"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { GameContent, GameState, PlayerId } from "@/game/core/types";
import { cn } from "@/lib/format";
import { TileView, TileTooltip } from "./TileView";
import { TokenBubble, type TokenSkin } from "./TokenLayer";
import { ringGridTemplate, ringSide, ringSpot } from "./geometry";
import { visiblePathLabels } from "./labels";

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function useOwners(state: GameState, skins: Record<PlayerId, TokenSkin>) {
  return (ownerId: PlayerId | null) => {
    if (!ownerId) {
      return {};
    }
    const owner = state.players.find((player) => player.id === ownerId);
    return { ownerName: owner?.name, ownerColor: skins[ownerId]?.color };
  };
}

function groupTokens(players: GameState["players"], display: Record<PlayerId, number>) {
  const grouped: Record<number, PlayerId[]> = {};
  for (const player of players) {
    const index = display[player.id] ?? player.position;
    grouped[index] = [...(grouped[index] ?? []), player.id];
  }
  return grouped;
}

function tokenRowSize(count: number): "xs" | "sm" | "md" {
  if (count >= 3) {
    return "xs";
  }
  return count === 2 ? "sm" : "md";
}

export function Board(props: BoardProps) {
  const { state, content } = props;
  const map = content.map;
  const [inspect, setInspect] = useState<number | null>(null);
  const ownerOf = useOwners(state, props.skins);

  const playersByTile = useMemo(
    () => groupTokens(state.players, props.display),
    [state.players, props.display],
  );

  const names = useMemo(() => {
    const map: Record<PlayerId, string> = {};
    for (const player of state.players) {
      map[player.id] = player.name;
    }
    return map;
  }, [state.players]);

  if (map.layout === "ring") {
    return (
      <RingBoard
        {...props}
        playersByTile={playersByTile}
        names={names}
        inspect={inspect}
        setInspect={setInspect}
        ownerOf={ownerOf}
      />
    );
  }

  return (
    <PathBoard
      {...props}
      playersByTile={playersByTile}
      names={names}
      inspect={inspect}
      setInspect={setInspect}
      ownerOf={ownerOf}
    />
  );
}

type LayoutExtras = {
  playersByTile: Record<number, PlayerId[]>;
  names: Record<PlayerId, string>;
  inspect: number | null;
  setInspect: (value: number | null) => void;
  ownerOf: (ownerId: PlayerId | null) => { ownerName?: string; ownerColor?: string };
};

function TileTooltipCard({
  state,
  content,
  index,
  ownerOf,
}: {
  state: GameState;
  content: GameContent;
  index: number;
  ownerOf: LayoutExtras["ownerOf"];
}) {
  const def = state.tileDefs[index];
  const tile = state.tiles[index];
  if (!def || !tile) {
    return null;
  }
  const groupName = def.group
    ? content.map.groups.find((entry) => entry.id === def.group)?.name
    : undefined;
  return (
    <TileTooltip
      def={def}
      tile={tile}
      economy={state.config.economy}
      {...ownerOf(tile.ownerId)}
      groupName={groupName}
    />
  );
}

