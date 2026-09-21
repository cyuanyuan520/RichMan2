"use client";

import { useId } from "react";
import type { Player } from "@/game/core/types";
import { cn } from "@/lib/format";

export interface TokenSkin {
  color: string;
  avatar: string;
  icon: string;
}

export type TokenSize = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<TokenSize, number> = {
  xs: 19,
  sm: 24,
  md: 31,
  lg: 40,
};

const STATUS_BADGE: Record<string, string> = {
  jailed: "⛓️",
  hospitalized: "🏥",
  bankrupt: "💀",
};

export function PawnPiece({
  color,
  icon,
  size = "md",
  dimmed,
  className,
}: {
  color: string;
  icon: string;
  size?: TokenSize;
  dimmed?: boolean;
  className?: string;
}) {
  const px = SIZE_PX[size];
  const gradientId = useId().replace(/:/g, "");
  return (
    <span
      className={cn("relative block shrink-0", dimmed && "opacity-70 saturate-50", className)}
      style={{ width: px, height: px * 1.3 }}
    >
      <svg viewBox="0 0 44 56" className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id={`${gradientId}-head`} cx="36%" cy="26%" r="82%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
            <stop offset="42%" stopColor={color} />
            <stop offset="100%" stopColor="#0b1118" stopOpacity="0.88" />
          </radialGradient>
          <linearGradient id={`${gradientId}-stem`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="38%" stopColor={color} />
            <stop offset="100%" stopColor="#0b1118" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        <ellipse cx="22" cy="51.5" rx="13.6" ry="3.8" fill="rgba(0,0,0,0.42)" />
        <ellipse cx="22" cy="47" rx="13" ry="4.6" fill="#101720" />
        <ellipse cx="22" cy="46" rx="11.2" ry="3.3" fill={color} fillOpacity="0.82" />
        <path
          d="M22 12.5 C 28.4 21.5, 31.6 35.5, 32.8 44 L 11.2 44 C 12.4 35.5, 15.6 21.5, 22 12.5 Z"
          fill={`url(#${gradientId}-stem)`}
          stroke="#0b1118"
          strokeWidth="1"
        />
        <ellipse cx="22" cy="43.6" rx="10.6" ry="2.6" fill="#0b1118" opacity="0.5" />
        <ellipse cx="22" cy="13.6" rx="6.4" ry="2.6" fill="#0b1118" opacity="0.5" />
        <circle
          cx="22"
          cy="11"
          r="10.3"
          fill={`url(#${gradientId}-head)`}
          stroke="#0b1118"
          strokeWidth="1.4"
        />
        <ellipse cx="18.2" cy="7.2" rx="3.4" ry="2.2" fill="#ffffff" opacity="0.45" />
      </svg>
      <span
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 leading-none"
        style={{ top: "19.6%", fontSize: Math.max(8, Math.round(px * 0.42)) }}
      >
        {icon}
      </span>
    </span>
  );
}

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
  size?: TokenSize;
  showName?: boolean;
  onClick?: () => void;
}) {
  const px = SIZE_PX[size];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${player.name} · ${player.status === "active" ? "正常" : STATUS_BADGE[player.status] ?? ""}`}
      className={cn(
        "pointer-events-auto relative shrink-0 transition-transform",
        player.status === "bankrupt" && "grayscale opacity-60",
        onClick && "cursor-pointer hover:-translate-y-0.5",
      )}
      style={{ width: px, height: px * 1.3 }}
    >
      {active ? (
        <span className="pointer-events-none absolute inset-x-1 bottom-[4%] h-3 animate-pulse rounded-[50%] border-2 border-gold-300/70" />
      ) : null}
      <PawnPiece color={skin.color} icon={skin.icon} size={size} />
      {showName ? (
        <span className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink-950/90 px-1 text-[9px] leading-tight text-paper-50">
          {player.name}
        </span>
      ) : null}
      {player.status !== "active" ? (
        <span className="absolute -top-1 -right-0.5 text-[10px]">{STATUS_BADGE[player.status]}</span>
      ) : null}
      {player.skipTurns > 0 ? (
        <span className="absolute -bottom-0.5 -right-0.5 text-[9px]">💤</span>
      ) : null}
    </button>
  );
}
