import type {
  GameAction,
  GameEvent,
  GameState,
  Player,
  PlayerId,
  ReduceResult,
  TileDef,
} from "../core/types";
import { EngineError } from "../core/errors";
import { rngInt } from "../core/rng";
import { asTileId } from "../core/ids";
import { addMoney, findPlayer } from "../rules/money";
import { movePlayer } from "../rules/movement";
import {
  bankruptPlayer,
  releasePlayer,
  resolveLanding,
  sendToJail,
} from "../rules/landing";

export function currentPlayer(state: GameState): Player {
  const player = state.players[state.turnSeat];
  if (!player) {
    throw new EngineError("INVALID_ACTION", "No current player");
  }
  return player;
}

export function activePlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.status !== "bankrupt");
}

export function netWorth(state: GameState, playerId: PlayerId): number {
  const player = findPlayer(state, playerId);
  let total = player.money;
  for (const tile of state.tiles) {
    if (tile.ownerId !== playerId) {
      continue;
    }
    const def = state.tileDefs[tile.index] as TileDef;
    total += def.price ?? 0;
    for (let level = 0; level < tile.level; level += 1) {
      total += def.upgradeCosts?.[level] ?? 0;
    }
  }
  return total;
}

export function standingsByNetWorth(state: GameState): PlayerId[] {
  return [...state.players]
    .sort((a, b) => netWorth(state, b.id) - netWorth(state, a.id))
    .map((player) => player.id);
}

function finishGame(
  state: GameState,
  events: GameEvent[],
  winnerId: PlayerId | null,
): void {
  state.phase = "finished";
  state.standings = standingsByNetWorth(state);
  state.winnerId = winnerId ?? state.standings[0] ?? null;
  const winner = state.winnerId ? findPlayer(state, state.winnerId) : null;
  events.push({
    type: "game-ended",
    winnerId: state.winnerId as PlayerId,
    standings: state.standings,
  });
  if (winner) {
    events.push({
      type: "log",
      text: `${winner.name} 赢得了本局大富翁！`,
      icon: "🏆",
    });
  }
}

function isFinished(state: GameState): boolean {
  return state.phase === "finished";
}

function checkBankruptcyOutcome(
  state: GameState,
  events: GameEvent[],
): boolean {
  if (state.phase === "finished") {
    return true;
  }
  const alive = activePlayers(state);
  if (alive.length <= 1) {
    finishGame(state, events, alive[0]?.id ?? null);
    return true;
  }
  return false;
}

function advanceTurn(state: GameState, events: GameEvent[]): void {
  const previous = currentPlayer(state);
  events.push({ type: "turn-ended", playerId: previous.id });
  let seat = previous.seat;
  const total = state.players.length;
  let guard = 0;
  do {
    seat = (seat + 1) % total;
    guard += 1;
  } while (
    state.players[seat]?.status === "bankrupt" &&
    guard <= total
  );
  if (seat <= previous.seat) {
    state.round += 1;
  }
  state.turnSeat = seat;
  state.turnCount += 1;
  state.phase = "await-roll";
  state.rollAgain = false;
  state.lastRoll = null;
  state.pending = null;
  if (
    state.config.targetRounds > 0 &&
    state.round > state.config.targetRounds
  ) {
    finishGame(state, events, null);
    return;
  }
  const next = currentPlayer(state);
  events.push({
    type: "turn-started",
    playerId: next.id,
    round: state.round,
  });
}

function postRollPhase(state: GameState, events: GameEvent[], doubles: boolean): void {
  if (isFinished(state)) {
    return;
  }
  if (state.pending) {
    state.phase = "await-decision";
    state.rollAgain = doubles && currentPlayer(state).status === "active";
    return;
  }
  if (doubleSAgainAllowed(state, doubles)) {
    state.phase = "await-roll";
    state.rollAgain = true;
    events.push({ type: "doubles-again", playerId: currentPlayer(state).id });
    return;
  }
  state.phase = "action-window";
  state.rollAgain = false;
}

function doubleSAgainAllowed(state: GameState, doubles: boolean): boolean {
  if (!doubles) {
    return false;
  }
  const player = currentPlayer(state);
  return player.status === "active";
}

