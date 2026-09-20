import type {
  CardDef,
  CharacterDef,
  GameContent,
  ItemDef,
  MapDef,
} from "@/game/core/types";
import { computeContentHash } from "@/game/core/state";
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

export function buildGameContent(mapId: string): GameContent {
  const map = mapsById.get(mapId);
  if (!map) {
    throw new Error(`Unknown map ${mapId}`);
  }
  const cardMap: Record<string, CardDef> = {};
  for (const card of cards) {
    cardMap[card.id] = card;
  }
  const itemMap: Record<string, ItemDef> = {};
  for (const item of items) {
    itemMap[item.id] = item;
  }
  const characterMap: Record<string, CharacterDef> = {};
  for (const character of characters) {
    characterMap[character.id as string] = character;
  }
  const content = {
    map,
    cards: cardMap,
    items: itemMap,
    characters: characterMap,
  };
  return {
    ...content,
    contentHash: computeContentHash(content),
  };
}

function assertUniqueIds(): void {
  const seen = new Set<string>();
  for (const def of [...cards, ...items, ...characters]) {
    const id = def.id as string;
    if (seen.has(id)) {
      throw new Error(`Duplicate content id ${id}`);
    }
    seen.add(id);
  }
}

export function assertMapStructure(map: MapDef): void {
  MapDefSchema.parse(map);
  const counts: Record<string, number> = {};
  const tileIds = new Set<string>();
  for (const tile of map.tiles) {
    counts[tile.kind] = (counts[tile.kind] ?? 0) + 1;
    if (tileIds.has(tile.id)) {
      throw new Error(`Map ${map.id} has duplicate tile id ${tile.id}`);
    }
    tileIds.add(tile.id);
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
      if (tile.rents.length <= defaultEconomy.maxBuildingLevel) {
        throw new Error(
          `Map ${map.id} tile ${tile.id} rents must cover max building level`,
        );
      }
      if (tile.upgradeCosts.length < defaultEconomy.maxBuildingLevel) {
        throw new Error(
          `Map ${map.id} tile ${tile.id} upgradeCosts must cover max building level`,
        );
      }
    }
    if (map.layout === "path" && !tile.coord) {
      throw new Error(`Map ${map.id} path tile ${tile.id} missing coord`);
    }
  }
}

export function validateContent(): void {
  EconomyConfigSchema.parse(economy);
  assertUniqueIds();
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
  for (const def of [...cards, ...items, ...characters]) {
    const effects = [];
    if ("effects" in def) {
      effects.push(...def.effects);
    }
    if ("skills" in def) {
      for (const skill of def.skills) {
        effects.push(...(skill.effects ?? []));
      }
    }
    for (const effect of effects) {
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
