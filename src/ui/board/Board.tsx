"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { GameContent, GameState, PlayerId } from "@/game/core/types";
import { cn } from "@/lib/format";
import { TileView, TileTooltip } from "./TileView";
import { TokenBubble, type TokenSkin } from "./TokenLayer";
import { ringGridTemplate, ringSide, ringSpot } from "./geometry";

export interface Floater {
  id: number;
  playerId: PlayerId;
  delta: number;
}

export interface BoardProps {
  state: GameState;
  content: GameContent;
  display: Record<PlayerId, number>;
  skins: Record<PlayerId, TokenSkin>;
  activePlayerId: PlayerId | null;
  highlightTiles?: number[];
  selectableTiles?: number[];
  onTileSelect?: (index: number) => void;
  floaters?: Floater[];
  centerSlot?: React.ReactNode;
  onTokenClick?: (playerId: PlayerId) => void;
}

function useOwners(state: GameState, skins: Record<PlayerId, TokenSkin>) {
  return (ownerId: PlayerId | null) => {
    if (!ownerId) {
      return {};
    }
    const owner = state.players.find((player) => player.id === ownerId);
    return { ownerName: owner?.name, ownerColor: skins[ownerId]?.color };
  };
}

export function Board(props: BoardProps) {
  const { state, content } = props;
  const map = content.map;
  const [inspect, setInspect] = useState<number | null>(null);
  const ownerOf = useOwners(state, props.skins);

  const playersByTile = useMemo(() => {
    const grouped: Record<number, PlayerId[]> = {};
    for (const player of state.players) {
      const index = props.display[player.id] ?? player.position;
      grouped[index] = [...(grouped[index] ?? []), player.id];
    }
    return grouped;
  }, [state.players, props.display]);

  const names = useMemo(() => {
    const map: Record<PlayerId, string> = {};
    for (const player of state.players) {
      map[player.id] = player.name;
    }
    return map;
  }, [state.players]);

  const inspectDef = inspect !== null ? state.tileDefs[inspect] : undefined;
  const inspectTile = inspect !== null ? state.tiles[inspect] : undefined;

  const tooltip =
    inspectDef && inspectTile ? (
      <div className="pointer-events-none absolute bottom-3 left-3 z-30 w-72 rounded-2xl border border-gold-400/25 bg-ink-950/94 p-3 shadow-panel">
        <TileTooltip
          def={inspectDef}
          tile={inspectTile}
          economy={state.config.economy}
          {...ownerOf(inspectTile.ownerId)}
          groupName={
            inspectDef.group
              ? map.groups.find((entry) => entry.id === inspectDef.group)?.name
              : undefined
          }
        />
      </div>
    ) : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${map.theme.backgroundImage})`,
          backgroundSize: map.theme.backgroundSize,
          backgroundColor: map.theme.boardBg,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/25 via-transparent to-ink-950/45" />

      {map.layout === "ring" ? (
        <div className="absolute inset-0 flex items-center justify-center p-2 [@media(max-height:880px)]:p-1">
          <div
            className="relative h-full max-h-[calc(100vh-6.5rem)] w-full max-w-[min(100%,calc(100vh-6.5rem))] rounded-[2rem] border p-2.5 shadow-[0_40px_120px_-50px_rgba(0,0,0,0.95)] [@media(max-height:880px)]:p-1.5"
            style={{
              borderColor: map.theme.boardBorder,
              background: `${map.theme.boardBg}f2`,
            }}
          >
            <div
              className="pointer-events-none absolute inset-1.5 rounded-[1.65rem] border"
              style={{ borderColor: `${map.theme.accent}2e` }}
            />
            {(
              [
                ["left-2 top-2", "rotate-0"],
                ["right-2 top-2", "rotate-90"],
                ["right-2 bottom-2", "rotate-180"],
                ["left-2 bottom-2", "-rotate-90"],
              ] as Array<[string, string]>
            ).map(([position, rotation]) => (
              <span
                key={position}
                className={cn(
                  "pointer-events-none absolute text-[11px] leading-none",
                  position,
                  rotation,
                )}
                style={{ color: `${map.theme.accent}aa` }}
              >
                ◆
              </span>
            ))}
            <div
              className="relative grid h-full w-full gap-1 [@media(max-height:880px)]:gap-0.5"
              style={{
                gridTemplateColumns: ringGridTemplate,
                gridTemplateRows: ringGridTemplate,
              }}
            >
            {state.tileDefs.map((def, index) => {
              const spot = ringSpot(index);
              const tile = state.tiles[index];
              const here = playersByTile[index] ?? [];
              return (
                <div
                  key={def.id}
                  className="relative"
                  style={{ gridRow: spot.row, gridColumn: spot.col }}
                  onMouseEnter={() => setInspect(index)}
                  onMouseLeave={() => setInspect((current) => (current === index ? null : current))}
                >
                  <TileView
                    map={map}
                    def={def}
                    tile={tile}
                    side={ringSide(index)}
                    highlighted={props.highlightTiles?.includes(index)}
                    selectable={props.selectableTiles?.includes(index)}
                    onSelect={() => props.onTileSelect?.(index)}
                    {...ownerOf(tile.ownerId)}
                  />
                  {here.length > 0 ? (
                    <div className="absolute inset-x-0.5 bottom-0.5 z-10 flex justify-center">
                      <div className="flex -space-x-1.5">
                        {state.players
                          .filter((player) => here.includes(player.id))
                          .map((player) => (
                            <motion.div
                              key={player.id}
                              layout
                              initial={{ scale: 0.4, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: "spring", stiffness: 420, damping: 28 }}
                              className="relative"
                            >
                              <TokenBubble
                                player={player}
                                skin={props.skins[player.id] ?? { color: "#e0b64f", avatar: "", icon: "●" }}
                                size={here.length >= 3 ? "sm" : "md"}
                                active={player.id === props.activePlayerId}
                                showName={player.id === props.activePlayerId && here.length < 3}
                                onClick={() => props.onTokenClick?.(player.id)}
                              />
                            </motion.div>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div
              className="relative overflow-hidden rounded-2xl border border-white/8 bg-ink-950/40 backdrop-blur-[2px]"
              style={{ gridRow: "2 / 11", gridColumn: "2 / 11" }}
            >
              {props.centerSlot}
            </div>
            <FloaterLayer
              floaters={props.floaters ?? []}
              display={props.display}
              names={names}
              spot={(index) => {
                const spot = ringSpot(index);
                return {
                  left: `${((spot.col - 0.5) / 11) * 100}%`,
                  top: `${((spot.row - 0.5) / 11) * 100}%`,
                };
              }}
            />
            </div>
          </div>
          {tooltip}
        </div>
      ) : (
        <PathBoard
          {...props}
          playersByTile={playersByTile}
          names={names}
          setInspect={setInspect}
          tooltip={tooltip}
        />
      )}
    </div>
  );
}

function FloaterLayer({
  floaters,
  display,
  names,
  spot,
}: {
  floaters: Floater[];
  display: Record<PlayerId, number>;
  names: Record<PlayerId, string>;
  spot: (index: number) => { left: string; top: string };
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {floaters.map((floater) => {
        const position = spot(display[floater.playerId] ?? 0);
        return (
          <motion.span
            key={floater.id}
            initial={{ opacity: 0, y: 14, scale: 0.7 }}
            animate={{ opacity: [0, 1, 1, 0], y: -52, scale: 1 }}
            transition={{ duration: 1.5, times: [0, 0.12, 0.66, 1], ease: "easeOut" }}
            className={cn(
              "absolute -translate-x-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 text-base font-semibold shadow-xl backdrop-blur-sm",
              floater.delta >= 0
                ? "border-emerald-200/50 bg-jade-600/92 text-paper-50"
                : "border-rose-200/50 bg-cinnabar-600/92 text-paper-50",
            )}
            style={position}
          >
            <span className="mr-1 text-[11px] font-normal opacity-85">
              {names[floater.playerId] ?? ""}
            </span>
            {floater.delta >= 0 ? "+" : "-"}¥
            {Math.abs(Math.round(floater.delta)).toLocaleString("zh-CN")}
          </motion.span>
        );
      })}
    </div>
  );
}

function PathBoard({
  state,
  content,
  display,
  skins,
  activePlayerId,
  highlightTiles,
  selectableTiles,
  onTileSelect,
  onTokenClick,
  floaters,
  playersByTile,
  names,
  setInspect,
  tooltip,
}: BoardProps & {
  playersByTile: Record<number, PlayerId[]>;
  names: Record<PlayerId, string>;
  setInspect: (value: number | null) => void;
  tooltip: React.ReactNode;
}) {
  const map = content.map;
  const activeIndex = activePlayerId ? (display[activePlayerId] ?? 0) : 0;
  const focus = map.tiles[activeIndex]?.coord ?? { x: 50, y: 50 };
  const zoom = 1.08;
  const ownerOf = useOwners(state, skins);

  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden p-2">
      <motion.div
        className="relative aspect-[3/2] max-h-[calc(100vh-6.5rem)] w-full max-w-[min(100%,calc((100vh-6.5rem)*1.5))] rounded-[1.75rem] border shadow-[0_40px_120px_-50px_rgba(0,0,0,0.95)]"
        style={{ borderColor: map.theme.boardBorder, background: `${map.theme.boardBg}f0` }}
        animate={{
          scale: zoom,
          x: `${(50 - focus.x) * zoom}%`,
          y: `${(50 - focus.y) * zoom}%`,
        }}
        transition={{ type: "spring", stiffness: 55, damping: 18, mass: 0.9 }}
      >
        {state.tileDefs.map((def, index) => {
          const coord = map.tiles[index]?.coord ?? { x: 50, y: 50 };
          const here = playersByTile[index] ?? [];
          return (
            <div
              key={def.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
              onMouseEnter={() => setInspect(index)}
              onMouseLeave={() => setInspect(null)}
            >
              <TileView
                variant="path"
                map={map}
                def={def}
                tile={state.tiles[index]}
                active={index === activeIndex}
                highlighted={highlightTiles?.includes(index)}
                selectable={selectableTiles?.includes(index)}
                onSelect={() => onTileSelect?.(index)}
                {...ownerOf(state.tiles[index]?.ownerId ?? null)}
              />
              {here.length > 0 ? (
                <div className="absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-[130%] gap-0.5">
                  {state.players
                    .filter((player) => here.includes(player.id))
                    .map((player) => (
                      <TokenBubble
                        key={player.id}
                        player={player}
                        skin={skins[player.id] ?? { color: "#e0b64f", avatar: "", icon: "●" }}
                        size="sm"
                        active={player.id === activePlayerId}
                        onClick={() => onTokenClick?.(player.id)}
                      />
                    ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <FloaterLayer
          floaters={floaters ?? []}
          display={display}
          names={names}
          spot={(index) => {
            const coord = map.tiles[index]?.coord ?? { x: 50, y: 50 };
            return { left: `${coord.x}%`, top: `${coord.y}%` };
          }}
        />
      </motion.div>
      {tooltip}
    </div>
  );
}