function handleRoll(state: GameState, events: GameEvent[], action: { playerId: PlayerId; forcedDice?: [number, number] }): void {
  if (state.phase !== "await-roll") {
    throw new EngineError("INVALID_ACTION", "Not in roll phase");
  }
  const player = currentPlayer(state);
  if (action.playerId !== player.id) {
    throw new EngineError("NOT_YOUR_TURN", "Not your turn");
  }
  if (player.skipTurns > 0) {
    player.skipTurns -= 1;
    events.push({
      type: "log",
      text: `${player.name} 暂停一回合`,
      icon: "⏸️",
    });
    advanceTurn(state, events);
    return;
  }
  if (player.status === "hospitalized") {
    player.statusTurns -= 1;
    if (player.statusTurns <= 0) {
      releasePlayer(state, events, player.id, "hospital");
    } else {
      events.push({
        type: "log",
        text: `${player.name} 仍在住院，还需 ${player.statusTurns} 回合`,
        icon: "🏥",
      });
    }
    advanceTurn(state, events);
    return;
  }
  if (player.status === "jailed") {
    const [d1r, d2r] = rollDice(state, action.forcedDice);
    state.lastRoll = [d1r, d2r];
    player.stats.rolls += 1;
    const doubles = d1r === d2r;
    events.push({
      type: "dice-rolled",
      playerId: player.id,
      dice: [d1r, d2r],
      doubles,
    });
    if (doubles) {
      releasePlayer(state, events, player.id, "jail");
      player.stats.doubles += 1;
      player.doublesStreak = 0;
      movePlayer(state, events, player.id, d1r + d2r);
      resolveLanding(state, events, player.id, d1r + d2r);
      postRollPhase(state, events, false);
      return;
    }
    player.statusTurns -= 1;
    if (player.statusTurns <= 0) {
      releasePlayer(state, events, player.id, "jail");
    } else {
      events.push({
        type: "log",
        text: `${player.name} 仍在服刑，还需 ${player.statusTurns} 回合`,
        icon: "⛓️",
      });
    }
    advanceTurn(state, events);
    return;
  }

  const [d1, d2] = rollDice(state, action.forcedDice);
  state.lastRoll = [d1, d2];
  player.stats.rolls += 1;
  const doubles = d1 === d2;
  events.push({
    type: "dice-rolled",
    playerId: player.id,
    dice: [d1, d2],
    doubles,
  });
  if (doubles) {
    player.stats.doubles += 1;
    player.doublesStreak += 1;
    if (player.doublesStreak >= 3) {
      events.push({
        type: "log",
        text: `${player.name} 连续三次掷出双数，被押入监狱`,
        icon: "🎲",
      });
      sendToJail(state, events, player.id);
      advanceTurn(state, events);
      return;
    }
  } else {
    player.doublesStreak = 0;
  }
  movePlayer(state, events, player.id, d1 + d2);
  if (isFinished(state)) {
    return;
  }
  resolveLanding(state, events, player.id, d1 + d2);
  if (checkBankruptcyOutcome(state, events)) {
    if (isFinished(state)) {
      return;
    }
    advanceTurn(state, events);
    return;
  }
  postRollPhase(state, events, doubles);
}

function rollDice(state: GameState, forced?: [number, number]): [number, number] {
  const player = currentPlayer(state);
  if (player.forcedDice !== null) {
    const value = player.forcedDice;
    player.forcedDice = null;
    const [other, rng] = rngInt(state.rng, 1, 6);
    state.rng = rng;
    return forced ?? ([value, other] as [number, number]);
  }
  if (forced) {
    return forced;
  }
  const [a, rng1] = rngInt(state.rng, 1, 6);
  state.rng = rng1;
  const [b, rng2] = rngInt(state.rng, 1, 6);
  state.rng = rng2;
  return [a, b];
}

function handleBuyProperty(state: GameState, events: GameEvent[], playerId: PlayerId): void {
  const pending = state.pending;
  if (!pending || pending.kind !== "buy-property") {
    throw new EngineError("NO_PENDING_DECISION", "No purchase pending");
  }
  if (pending.playerId !== playerId) {
    throw new EngineError("NOT_YOUR_TURN", "Not your decision");
  }
  const player = findPlayer(state, playerId);
  const tile = state.tiles[pending.tileIndex];
  const def = state.tileDefs[pending.tileIndex] as TileDef;
  if (!tile || !def || tile.ownerId !== null) {
    throw new EngineError("INVALID_ACTION", "Tile no longer purchasable");
  }
  const price = pending.price;
  if (player.money < price) {
    throw new EngineError("INSUFFICIENT_FUNDS", "Cannot afford this tile");
  }
  addMoney(state, events, playerId, -price, "purchase");
  tile.ownerId = playerId;
  player.properties.push(asTileId(def.id));
  player.stats.bought += 1;
  events.push({ type: "property-bought", playerId, tileIndex: pending.tileIndex, price });
  events.push({
    type: "log",
    text: `${player.name} 买下了 ${def.name}，花费 ${price} 元`,
    icon: "🏠",
  });
  events.push({ type: "decision-resolved", kind: "buy-property", playerId });
  state.pending = null;
  state.phase = state.rollAgain ? "await-roll" : "action-window";
}

function handleDeclineBuy(state: GameState, events: GameEvent[], playerId: PlayerId): void {
  const pending = state.pending;
  if (!pending || pending.kind !== "buy-property") {
    throw new EngineError("NO_PENDING_DECISION", "No purchase pending");
  }
  if (pending.playerId !== playerId) {
    throw new EngineError("NOT_YOUR_TURN", "Not your decision");
  }
  const player = findPlayer(state, playerId);
  const def = state.tileDefs[pending.tileIndex] as TileDef;
  events.push({
    type: "log",
    text: `${player.name} 放弃购买 ${def?.name ?? "地块"}`,
    icon: "🙅",
  });
  events.push({ type: "decision-resolved", kind: "buy-property", playerId });
  state.pending = null;
  state.phase = state.rollAgain ? "await-roll" : "action-window";
}