function RingBoard({
  state,
  content,
  display,
  skins,
  activePlayerId,
  highlightTiles,
  selectableTiles,
  onTileSelect,
  floaters,
  centerSlot,
  onTokenClick,
  playersByTile,
  names,
  inspect,
  setInspect,
  ownerOf,
}: BoardProps & LayoutExtras) {
  const map = content.map;
  const spot = inspect !== null ? ringSpot(inspect) : null;
  const tooltipLeft = spot ? clamp(((spot.col - 0.5) / 11) * 100, 15, 85) : 50;
  const tooltipTop = spot ? clamp(((spot.row - 0.5) / 11) * 100, 6, 94) : 50;
  const flipY = tooltipTop < 32;

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
              const tileSpot = ringSpot(index);
              const tile = state.tiles[index];
              const here = playersByTile[index] ?? [];
              return (
                <div
                  key={def.id}
                  className="relative"
                  style={{ gridRow: tileSpot.row, gridColumn: tileSpot.col }}
                  onMouseEnter={() => setInspect(index)}
                  onMouseLeave={() => setInspect(null)}
                >
                  <TileView
                    map={map}
                    def={def}
                    tile={tile}
                    side={ringSide(index)}
                    highlighted={highlightTiles?.includes(index)}
                    selectable={selectableTiles?.includes(index)}
                    onSelect={() => onTileSelect?.(index)}
                    {...ownerOf(tile.ownerId)}
                  />
                  {here.length > 0 ? (
                    <div className="absolute inset-x-0.5 bottom-0.5 z-10 flex items-end justify-center gap-[3px] [@media(max-height:880px)]:gap-[2px]">
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
                              skin={skins[player.id] ?? { color: "#e0b64f", avatar: "", icon: "●" }}
                              size={tokenRowSize(here.length)}
                              active={player.id === activePlayerId}
                              showName={player.id === activePlayerId && here.length < 3}
                              onClick={() => onTokenClick?.(player.id)}
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
              {centerSlot}
            </div>
            <FloaterLayer
              floaters={floaters ?? []}
              display={display}
              names={names}
              spot={(index) => {
                const floaterSpot = ringSpot(index);
                return {
                  left: `${((floaterSpot.col - 0.5) / 11) * 100}%`,
                  top: `${((floaterSpot.row - 0.5) / 11) * 100}%`,
                };
              }}
            />
            {inspect !== null ? (
              <div
                className="pointer-events-none absolute z-30 w-64 rounded-2xl border border-gold-400/25 bg-ink-950/94 p-3 shadow-panel"
                style={{
                  left: `${tooltipLeft}%`,
                  top: `${tooltipTop}%`,
                  transform: `translate(-50%, ${flipY ? "12px" : "calc(-100% - 12px)"})`,
                }}
              >
                <TileTooltipCard
                  state={state}
                  content={content}
                  index={inspect}
                  ownerOf={ownerOf}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
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
  inspect,
  setInspect,
  ownerOf,
}: BoardProps & LayoutExtras) {
  const map = content.map;
  const coords = useMemo(() => map.tiles.map((tile) => tile.coord ?? { x: 50, y: 50 }), [map]);
  const activeIndex = activePlayerId ? (display[activePlayerId] ?? 0) : 0;

  const labels = useMemo(() => {
    const priority: number[] = [];
    const push = (index: number | undefined) => {
      if (index !== undefined && index >= 0 && !priority.includes(index)) {
        priority.push(index);
      }
    };
    push(activeIndex);
    for (const index of highlightTiles ?? []) {
      push(index);
    }
    for (const index of selectableTiles ?? []) {
      push(index);
    }
    for (let index = 0; index < coords.length; index += 1) {
      push(index);
    }
    return visiblePathLabels(coords, priority);
  }, [coords, activeIndex, highlightTiles, selectableTiles]);

  const focus = map.tiles[activeIndex]?.coord ?? { x: 50, y: 50 };
  const zoom = 1.12;
  const shiftX = clamp((50 - focus.x) * zoom, -6, 6);
  const shiftY = clamp((50 - focus.y) * zoom, -6, 6);
  const route = coords.map((coord) => `${coord.x * 1.5},${coord.y}`).join(" ");

  const tooltipCoord = inspect !== null ? coords[inspect] : undefined;
  const tooltipLeft = tooltipCoord ? clamp(tooltipCoord.x, 13, 87) : 50;
  const tooltipTop = tooltipCoord ? clamp(tooltipCoord.y, 6, 92) : 50;
  const flipY = tooltipTop < 32;

  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden p-2">
      <div
        className="relative aspect-[3/2] max-h-[calc(100vh-6.5rem)] w-full max-w-[min(100%,calc((100vh-6.5rem)*1.5))] overflow-hidden rounded-[1.75rem] border shadow-[0_40px_120px_-50px_rgba(0,0,0,0.95)]"
        style={{ borderColor: map.theme.boardBorder, background: map.theme.boardBg }}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ scale: zoom, x: `${shiftX}%`, y: `${shiftY}%` }}
          transition={{ type: "spring", stiffness: 55, damping: 18, mass: 0.9 }}
        >
          <div
            className="absolute inset-0 bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${map.theme.backgroundImage})`,
              backgroundSize: "cover",
              backgroundColor: map.theme.boardBg,
            }}
          />
          <svg
            viewBox="0 0 150 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            <polyline
              points={route}
              fill="none"
              stroke="rgba(255,252,242,0.6)"
              strokeWidth="1.15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={route}
              fill="none"
              stroke={map.theme.accent}
              strokeWidth="0.5"
              strokeDasharray="1.7 1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.75"
            />
            {coords.map((coord, index) => (
              <circle
                key={index}
                cx={coord.x * 1.5}
                cy={coord.y}
                r={index === activeIndex ? 0.85 : 0.5}
                fill={index === activeIndex ? "#e0b64f" : map.theme.accent}
                opacity={index === activeIndex ? 1 : 0.65}
              />
            ))}
          </svg>
          {state.tileDefs.map((def, index) => {
            const coord = coords[index];
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
              </div>
            );
          })}
          <div className="pointer-events-none absolute inset-0 z-10">
            {state.tileDefs.map((def, index) => {
              if (!labels.has(index)) {
                return null;
              }
              const coord = coords[index];
              const above = coord.y < 26;
              return (
                <span
                  key={def.id}
                  className="absolute whitespace-nowrap rounded bg-ink-950/78 px-1 text-[9px] leading-tight text-paper-50 shadow-[0_1px_3px_rgba(0,0,0,0.55)]"
                  style={{
                    left: `${coord.x}%`,
                    top: `${coord.y}%`,
                    transform: `translate(-50%, ${above ? "calc(-100% - 21px)" : "21px"})`,
                  }}
                >
                  {def.name}
                </span>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-0 z-20">
            {state.tileDefs.map((def, index) => {
              const here = playersByTile[index] ?? [];
              if (here.length === 0) {
                return null;
              }
              const coord = coords[index];
              const below = coord.y < 26;
              return (
                <div
                  key={def.id}
                  className="absolute"
                  style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
                >
                  <div
                    className="absolute left-1/2 flex items-end gap-[3px]"
                    style={{
                      transform: `translate(-50%, ${below ? "24px" : "calc(-100% - 24px)"})`,
                    }}
                  >
                    {state.players
                      .filter((player) => here.includes(player.id))
                      .map((player) => (
                        <TokenBubble
                          key={player.id}
                          player={player}
                          skin={skins[player.id] ?? { color: "#e0b64f", avatar: "", icon: "●" }}
                          size={tokenRowSize(here.length)}
                          active={player.id === activePlayerId}
                          onClick={() => onTokenClick?.(player.id)}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
          <FloaterLayer
            floaters={floaters ?? []}
            display={display}
            names={names}
            spot={(index) => ({
              left: `${coords[index]?.x ?? 50}%`,
              top: `${coords[index]?.y ?? 50}%`,
            })}
          />
          {inspect !== null ? (
            <div
              className="pointer-events-none absolute z-30 w-64 rounded-2xl border border-gold-400/25 bg-ink-950/94 p-3 shadow-panel"
              style={{
                left: `${tooltipLeft}%`,
                top: `${tooltipTop}%`,
                transform: `translate(-50%, ${flipY ? "12px" : "calc(-100% - 12px)"})`,
              }}
            >
              <TileTooltipCard state={state} content={content} index={inspect} ownerOf={ownerOf} />
            </div>
          ) : null}
        </motion.div>
        <div
          className="pointer-events-none absolute inset-1.5 z-20 rounded-[1.5rem] border"
          style={{ borderColor: `${map.theme.accent}30` }}
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
              "pointer-events-none absolute z-20 text-[11px] leading-none",
              position,
              rotation,
            )}
            style={{ color: `${map.theme.accent}aa` }}
          >
            ◆
          </span>
        ))}
        <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_70px_rgba(24,16,8,0.45)]" />
      </div>
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
