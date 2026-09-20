import type { GameContent, GameEvent, GameState, PlayerId } from "../core/types";
import { addMoney, findPlayer } from "./money";
import { skillValueSum } from "../systems/skills";

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
  content: GameContent,
  playerId: PlayerId,
  steps: number,
): void {
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    return;
  }
  const size = state.tiles.length;
  const from = player.position;
  const fullPath = computePath(from, steps, size);
  if (fullPath.length === 0) {
    return;
  }
  const path: number[] = [];
  for (const index of fullPath) {
    const tile = state.tiles[index];
    const roadblock =
      steps > 0 && tile
        ? tile.effects.find(
            (effect) => effect.kind === "roadblock" && effect.ownerId !== playerId,
          )
        : undefined;
    path.push(index);
    if (roadblock) {
      tile!.effects = tile!.effects.filter((effect) => effect !== roadblock);
      events.push({ type: "roadblock-triggered", playerId, tileIndex: index });
      events.push({
        type: "log",
        text: `${player.name} 撞上路障，被迫在 ${state.tileDefs[index]?.name ?? "此处"} 停下`,
        icon: "🚧",
      });
      break;
    }
  }
  const to = path[path.length - 1] as number;
  const passedStart = steps > 0 && path.includes(0);
  player.position = to;
  player.stats.steps += path.length;
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
    const bonus = skillValueSum(state, content, playerId, "pass-start");
    if (bonus > 0) {
      addMoney(state, events, playerId, bonus, "skill");
      events.push({
        type: "log",
        text: `${player.name} 途经起点，额外获得 ${bonus} 元`,
        icon: "🧧",
      });
    }
  }
}

export function teleportPlayer(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  to: number,
): void {
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    return;
  }
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

export function nearestTileIndex(
  state: GameState,
  from: number,
  kind: string,
): number {
  const size = state.tiles.length;
  for (let step = 1; step <= size; step += 1) {
    const index = (from + step) % size;
    if (state.tileDefs[index]?.kind === kind) {
      return index;
    }
  }
  return -1;
}
