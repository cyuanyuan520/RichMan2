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

export interface DirectorState {
  display: Record<PlayerId, number>;
  dice: DiceDisplay | null;
  floaters: Floater[];
  card: CardDisplay | null;
  banner: string | null;
  busy: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useDirector(): DirectorState {
  const game = useGameStore((state) => state.game);
  const fxQueue = useGameStore((state) => state.fxQueue);
  const setAnimating = useGameStore((state) => state.setAnimating);

  const [display, setDisplay] = useState<Record<PlayerId, number>>({});
  const [dice, setDice] = useState<DiceDisplay | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [card, setCard] = useState<CardDisplay | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const floaterSeq = useRef(0);
  const runningRef = useRef(false);
  const [syncedSeq, setSyncedSeq] = useState(-1);

  const pushFloater = useCallback((playerId: PlayerId, delta: number) => {
    floaterSeq.current += 1;
    const id = floaterSeq.current;
    setFloaters((current) => [...current, { id, playerId, delta }]);
    setTimeout(() => {
      setFloaters((current) => current.filter((entry) => entry.id !== id));
    }, 1200);
  }, []);

  if (game && game.seq !== syncedSeq) {
    setSyncedSeq(game.seq);
    setDisplay((current) => {
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
    if (runningRef.current || fxQueue.length === 0) {
      return;
    }
    let cancelled = false;
    runningRef.current = true;
    setBusy(true);
    setAnimating(true);

    const handle = async (event: GameEvent): Promise<void> => {
      switch (event.type) {
        case "dice-rolled": {
          playSfx("dice");
          setDice({ dice: event.dice, playerId: event.playerId, rolling: true });
          await sleep(440);
          setDice({ dice: event.dice, playerId: event.playerId, rolling: false });
          await sleep(200);
          return;
        }
        case "token-moved": {
          const steps = event.path.length > 0 ? event.path : [event.to];
          for (const step of steps) {
            if (cancelled) {
              return;
            }
            playSfx("step");
            setDisplay((current) => ({ ...current, [event.playerId]: step }));
            await sleep(120);
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
          await sleep(180);
          return;
        }
        case "card-drawn": {
          playSfx("card");
          setCard({ cardId: event.cardId, deck: event.deck, playerId: event.playerId });
          await sleep(1400);
          setCard(null);
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
          setBanner(event.type === "jailed" ? "⛓️ 入狱" : "🏥 住院");
          if (game) {
            const player = game.players.find((entry) => entry.id === event.playerId);
            if (player) {
              setDisplay((current) => ({ ...current, [player.id]: player.position }));
            }
          }
          await sleep(620);
          setBanner(null);
          return;
        }
        case "released": {
          setBanner("🕊️ 恢复自由");
          await sleep(520);
          setBanner(null);
          return;
        }
        case "player-bankrupt": {
          playSfx("jail");
          setBanner("💀 破产出局");
          await sleep(900);
          setBanner(null);
          return;
        }
        case "game-ended": {
          playSfx("win");
          setBanner("🏆 对局结束");
          await sleep(800);
          setBanner(null);
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
          await sleep(90);
      }
    };

    void (async () => {
      while (!cancelled) {
        const store = useGameStore.getState();
        const next = store.fxQueue[0];
        if (!next) {
          break;
        }
        store.shiftFx();
        await handle(next);
      }
      runningRef.current = false;
      if (!cancelled) {
        setBusy(false);
        setAnimating(false);
      }
    })();

    return () => {
      cancelled = true;
      runningRef.current = false;
    };
  }, [fxQueue, game, pushFloater, setAnimating]);

  return { display, dice, floaters, card, banner, busy };
}
