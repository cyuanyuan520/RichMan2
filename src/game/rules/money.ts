import type {
  GameEvent,
  GameState,
  MoneyReason,
  Player,
  PlayerId,
  RaiseFundsDecision,
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
  const balance = player.money;
  if (balance !== 0) {
    addMoney(state, events, playerId, -balance, "bankruptcy");
  }
  const creditor =
    balance > 0 && creditorId && creditorId !== playerId
      ? state.players.find(
          (entry) => entry.id === creditorId && entry.status !== "bankrupt",
        )
      : undefined;
  if (creditor && balance > 0) {
    addMoney(state, events, creditor.id, balance, "bankruptcy");
  }
  player.status = "bankrupt";
  player.money = 0;
  player.statusTurns = 0;
  player.items = [];
  player.skipTurns = 0;
  state.debtQueue = state.debtQueue.filter((debt) => debt.playerId !== playerId);
  if (state.pending?.kind === "raise-funds" && state.pending.playerId === playerId) {
    state.pending = null;
  }
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
  events.push({ type: "player-bankrupt", playerId, creditorId });
  events.push({ type: "log", text: `${player.name} 破产离场`, icon: "💥" });
}

export function promoteDebt(state: GameState, events: GameEvent[]): void {
  if (state.pending) {
    return;
  }
  while (!state.pending && state.debtQueue.length > 0) {
    const debt = state.debtQueue.shift() as RaiseFundsDecision;
    const player = state.players.find((entry) => entry.id === debt.playerId);
    if (!player || player.status === "bankrupt") {
      continue;
    }
    state.pending = debt;
    events.push({ type: "decision-requested", decision: debt });
    events.push({
      type: "log",
      text: `${player.name} 欠款 ${debt.amount} 元，需要变卖资产或抵押地产`,
      icon: "🏚️",
    });
  }
}

function queueDebt(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  creditorId: PlayerId | null,
  reason: MoneyReason,
  deficit: number,
): void {
  const player = findPlayer(state, playerId);
  const share = { creditorId, amount: deficit, reason };
  const target =
    state.pending?.kind === "raise-funds" && state.pending.playerId === playerId
      ? state.pending
      : state.debtQueue.find((debt) => debt.playerId === playerId);
  if (target) {
    target.shares.push(share);
    target.amount = target.shares.reduce((sum, entry) => sum + entry.amount, 0);
    target.creditorId = target.creditorId ?? creditorId;
    return;
  }
  state.debtQueue.push({
    kind: "raise-funds",
    playerId,
    creditorId,
    amount: deficit,
    reason,
    shares: [share],
  });
  events.push({
    type: "log",
    text: `${player.name} 欠款 ${deficit} 元，等待处理`,
    icon: "🏚️",
  });
  promoteDebt(state, events);
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
  const paidNow = Math.min(amount, Math.max(0, player.money));
  if (paidNow > 0) {
    addMoney(state, events, playerId, -paidNow, reason);
    if (creditorId && creditorId !== playerId) {
      const creditor = state.players.find(
        (entry) => entry.id === creditorId && entry.status !== "bankrupt",
      );
      if (creditor) {
        addMoney(state, events, creditor.id, paidNow, reason);
      }
    }
  }
  const deficit = amount - paidNow;
  if (deficit <= 0) {
    return true;
  }
  addMoney(state, events, playerId, -deficit, reason);
  return requestFunds(state, events, playerId, creditorId, reason, deficit);
}

function requestFunds(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  creditorId: PlayerId | null,
  reason: MoneyReason,
  deficit: number,
): boolean {
  const player = findPlayer(state, playerId);
  if (player.money + liquidateValue(state, playerId) < 0) {
    if (state.pending?.kind === "raise-funds" && state.pending.playerId === playerId) {
      state.pending = null;
    }
    bankruptPlayer(state, events, playerId, creditorId);
    promoteDebt(state, events);
    return false;
  }
  queueDebt(state, events, playerId, creditorId, reason, deficit);
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
    promoteDebt(state, events);
    return true;
  }
  if (player.money >= 0) {
    for (const share of pending.shares) {
      if (share.amount <= 0) {
        continue;
      }
      const creditor =
        share.creditorId && share.creditorId !== player.id
          ? state.players.find(
              (entry) =>
                entry.id === share.creditorId && entry.status !== "bankrupt",
            )
          : undefined;
      if (creditor) {
        addMoney(state, events, creditor.id, share.amount, share.reason);
      }
    }
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
    promoteDebt(state, events);
    return true;
  }
  if (player.money + liquidateValue(state, player.id) < 0) {
    bankruptPlayer(state, events, player.id, pending.creditorId);
    state.pending = null;
    promoteDebt(state, events);
    return true;
  }
  return false;
}
