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
  onClick,
}: {
  player: Player;
  skin: TokenSkin;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}) {
  const sizeClass =
    size === "lg"
      ? "h-9 w-9 text-lg"
      : size === "sm"
        ? "h-5 w-5 text-[10px]"
        : "h-7 w-7 text-sm";
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
      <span>{skin.icon}</span>
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

