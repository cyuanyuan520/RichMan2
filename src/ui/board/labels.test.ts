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
});
