"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import type {
  GameAction,
  GameContent,
  GameState,
  PlayerId,
  TileDef,
} from "@/game/core/types";
import { netWorth } from "@/game/core/reducer";
import { pendingTargetOptions } from "@/game/selectors";
import { formatMoney } from "@/lib/format";
import { Button, Chip, Modal, SectionTitle } from "@/ui/components/primitives";
import { AssetManager, PlayerSummary } from "@/ui/hud/Panels";
import type { CardDisplay } from "@/ui/fx/use-director";

export function BuyPropertyDialog({
  state,
  content,
  localPlayerId,
  busy,
  onDispatch,
}: DialogBase) {
  const pending = state.pending;
  if (!pending || pending.kind !== "buy-property" || pending.playerId !== localPlayerId) {
    return null;
  }
  const def = state.tileDefs[pending.tileIndex] as TileDef;
  const group = def.group
    ? content.map.groups.find((entry) => entry.id === def.group)
    : undefined;
  const economy = state.config.economy;
  const rentCells: Array<[string, string]> =
    def.kind === "transport"
      ? economy.transportRents.map((rent, index) => [
          `持有 ${index + 1} 处`,
          formatMoney(rent),
        ])
      : def.kind === "utility"
        ? economy.utilityMultipliers.map((multiplier, index) => [
            `持有 ${index + 1} 处`,
            `点数 ×${multiplier}`,
          ])
        : [
            ["基础租金", formatMoney(def.rents?.[0] ?? 0)],
            ["满级租金", formatMoney(def.rents?.[def.rents.length - 1] ?? 0)],
          ];
  return (
    <Modal open>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <SectionTitle>购置地产</SectionTitle>
          <Chip color={group?.color}>{group?.name ?? def.subtitle ?? "地产"}</Chip>
        </div>
        <div className="rounded-2xl border border-gold-400/25 bg-gold-500/[0.07] p-4">
          <p className="font-display text-2xl text-gold-300">{def.name}</p>
          <p className="mt-1 text-xs text-paper-200/80">{def.desc}</p>
          <div
            className="mt-3 grid gap-2 text-center text-xs"
            style={{ gridTemplateColumns: `repeat(${rentCells.length + 1}, minmax(0, 1fr))` }}
          >
            <span className="rounded-lg bg-white/5 py-1.5">
              地价
              <br />
              <b className="text-paper-50">{formatMoney(pending.price)}</b>
            </span>
            {rentCells.map(([label, value]) => (
              <span key={label} className="rounded-lg bg-white/5 py-1.5">
                {label}
                <br />
                <b className="text-paper-50">{value}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button tone="ghost" disabled={busy} onClick={() => onDispatch({ type: "decline-buy", playerId: pending.playerId })}>
            放弃
          </Button>
          <Button tone="gold" disabled={busy} onClick={() => onDispatch({ type: "buy-property", playerId: pending.playerId })}>
            购买 {formatMoney(pending.price)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function RaiseFundsDialog({
  state,
  content,
  localPlayerId,
  busy,
  onDispatch,
  actions,
}: DialogBase & { actions: GameAction[] }) {
  const pending = state.pending;
  if (!pending || pending.kind !== "raise-funds" || pending.playerId !== localPlayerId) {
    return null;
  }
  const player = state.players.find((entry) => entry.id === pending.playerId);
  const settled = (player?.money ?? 0) >= 0;
  return (
    <Modal open width="max-w-2xl" dismissable={false}>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <SectionTitle>筹集欠款</SectionTitle>
          <span className="text-xs text-rose-300">
            缺口 {formatMoney(Math.max(0, -Math.round(player?.money ?? 0)))}
          </span>
        </div>
        <div className="space-y-1.5 rounded-2xl border border-rose-400/25 bg-rose-500/[0.07] p-3 text-xs">
          {pending.shares.map((share, index) => {
            const creditor = state.players.find((entry) => entry.id === share.creditorId);
            return (
              <div key={index} className="flex items-center justify-between text-paper-100">
                <span>债权人：{creditor?.name ?? "银行"}</span>
                <span className="text-rose-200">{formatMoney(share.amount)}</span>
              </div>
            );
          })}
          <p className="pt-1 text-[11px] text-paper-200/70">
            变卖建筑或抵押地产来补足现金；全部资产变卖后仍不足将自动破产。
          </p>
        </div>
        <AssetManager
          state={state}
          content={content}
          playerId={pending.playerId}
          actions={actions}
          busy={busy}
          onDispatch={onDispatch}
        />
        <div className="flex justify-end gap-2">
          <Button
            tone="danger"
            disabled={busy}
            onClick={() => onDispatch({ type: "declare-bankrupt", playerId: pending.playerId })}
          >
            宣布破产
          </Button>
          <Button
            tone="gold"
            disabled={busy || !settled}
            onClick={() => onDispatch({ type: "raise-funds-done", playerId: pending.playerId })}
          >
            {settled ? "完成筹集" : "现金仍为负"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function TargetPickerDialog({
  state,
  content,
  localPlayerId,
  busy,
  onDispatch,
}: DialogBase) {
  const pending = state.pending;
  if (
    !pending ||
    (pending.kind !== "item-target" && pending.kind !== "card-target") ||
    pending.playerId !== localPlayerId
  ) {
    return null;
  }
  const options = pendingTargetOptions(state, content) ?? [];
  const title =
    pending.kind === "item-target"
      ? `选择「${content.items[state.players.find((p) => p.id === pending.playerId)?.items.find((i) => i.id === pending.itemId)?.defId ?? ""]?.name ?? "道具"}」目标`
      : `选择「${content.cards[pending.sourceId]?.title ?? "卡牌"}」目标`;
  return (
    <Modal open width="max-w-2xl" dismissable={false}>
      <div className="space-y-4 p-6">
        <SectionTitle>{title}</SectionTitle>
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
          {options.map((option, index) => {
            const player = option.playerId
              ? state.players.find((entry) => entry.id === option.playerId)
              : undefined;
            const def = option.tileIndex !== undefined ? (state.tileDefs[option.tileIndex] as TileDef) : undefined;
            return (
              <button
                key={index}
                type="button"
                disabled={busy}
                onClick={() =>
                  onDispatch({
                    type: "resolve-target",
                    playerId: pending.playerId,
                    target: { playerId: option.playerId, tileIndex: option.tileIndex },
                  })
                }
                className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-left transition-colors hover:border-gold-400/50 hover:bg-gold-500/10 disabled:opacity-40"
              >
                <span className="text-lg">
                  {player ? "🧑" : (def?.icon ?? "🏠")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-paper-50">{option.label}</span>
                  {def ? (
                    <span className="block text-[10px] text-paper-200/60">
                      {def.rents?.[0] ? `基础租金 ${formatMoney(def.rents[0])}` : def.subtitle ?? ""}
                    </span>
                  ) : player ? (
                    <span className="block text-[10px] text-paper-200/60">
                      现金 {formatMoney(player.money)}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button tone="ghost" disabled={busy} onClick={() => onDispatch({ type: "cancel-target", playerId: pending.playerId })}>
            取消（不消耗）
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ChooseDiceDialog({ state, localPlayerId, busy, onDispatch }: DialogBase) {
  const pending = state.pending;
  if (!pending || pending.kind !== "choose-dice" || pending.playerId !== localPlayerId) {
    return null;
  }
  return (
    <Modal open width="max-w-md" dismissable={false}>
      <div className="space-y-4 p-6 text-center">
        <SectionTitle className="text-center">遥控骰子</SectionTitle>
        <p className="text-xs text-paper-200/70">选择本次掷骰的点数（1–6）</p>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((value) => (
            <Button
              key={value}
              tone="gold"
              disabled={busy}
              onClick={() =>
                onDispatch({ type: "choose-dice", playerId: pending.playerId, value })
              }
            >
              {value}
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function ShopDialog({
  open,
  onClose,
  state,
  content,
  localPlayerId,
  busy,
  onBuy,
}: Omit<DialogBase, "onDispatch"> & {
  open: boolean;
  onClose: () => void;
  onBuy: (itemDefId: string) => void;
}) {
  const player = state.players.find((entry) => entry.id === localPlayerId);
  if (!open || !player) {
    return null;
  }
  const items = Object.values(content.items);
  return (
    <Modal open={open} onClose={onClose} width="max-w-3xl">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <SectionTitle>道具店</SectionTitle>
          <span className="text-xs text-paper-200/70">
            现金 {formatMoney(player.money)} · 背包 {player.items.length}/4
          </span>
        </div>
        <div className="grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const affordable = player.money >= item.price;
            const slot = player.items.length < 4;
            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-2xl border border-white/12 bg-white/[0.03] p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{item.icon ?? "🎒"}</span>
                  <span className="flex-1 text-sm text-paper-50">{item.name}</span>
                  <span className="text-xs text-gold-300">{formatMoney(item.price)}</span>
                </div>
                <p className="min-h-8 text-[11px] leading-snug text-paper-200/75">{item.text}</p>
                <Button
                  size="sm"
                  tone="gold"
                  disabled={busy || !affordable || !slot}
                  onClick={() => onBuy(item.id)}
                >
                  {affordable ? (slot ? "购买" : "背包已满") : "金额不足"}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button tone="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function LotteryDialog({
  open,
  onClose,
  state,
  localPlayerId,
  busy,
  onDispatch,
}: Omit<DialogBase, "content"> & { open: boolean; onClose: () => void }) {
  const player = state.players.find((entry) => entry.id === localPlayerId);
  if (!open || !player) {
    return null;
  }
  const economy = state.config.economy;
  const canBuy = player.money >= economy.lotteryTicketPrice && !player.lotteryBoughtThisTurn;
  return (
    <Modal open={open} onClose={onClose} width="max-w-md">
      <div className="space-y-4 p-6">
        <SectionTitle>彩票行</SectionTitle>
        <p className="text-xs text-paper-200/75">
          每张 {formatMoney(economy.lotteryTicketPrice)}，每回合限购一张。开奖结果：
        </p>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          {economy.lotteryPrizes.map((prize, index) => (
            <span key={index} className="rounded-lg bg-white/5 py-2">
              {index === economy.lotteryPrizes.length - 1 ? "头奖" : `奖 ${index + 1}`}
              <br />
              <b className={prize > 0 ? "text-gold-300" : "text-paper-200/50"}>
                {prize > 0 ? formatMoney(prize) : "未中奖"}
              </b>
            </span>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button
            tone="gold"
            disabled={busy || !canBuy}
            onClick={() => {
              onDispatch({ type: "buy-lottery", playerId: player.id });
              onClose();
            }}
          >
            {player.lotteryBoughtThisTurn ? "本回合已购" : `购买 ${formatMoney(economy.lotteryTicketPrice)}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function PlayerDetailDialog({
  open,
  onClose,
  state,
  content,
  playerId,
}: {
  open: boolean;
  onClose: () => void;
  state: GameState;
  content: GameContent;
  playerId: PlayerId | null;
}) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!open || !player) {
    return null;
  }
  const owned = state.tiles.filter((tile) => tile.ownerId === player.id);
  return (
    <Modal open={open} onClose={onClose} width="max-w-xl">
      <div className="space-y-4 p-6">
        <PlayerSummary state={state} content={content} player={player} />
        <div className="space-y-1.5">
          <SectionTitle>名下地产（{owned.length}）</SectionTitle>
          <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
            {owned.map((tile) => {
              const def = state.tileDefs[tile.index] as TileDef;
              return (
                <span
                  key={tile.index}
                  className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2 py-1 text-[11px]"
                >
                  <span className="truncate text-paper-100">{def.name}</span>
                  <span className="text-paper-200/60">
                    {tile.mortgaged ? "抵押" : tile.level > 0 ? `${tile.level}级` : "空地"}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end">
          <Button tone="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function TileManageDialog({
  tileIndex,
  onClose,
  state,
  content,
  localPlayerId,
  actions,
  busy,
  onDispatch,
}: DialogBase & { tileIndex: number | null; onClose: () => void; actions: GameAction[] }) {
  const tile = tileIndex !== null ? state.tiles[tileIndex] : undefined;
  if (!tile || !localPlayerId) {
    return null;
  }
  const def = state.tileDefs[tile.index] as TileDef;
  const group = def.group
    ? content.map.groups.find((entry) => entry.id === def.group)
    : undefined;
  return (
    <Modal open onClose={onClose} width="max-w-lg">
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <SectionTitle>管理地产</SectionTitle>
          <Chip color={group?.color}>{group?.name ?? def.subtitle ?? "地产"}</Chip>
        </div>
        <div>
          <p className="font-display text-xl text-gold-300">{def.name}</p>
          <p className="text-xs text-paper-200/75">
            当前：{tile.mortgaged ? "已抵押" : tile.level > 0 ? `${tile.level} 级建筑` : "空地"} · 地价{" "}
            {formatMoney(def.price ?? 0)}
          </p>
        </div>
        <AssetManager
          state={state}
          content={content}
          playerId={localPlayerId}
          actions={actions.filter(
            (action) => !("tileIndex" in action) || action.tileIndex === tile.index,
          )}
          busy={busy}
          onDispatch={(action) => {
            onDispatch(action);
            onClose();
          }}
        />
        <div className="flex justify-end">
          <Button tone="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function CardOverlay({ card, content }: { card: CardDisplay | null; content: GameContent }) {
  if (!card) {
    return null;
  }
  const def = content.cards[card.cardId];
  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
      <motion.div
        initial={{ rotateY: 90, opacity: 0, scale: 0.85 }}
        animate={{ rotateY: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
        className="w-72 rounded-3xl border border-gold-400/40 bg-gradient-to-b from-ink-800 to-ink-950 p-5 text-center shadow-[0_30px_90px_-30px_rgba(0,0,0,1)]"
      >
        <p className="text-3xl">{def?.icon ?? (card.deck === "chance" ? "🃏" : "🎴")}</p>
        <p className="mt-2 font-display text-lg text-gold-300">{def?.title ?? "卡片"}</p>
        <p className="mt-2 text-xs leading-relaxed text-paper-100">{def?.text}</p>
        <p className="mt-3 text-[10px] tracking-[0.3em] text-paper-200/50">
          {card.deck === "chance" ? "机遇" : "命运"}
        </p>
      </motion.div>
    </div>
  );
}

export function GameOverDialog({
  state,
  content,
  onRestart,
  onMenu,
}: {
  state: GameState;
  content: GameContent;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const standings = state.standings.length
    ? state.standings
    : [...state.players]
        .sort((a, b) => netWorth(state, b.id) - netWorth(state, a.id))
        .map((player) => player.id);
  return (
    <Modal open width="max-w-xl" dismissable={false}>
      <div className="space-y-5 p-6">
        <div className="text-center">
          <p className="text-4xl">🏆</p>
          <SectionTitle className="mt-2 text-center">对局结束</SectionTitle>
          <p className="mt-1 font-display text-2xl text-gold-300">
            {content.map.name}
          </p>
        </div>
        <div className="space-y-1.5">
          {standings.map((playerId, index) => {
            const player = state.players.find((entry) => entry.id === playerId);
            if (!player) {
              return null;
            }
            const character = content.characters[player.characterId];
            return (
              <div
                key={playerId}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
              >
                <span className="w-5 text-center text-sm text-paper-200/60">{index + 1}</span>
                <span className="text-xl">{character?.avatar ?? "🎲"}</span>
                <span className="flex-1 truncate text-sm text-paper-50">{player.name}</span>
                <span className="text-xs text-paper-200/70">
                  现金 {formatMoney(player.money)}
                </span>
                <span className="text-sm text-gold-300">
                  {formatMoney(netWorth(state, player.id))}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={onMenu}>
            返回主菜单
          </Button>
          <Button tone="gold" onClick={onRestart}>
            再来一局
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface DialogBase {
  state: GameState;
  content: GameContent;
  localPlayerId: PlayerId | null;
  busy: boolean;
  onDispatch: (action: GameAction) => void;
}

export function Toast({
  toast,
  onDone,
}: {
  toast: { id: number; text: string } | null;
  onDone: () => void;
}) {
  const toastId = toast?.id;
  useEffect(() => {
    if (toastId === undefined) {
      return;
    }
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [toastId, onDone]);
  if (!toast) {
    return null;
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-rose-400/40 bg-ink-900/95 px-4 py-2 text-xs text-rose-200 shadow-lg"
    >
      {toast.text}
    </motion.div>
  );
}
