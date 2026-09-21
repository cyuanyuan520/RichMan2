import { describe, expect, it } from "vitest";
import { visiblePathLabels } from "./labels";

const coord = (x: number, y: number) => ({ x, y });

describe("visiblePathLabels", () => {
  it("keeps every label when tiles are far apart", () => {
    const coords = [coord(10, 10), coord(30, 20), coord(50, 30), coord(70, 40), coord(90, 50)];
    const visible = visiblePathLabels(coords, [0, 1, 2, 3, 4]);
    expect(visible.size).toBe(5);
  });

  it("drops the later label when two tiles overlap", () => {
    const coords = [coord(50, 50), coord(51, 50.4)];
    const visible = visiblePathLabels(coords, [0, 1]);
    expect(visible.has(0)).toBe(true);
    expect(visible.has(1)).toBe(false);
  });

  it("honours priority order over index order", () => {
    const coords = [coord(50, 50), coord(50.5, 50)];
    const visible = visiblePathLabels(coords, [1, 0]);
    expect(visible.has(1)).toBe(true);
    expect(visible.has(0)).toBe(false);
  });

  it("lets a lower label co-exist vertically", () => {
    const coords = [coord(50, 50), coord(50, 56)];
    const visible = visiblePathLabels(coords, [0, 1]);
    expect(visible.size).toBe(2);
  });

  it("skips missing coordinates and duplicates", () => {
    const coords = [coord(10, 10), undefined, coord(80, 80)];
    const visible = visiblePathLabels(coords, [0, 1, 2, 0]);
    expect([...visible].sort()).toEqual([0, 2]);
  });

  it("places flipped labels above the tile and de-clutters them there", () => {
    const coords = [coord(20, 10), coord(21, 10.5)];
    const visible = visiblePathLabels(coords, [0, 1], { flip: () => true });
    expect(visible.has(0)).toBe(true);
    expect(visible.has(1)).toBe(false);
  });

  it("hides a label that would sit under a token row", () => {
    const coords = [coord(50, 50)];
    const visible = visiblePathLabels(coords, [0], {
      obstacles: [{ x: 50, y: 57.5, halfWidth: 3, halfHeight: 2.8 }],
    });
    expect(visible.has(0)).toBe(false);
  });

  it("keeps a label when the token row is on the opposite side", () => {
    const coords = [coord(50, 50)];
    const visible = visiblePathLabels(coords, [0], {
      obstacles: [{ x: 50, y: 42, halfWidth: 3, halfHeight: 2.8 }],
    });
    expect(visible.has(0)).toBe(true);
  });
});
