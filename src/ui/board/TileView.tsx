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
  const accent = group?.color ?? ownerColor ?? "#e0b64f";
  const icon = def.icon ?? kindIcon[def.kind] ?? "◆";
  const isProperty = def.kind === "property";
  const sideClass =
    variant === "ring" && side === "top" ? "flex-col-reverse" : "flex-col";

  return (
    <button
      type="button"
      onClick={selectable ? onSelect : undefined}
      disabled={!selectable}
      className={cn(
        "group relative flex w-full select-none overflow-hidden text-left transition-all duration-200",
        variant === "ring"
          ? "h-full min-h-0 flex-col justify-between rounded-xl border p-1"
          : "min-w-[84px] gap-0.5 rounded-2xl border p-1.5 backdrop-blur-sm",
        "bg-gradient-to-b from-ink-800/92 to-ink-900/95",
        "border-white/10",
        selectable && "cursor-pointer hover:z-20 hover:-translate-y-0.5 hover:border-gold-400/60",
        highlighted && "z-20 border-gold-400 shadow-gold",
        dimmed && "opacity-45 saturate-50",
        sideClass,
      )}
    >
      {isProperty ? (
        <span
          className="block h-1.5 w-full shrink-0 rounded-full"
          style={{ background: accent }}
        />
      ) : null}
      <span className="flex min-h-0 w-full flex-1 flex-col items-start gap-0.5">
        <span className="flex w-full items-center justify-between gap-1">
          <span className="text-[13px] leading-none">{icon}</span>
          {tile.level > 0 ? (
            <span className="flex items-center gap-0.5 text-[9px] text-gold-300">
              {Array.from({ length: Math.min(tile.level, 4) }).map((_, levelIndex) => (
                <span key={levelIndex}>🏠</span>
              ))}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "w-full truncate font-display leading-tight text-paper-50",
            variant === "ring" ? "text-[11px]" : "text-xs",
          )}
          title={def.name}
        >
          {def.name}
        </span>
        {variant === "ring" && def.price ? (
          <span className="text-[9px] leading-none text-paper-200/70">
            ¥{def.price}
          </span>
        ) : null}
        {variant === "ring" && !def.price ? (
          <span className="text-[9px] leading-none text-paper-200/50">
            {kindLabel[def.kind] ?? def.subtitle ?? ""}
          </span>
        ) : null}
      </span>
      {tile.ownerId ? (
        <span
          className="absolute inset-y-0 right-0 w-1"
          style={{ background: ownerColor ?? "#e0b64f" }}
          title={ownerName}
        />
      ) : null}
      {tile.mortgaged ? (
        <span className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.5)_0_6px,transparent_6px_12px)]" />
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
