import type {
  GameAction,
  GameContent,
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
import {
  addMoney,
  bankruptPlayer,
  findPlayer,
  settleDebtIfPossible,
} from "../rules/money";
import { movePlayer } from "../rules/movement";
import { releasePlayer, sendToJail } from "../rules/status";
import { discountedPrice } from "../systems/skills";
import {
  cancelTargetPending,
  pump,
  pushEffects,
  resolveTargetPending,
  settlePhase,
} from "../systems/resolution";
import { addItem, removeItem } from "../rules/status";

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
  const economy = state.config.economy;
  for (const tile of state.tiles) {
    if (tile.ownerId !== playerId) {
      continue;
    }
    const def = state.tileDefs[tile.index] as TileDef;
    if (tile.mortgaged) {
      total += Math.round((def.price ?? 0) * (1 - economy.mortgageRefundRate));
    } else {
      total += def.price ?? 0;
    }
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
  state.queue = [];
  state.pending = null;
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

function tickCooldowns(state: GameState, playerId: PlayerId): void {
  const player = findPlayer(state, playerId);
  for (const key of Object.keys(player.skillCooldowns)) {
    player.skillCooldowns[key] = Math.max(
      0,
      (player.skillCooldowns[key] ?? 0) - 1,
    );
  }
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
  } while (state.players[seat]?.status === "bankrupt" && guard <= total);
  if (seat <= previous.seat) {
    state.round += 1;
  }
  state.turnSeat = seat;
  state.turnCount += 1;
  state.phase = "await-roll";
  state.rollAgain = false;
  state.lastRoll = null;
  state.pending = null;
  state.queue = [];
  if (
    state.config.targetRounds > 0 &&
    state.round > state.config.targetRounds
  ) {
    finishGame(state, events, null);
    return;
  }
  const next = currentPlayer(state);
  tickCooldowns(state, next.id);
  next.lotteryBoughtThisTurn = false;
  events.push({
    type: "turn-started",
    playerId: next.id,
    round: state.round,
  });
}

function postRollPhase(
  state: GameState,
  events: GameEvent[],
  doubles: boolean,
): void {
  if (isFinished(state)) {
    return;
  }
  if (state.pending) {
    state.phase = "await-decision";
    state.rollAgain = doubles && currentPlayer(state).status === "active";
    return;
  }
  if (isFinished(state)) {
    return;
  }
  const player = currentPlayer(state);
  if (player.status === "bankrupt") {
    advanceTurn(state, events);
    return;
  }
  if (doubles && player.status === "active") {
    state.phase = "await-roll";
    state.rollAgain = true;
    events.push({ type: "doubles-again", playerId: player.id });
    return;
  }
  state.phase = "action-window";
  state.rollAgain = false;
}

function rollDice(
  state: GameState,
  forced?: [number, number],
): [number, number] {
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

function finishRollWithMovement(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  diceSum: number,
  doubles: boolean,
): void {
  movePlayer(state, events, content, playerId, diceSum);
  state.queue.push({ kind: "landing", playerId, diceSum });
  pump(state, events, content);
  if (checkBankruptcyOutcome(state, events)) {
    if (isFinished(state)) {
      return;
    }
    advanceTurn(state, events);
    return;
  }
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    if (currentPlayer(state).id === playerId) {
      advanceTurn(state, events);
    }
    return;
  }
  postRollPhase(state, events, doubles);
}

function handleRoll(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  action: { playerId: PlayerId; forcedDice?: [number, number] },
): void {
  if (state.phase !== "await-roll") {
    throw new EngineError("INVALID_ACTION", "Not in roll phase");
  }
  const player = currentPlayer(state);
  if (action.playerId !== player.id) {
    throw new EngineError("NOT_YOUR_TURN", "Not your turn");
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
    if (player.jailFreeCards > 0) {
      player.jailFreeCards -= 1;
      releasePlayer(state, events, player.id, "jail");
      events.push({
        type: "log",
        text: `${player.name} 使用了出狱许可`,
        icon: "🔑",
      });
    } else {
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
        movePlayer(state, events, content, player.id, d1r + d2r);
        state.queue.push({ kind: "landing", playerId: player.id, diceSum: d1r + d2r });
        pump(state, events, content);
        if (checkBankruptcyOutcome(state, events)) {
          if (isFinished(state)) {
            return;
          }
          advanceTurn(state, events);
          return;
        }
        if (findPlayer(state, player.id).status === "bankrupt") {
          advanceTurn(state, events);
          return;
        }
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
      sendToJail(state, events, content, player.id);
      advanceTurn(state, events);
      return;
    }
  } else {
    player.doublesStreak = 0;
  }
  finishRollWithMovement(state, events, content, player.id, d1 + d2, doubles);
}

function continueAfterDecision(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
): void {
  pump(state, events, content);
  if (checkBankruptcyOutcome(state, events)) {
    return;
  }
  settlePhase(state);
}

function handleBuyProperty(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
): void {
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
  if (player.money < pending.price) {
    throw new EngineError("INSUFFICIENT_FUNDS", "Cannot afford this tile");
  }
  addMoney(state, events, playerId, -pending.price, "purchase");
  tile.ownerId = playerId;
  player.properties.push(asTileId(def.id));
  player.stats.bought += 1;
  events.push({
    type: "property-bought",
    playerId,
    tileIndex: pending.tileIndex,
    price: pending.price,
  });
  events.push({
    type: "log",
    text: `${player.name} 买下了 ${def.name}，花费 ${pending.price} 元`,
    icon: "🏠",
  });
  events.push({ type: "decision-resolved", kind: "buy-property", playerId });
  state.pending = null;
  continueAfterDecision(state, events, content);
}

function handleDeclineBuy(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
): void {
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
  continueAfterDecision(state, events, content);
}

function canManageAssets(state: GameState, playerId: PlayerId): boolean {
  if (state.phase === "action-window" && currentPlayer(state).id === playerId) {
    return true;
  }
  return (
    state.pending?.kind === "raise-funds" && state.pending.playerId === playerId
  );
}

function handleUpgrade(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  tileIndex: number,
): void {
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
  const base = def.upgradeCosts?.[tile.level] ?? 0;
  const cost = discountedPrice(state, content, playerId, base, "upgrade-discount");
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

function handleSellBuilding(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  tileIndex: number,
): void {
  if (!canManageAssets(state, playerId)) {
    throw new EngineError("INVALID_ACTION", "Cannot sell buildings now");
  }
  const tile = state.tiles[tileIndex];
  const def = state.tileDefs[tileIndex] as TileDef;
  const player = findPlayer(state, playerId);
  if (!tile || !def || tile.ownerId !== playerId) {
    throw new EngineError("INVALID_TARGET", "You do not own this tile");
  }
  if (tile.level <= 0) {
    throw new EngineError("INVALID_TARGET", "No building to sell");
  }
  const base = def.upgradeCosts?.[tile.level - 1] ?? 0;
  const refund = Math.round(base * state.config.economy.sellRefundRate);
  tile.level -= 1;
  addMoney(state, events, playerId, refund, "sell-building");
  events.push({
    type: "building-sold",
    playerId,
    tileIndex,
    level: tile.level,
    amount: refund,
  });
  events.push({
    type: "log",
    text: `${player.name} 拆除 ${def.name} 一级建筑，回收 ${refund} 元`,
    icon: "🧱",
  });
  afterAssetAction(state, events, content);
}

function handleMortgage(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  tileIndex: number,
): void {
  if (!canManageAssets(state, playerId)) {
    throw new EngineError("INVALID_ACTION", "Cannot mortgage now");
  }
  const tile = state.tiles[tileIndex];
  const def = state.tileDefs[tileIndex] as TileDef;
  const player = findPlayer(state, playerId);
  if (!tile || !def || tile.ownerId !== playerId) {
    throw new EngineError("INVALID_TARGET", "You do not own this tile");
  }
  if (tile.mortgaged) {
    throw new EngineError("INVALID_TARGET", "Already mortgaged");
  }
  if (tile.level > 0) {
    throw new EngineError("INVALID_TARGET", "Sell buildings before mortgaging");
  }
  const refund = Math.round(
    (def.price ?? 0) * state.config.economy.mortgageRefundRate,
  );
  tile.mortgaged = true;
  addMoney(state, events, playerId, refund, "mortgage");
  events.push({ type: "property-mortgaged", playerId, tileIndex, amount: refund });
  events.push({
    type: "log",
    text: `${player.name} 抵押 ${def.name}，获得 ${refund} 元`,
    icon: "🏦",
  });
  afterAssetAction(state, events, content);
}

function handleUnmortgage(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  tileIndex: number,
): void {
  if (!canManageAssets(state, playerId)) {
    throw new EngineError("INVALID_ACTION", "Cannot redeem now");
  }
  const tile = state.tiles[tileIndex];
  const def = state.tileDefs[tileIndex] as TileDef;
  const player = findPlayer(state, playerId);
  if (!tile || !def || tile.ownerId !== playerId) {
    throw new EngineError("INVALID_TARGET", "You do not own this tile");
  }
  if (!tile.mortgaged) {
    throw new EngineError("INVALID_TARGET", "Not mortgaged");
  }
  const economy = state.config.economy;
  const cost = Math.round(
    (def.price ?? 0) * economy.mortgageRefundRate * (1 + economy.mortgageInterest),
  );
  if (player.money < cost) {
    throw new EngineError("INSUFFICIENT_FUNDS", "Cannot afford redemption");
  }
  addMoney(state, events, playerId, -cost, "unmortgage");
  tile.mortgaged = false;
  events.push({ type: "property-unmortgaged", playerId, tileIndex, cost });
  events.push({
    type: "log",
    text: `${player.name} 赎回 ${def.name}，支付 ${cost} 元`,
    icon: "💠",
  });
  afterAssetAction(state, events, content);
}

function afterAssetAction(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
): void {
  if (state.pending?.kind === "raise-funds") {
    settleDebtIfPossible(state, events);
    if (state.pending) {
      return;
    }
    continueAfterDecision(state, events, content);
    return;
  }
}

function handleBuyItem(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  itemDefId: string,
): void {
  if (state.phase !== "action-window" || currentPlayer(state).id !== playerId) {
    throw new EngineError("INVALID_ACTION", "Cannot buy items now");
  }
  const player = findPlayer(state, playerId);
  const def = content.items[itemDefId];
  if (!def) {
    throw new EngineError("CONTENT_ERROR", `Unknown item ${itemDefId}`);
  }
  const tileDef = state.tileDefs[player.position] as TileDef;
  if (tileDef?.kind !== "shop") {
    throw new EngineError("INVALID_TARGET", "You are not at a shop");
  }
  if (player.money < def.price) {
    throw new EngineError("INSUFFICIENT_FUNDS", "Cannot afford this item");
  }
  addMoney(state, events, playerId, -def.price, "item");
  addItem(state, events, playerId, def.id);
  events.push({ type: "item-bought", playerId, itemDefId: def.id, price: def.price });
  events.push({
    type: "log",
    text: `${player.name} 购买了 ${def.name}，花费 ${def.price} 元`,
    icon: def.icon ?? "🛒",
  });
}

function handleUseItem(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  itemId: string,
): void {
  if (
    state.phase !== "await-roll" &&
    state.phase !== "action-window"
  ) {
    throw new EngineError("INVALID_ACTION", "Cannot use items now");
  }
  if (currentPlayer(state).id !== playerId) {
    throw new EngineError("NOT_YOUR_TURN", "Not your turn");
  }
  const player = findPlayer(state, playerId);
  const item = player.items.find((entry) => entry.id === itemId);
  const def = item ? content.items[item.defId] : undefined;
  if (!item || !def) {
    throw new EngineError("INVALID_TARGET", "Item not found");
  }
  if (def.target !== "none" && def.target !== "self") {
    state.pending = {
      kind: "item-target",
      playerId,
      itemId: item.id,
      target: def.target,
    };
    events.push({ type: "decision-requested", decision: state.pending });
    state.phase = "await-decision";
    return;
  }
  removeItem(state, playerId, item.id);
  player.stats.itemsUsed += 1;
  events.push({ type: "item-used", playerId, itemDefId: def.id });
  events.push({
    type: "log",
    text: `${player.name} 使用了 ${def.name}`,
    icon: def.icon ?? "🎒",
  });
  pushEffects(state, playerId, def.effects, "item", def.id);
  pump(state, events, content);
  if (!isFinished(state)) {
    settlePhase(state);
  }
}

function handleUseSkill(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  skillId: string,
): void {
  if (
    state.phase !== "await-roll" &&
    state.phase !== "action-window"
  ) {
    throw new EngineError("INVALID_ACTION", "Cannot use skills now");
  }
  if (currentPlayer(state).id !== playerId) {
    throw new EngineError("NOT_YOUR_TURN", "Not your turn");
  }
  const player = findPlayer(state, playerId);
  const character = content.characters[player.characterId];
  const skill = character?.skills.find(
    (entry) => entry.id === skillId && entry.trigger === "active",
  );
  if (!skill) {
    throw new EngineError("INVALID_TARGET", "Unknown active skill");
  }
  if ((player.skillCharges[skillId] ?? 0) <= 0 && skill.charges !== undefined) {
    throw new EngineError("INVALID_ACTION", "No charges left");
  }
  if ((player.skillCooldowns[skillId] ?? 0) > 0) {
    throw new EngineError("INVALID_ACTION", "Skill is cooling down");
  }
  const effects = skill.effects ?? [];
  if (effects.length === 0) {
    throw new EngineError("INVALID_ACTION", "Skill has no effects");
  }
  const escapeOnly = effects.every((effect) => effect.kind === "get-out-of-jail");
  if (escapeOnly) {
    if (player.status !== "jailed") {
      throw new EngineError("INVALID_ACTION", "You are not in jail");
    }
    releasePlayer(state, events, playerId, "jail");
    events.push({
      type: "log",
      text: `${player.name} 使用「${skill.name}」离开了监狱`,
      icon: skill.icon ?? "🩺",
    });
  } else {
    pushEffects(state, playerId, effects, "skill", skill.id);
  }
  if (skill.charges !== undefined) {
    player.skillCharges[skillId] = Math.max(
      0,
      (player.skillCharges[skillId] ?? 0) - 1,
    );
  }
  if (skill.cooldownRounds !== undefined) {
    player.skillCooldowns[skillId] = skill.cooldownRounds;
  }
  events.push({ type: "skill-used", playerId, skillId });
  pump(state, events, content);
  if (!isFinished(state)) {
    settlePhase(state);
  }
}

function handleBuyLottery(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
): void {
  if (state.phase !== "action-window" || currentPlayer(state).id !== playerId) {
    throw new EngineError("INVALID_ACTION", "Cannot buy lottery now");
  }
  const player = findPlayer(state, playerId);
  const tileDef = state.tileDefs[player.position] as TileDef;
  if (tileDef?.kind !== "lottery") {
    throw new EngineError("INVALID_TARGET", "You are not at the lottery booth");
  }
  if (player.lotteryBoughtThisTurn) {
    throw new EngineError("INVALID_ACTION", "One ticket per turn");
  }
  const economy = state.config.economy;
  if (player.money < economy.lotteryTicketPrice) {
    throw new EngineError("INSUFFICIENT_FUNDS", "Cannot afford a ticket");
  }
  addMoney(state, events, playerId, -economy.lotteryTicketPrice, "lottery");
  player.lotteryBoughtThisTurn = true;
  const prizes = economy.lotteryPrizes;
  const [index, rng] = rngInt(state.rng, 0, Math.max(0, prizes.length - 1));
  state.rng = rng;
  const prize = prizes[index] ?? 0;
  if (prize > 0) {
    addMoney(state, events, playerId, prize, "lottery");
  }
  events.push({
    type: "lottery-result",
    playerId,
    cost: economy.lotteryTicketPrice,
    prize,
  });
  events.push({
    type: "log",
    text:
      prize > 0
        ? `${player.name} 买彩票中了 ${prize} 元！`
        : `${player.name} 买彩票没有中奖`,
    icon: "🎟️",
  });
}

function handlePayJailFine(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
): void {
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

function handleChooseDice(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  value: number,
): void {
  const pending = state.pending;
  if (!pending || pending.kind !== "choose-dice") {
    throw new EngineError("NO_PENDING_DECISION", "No dice choice pending");
  }
  if (pending.playerId !== playerId) {
    throw new EngineError("NOT_YOUR_TURN", "Not your decision");
  }
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new EngineError("INVALID_ACTION", "Dice value must be 1-6");
  }
  const player = findPlayer(state, playerId);
  player.forcedDice = value;
  state.pending = null;
  events.push({ type: "decision-resolved", kind: "choose-dice", playerId });
  events.push({
    type: "log",
    text: `${player.name} 遥控骰子设定为 ${value} 点`,
    icon: "🎲",
  });
  continueAfterDecision(state, events, content);
}

function handleRaiseFundsDone(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
): void {
  const pending = state.pending;
  if (!pending || pending.kind !== "raise-funds") {
    throw new EngineError("NO_PENDING_DECISION", "No debt pending");
  }
  if (pending.playerId !== playerId) {
    throw new EngineError("NOT_YOUR_TURN", "Not your debt");
  }
  const player = findPlayer(state, playerId);
  if (player.money < 0) {
    throw new EngineError(
      "INSUFFICIENT_FUNDS",
      "Still in debt, sell or mortgage more assets",
    );
  }
  settleDebtIfPossible(state, events);
  continueAfterDecision(state, events, content);
}

function handleDeclareBankrupt(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
): void {
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    throw new EngineError("INVALID_ACTION", "Already bankrupt");
  }
  const pending = state.pending;
  const creditorId = pending?.kind === "raise-funds" ? pending.creditorId : null;
  bankruptPlayer(state, events, playerId, creditorId);
  if (pending?.playerId === playerId) {
    state.pending = null;
  }
  if (checkBankruptcyOutcome(state, events)) {
    return;
  }
  if (currentPlayer(state).id === playerId) {
    advanceTurn(state, events);
    return;
  }
  continueAfterDecision(state, events, content);
}

function handleGiveUp(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
): void {
  handleDeclareBankrupt(state, events, content, playerId);
}

function allowedWhilePending(
  state: GameState,
  action: GameAction,
): boolean {
  const pending = state.pending;
  if (!pending) {
    return true;
  }
  if (action.type === "give-up") {
    return true;
  }
  switch (pending.kind) {
    case "buy-property":
      return (
        (action.type === "buy-property" || action.type === "decline-buy") &&
        action.playerId === pending.playerId
      );
    case "raise-funds":
      return (
        (action.type === "sell-building" ||
          action.type === "mortgage-property" ||
          action.type === "raise-funds-done" ||
          action.type === "declare-bankrupt") &&
        action.playerId === pending.playerId
      );
    case "item-target":
      return (
        (action.type === "resolve-target" || action.type === "cancel-target") &&
        action.playerId === pending.playerId
      );
    case "card-target":
      return (
        (action.type === "resolve-target" || action.type === "cancel-target") &&
        action.playerId === pending.playerId
      );
    case "choose-dice":
      return action.type === "choose-dice" && action.playerId === pending.playerId;
    default:
      return false;
  }
}

export function reduce(
  state: GameState,
  action: GameAction,
  content: GameContent,
): ReduceResult {
  if (state.phase === "finished") {
    throw new EngineError("GAME_FINISHED", "Game already finished");
  }
  if (!allowedWhilePending(state, action)) {
    throw new EngineError(
      "PENDING_DECISION",
      `Pending ${state.pending?.kind ?? "decision"} must be resolved first`,
    );
  }
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  next.seq += 1;

  switch (action.type) {
    case "roll-dice":
      handleRoll(next, events, content, action);
      break;
    case "buy-property":
      handleBuyProperty(next, events, content, action.playerId);
      break;
    case "decline-buy":
      handleDeclineBuy(next, events, content, action.playerId);
      break;
    case "upgrade-property":
      handleUpgrade(next, events, content, action.playerId, action.tileIndex);
      break;
    case "sell-building":
      handleSellBuilding(next, events, content, action.playerId, action.tileIndex);
      break;
    case "mortgage-property":
      handleMortgage(next, events, content, action.playerId, action.tileIndex);
      break;
    case "unmortgage-property":
      handleUnmortgage(next, events, content, action.playerId, action.tileIndex);
      break;
    case "buy-item":
      handleBuyItem(next, events, content, action.playerId, action.itemDefId);
      break;
    case "use-item":
      handleUseItem(next, events, content, action.playerId, action.itemId);
      break;
    case "use-skill":
      handleUseSkill(next, events, content, action.playerId, action.skillId);
      break;
    case "buy-lottery":
      handleBuyLottery(next, events, content, action.playerId);
      break;
    case "pay-jail-fine":
      handlePayJailFine(next, events, content, action.playerId);
      break;
    case "resolve-target":
      resolveTargetPending(
        next,
        events,
        content,
        action.playerId,
        action.target,
      );
      break;
    case "cancel-target":
      cancelTargetPending(next, events, content, action.playerId);
      break;
    case "choose-dice":
      handleChooseDice(next, events, content, action.playerId, action.value);
      break;
    case "raise-funds-done":
      handleRaiseFundsDone(next, events, content, action.playerId);
      break;
    case "declare-bankrupt":
      handleDeclareBankrupt(next, events, content, action.playerId);
      break;
    case "give-up":
      handleGiveUp(next, events, content, action.playerId);
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
    default:
      throw new EngineError("INVALID_ACTION", "Unknown action");
  }

  if (!isFinished(next)) {
    checkBankruptcyOutcome(next, events);
  }

  return { state: next, seq: next.seq, events };
}
