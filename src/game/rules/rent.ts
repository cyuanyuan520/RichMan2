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
      const base = def.rents?.[tile.level] ?? 0;
      const bonus =
        def.group && hasGroupMonopoly(state, tile.ownerId, def.group)
          ? state.config.economy.groupMonopolyRentBonus
          : 1;
      return Math.round(base * bonus * factors);
    }
    case "transport": {
      const count = countOwnedByKind(state, tile.ownerId, "transport");
      const base = state.config.economy.transportRents[count - 1] ?? 0;
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
