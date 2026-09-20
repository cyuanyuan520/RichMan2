"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { GameAction, PlayerId } from "@/game/core/types";
import { getLegalActions, netWorth, pendingTargetOptions } from "@/game/selectors";
import { actorIdOf, turnOwnerName, useGameStore, type LogEntry } from "@/store/game-store";
import { useNetStore } from "@/store/net-store";
import { OnlineChatDock } from "@/ui/AppShell";
import { skinsFor } from "@/ui/hud/skins";
import { Board } from "@/ui/board/Board";
import { PlayerCard } from "@/ui/hud/PlayerCard";
import { ActionBar, ItemsBar, SkillsBar } from "@/ui/hud/ActionBar";
import { CenterPanel, LogPanel } from "@/ui/hud/Panels";
import {
  BuyPropertyDialog,
  CardOverlay,
  ChooseDiceDialog,
  GameOverDialog,
  LotteryDialog,
  PlayerDetailDialog,
  RaiseFundsDialog,
  ShopDialog,
  TargetPickerDialog,
  TileManageDialog,
  Toast,
} from "@/ui/dialogs";
import { Button, SectionTitle } from "@/ui/components/primitives";
import { useDirector } from "@/ui/fx/use-director";
import { cn } from "@/lib/format";
import { playSfx } from "@/audio/sfx";
import { playBgm, stopBgm } from "@/audio/bgm";

type Tab = "items" | "log";