function handleUpgrade(state: GameState, events: GameEvent[], playerId: PlayerId, tileIndex: number): void {
  if (state.phase !== "action-window") {
    throw new EngineError("INVALID_ACTION", "Upgrades only in action window");
  }
  const player = currentPlayer(state);
  if (player.id !== playerId) {
    throw new EngineError("NOT_YOUR_TURN", "Not your turn");
  }
  const tile = state.tiles[tileIndex];
  const def = state.tileDefs[tileIndex] as TileDef;
  if (!tile || !def || def.kind !== "property") {
    throw new EngineError("INVALID_TARGET", "Only properties can be upgraded");
  }
  if (tile.ownerId !== playerId) {
    throw new EngineError("INVALID_TARGET", "You do not own this property");
  }
  if (tile.mortgaged) {
    throw new EngineError("INVALID_TARGET", "Mortgaged property cannot be upgraded");
  }
  const maxLevel = state.config.economy.maxBuildingLevel;
  if (tile.level >= maxLevel) {
    throw new EngineError("INVALID_TARGET", "Property is fully built");
  }
  const cost = def.upgradeCosts?.[tile.level] ?? 0;
  if (player.money < cost) {
    throw new EngineError("INSUFFICIENT_FUNDS", "Cannot afford upgrade");
  }
  addMoney(state, events, playerId, -cost, "upgrade");
  tile.level += 1;
  player.stats.upgraded += 1;
  events.push({
    type: "property-upgraded",
    playerId,
    tileIndex,
    level: tile.level,
    cost,
  });
  events.push({
    type: "log",
    text: `${player.name} 将 ${def.name} 升级到 ${tile.level} 级，花费 ${cost} 元`,
    icon: "🏗️",
  });
}

function handlePayJailFine(state: GameState, events: GameEvent[], playerId: PlayerId): void {
  if (state.phase !== "await-roll") {
    throw new EngineError("INVALID_ACTION", "Not in roll phase");
  }
  const player = currentPlayer(state);
  if (player.id !== playerId || player.status !== "jailed") {
    throw new EngineError("INVALID_ACTION", "Cannot pay bail now");
  }
  const fine = state.config.economy.jailFine;
  if (player.money < fine) {
    throw new EngineError("INSUFFICIENT_FUNDS", "Cannot afford bail");
  }
  addMoney(state, events, playerId, -fine, "jail-fine");
  releasePlayer(state, events, playerId, "jail");
}

export function reduce(state: GameState, action: GameAction): ReduceResult {
  if (state.phase === "finished") {
    throw new EngineError("GAME_FINISHED", "Game already finished");
  }
  const decisionActions = new Set([
    "buy-property",
    "decline-buy",
    "raise-funds-done",
    "declare-bankrupt",
    "give-up",
  ]);
  if (state.pending && !decisionActions.has(action.type)) {
    throw new EngineError(
      "PENDING_DECISION",
      `Pending ${state.pending.kind} must be resolved first`,
    );
  }
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  next.seq += 1;

  switch (action.type) {
    case "roll-dice":
      handleRoll(next, events, action);
      break;
    case "buy-property":
      handleBuyProperty(next, events, action.playerId);
      break;
    case "decline-buy":
      handleDeclineBuy(next, events, action.playerId);
      break;
    case "upgrade-property":
      handleUpgrade(next, events, action.playerId, action.tileIndex);
      break;
    case "pay-jail-fine":
      handlePayJailFine(next, events, action.playerId);
      break;
    case "end-turn": {
      if (next.phase !== "action-window") {
        throw new EngineError("INVALID_ACTION", "Cannot end turn now");
      }
      const player = currentPlayer(next);
      if (player.id !== action.playerId) {
        throw new EngineError("NOT_YOUR_TURN", "Not your turn");
      }
      if (next.pending) {
        throw new EngineError("PENDING_DECISION", "Resolve decision first");
      }
      advanceTurn(next, events);
      break;
    }
    case "give-up": {
      const player = findPlayer(next, action.playerId);
      if (player.status === "bankrupt") {
        throw new EngineError("INVALID_ACTION", "Already bankrupt");
      }
      bankruptPlayer(next, events, action.playerId, null);
      if (checkBankruptcyOutcome(next, events)) {
        break;
      }
      if (currentPlayer(next).id === action.playerId) {
        advanceTurn(next, events);
      }
      break;
    }
    default:
      throw new EngineError(
        "INVALID_ACTION",
        `Action ${action.type} is not available in this build`,
      );
  }

  if (!isFinished(next)) {
    checkBankruptcyOutcome(next, events);
  }

  return { state: next, events };
}
