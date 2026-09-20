import type {
  CardDef,
  CharacterDef,
  ItemDef,
  MapDef,
} from "@/game/core/types";
import { defaultEconomy } from "./economy";
import { chinaJourneyMap } from "../maps/china-journey";
import { inkMap } from "../maps/ink";
import { nostalgiaMap } from "../maps/nostalgia";
import { chanceCards, fateCards } from "./cards";
import { itemDefs } from "./items";
import { characterDefs, tokenDefs } from "./characters";
import {
  CardDefSchema,
  CharacterDefSchema,
  ItemDefSchema,
  MapDefSchema,
  EconomyConfigSchema,
} from "../schema";

export const maps: MapDef[] = [inkMap, nostalgiaMap, chinaJourneyMap];
export const cards: CardDef[] = [...chanceCards, ...fateCards];
export const items: ItemDef[] = itemDefs;
export const characters: CharacterDef[] = characterDefs;
export const tokens = tokenDefs;
export const economy = defaultEconomy;

export const mapsById = new Map(maps.map((map) => [map.id as string, map]));
export const cardsById = new Map(cards.map((card) => [card.id, card]));
export const itemsById = new Map(items.map((item) => [item.id, item]));
export const charactersById = new Map(
  characters.map((character) => [character.id as string, character]),
);

export function assertMapStructure(map: MapDef): void {
  MapDefSchema.parse(map);
  const counts: Record<string, number> = {};
  for (const tile of map.tiles) {
    counts[tile.kind] = (counts[tile.kind] ?? 0) + 1;
  }
  const expected: Record<string, number> = {
    start: 1,
    property: 22,
    transport: 4,
    utility: 2,
    chance: 2,
    fate: 2,
    tax: 2,
    jail: 1,
    hospital: 1,
    "goto-jail": 1,
    shop: 1,
    lottery: 1,
  };
  if (map.tiles.length !== 40) {
    throw new Error(`Map ${map.id} must have 40 tiles`);
  }
  for (const [kind, count] of Object.entries(expected)) {
    if (counts[kind] !== count) {
      throw new Error(
        `Map ${map.id} expected ${count} tiles of kind ${kind}, got ${counts[kind] ?? 0}`,
      );
    }
  }
  const groupIds = new Set(map.groups.map((group) => group.id));
  for (const tile of map.tiles) {
    if (tile.kind === "property") {
      if (!tile.group || !groupIds.has(tile.group)) {
        throw new Error(`Map ${map.id} tile ${tile.id} has invalid group`);
      }
      if (!tile.price || !tile.rents || !tile.upgradeCosts) {
        throw new Error(`Map ${map.id} tile ${tile.id} missing economy data`);
      }
    }
    if (map.layout === "path" && !tile.coord) {
      throw new Error(`Map ${map.id} path tile ${tile.id} missing coord`);
    }
  }
}

export function validateContent(): void {
  EconomyConfigSchema.parse(economy);
  for (const map of maps) {
    assertMapStructure(map);
  }
  for (const card of cards) {
    CardDefSchema.parse(card);
  }
  for (const item of items) {
    ItemDefSchema.parse(item);
  }
  for (const character of characters) {
    CharacterDefSchema.parse(character);
  }
  for (const def of [...cards, ...items]) {
    for (const effect of def.effects) {
      if (effect.kind === "gain-item" && !itemsById.has(effect.itemDefId)) {
        throw new Error(`${def.id} references unknown item ${effect.itemDefId}`);
      }
    }
  }
}

export const contentCounts = {
  maps: maps.length,
  cards: cards.length,
  items: items.length,
  characters: characters.length,
};
