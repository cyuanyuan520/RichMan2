import type {
  GameEvent,
  GameState,
  MoneyReason,
  Player,
  PlayerId,
} from "../core/types";

export function findPlayer(state: GameState, playerId: PlayerId): Player {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error(`Unknown player ${playerId}`);
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
  addMoney(state, events, toId, amount, reason);
}
