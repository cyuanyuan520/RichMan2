import { describe, expect, it } from "vitest";
import {
  assertMapStructure,
  cards,
  characters,
  contentCounts,
  items,
  maps,
  validateContent,
} from "./index";
import { inkMap } from "../maps/ink";

describe("content", () => {
  it("validates without errors", () => {
    expect(() => validateContent()).not.toThrow();
  });

  it("exposes the expected registries", () => {
    expect(contentCounts.maps).toBe(3);
    expect(contentCounts.cards).toBe(24);
    expect(contentCounts.items).toBeGreaterThanOrEqual(8);
    expect(contentCounts.characters).toBe(6);
  });

  it("gives every map 40 tiles with complete coordinates for path layout", () => {
    for (const map of maps) {
      expect(map.tiles).toHaveLength(40);
      if (map.layout === "path") {
        for (const tile of map.tiles) {
          expect(tile.coord).toBeDefined();
        }
      }
      expect(map.groups).toHaveLength(8);
    }
  });

  it("keeps card ids unique", () => {
    const ids = cards.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects malformed maps", () => {
    const broken = {
      ...inkMap,
      tiles: inkMap.tiles.slice(0, 39),
    };
    expect(() => assertMapStructure(broken)).toThrow();
  });

  it("has eight characters with at least one skill", () => {
    for (const character of characters) {
      expect(character.skills.length).toBeGreaterThan(0);
    }
  });

  it("has items with positive prices", () => {
    for (const item of items) {
      expect(item.price).toBeGreaterThan(0);
    }
  });
});
