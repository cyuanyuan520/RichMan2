"use client";

import type { Player } from "@/game/core/types";
import { cn } from "@/lib/format";

export interface TokenSkin {
  color: string;
  avatar: string;
  icon: string;
}

const STATUS_BADGE: Record<string, string> = {
  jailed: "⛓️",
  hospitalized: "🏥",
  bankrupt: "💀",
};

export function TokenBubble({
  player,
  skin,
  active,
  size = "md",
  showName,
  onClick,
}: {
  player: Player;
  skin: TokenSkin;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  onClick?: () => void;
}) {
  const sizeClass =
    size === "lg"
      ? "h-10 w-10 text-lg"
      : size === "sm"
        ? "h-6 w-6 text-[11px]"
        : "h-8 w-8 text-sm";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${player.name} · ${player.status === "active" ? "正常" : STATUS_BADGE[player.status] ?? ""}`}
      className={cn(
        "relative grid place-items-center rounded-full border-2 shadow-lg transition-transform",
        sizeClass,
        player.status === "bankrupt" && "grayscale opacity-60",
        active && "ring-2 ring-gold-300",
      )}
      style={{ background: skin.color, borderColor: "#0b1118" }}
    >
      {active ? (
        <span className="pointer-events-none absolute -inset-1 animate-ping rounded-full border-2 border-gold-300/60" />
      ) : null}
      <span className="leading-none">{skin.icon}</span>
      {showName ? (
        <span className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink-950/90 px-1 text-[9px] leading-tight text-paper-50">
          {player.name}
        </span>
      ) : null}
      {player.status !== "active" ? (
        <span className="absolute -top-2 -right-1 text-[10px]">
          {STATUS_BADGE[player.status]}
        </span>
      ) : null}
      {player.skipTurns > 0 ? (
        <span className="absolute -bottom-1 -right-1 text-[9px]">💤</span>
      ) : null}
    </button>
  );
}

