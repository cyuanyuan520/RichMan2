export type PlayerId = string & { readonly __playerId: unique symbol };
export type TileId = string & { readonly __tileId: unique symbol };
export type ItemInstanceId = string & { readonly __itemInstanceId: unique symbol };
export type CharacterId = string & { readonly __characterId: unique symbol };
export type MapId = string & { readonly __mapId: unique symbol };

export const asPlayerId = (value: string): PlayerId => value as PlayerId;
export const asTileId = (value: string): TileId => value as TileId;
export const asItemInstanceId = (value: string): ItemInstanceId =>
  value as ItemInstanceId;
export const asCharacterId = (value: string): CharacterId =>
  value as CharacterId;
export const asMapId = (value: string): MapId => value as MapId;
