"use client";

import { motion } from "motion/react";
import type { GameContent, GameState, Player } from "@/game/core/types";
import { netWorth } from "@/game/core/reducer";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/format";
import { Chip, Meter } from "@/ui/components/primitives";
import type { TokenSkin } from "@/ui/board/TokenLayer";

const STATUS_TEXT: Record<string, string> = {
  jailed: "监禁中",
  hospitalized: "住院中",
  bankrupt: "已破产",
};

export function PlayerCard({
  state,
  content,
  player,
  skin,
  isActive,
  isLocal,
  leaderNetWorth,
  onClick,
}: {
  state: GameState;
  content: GameContent;
  player: Player;
  skin: TokenSkin;
  isActive: boolean;
  isLocal: boolean;
  leaderNetWorth: number;
  onClick?: () => void;
}) {
  const character = content.characters[player.characterId];
  const worth = netWorth(state, player.id);
  const tiles = state.tiles.filter((tile) => tile.ownerId === player.id);
  const activeSkills = (character?.skills ?? []).filter(
    (skill) => skill.trigger === "active",
  );

  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border p-3 text-left transition-colors",
        isActive
          ? "border-gold-400/70 bg-gold-500/10"
          : "border-white/10 bg-white/[0.03] hover:border-white/25",
        player.status === "bankrupt" && "opacity-55",
      )}
    >
      {isActive ? (
        <motion.span
          layoutId="active-player-glow"
          className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-gold-300/60"
        />
      ) : null}
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl"
          style={{ background: `${skin.color}33`, border: `1px solid ${skin.color}88` }}
        >
          {skin.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-sm text-paper-50">
              {player.name}
            </span>
            {isLocal ? <Chip color="#e0b64f">你</Chip> : null}
            {player.isBot ? <Chip>AI·{player.botDifficulty === "hard" ? "困难" : player.botDifficulty === "easy" ? "简单" : "普通"}</Chip> : null}
            {player.status !== "active" ? (
              <Chip color="#c0392b">{STATUS_TEXT[player.status]}</Chip>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="font-display text-lg text-gold-300">
              {formatMoney(player.money)}
            </span>
            <span className="text-[11px] text-paper-200/60">
              净资产 {formatMoney(worth)}
              {leaderNetWorth > 0
                ? ` · ${Math.round((worth / leaderNetWorth) * 100)}%`
                : ""}
            </span>
          </div>
          <Meter
            className="mt-1.5"
            value={Math.max(0, worth)}
            max={Math.max(1, leaderNetWorth)}
            color={skin.color}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-paper-200/70">
            <span>🏠 {tiles.length}</span>
            <span>🎒 {player.items.length}</span>
            {player.skipTurns > 0 ? <span>💤 {player.skipTurns}</span> : null}
            {player.statusTurns > 0 ? <span>⏳ {player.statusTurns}</span> : null}
            {player.rentShields > 0 ? <span>🛡️ {player.rentShields}</span> : null}
            {player.jailFreeCards > 0 ? <span>🎫 {player.jailFreeCards}</span> : null}
            {activeSkills.map((skill) => {
              const charges = player.skillCharges[skill.id];
              const cooldown = player.skillCooldowns[skill.id] ?? 0;
              return (
                <span key={skill.id} title={skill.text}>
                  {skill.icon ?? "✨"}
                  {charges !== undefined ? `×${charges}` : ""}
                  {cooldown > 0 ? ` (${cooldown})` : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

