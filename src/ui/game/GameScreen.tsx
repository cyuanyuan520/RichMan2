"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { GameAction, PlayerId } from "@/game/core/types";
import { getLegalActions, netWorth, pendingTargetOptions } from "@/game/selectors";
import { actorIdOf, useGameStore } from "@/store/game-store";
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
  const [shopOpen, setShopOpen] = useState(false);
  const [lotteryOpen, setLotteryOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<PlayerId | null>(null);
  const [manageTile, setManageTile] = useState<number | null>(null);

  const skins = useMemo(
    () => (game && content ? skinsFor(game, content) : {}),
    [game, content],
  );

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
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="pointer-events-none absolute left-1/2 top-6 z-40 -translate-x-1/2 rounded-2xl border border-gold-400/40 bg-ink-950/90 px-6 py-3 font-display text-lg text-gold-200 shadow-xl"
              >
                {director.banner}
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
                  onClick={() => setTab(key)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-[11px] transition-colors",
                    tab === key
                      ? "bg-gold-500/15 text-gold-200"
                      : "text-paper-200/60 hover:text-paper-100",
                  )}
                >
                  {label}
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
