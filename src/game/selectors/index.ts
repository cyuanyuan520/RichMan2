import type {
  GameState,
  Player,
  PlayerId,
  TileDef,
  TileState,
} from "../core/types";
import {
  activePlayers,
  currentPlayer,
  netWorth,
  standingsByNetWorth,
} from "../core/reducer";
import { findPlayer } from "../rules/money";
import { rentForTile } from "../rules/rent";

export {
  activePlayers,
  currentPlayer,
  findPlayer,
  netWorth,
  standingsByNetWorth,
  rentForTile,
};

export function playerOnSeat(state: GameState, seat: number): Player | null {
  return state.players[seat] ?? null;
}

export function canBuyTile(
  state: GameState,
  playerId: PlayerId,
  tileIndex: number,
): boolean {
  const tile = state.tiles[tileIndex];
  const def = state.tileDefs[tileIndex] as TileDef | undefined;
  if (!tile || !def || tile.ownerId !== null) {
    return false;
  }
  if (def.kind !== "property" && def.kind !== "transport" && def.kind !== "utility") {
    return false;
  }
  const player = findPlayer(state, playerId);
  return player.money >= (def.price ?? 0);
}

export function canUpgradeTile(
  state: GameState,
  playerId: PlayerId,
  tileIndex: number,
): boolean {
  const tile = state.tiles[tileIndex];
  const def = state.tileDefs[tileIndex] as TileDef | undefined;
  if (!tile || !def || def.kind !== "property") {
    return false;
  }
  if (tile.ownerId !== playerId || tile.mortgaged) {
    return false;
  }
  if (tile.level >= state.config.economy.maxBuildingLevel) {
    return false;
  }
  const player = findPlayer(state, playerId);
  const cost = def.upgradeCosts?.[tile.level] ?? 0;
  return player.money >= cost;
}

export function upgradeCostOf(
  state: GameState,
  tileIndex: number,
): number {
  const tile = state.tiles[tileIndex];
  const def = state.tileDefs[tileIndex] as TileDef | undefined;
  if (!tile || !def) {
    return 0;
  }
  return def.upgradeCosts?.[tile.level] ?? 0;
}

export function ownedTilesOf(state: GameState, playerId: PlayerId): TileState[] {
  return state.tiles.filter((tile) => tile.ownerId === playerId);
}

export function tileDefOf(state: GameState, tileIndex: number): TileDef {
  const def = state.tileDefs[tileIndex];
  if (!def) {
    throw new Error(`Unknown tile index ${tileIndex}`);
  }
  return def;
}

export function groupOwnership(
  state: GameState,
  groupId: string,
): Array<{ tile: TileState; def: TileDef }> {
  return state.tiles
    .map((tile, index) => ({ tile, def: state.tileDefs[index] as TileDef }))
    .filter((entry) => entry.def.kind === "property" && entry.def.group === groupId);
}

export function botPlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.isBot && player.status !== "bankrupt");
}
