import type { GameContent, GameState, PlayerId, TileDef } from "../core/types";
import { rentFactors } from "../systems/skills";

export function countPropertiesInGroup(
  state: GameState,
  groupId: string,
): number {
  return state.tileDefs.filter(
    (tile) => tile.kind === "property" && tile.group === groupId,
  ).length;
}

export function countOwnedInGroup(
  state: GameState,
  playerId: PlayerId,
  groupId: string,
): number {
  return state.tiles.filter((tile) => {
    const def = state.tileDefs[tile.index] as TileDef;
    return (
      tile.ownerId === playerId && def.kind === "property" && def.group === groupId
    );
  }).length;
}

export function hasGroupMonopoly(
  state: GameState,
  playerId: PlayerId,
  groupId: string,
): boolean {
  return (
    countOwnedInGroup(state, playerId, groupId) ===
    countPropertiesInGroup(state, groupId)
  );
}

export function countOwnedByKind(
  state: GameState,
  playerId: PlayerId,
  kind: TileDef["kind"],
): number {
  return state.tiles.filter((tile) => {
    const def = state.tileDefs[tile.index] as TileDef;
    return tile.ownerId === playerId && def.kind === kind;
  }).length;
}

export function maxLevelFor(def: TileDef): number {
  const costLevels = def.upgradeCosts?.length ?? 0;
  const rentLevels = (def.rents?.length ?? 1) - 1;
  return Math.max(0, Math.min(costLevels, rentLevels));
}

export function rentForTile(
  state: GameState,
  content: GameContent,
  tileIndex: number,
  diceSum: number,
  payerId?: PlayerId,
): number {
  const tile = state.tiles[tileIndex];
  const def = state.tileDefs[tileIndex];
  if (!tile || !def || !tile.ownerId || tile.mortgaged) {
    return 0;
  }
  const factors =
    payerId !== undefined
      ? rentFactors(state, content, tile.ownerId, payerId)
      : 1;
  switch (def.kind) {
    case "property": {
      const rents = def.rents ?? [];
      const level = Math.min(tile.level, Math.max(0, rents.length - 1));
      const base = rents[level] ?? rents[rents.length - 1] ?? 0;
      const bonus =
        def.group && hasGroupMonopoly(state, tile.ownerId, def.group)
          ? state.config.economy.groupMonopolyRentBonus
          : 1;
      return Math.round(base * bonus * factors);
    }
    case "transport": {
      const count = countOwnedByKind(state, tile.ownerId, "transport");
      const rents = state.config.economy.transportRents;
      const index = Math.min(Math.max(1, count), rents.length) - 1;
      const base = rents[index] ?? rents[rents.length - 1] ?? 0;
      return Math.round(base * factors);
    }
    case "utility": {
      const count = countOwnedByKind(state, tile.ownerId, "utility");
      const multiplier =
        state.config.economy.utilityMultipliers[count - 1] ??
        state.config.economy.utilityMultipliers[0] ??
        4;
      return Math.round(diceSum * multiplier * factors);
    }
    default:
      return 0;
  }
}
