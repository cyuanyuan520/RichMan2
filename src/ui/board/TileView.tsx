"use client";

import type { MapDef, TileDef, TileState } from "@/game/core/types";
import { cn } from "@/lib/format";
import { Chip } from "@/ui/components/primitives";

const kindIcon: Record<string, string> = {
  start: "🚩",
  chance: "🃏",
  fate: "🎴",
  tax: "🏛️",
  jail: "⛓️",
  hospital: "🏥",
  "goto-jail": "👮",
  shop: "🛒",
  lottery: "🎟️",
  transport: "🚂",
  utility: "💡",
};

const kindLabel: Record<string, string> = {
  start: "起点",
  chance: "机遇",
  fate: "命运",
  tax: "税务",
  jail: "监狱",
  hospital: "医院",
  "goto-jail": "进监狱",
  shop: "道具店",
  lottery: "彩票行",
  transport: "交通",
  utility: "公用",
};

const kindAccent: Record<string, string> = {
  start: "#e0b64f",
  chance: "#a78bfa",
  fate: "#818cf8",
  tax: "#f59e0b",
  jail: "#94a3b8",
  hospital: "#2dd4bf",
  "goto-jail": "#fb7185",
  shop: "#34d399",
  lottery: "#f472b6",
  transport: "#38bdf8",
  utility: "#facc15",
};

export interface TileViewProps {
  map: MapDef;
  def: TileDef;
  tile: TileState;
  ownerName?: string;
  ownerColor?: string;
  highlighted?: boolean;
  selectable?: boolean;
  dimmed?: boolean;
  onSelect?: () => void;
  variant?: "ring" | "path";
  side?: "bottom" | "left" | "top" | "right";
}