export function GameScreen() {
  const game = useGameStore((state) => state.game);
  const content = useGameStore((state) => state.content);
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const lastSetup = useGameStore((state) => state.lastSetup);
  const log = useGameStore((state) => state.log);
  const toast = useGameStore((state) => state.toast);
  const dispatch = useGameStore((state) => state.dispatch);
  const clearToast = useGameStore((state) => state.clearToast);
  const backToMenu = useGameStore((state) => state.backToMenu);
  const startLocal = useGameStore((state) => state.startLocal);
  const mode = useGameStore((state) => state.mode);
  const leaveRoom = useNetStore((state) => state.leave);
  const netStatus = useNetStore((state) => state.status);

  const director = useDirector();
  const [tab, setTab] = useState<Tab>("items");
  const logReadCount = useGameStore((state) => state.logReadCount);
  const markLogRead = useGameStore((state) => state.markLogRead);
  const logUnread = tab !== "log" && log.length > logReadCount;
  const [shopOpen, setShopOpen] = useState(false);
  const [lotteryOpen, setLotteryOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<PlayerId | null>(null);
  const [manageTile, setManageTile] = useState<number | null>(null);

  const skins = useMemo(
    () => (game && content ? skinsFor(game, content) : {}),
    [game, content],
  );

  useEffect(() => {
    playBgm(mode === "online" ? "top-hat-and-thimble" : "double-sixes");
    return () => {
      stopBgm();
    };
  }, [mode]);

  const pending = game?.pending ?? null;
  const pendingForLocal = pending?.playerId === localPlayerId;

  const targetTiles = useMemo(() => {
    if (!game || !content || !pending) {
      return [];
    }
    if (pending.kind !== "item-target" && pending.kind !== "card-target") {
      return [];
    }
    return (pendingTargetOptions(game, content) ?? [])
      .map((option) => option.tileIndex)
      .filter((index): index is number => index !== undefined);
  }, [pending, game, content]);

  const isActorNow = game ? actorIdOf(game) === localPlayerId : false;
  const ownedTiles = useMemo(
    () =>
      game && game.phase === "action-window" && isActorNow && !director.busy
        ? game.tiles
            .filter((tile) => tile.ownerId === localPlayerId)
            .map((tile) => tile.index)
        : [],
    [game, isActorNow, director.busy, localPlayerId],
  );

  if (!game || !content) {
    return null;
  }

  const actorId = actorIdOf(game);
  const isActor = actorId === localPlayerId;
  const busy = director.busy;
  const actions = localPlayerId ? getLegalActions(game, content, localPlayerId) : [];

  const selectableTiles = pendingForLocal && targetTiles.length > 0 ? targetTiles : ownedTiles;

  const onSelect = (action: GameAction) => {
    const result = dispatch(action);
    if (!result.ok) {
      playSfx("error");
    }
  };

  const onTileSelect = (index: number) => {
    if (pendingForLocal && (pending?.kind === "item-target" || pending?.kind === "card-target")) {
      dispatch({
        type: "resolve-target",
        playerId: pending.playerId,
        target: { tileIndex: index },
      });
      return;
    }
    if (ownedTiles.includes(index)) {
      playSfx("click");
      setManageTile(index);
    }
  };

  const playerCount = game.players.length;
  const leaderNetWorth = Math.max(
    1,
    ...game.players.map((player) => Math.max(0, netWorth(game, player.id))),
  );

  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 bg-ink-950/70 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg tracking-[0.25em] text-gold-300">
            大富翁 · 神州风云
          </span>
          <span className="text-xs text-paper-200/70">
            {content.map.name} · 第 {game.round} 回合
            {game.config.targetRounds > 0 ? ` / ${game.config.targetRounds}` : ""}
          </span>
        </div>
        {actorId ? (
          <div
            className="flex items-center gap-2 rounded-full border px-3 py-1"
            style={{
              borderColor: `${skins[actorId]?.color ?? "#e0b64f"}66`,
              background: `${skins[actorId]?.color ?? "#e0b64f"}14`,
            }}
          >
            <span className="text-base leading-none">
              {content.characters[game.players.find((player) => player.id === actorId)?.characterId ?? ""]?.avatar ?? "🎲"}
            </span>
            <span className="text-xs text-paper-100">
              轮到 <span className="font-display text-gold-200">{turnOwnerName(game)}</span>
            </span>
            {!busy && game.phase !== "finished" ? (
              <motion.span
                className="text-[10px] text-paper-200/65"
                animate={{ opacity: [0.35, 1, 0.35] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              >
                {isActor ? "等待你操作" : "行动中…"}
              </motion.span>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          {playerCount > 0 ? (
            <span className="text-[11px] text-paper-200/60">
              存活 {game.players.filter((player) => player.status !== "bankrupt").length}/{playerCount}
            </span>
          ) : null}
          <Button size="sm" tone="ghost" onClick={() => setDetailPlayer(localPlayerId)}>
            我的资产
          </Button>
          <Button
            size="sm"
            tone="ghost"
            onClick={() => {
              if (mode === "online") {
                leaveRoom();
              } else {
                backToMenu();
              }
            }}
          >
            {mode === "online" ? "离开房间" : "退出对局"}
          </Button>
        </div>
      </header>

      <EventTicker entry={log.length > 0 ? log[log.length - 1] : null} round={game.round} />

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <main className="relative min-h-0 min-w-0 flex-1">
          <Board
            state={game}
            content={content}
            display={director.display}
            skins={skins}
            activePlayerId={actorId}
            highlightTiles={[...targetTiles]}
            selectableTiles={selectableTiles}
            onTileSelect={onTileSelect}
            floaters={director.floaters}
            onTokenClick={(playerId) => setDetailPlayer(playerId)}
            centerSlot={
              content.map.layout === "ring" ? (
                <CenterPanel
                  state={game}
                  content={content}
                  dice={director.dice}
                  localPlayerId={localPlayerId}
                />
              ) : null
            }
          />
          <AnimatePresence>
            {director.banner ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.88, y: -14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: -8 }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                className={cn(
                  "pointer-events-none absolute left-1/2 top-6 z-40 w-[26rem] max-w-[90%] -translate-x-1/2 rounded-2xl border px-6 py-4 text-center shadow-2xl backdrop-blur",
                  director.banner.tone === "gold" && "border-gold-400/50 bg-ink-950/92 text-gold-200",
                  director.banner.tone === "bad" && "border-rose-400/50 bg-ink-950/92 text-rose-200",
                  director.banner.tone === "good" && "border-emerald-400/50 bg-ink-950/92 text-emerald-200",
                  director.banner.tone === "info" && "border-white/25 bg-ink-950/92 text-paper-100",
                )}
              >
                <div className="text-3xl leading-none">{director.banner.icon}</div>
                <div className="mt-1 font-display text-2xl leading-tight">{director.banner.title}</div>
                {director.banner.detail ? (
                  <div className="mt-1 text-xs opacity-80">{director.banner.detail}</div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <CardOverlay card={director.card} content={content} />
        </main>

        <aside className="flex w-[22rem] shrink-0 flex-col gap-2.5 overflow-y-auto pr-1">
          <div className="space-y-2">
            {game.players.map((player) => (
              <PlayerCard
                key={player.id}
                state={game}
                content={content}
                player={player}
                skin={skins[player.id] ?? { color: "#e0b64f", avatar: "", icon: "🎲" }}
                isActive={player.id === actorId}
                isLocal={player.id === localPlayerId}
                leaderNetWorth={leaderNetWorth}
                onClick={() => setDetailPlayer(player.id)}
              />
            ))}
          </div>

          <DiceStrip dice={director.dice} />

          <ActionBar
            state={game}
            content={content}
            localPlayerId={localPlayerId}
            isActor={isActor}
            busy={busy}
            onOpenShop={() => setShopOpen(true)}
            onOpenLottery={() => setLotteryOpen(true)}
            onEndTurn={() =>
              localPlayerId && onSelect({ type: "end-turn", playerId: localPlayerId })
            }
            onPayBail={() => {
              playSfx("click");
              if (localPlayerId) {
                onSelect({ type: "pay-jail-fine", playerId: localPlayerId });
              }
            }}
            onRoll={() => {
              if (localPlayerId) {
                onSelect({ type: "roll-dice", playerId: localPlayerId });
              }
            }}
          />

          <section className="panel flex min-h-0 flex-col">
            <div className="flex items-center gap-1 border-b border-white/8 px-2 py-1.5">
              {(
                [
                  ["items", "道具 / 技能"],
                  ["log", "对局日志"],
                ] as Array<[Tab, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTab(key);
                    if (key === "log") {
                      markLogRead();
                    }
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1 text-[11px] transition-colors",
                    tab === key
                      ? "bg-gold-500/15 text-gold-200"
                      : "text-paper-200/60 hover:text-paper-100",
                  )}
                >
                  {label}
                  {key === "log" && logUnread ? (
                    <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gold-300 align-middle" />
                  ) : null}
                </button>
              ))}
              <span className="ml-auto pr-2 text-[10px] text-paper-200/40">
                {playerCount} 位玩家
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
              {tab === "items" ? (
                <div className="space-y-3">
                  <ItemsBar
                    state={game}
                    content={content}
                    localPlayerId={localPlayerId}
                    isActor={isActor}
                    busy={busy}
                    onUse={(itemId) => localPlayerId && onSelect({ type: "use-item", playerId: localPlayerId, itemId })}
                  />
                  <SkillsBar
                    state={game}
                    content={content}
                    localPlayerId={localPlayerId}
                    isActor={isActor}
                    busy={busy}
                    onUse={(skillId) => {
                      playSfx("click");
                      if (localPlayerId) {
                        onSelect({ type: "use-skill", playerId: localPlayerId, skillId });
                      }
                    }}
                  />
                  <div className="space-y-1.5">
                    <SectionTitle>快捷提示</SectionTitle>
                    <p className="text-[11px] leading-relaxed text-paper-200/60">
                      点击自己名下的地块可升级 / 拆建 / 抵押；悬停任意格子查看租金表。
                    </p>
                  </div>
                </div>
              ) : (
                <LogPanel entries={log} />
              )}
            </div>
          </section>
        </aside>
      </div>

      <BuyPropertyDialog
        state={game}
        content={content}
        localPlayerId={localPlayerId}
        busy={busy}
        onDispatch={onSelect}
      />
      <RaiseFundsDialog
        state={game}
        content={content}
        localPlayerId={localPlayerId}
        busy={busy}
        onDispatch={onSelect}
        actions={actions}
      />
      <TargetPickerDialog
        state={game}
        content={content}
        localPlayerId={localPlayerId}
        busy={busy}
        onDispatch={onSelect}
      />
      <ChooseDiceDialog
        state={game}
        content={content}
        localPlayerId={localPlayerId}
        busy={busy}
        onDispatch={onSelect}
      />
      <ShopDialog
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        state={game}
        content={content}
        localPlayerId={localPlayerId}
        busy={busy}
        onBuy={(itemDefId) => {
          if (localPlayerId) {
            onSelect({ type: "buy-item", playerId: localPlayerId, itemDefId });
          }
        }}
      />
      <LotteryDialog
        open={lotteryOpen}
        onClose={() => setLotteryOpen(false)}
        state={game}
        localPlayerId={localPlayerId}
        busy={busy}
        onDispatch={onSelect}
      />
      <TileManageDialog
        tileIndex={manageTile}
        onClose={() => setManageTile(null)}
        state={game}
        content={content}
        localPlayerId={localPlayerId}
        actions={actions}
        busy={busy}
        onDispatch={onSelect}
      />
      <PlayerDetailDialog
        open={detailPlayer !== null}
        onClose={() => setDetailPlayer(null)}
        state={game}
        content={content}
        playerId={detailPlayer}
      />
      {game.phase === "finished" ? (
        <GameOverDialog
          state={game}
          content={content}
          onMenu={() => {
            if (mode === "online") {
              leaveRoom();
            } else {
              backToMenu();
            }
          }}
          onRestart={() => {
            if (mode === "online") {
              leaveRoom();
            } else if (lastSetup) {
              startLocal({ ...lastSetup, seed: (Date.now() >>> 0) % 2147483647 });
            } else {
              backToMenu();
            }
          }}
        />
      ) : null}
      {netStatus === "closed" ? (
        <div className="pointer-events-none absolute top-16 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-rose-400/40 bg-ink-950/90 px-4 py-2 text-xs text-rose-200">
          与主机连接中断，正在自动重连…
        </div>
      ) : null}
      <OnlineChatDock />
      <Toast
        toast={toast}
        onDone={() => {
          clearToast();
        }}
      />
    </div>
  );
}

function DiceStrip({ dice }: { dice: ReturnType<typeof useDirector>["dice"] }) {
  if (!dice) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-paper-200/50">
        等待掷骰
      </div>
    );
  }
  const sum = dice.dice[0] + dice.dice[1];
  return (
    <div className="flex items-center justify-between rounded-2xl border border-gold-400/25 bg-gold-500/[0.06] px-3 py-2">
      <span className="text-[11px] text-paper-200/70">
        {dice.dice[0]} + {dice.dice[1]} = {sum}
        {dice.dice[0] === dice.dice[1] ? " · 双数" : ""}
      </span>
      <span className="text-[11px] text-gold-300">
        {dice.rolling ? "掷骰中…" : "已掷出"}
      </span>
    </div>
  );
}

const TICKER_TONE: Record<string, string> = {
  info: "text-paper-100",
  good: "text-emerald-300",
  bad: "text-rose-300",
  gold: "text-gold-200",
};

function EventTicker({ entry, round }: { entry: LogEntry | null; round: number }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/6 bg-ink-950/45 px-4">
      <span className="shrink-0 rounded-md bg-gold-500/15 px-1.5 py-0.5 text-[10px] text-gold-200">
        最新
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {entry ? (
            <motion.p
              key={entry.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
              className={cn("truncate text-xs", TICKER_TONE[entry.tone] ?? "text-paper-100")}
            >
              <span className="mr-1">{entry.icon ?? "•"}</span>
              {entry.text}
            </motion.p>
          ) : (
            <p className="text-xs text-paper-200/45">等待开局…</p>
          )}
        </AnimatePresence>
      </div>
      <span className="shrink-0 text-[10px] text-paper-200/40">第 {round} 回合</span>
    </div>
  );
}
