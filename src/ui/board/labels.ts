import type { TileCoord } from "@/game/core/types";

export interface LabelPlacementOptions {
  /** Board-space half width of a label chip, in % of board width. */
  halfWidth?: number;
  /** Board-space height of a label chip, in % of board height. */
  height?: number;
  /** Vertical offset from the tile center to the top of its label, in % of board height. */
  offsetY?: number;
}

/**
 * Greedy label de-clutter for the scroll board: walks tiles in priority order
 * and keeps a label only when its bounding box does not overlap an accepted
 * one. Labels render in their own layer above the map stamps, so chips never
 * stack and never hide behind a neighbouring marker.
 */
export function visiblePathLabels(
  coords: Array<TileCoord | undefined>,
  priority: number[],
  options: LabelPlacementOptions = {},
): Set<number> {
  const halfWidth = options.halfWidth ?? 2.75;
  const height = options.height ?? 2.9;
  const offsetY = options.offsetY ?? 3.1;
  const placed: Array<{ x1: number; x2: number; y1: number; y2: number }> = [];
  const visible = new Set<number>();

  for (const index of priority) {
    const coord = coords[index];
    if (!coord || visible.has(index)) {
      continue;
    }
    const x1 = coord.x - halfWidth;
    const x2 = coord.x + halfWidth;
    const y1 = coord.y + offsetY;
    const y2 = y1 + height;
    const clash = placed.some((rect) => x1 < rect.x2 && x2 > rect.x1 && y1 < rect.y2 && y2 > rect.y1);
    if (!clash) {
      placed.push({ x1, x2, y1, y2 });
      visible.add(index);
    }
  }

  return visible;
}
