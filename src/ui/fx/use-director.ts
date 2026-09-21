"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckId, GameEvent, PlayerId } from "@/game/core/types";
import { useGameStore } from "@/store/game-store";
import { playSfx } from "@/audio/sfx";
import type { Floater } from "@/ui/board/Board";

export interface DiceDisplay {
  dice: [number, number];
  playerId: PlayerId;
  rolling: boolean;
}

export interface CardDisplay {
  cardId: string;
  deck: DeckId;
  playerId: PlayerId;
}

export interface BannerDisplay {
  icon: string;
  title: string;
  detail?: string;
  tone: "gold" | "good" | "bad" | "info";
}

export interface DirectorState {
  display: Record<PlayerId, number>;
  dice: DiceDisplay | null;
  floaters: Floater[];
  card: CardDisplay | null;
  banner: BannerDisplay | null;
  busy: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useDecisionVisible(
  active: boolean,
  busy: boolean,
  graceMs = 2500,
  progressKey = 0,
  identity = "",
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 0);
    return () => clearTimeout(timer);
  }, [identity]);

  useEffect(() => {
    if (!active) {
      const timer = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(timer);
    }
    if (!busy) {
      const timer = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(timer);
    }
    // Watchdog: reveal only after the animation queue stops making progress.
    const timer = setTimeout(() => setVisible(true), graceMs);
    return () => clearTimeout(timer);
  }, [active, busy, graceMs, progressKey]);

  return active && visible;
}

function playerName(id: PlayerId): string {
  const player = useGameStore.getState().game?.players.find((entry) => entry.id === id);
  return player?.name ?? "玩家";
}

