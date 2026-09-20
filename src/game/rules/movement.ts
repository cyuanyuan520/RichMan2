import type { GameEvent, GameState, PlayerId } from "../core/types";
import { addMoney, findPlayer } from "./money";

export function computePath(
  from: number,
  steps: number,
  size: number,
): number[] {
  const path: number[] = [];
  if (steps === 0) {
    return path;
  }
  const direction = steps > 0 ? 1 : -1;
  let cursor = from;
  for (let i = 0; i < Math.abs(steps); i += 1) {
    cursor = (cursor + direction + size) % size;
    path.push(cursor);
  }
  return path;
}

export function movePlayer(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  steps: number,
): void {
  const player = findPlayer(state, playerId);
  const size = state.tiles.length;
  const from = player.position;
  const path = computePath(from, steps, size);
  if (path.length === 0) {
    return;
  }
  const to = path[path.length - 1] as number;
  const passedStart = steps > 0 && path.includes(0);
  player.position = to;
  player.stats.steps += Math.abs(steps);
  events.push({
    type: "token-moved",
    playerId,
    from,
    to,
    path,
    passedStart,
  });
  if (passedStart) {
    addMoney(state, events, playerId, state.config.economy.goSalary, "salary");
  }
}

export function teleportPlayer(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  to: number,
): void {
  const player = findPlayer(state, playerId);
  const from = player.position;
  player.position = to;
  events.push({
    type: "token-moved",
    playerId,
    from,
    to,
    path: [],
    passedStart: false,
  });
}

export function findTileIndex(
  state: GameState,
  kind: string,
  occurrence = 0,
): number {
  let seen = 0;
  for (let i = 0; i < state.tileDefs.length; i += 1) {
    if (state.tileDefs[i]?.kind === kind) {
      if (seen === occurrence) {
        return i;
      }
      seen += 1;
    }
  }
  return -1;
}
