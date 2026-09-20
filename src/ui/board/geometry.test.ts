import { describe, expect, it } from "vitest";
import { ringGridTemplate, ringSide, ringSpot } from "./geometry";

describe("ring geometry", () => {
  const spots = Array.from({ length: 40 }, (_, index) => ringSpot(index));

  it("places 40 tiles on distinct perimeter cells of an 11x11 grid", () => {
    const keys = new Set(spots.map((spot) => `${spot.row}:${spot.col}`));
    expect(keys.size).toBe(40);
    for (const spot of spots) {
      const onPerimeter =
        spot.row === 1 || spot.row === 11 || spot.col === 1 || spot.col === 11;
      expect(onPerimeter, `${spot.row},${spot.col} on perimeter`).toBe(true);
    }
  });

  it("puts the corners on the expected indices", () => {
    expect(ringSpot(0)).toEqual({ row: 11, col: 1 });
    expect(ringSpot(10)).toEqual({ row: 1, col: 1 });
    expect(ringSpot(20)).toEqual({ row: 1, col: 11 });
    expect(ringSpot(30)).toEqual({ row: 11, col: 11 });
  });

  it("walks the ring in order without gaps", () => {
    for (let index = 0; index < 40; index += 1) {
      const current = ringSpot(index);
      const next = ringSpot((index + 1) % 40);
      const distance =
        Math.abs(current.row - next.row) + Math.abs(current.col - next.col);
      expect(distance, `step ${index} -> ${index + 1}`).toBe(1);
    }
  });

  it("wraps negative and overflow indices", () => {
    expect(ringSpot(40)).toEqual(ringSpot(0));
    expect(ringSpot(-1)).toEqual(ringSpot(39));
  });

  it("reports sides used for tile text direction", () => {
    expect(ringSide(0)).toBe("bottom");
    expect(ringSide(10)).toBe("top");
    expect(ringSide(5)).toBe("left");
    expect(ringSide(25)).toBe("right");
  });

  it("builds an 11 column grid template", () => {
    expect(ringGridTemplate).toBe("repeat(11, minmax(0, 1fr))");
  });
});