export function useDirector(): DirectorState {
  const game = useGameStore((state) => state.game);
  const gameKey = useGameStore((state) => state.gameKey);

  const [display, setDisplay] = useState<Record<PlayerId, number>>({});
  const [dice, setDice] = useState<DiceDisplay | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [card, setCard] = useState<CardDisplay | null>(null);
  const [banner, setBanner] = useState<BannerDisplay | null>(null);
  const [busy, setBusy] = useState(false);

  const floaterSeq = useRef(0);
  const floaterTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [syncedSeq, setSyncedSeq] = useState(-1);
  const setAnimating = useGameStore((state) => state.setAnimating);

  const pushFloater = useCallback((playerId: PlayerId, delta: number) => {
    floaterSeq.current += 1;
    const id = floaterSeq.current;
    setFloaters((current) => [...current, { id, playerId, delta }]);
    const timer = setTimeout(() => {
      floaterTimers.current.delete(timer);
      setFloaters((current) => current.filter((entry) => entry.id !== id));
    }, 1200);
    floaterTimers.current.add(timer);
  }, []);

  if (game && game.seq !== syncedSeq) {
    const missedUpdates = syncedSeq >= 0 && game.seq - syncedSeq > 1;
    setSyncedSeq(game.seq);
    setDisplay((current) => {
      if (missedUpdates) {
        const next: Record<PlayerId, number> = {};
        for (const player of game.players) {
          next[player.id] = player.position;
        }
        return next;
      }
      let changed = false;
      const next: Record<PlayerId, number> = { ...current };
      for (const player of game.players) {
        if (next[player.id] === undefined) {
          next[player.id] = player.position;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  useEffect(() => {
    let disposed = false;
    let processing = false;
    let pump: () => Promise<void> = async () => {};

    const handle = async (event: GameEvent): Promise<void> => {
      const live = () => !disposed;
      switch (event.type) {
        case "dice-rolled": {
          playSfx("dice");
          setDice({ dice: event.dice, playerId: event.playerId, rolling: true });
          await sleep(440);
          if (!live()) {
            return;
          }
          setDice({ dice: event.dice, playerId: event.playerId, rolling: false });
          await sleep(200);
          return;
        }
        case "token-moved": {
          const steps = event.path.length > 0 ? event.path : [event.to];
          const stepDelay = Math.min(120, Math.round(1800 / Math.max(1, steps.length)));
          for (const step of steps) {
            if (!live()) {
              return;
            }
            playSfx("step");
            setDisplay((current) => ({ ...current, [event.playerId]: step }));
            await sleep(stepDelay);
          }
          if (!live()) {
            return;
          }
          setDisplay((current) => ({ ...current, [event.playerId]: event.to }));
          await sleep(90);
          return;
        }
        case "money-changed": {
          if (event.delta !== 0) {
            pushFloater(event.playerId, event.delta);
            playSfx(event.delta > 0 ? "money-in" : "money-out");
          }
          await sleep(420);
          return;
        }
        case "card-drawn": {
          playSfx("card");
          setCard({ cardId: event.cardId, deck: event.deck, playerId: event.playerId });
          await sleep(1400);
          if (live()) {
            setCard(null);
          }
          await sleep(120);
          return;
        }
        case "property-bought":
        case "property-upgraded":
        case "item-bought": {
          playSfx("buy");
          await sleep(160);
          return;
        }
        case "lottery-result": {
          if (event.prize > 0) {
            playSfx("lottery");
            pushFloater(event.playerId, event.prize);
          }
          await sleep(260);
          return;
        }
        case "jailed":
        case "hospitalized": {
          playSfx("jail");
          const who = playerName(event.playerId);
          setBanner(
            event.type === "jailed"
              ? {
                  icon: "⛓️",
                  title: `${who} 入狱`,
                  detail: `暂停行动 ${event.turns} 回合 · 可缴纳保释金提前出狱`,
                  tone: "bad",
                }
              : {
                  icon: "🏥",
                  title: `${who} 住院`,
                  detail: `需要休养 ${event.turns} 回合`,
                  tone: "bad",
                },
          );
          const player = useGameStore
            .getState()
            .game?.players.find((entry) => entry.id === event.playerId);
          if (player) {
            setDisplay((current) => ({ ...current, [player.id]: player.position }));
          }
          await sleep(1200);
          if (live()) {
            setBanner(null);
          }
          return;
        }
        case "released": {
          setBanner({
            icon: "🕊️",
            title: `${playerName(event.playerId)} 恢复自由`,
            detail: event.from === "jail" ? "可以继续正常行动" : "康复出院",
            tone: "good",
          });
          await sleep(900);
          if (live()) {
            setBanner(null);
          }
          return;
        }
        case "player-bankrupt": {
          playSfx("jail");
          setBanner({
            icon: "💀",
            title: `${playerName(event.playerId)} 破产出局`,
            detail: "名下资产已清算",
            tone: "bad",
          });
          await sleep(1500);
          if (live()) {
            setBanner(null);
          }
          return;
        }
        case "game-ended": {
          playSfx("win");
          setBanner({
            icon: "🏆",
            title: `${playerName(event.winnerId)} 获得胜利`,
            detail: "查看最终排名",
            tone: "gold",
          });
          await sleep(1400);
          if (live()) {
            setBanner(null);
          }
          return;
        }
        case "share-wealth": {
          for (const entry of event.amounts) {
            if (entry.amount !== 0) {
              pushFloater(entry.playerId, entry.amount);
            }
          }
          await sleep(320);
          return;
        }
        default:
          await sleep(150);
      }
    };

    pump = async () => {
      if (processing || disposed) {
        return;
      }
      processing = true;
      setBusy(true);
      setAnimating(true);
      try {
        while (!disposed) {
          const store = useGameStore.getState();
          const next = store.fxQueue[0];
          if (!next) {
            break;
          }
          store.shiftFx();
          await handle(next);
        }
      } finally {
        processing = false;
        if (!disposed) {
          setBusy(false);
          setAnimating(false);
        }
      }
    };

    void pump();

    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.fxQueue !== previous.fxQueue) {
        void pump();
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
      setBusy(false);
      setAnimating(false);
    };
  }, [gameKey, pushFloater, setAnimating]);

  useEffect(() => {
    const timers = floaterTimers.current;
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return { display, dice, floaters, card, banner, busy };
}
