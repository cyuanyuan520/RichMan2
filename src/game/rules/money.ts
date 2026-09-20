import type {
  GameEvent,
  GameState,
  MoneyReason,
  Player,
  PlayerId,
  TileDef,
} from "../core/types";
import { EngineError } from "../core/errors";

export function findPlayer(state: GameState, playerId: PlayerId): Player {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new EngineError("INVALID_TARGET", `Unknown player ${playerId}`);
  }
  return player;
}

export function addMoney(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  delta: number,
  reason: MoneyReason,
): void {
  const player = findPlayer(state, playerId);
  player.money += delta;
  events.push({
    type: "money-changed",
    playerId,
    delta,
    reason,
    balance: player.money,
  });
}

export function transferMoney(
  state: GameState,
  events: GameEvent[],
  fromId: PlayerId,
  toId: PlayerId,
  amount: number,
  reason: MoneyReason,
): void {
  addMoney(state, events, fromId, -amount, reason);
  const target = findPlayer(state, toId);
  if (target.status === "bankrupt") {
    return;
  }
  addMoney(state, events, toId, amount, reason);
}

export function liquidateValue(state: GameState, playerId: PlayerId): number {
  const economy = state.config.economy;
  let total = 0;
  for (const tile of state.tiles) {
    if (tile.ownerId !== playerId) {
      continue;
    }
    const def = state.tileDefs[tile.index] as TileDef;
    for (let level = 0; level < tile.level; level += 1) {
      total += Math.round((def.upgradeCosts?.[level] ?? 0) * economy.sellRefundRate);
    }
    if (!tile.mortgaged) {
      total += Math.round((def.price ?? 0) * economy.mortgageRefundRate);
    }
  }
  return total;
}

export function bankruptPlayer(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  creditorId: PlayerId | null,
): void {
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    return;
  }
  const creditor =
    creditorId && creditorId !== playerId
      ? state.players.find(
          (entry) => entry.id === creditorId && entry.status !== "bankrupt",
        )
      : undefined;
  if (player.money > 0 && creditor) {
    addMoney(state, events, creditor.id, player.money, "bankruptcy");
  }
  player.status = "bankrupt";
  player.money = 0;
  player.statusTurns = 0;
  player.items = [];
  player.skipTurns = 0;
  for (const tile of state.tiles) {
    if (tile.ownerId === playerId) {
      tile.ownerId = null;
      tile.level = 0;
      tile.mortgaged = false;
      tile.effects = [];
    } else {
      tile.effects = tile.effects.filter((effect) => effect.ownerId !== playerId);
    }
  }
  player.properties = [];
  events.push({
    type: "money-changed",
    playerId,
    delta: -player.money,
    reason: "bankruptcy",
    balance: 0,
  });
  events.push({ type: "player-bankrupt", playerId, creditorId });
  events.push({ type: "log", text: `${player.name} 破产离场`, icon: "💥" });
}

export function payMoney(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  amount: number,
  reason: MoneyReason,
  creditorId: PlayerId | null = null,
): boolean {
  if (amount <= 0) {
    return true;
  }
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    return false;
  }
  if (creditorId && creditorId !== playerId) {
    transferMoney(state, events, playerId, creditorId, amount, reason);
  } else {
    addMoney(state, events, playerId, -amount, reason);
  }
  if (player.money >= 0) {
    return true;
  }
  return requestFunds(state, events, playerId, creditorId, reason);
}

function requestFunds(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  creditorId: PlayerId | null,
  reason: MoneyReason,
): boolean {
  const player = findPlayer(state, playerId);
  const deficit = -player.money;
  if (player.money + liquidateValue(state, playerId) < 0) {
    bankruptPlayer(state, events, playerId, creditorId);
    return false;
  }
  const existing = state.pending;
  if (existing && existing.kind === "raise-funds" && existing.playerId === playerId) {
    existing.amount = deficit;
    return false;
  }
  if (existing) {
    bankruptPlayer(state, events, playerId, creditorId);
    return false;
  }
  state.pending = {
    kind: "raise-funds",
    playerId,
    creditorId,
    amount: deficit,
    reason,
  };
  events.push({ type: "decision-requested", decision: state.pending });
  events.push({
    type: "log",
    text: `${player.name} 欠款 ${deficit} 元，需要变卖资产或抵押地产`,
    icon: "🏚️",
  });
  return false;
}

export function settleDebtIfPossible(
  state: GameState,
  events: GameEvent[],
): boolean {
  const pending = state.pending;
  if (!pending || pending.kind !== "raise-funds") {
    return false;
  }
  const player = findPlayer(state, pending.playerId);
  if (player.status === "bankrupt") {
    state.pending = null;
    return true;
  }
  if (player.money >= 0) {
    events.push({
      type: "log",
      text: `${player.name} 变卖资产后还清了欠款`,
      icon: "💵",
    });
    events.push({
      type: "decision-resolved",
      kind: "raise-funds",
      playerId: player.id,
    });
    state.pending = null;
    return true;
  }
  if (player.money + liquidateValue(state, player.id) < 0) {
    bankruptPlayer(state, events, player.id, pending.creditorId);
    state.pending = null;
    return true;
  }
  return false;
}
