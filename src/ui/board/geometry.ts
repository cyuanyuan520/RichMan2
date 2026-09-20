import type { MapDef } from "@/game/core/types";

export interface GridSpot {
  row: number;
  col: number;
}

const RING_SIZE = 11;

export function ringSpot(index: number): GridSpot {
  const i = ((index % 40) + 40) % 40;
  if (i === 0) {
    return { row: RING_SIZE, col: 1 };
  }
  if (i <= 10) {
    return { row: RING_SIZE - i, col: 1 };
  }
  if (i <= 20) {
    return { row: 1, col: i - 9 };
  }
  if (i <= 30) {
    return { row: i - 19, col: RING_SIZE };
  }
  return { row: RING_SIZE, col: RING_SIZE - (i - 30) };
}

export const ringGridTemplate = `repeat(${RING_SIZE}, minmax(0, 1fr))`;

export type Side = "bottom" | "left" | "top" | "right";

export function ringSide(index: number): Side {
  const spot = ringSpot(index);
  if (spot.row === RING_SIZE) {
    return "bottom";
  }
  if (spot.row === 1) {
    return "top";
  }
  return spot.col === 1 ? "left" : "right";
}

export function pathPosition(map: MapDef, index: number): {
  x: number;
  y: number;
} {
  const coord = map.tiles[index]?.coord;
  if (coord) {
    return coord;
  }
  return { x: 50, y: 50 };
}

export function approxRingTilePercent(size: number): number {
  return 100 / size;
}