export function TileView({
  map,
  def,
  tile,
  ownerName,
  ownerColor,
  highlighted,
  selectable,
  dimmed,
  onSelect,
  variant = "ring",
  side,
}: TileViewProps) {
  const group = def.group
    ? map.groups.find((entry) => entry.id === def.group)
    : undefined;
  const isProperty = def.kind === "property";
  const accent = group?.color ?? kindAccent[def.kind] ?? "#e0b64f";
  const icon = def.icon ?? kindIcon[def.kind] ?? "◆";
  const label = kindLabel[def.kind] ?? def.subtitle ?? "";
  const topOriented = variant === "ring" && side === "top";

  const band = (
    <span
      className={cn(
        "shrink-0",
        variant === "ring"
          ? topOriented
            ? "h-2 w-full rounded-b-full"
            : "h-2 w-full rounded-full"
          : "h-full w-2 rounded-full",
      )}
      style={{ background: `linear-gradient(90deg, ${accent}, ${accent}cc)` }}
    />
  );

  const body = (
    <span
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-0.5",
        variant === "path" && "items-start",
      )}
    >
      <span className="flex w-full items-center justify-between gap-1">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] leading-none"
          style={{ background: `${accent}2e`, boxShadow: `inset 0 0 0 1px ${accent}55` }}
        >
          {icon}
        </span>
        {tile.level > 0 ? (
          <span className="flex items-center gap-[2px]">
            {Array.from({ length: Math.min(tile.level, 4) }).map((_, levelIndex) => (
              <span
                key={levelIndex}
                className={cn("block bg-gold-300", variant === "ring" ? "h-1.5 w-1.5 rounded-[2px]" : "h-1 w-2.5 rounded-full")}
              />
            ))}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "w-full font-display font-medium leading-[1.15] text-paper-50",
          variant === "ring" ? "line-clamp-2 text-center text-[11px]" : "truncate text-xs",
        )}
        title={def.name}
      >
        {def.name}
      </span>
      {variant === "ring" ? (
        <span
          className="w-full rounded-[5px] bg-black/25 py-[1px] text-center text-[9px] leading-tight"
          style={{ color: def.price ? "#f3d9a4" : "rgba(232,226,214,0.55)" }}
        >
          {def.price ? `¥${def.price}` : label}
        </span>
      ) : def.price ? (
        <span className="text-[10px] leading-none text-gold-200/90">¥{def.price}</span>
      ) : (
        <span className="text-[10px] leading-none text-paper-200/60">{label}</span>
      )}
    </span>
  );

  return (
    <button
      type="button"
      onClick={selectable ? onSelect : undefined}
      disabled={!selectable}
      className={cn(
        "group relative flex w-full select-none overflow-hidden text-left transition-all duration-200",
        variant === "ring"
          ? cn("h-full min-h-0 gap-0.5 rounded-xl border px-0.5 pt-0.5 pb-0.5", topOriented ? "flex-col-reverse" : "flex-col")
          : "min-w-[92px] items-stretch gap-1.5 rounded-2xl border p-1.5 backdrop-blur-sm",
        "border-white/10",
        "bg-gradient-to-b from-ink-800/94 to-ink-950/96",
        selectable && "cursor-pointer hover:z-20 hover:-translate-y-0.5 hover:border-gold-400/60",
        highlighted && "z-20 border-gold-400 shadow-gold",
        dimmed && "opacity-45 saturate-50",
      )}
    >
      {variant === "ring" && isProperty ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(180deg, ${accent}24, transparent 58%)` }}
        />
      ) : null}
      {variant === "ring" && !isProperty ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(120% 90% at 50% 0%, ${accent}1f, transparent 62%)` }}
        />
      ) : null}

      {band}
      {body}

      {tile.ownerId ? (
        <>
          <span
            className="absolute inset-x-0 bottom-0 h-[5px]"
            style={{ background: ownerColor ?? "#e0b64f" }}
            title={ownerName}
          />
          {ownerName ? (
            <span
              className="absolute right-0.5 bottom-1 grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-bold text-ink-950"
              style={{ background: ownerColor ?? "#e0b64f" }}
              title={ownerName}
            >
              {ownerName.slice(0, 1)}
            </span>
          ) : null}
        </>
      ) : null}
      {tile.mortgaged ? (
        <>
          <span
            aria-hidden
            className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.55)_0_6px,transparent_6px_12px)]"
          />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-ink-950/80 px-1 text-[8px] text-rose-200">
            抵押
          </span>
        </>
      ) : null}
      {tile.effects.some((effect) => effect.kind === "roadblock") ? (
        <span className="absolute right-1 bottom-1 text-xs">🚧</span>
      ) : null}
    </button>
  );
}

export function TileTooltip({
  def,
  tile,
  ownerName,
  groupName,
}: {
  def: TileDef;
  tile: TileState;
  ownerName?: string;
  groupName?: string;
}) {
  const rent = def.rents && def.rents.length > 0 ? def.rents : [];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-base text-gold-300">{def.name}</span>
        {groupName ? <Chip>{groupName}</Chip> : null}
      </div>
      {def.desc ? (
        <p className="text-xs leading-relaxed text-paper-200/80">{def.desc}</p>
      ) : null}
      {def.price ? (
        <p className="text-xs text-paper-100">
          地价 ¥{def.price}
          {def.upgradeCosts?.[0] ? ` · 升级 ¥${def.upgradeCosts[0]}` : ""}
        </p>
      ) : null}
      {rent.length > 0 ? (
        <div className="grid grid-cols-5 gap-1 text-[10px] text-paper-200/80">
          {rent.map((value, index) => (
            <span key={index} className="rounded bg-white/5 px-1 py-0.5 text-center">
              {index === 0 ? "基础" : `${index}级`}
              <br />¥{value}
            </span>
          ))}
        </div>
      ) : null}
      {tile.ownerId ? (
        <p className="text-xs text-paper-100">
          归属：{ownerName ?? "—"}
          {tile.mortgaged ? " · 已抵押" : tile.level > 0 ? ` · ${tile.level} 级` : ""}
        </p>
      ) : null}
    </div>
  );
}
