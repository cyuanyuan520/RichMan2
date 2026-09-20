"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type {
  GameAction,
  GameContent,
  GameState,
  Player,
  PlayerId,
  TileDef,
} from "@/game/core/types";
import { netWorth } from "@/game/core/reducer";
import { formatMoney } from "@/lib/format";
import { Chip } from "@/ui/components/primitives";
import { cn } from "@/lib/format";
import type { LogEntry } from "@/store/game-store";
import type { DiceDisplay } from "@/ui/fx/use-director";

const TONE_CLASS: Record<string, string> = {
  info: "text-paper-100",
  good: "text-emerald-300",
  bad: "text-rose-300",
  gold: "text-gold-300",
};

export function CenterPanel({
  state,
  content,
  dice,
  localPlayerId,
}: {
  state: GameState;
  content: GameContent;
  dice: DiceDisplay | null;
  localPlayerId: PlayerId | null;
}) {
  const actorId = state.pending ? state.pending.playerId : state.players[state.turnSeat]?.id;
  const actor = state.players.find((player) => player.id === actorId);
  const character = actor ? content.characters[actor.characterId] : null;
  const tile = state.tileDefs[actor?.position ?? 0] as TileDef | undefined;
  const theme = content.map.theme;
  const standings = [...state.players].sort(
    (a, b) => netWorth(state, b.id) - netWorth(state, a.id),
  );
  const maxWorth = Math.max(1, ...standings.map((player) => Math.max(0, netWorth(state, player.id))));
  const phaseLabel =
    state.phase === "await-roll"
      ? "等待掷骰"
      : state.phase === "await-decision"
        ? "等待决策"
        : state.phase === "action-window"
          ? "行动阶段"
          : "对局结束";
  const thinking = Boolean(actor?.isBot) && state.phase !== "finished" && actor?.status === "active";

  return (
    <div className="relative flex h-full flex-col items-center justify-between gap-2 p-4">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 grid place-items-center font-display text-[10rem] leading-none text-white/[0.035]"
      >
        {content.map.name.slice(0, 1)}
      </span>

      <div className="relative z-10 flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-10 w-10 place-items-center rounded-2xl border font-display text-lg"
            style={{ borderColor: `${theme.accent}66`, background: `${theme.accent}18`, color: theme.accent }}
          >
            {content.map.name.slice(0, 1)}
          </span>
          <div>
            <p className="font-display text-lg leading-tight text-gold-300">{content.map.name}</p>
            <p className="text-[11px] text-paper-200/60">
              第 {state.round} 回合
              {state.config.targetRounds > 0 ? ` / ${state.config.targetRounds}` : ""}
            </p>
          </div>
        </div>
        <span
          className="rounded-full border px-3 py-1 text-[11px]"
          style={{ borderColor: `${theme.accent}44`, background: `${theme.accent}14`, color: theme.accent }}
        >
          {phaseLabel}
        </span>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-2">
        <div className="flex items-center gap-4 rounded-3xl border border-gold-400/25 bg-ink-950/55 px-6 py-3 shadow-[inset_0_2px_18px_rgba(0,0,0,0.6)]">
          <Die value={dice?.dice[0]} rolling={dice?.rolling} />
          <Die value={dice?.dice[1]} rolling={dice?.rolling} />
          <div className="w-24 text-left">
            {dice ? (
              <>
                <p className="font-display text-2xl leading-tight text-gold-200">
                  {dice.dice[0] + dice.dice[1]}
                </p>
                <p className="text-[10px] text-paper-200/70">
                  {dice.dice[0] === dice.dice[1] ? "双数 · 再掷一次" : `前进 ${dice.dice[0] + dice.dice[1]} 格`}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-paper-200/50">等待掷骰</p>
            )}
          </div>
        </div>
        {actor ? (
          <div
            className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            style={{ borderColor: `${theme.accent}55`, background: `${theme.accent}12` }}
          >
            <span className="text-lg leading-none">{character?.avatar ?? "🎲"}</span>
            <span className="font-display text-paper-50">
              {actor.name}
              {actor.id === localPlayerId ? "（你）" : actor.isBot ? "（AI）" : ""}
            </span>
            <span className="text-xs text-paper-200/75">
              {actor.status === "active"
                ? tile?.name
                : actor.status === "jailed"
                  ? "监禁中"
                  : actor.status === "hospitalized"
                    ? "住院中"
                    : "已出局"}
            </span>
            {thinking && !dice?.rolling ? (
              <motion.span
                className="text-[11px] text-gold-200/80"
                animate={{ opacity: [0.35, 1, 0.35] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              >
                思考中…
              </motion.span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-1">
        <p className="text-center text-[10px] tracking-[0.3em] text-paper-200/45">资产排行</p>
        {standings.map((player, index) => {
          const worth = netWorth(state, player.id);
          const characterOf = content.characters[player.characterId];
          return (
            <div
              key={player.id}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs",
                player.id === actorId ? "bg-gold-500/12" : "bg-white/[0.03]",
              )}
            >
              <span
                className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center rounded text-[9px]",
                  index === 0 ? "bg-gold-400 text-ink-950" : "bg-white/10 text-paper-200/70",
                )}
              >
                {index + 1}
              </span>
              <span className="shrink-0 text-sm leading-none">{characterOf?.avatar ?? "🎲"}</span>
              <span className="max-w-[5.5rem] truncate text-paper-100">{player.name}</span>
              {player.status === "bankrupt" ? <Chip color="#c0392b">出局</Chip> : null}
              <span className="ml-auto text-gold-300">{formatMoney(worth)}</span>
              <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-white/8">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(4, (Math.max(0, worth) / maxWorth) * 100)}%`, background: theme.accent }}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Die({ value, rolling }: { value?: number; rolling?: boolean }) {
  return (
    <motion.span
      animate={rolling ? { rotate: [0, 14, -12, 8, 0], scale: [1, 1.12, 1] } : { rotate: 0, scale: 1 }}
      transition={{ duration: 0.45 }}
      className="grid h-16 w-16 place-items-center rounded-2xl border border-gold-400/45 bg-gradient-to-b from-paper-50 to-paper-200 font-display text-3xl text-ink-900 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.9)]"
    >
      {value ?? "?"}
    </motion.span>
  );
}

export function LogPanel({ entries }: { entries: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {entries.slice(-120).map((entry) => (
          <div key={entry.id} className="flex items-start gap-2 text-[11px] leading-snug">
            <span className="mt-[1px]">{entry.icon ?? "•"}</span>
            <span className={cn("flex-1", TONE_CLASS[entry.tone])}>{entry.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

export function AssetManager({
  state,
  content,
  playerId,
  actions,
  busy,
  onDispatch,
}: {
  state: GameState;
  content: GameContent;
  playerId: PlayerId;
  actions: GameAction[];
  busy: boolean;
  onDispatch: (action: GameAction) => void;
}) {
  const player = state.players.find((entry) => entry.id === playerId);
  const owned = state.tiles.filter((tile) => tile.ownerId === playerId);
  if (!player) {
    return null;
  }

  const findAction = (type: GameAction["type"], tileIndex: number) =>
    actions.find(
      (action) =>
        action.type === type &&
        "tileIndex" in action &&
        action.tileIndex === tileIndex,
    );

  return (
    <div className="space-y-1.5">
      {owned.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/12 px-3 py-2 text-[11px] text-paper-200/50">
          你还没有任何地产。
        </p>
      ) : (
        owned.map((tile) => {
          const def = state.tileDefs[tile.index] as TileDef;
          const group = def.group
            ? content.map.groups.find((entry) => entry.id === def.group)
            : undefined;
          const sell = findAction("sell-building", tile.index);
          const mortgage = findAction("mortgage-property", tile.index);
          const unmortgage = findAction("unmortgage-property", tile.index);
          const upgrade = findAction("upgrade-property", tile.index);
          return (
            <div
              key={tile.index}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: group?.color ?? "#e0b64f" }}
              />
              <span className="min-w-24 flex-1 truncate text-xs text-paper-50">
                {def.name}
              </span>
              <span className="text-[11px] text-paper-200/70">
                {tile.mortgaged ? "已抵押" : tile.level > 0 ? `${tile.level} 级` : "空地"}
              </span>
              <span className="flex flex-wrap gap-1">
                {upgrade ? (
                  <MiniAction
                    disabled={busy}
                    onClick={() => onDispatch(upgrade)}
                    label={`升级 ${formatMoney((def.upgradeCosts?.[tile.level] ?? 0))}`}
                  />
                ) : null}
                {sell ? (
                  <MiniAction
                    disabled={busy}
                    onClick={() => onDispatch(sell)}
                    label={`拆建 +${formatMoney(Math.round((def.upgradeCosts?.[tile.level - 1] ?? 0) * state.config.economy.sellRefundRate))}`}
                  />
                ) : null}
                {mortgage ? (
                  <MiniAction
                    disabled={busy}
                    onClick={() => onDispatch(mortgage)}
                    label={`抵押 +${formatMoney(Math.round((def.price ?? 0) * state.config.economy.mortgageRefundRate))}`}
                  />
                ) : null}
                {unmortgage ? (
                  <MiniAction
                    disabled={busy}
                    onClick={() => onDispatch(unmortgage)}
                    label="赎回"
                  />
                ) : null}
              </span>
            </div>
          );
        })
      )}
      {player.items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {player.items.map((item) => {
            const def = content.items[item.defId];
            return (
              <Chip key={item.id}>
                {def?.icon ?? "🎒"} {def?.name ?? item.defId}
              </Chip>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MiniAction({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-gold-400/40 bg-gold-500/10 px-2 py-0.5 text-[10px] text-gold-200 transition-colors hover:bg-gold-500/25 disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1">
      <span className="text-[10px] text-paper-200/60">{label}</span>
      <span className="text-[11px] text-paper-50">{value}</span>
    </span>
  );
}

export function PlayerSummary({
  state,
  content,
  player,
}: {
  state: GameState;
  content: GameContent;
  player: Player;
}) {
  const character = content.characters[player.characterId];
  const owned = state.tiles.filter((tile) => tile.ownerId === player.id);
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{character?.avatar ?? "🎲"}</span>
        <div>
          <p className="font-display text-base text-gold-300">{player.name}</p>
          <p className="text-[11px] text-paper-200/70">
            {character?.name} · {character?.title}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="现金" value={formatMoney(player.money)} />
        <Stat label="净资产" value={formatMoney(netWorth(state, player.id))} />
        <Stat label="地产" value={`${owned.length} 处`} />
        <Stat label="道具" value={`${player.items.length} 件`} />
        <Stat label="掷骰" value={`${player.stats.rolls} 次`} />
        <Stat label="收租" value={formatMoney(player.stats.rentReceived)} />
      </div>
      <p className="text-[11px] leading-relaxed text-paper-200/70">{character?.text}</p>
    </div>
  );
}
