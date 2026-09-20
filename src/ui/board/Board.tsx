"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { GameContent, GameState, PlayerId } from "@/game/core/types";
import { cn } from "@/lib/format";
import { TileView, TileTooltip } from "./TileView";
import { TokenBubble, type TokenSkin } from "./TokenLayer";
import { ringGridTemplate, ringSpot } from "./geometry";

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

  const inspectDef = inspect !== null ? state.tileDefs[inspect] : undefined;
  const inspectTile = inspect !== null ? state.tiles[inspect] : undefined;

  const tooltip =
    inspectDef && inspectTile ? (
      <div className="pointer-events-none absolute bottom-3 left-3 z-30 w-72 rounded-2xl border border-gold-400/25 bg-ink-950/94 p-3 shadow-panel">
        <TileTooltip
          def={inspectDef}
          tile={inspectTile}
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
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <div
            className="relative grid h-full max-h-[calc(100vh-6.5rem)] w-full max-w-[min(100%,calc(100vh-6.5rem))] gap-1 rounded-[2rem] border p-2 shadow-[0_40px_120px_-50px_rgba(0,0,0,0.95)]"
            style={{
              borderColor: map.theme.boardBorder,
              background: `${map.theme.boardBg}f2`,
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
                    highlighted={props.highlightTiles?.includes(index)}
                    selectable={props.selectableTiles?.includes(index)}
                    onSelect={() => props.onTileSelect?.(index)}
                    {...ownerOf(tile.ownerId)}
                  />
                  {here.length > 0 ? (
                    <div className="absolute inset-x-0.5 bottom-0.5 z-10 flex flex-wrap justify-center gap-0.5">
                      {state.players
                        .filter((player) => here.includes(player.id))
                        .map((player) => (
                          <motion.div
                            key={player.id}
                            layout
                            initial={{ scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 420, damping: 28 }}
                          >
                            <TokenBubble
                              player={player}
                              skin={props.skins[player.id] ?? { color: "#e0b64f", avatar: "", icon: "●" }}
                              size="sm"
                              active={player.id === props.activePlayerId}
                              onClick={() => props.onTokenClick?.(player.id)}
                            />
                          </motion.div>
                        ))}
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
              spot={(index) => {
                const spot = ringSpot(index);
                return {
                  left: `${((spot.col - 0.5) / 11) * 100}%`,
                  top: `${((spot.row - 0.5) / 11) * 100}%`,
                };
              }}
            />
          </div>
          {tooltip}
        </div>
      ) : (
        <PathBoard
          {...props}
          playersByTile={playersByTile}
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
  spot,
}: {
  floaters: Floater[];
  display: Record<PlayerId, number>;
  spot: (index: number) => { left: string; top: string };
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {floaters.map((floater) => {
        const position = spot(display[floater.playerId] ?? 0);
        return (
          <motion.span
            key={floater.id}
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: -40, scale: 1 }}
            transition={{ duration: 1.15, times: [0, 0.15, 0.62, 1], ease: "easeOut" }}
            className={cn(
              "absolute -translate-x-1/2 rounded-full px-2 py-0.5 text-sm font-semibold shadow-lg",
              floater.delta >= 0
                ? "bg-jade-500/90 text-paper-50"
                : "bg-cinnabar-500/90 text-paper-50",
            )}
            style={position}
          >
            {floater.delta >= 0 ? "+" : ""}
            {Math.round(floater.delta).toLocaleString("zh-CN")}
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
  setInspect,
  tooltip,
}: BoardProps & {
  playersByTile: Record<number, PlayerId[]>;
  setInspect: (value: number | null) => void;
  tooltip: React.ReactNode;
}) {
  const map = content.map;
  const activeIndex = activePlayerId ? (display[activePlayerId] ?? 0) : 0;
  const focus = map.tiles[activeIndex]?.coord ?? { x: 50, y: 50 };
  const zoom = 1.18;
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
