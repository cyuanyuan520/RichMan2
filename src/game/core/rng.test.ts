import { describe, expect, it } from "vitest";
import {
  createRng,
  rngInt,
  rngNext,
  rngShuffle,
  seedFromString,
} from "./rng";

describe("rng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const [va, sa] = rngNext(a);
    const [vb, sb] = rngNext(b);
    expect(va).toBe(vb);
    expect(sa).toEqual(sb);
  });

  it("produces different streams for different seeds", () => {
    const [a] = rngNext(createRng(1));
    const [b] = rngNext(createRng(2));
    expect(a).not.toBe(b);
  });

  it("hashes strings to stable seeds", () => {
    expect(seedFromString("hello")).toBe(seedFromString("hello"));
    expect(seedFromString("hello")).not.toBe(seedFromString("world"));
  });

  it("keeps rngInt within inclusive bounds", () => {
    let state = createRng(7);
    for (let i = 0; i < 500; i += 1) {
      const [value, next] = rngInt(state, 1, 6);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      state = next;
    }
  });

  it("shuffles as a permutation", () => {
    const input = Array.from({ length: 40 }, (_, index) => index);
    const [result] = rngShuffle(createRng(99), input);
    expect([...result].sort((a, b) => a - b)).toEqual(input);
  });

  it("produces a roughly uniform distribution", () => {
    let state = createRng(2026);
    const buckets = [0, 0, 0, 0, 0, 0];
    const total = 6000;
    for (let i = 0; i < total; i += 1) {
      const [value, next] = rngInt(state, 1, 6);
      buckets[value - 1] = (buckets[value - 1] as number) + 1;
      state = next;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(total / 6 - 200);
      expect(count).toBeLessThan(total / 6 + 200);
    }
  });
});
