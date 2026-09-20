"use client";

import { create } from "zustand";
import type {
  GameAction,
  GameContent,
  GameEvent,
  GameSetup,
  GameState,
  PlayerId,
} from "@/game/core/types";
import { bootstrapGame } from "@/game/core/state";
import { reduce } from "@/game/core/reducer";
import { currentPlayer } from "@/game/core/reducer";
import { chooseAiAction } from "@/game/ai";
import { buildGameContent } from "@/data/content";
import {
  aiDelayMs,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "./settings";
import {
  describeEvent,
  playerName,
  type LogTone,
} from "@/lib/event-text";

export interface LogEntry {
  id: number;
  text: string;
  tone: LogTone;
  icon?: string;
  round: number;
}

export type GameMode = "menu" | "local" | "online";
export type GameStatus = "idle" | "playing" | "finished";

interface GameStore {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;

  mode: GameMode;
  gameKey: number;
  content: GameContent | null;
  game: GameState | null;
  localPlayerId: PlayerId | null;
  lastSetup: GameSetup | null;
  status: GameStatus;
  fxQueue: GameEvent[];
  log: LogEntry[];
  logReadCount: number;
  animating: boolean;
  toast: { id: number; text: string; tone: LogTone } | null;

  startLocal: (setup: GameSetup, localSeat?: number) => void;
  dispatch: (action: GameAction) => { ok: boolean; error?: string };
  setAnimating: (value: boolean) => void;
  shiftFx: () => GameEvent | undefined;
  markLogRead: () => void;
  notify: (text: string, tone?: LogTone) => void;
  clearToast: () => void;
  backToMenu: () => void;
}

let botTimer: ReturnType<typeof setTimeout> | null = null;
let botGeneration = 0;
let gameKeySeq = 0;
let logSeq = 0;
let toastSeq = 0;

function cancelBot(): void {
  if (botTimer !== null) {
    clearTimeout(botTimer);
    botTimer = null;
  }
  botGeneration += 1;
}

function describeAll(
  events: GameEvent[],
  state: GameState,
  content: GameContent,
): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const event of events) {
    const described = describeEvent(event, state, content);
    if (!described) {
      continue;
    }
    logSeq += 1;
    entries.push({
      id: logSeq,
      text: described.text,
      tone: described.tone,
      icon: described.icon,
      round: state.round,
    });
  }
  return entries;
}

export function buildLogEntries(
  events: GameEvent[],
  state: GameState,
  content: GameContent,
): LogEntry[] {
  return describeAll(events, state, content);
}

let onlineDispatcher:
  | ((action: GameAction) => { ok: boolean; error?: string })
  | null = null;

export function setOnlineDispatcher(
  dispatcher: ((action: GameAction) => { ok: boolean; error?: string }) | null,
): void {
  onlineDispatcher = dispatcher;
}

export function applyRemoteSnapshot(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  localPlayerId: PlayerId | null,
): void {
  gameKeySeq += 1;
  const key = gameKeySeq;
  useGameStore.setState((current) => {
    const previousSeq = current.game?.seq ?? -1;
    const missedUpdates = previousSeq >= 0 && state.seq - previousSeq > 1;
    const backlogged = current.fxQueue.length > 12;
    return {
      mode: "online",
      gameKey: current.game ? current.gameKey : key,
      content,
      game: state,
      localPlayerId,
      status: state.phase === "finished" ? "finished" : "playing",
      fxQueue: missedUpdates || backlogged ? events : [...current.fxQueue, ...events],
      log: [...current.log, ...describeAll(events, state, content)],
    };
  });
}

export const useGameStore = create<GameStore>((set, get) => {
  function scheduleBot(): void {
    cancelBot();
    const generation = botGeneration;
    const delay = aiDelayMs(get().settings.aiSpeed);

    const step = (): void => {
      botTimer = null;
      if (generation !== botGeneration) {
        return;
      }
      const state = get();
      const { game, content, mode } = state;
      if (!game || !content || mode === "menu") {
        return;
      }
      if (game.phase === "finished") {
        set({ status: "finished" });
        return;
      }
      const actorId = game.pending ? game.pending.playerId : currentPlayer(game).id;
      const actor = game.players.find((player) => player.id === actorId);
      if (!actor?.isBot) {
        return;
      }
      if (state.animating) {
        // Let the current animation play out so players can follow the action.
        botTimer = setTimeout(step, 150);
        return;
      }
      const action = chooseAiAction(game, content, actorId);
      if (!action) {
        return;
      }
      try {
        const result = reduce(game, action, content);
        set((state) => ({
          game: result.state,
          fxQueue: [...state.fxQueue, ...result.events],
          log: [...state.log, ...describeAll(result.events, result.state, content)],
          status: result.state.phase === "finished" ? "finished" : "playing",
        }));
      } catch {
        return;
      }
      botTimer = setTimeout(step, delay);
    };

    botTimer = setTimeout(step, delay);
  }

  return {
    settings: loadSettings(),
    updateSettings: (patch) => {
      const next = { ...get().settings, ...patch };
      saveSettings(next);
      set({ settings: next });
    },

    mode: "menu",
    gameKey: 0,
    content: null,
    game: null,
    localPlayerId: null,
    lastSetup: null,
    status: "idle",
    fxQueue: [],
    log: [],
    logReadCount: 0,
    animating: false,
    toast: null,

    startLocal: (setup, localSeat = 0) => {
      cancelBot();
      const content = buildGameContent(setup.mapId);
      const { state, events } = bootstrapGame(setup, content);
      logSeq += 1;
      gameKeySeq += 1;
      set({
        mode: "local",
        gameKey: gameKeySeq,
        content,
        game: state,
        localPlayerId: state.players[localSeat]?.id ?? state.players[0].id,
        lastSetup: setup,
        status: "playing",
        fxQueue: events,
        logReadCount: 0,
        log: [
          {
            id: logSeq,
            text: `开局：${state.players.map((player) => player.name).join(" / ")}`,
            tone: "gold",
            icon: "🎬",
            round: 1,
          },
          ...describeAll(events, state, content),
        ],
        animating: false,
        toast: null,
      });
      scheduleBot();
    },

    dispatch: (action) => {
      const { game, content, mode } = get();
      if (mode === "online") {
        if (!onlineDispatcher) {
          get().notify("与主机连接已断开", "bad");
          return { ok: false, error: "与主机连接已断开" };
        }
        return onlineDispatcher(action);
      }
      if (!game || !content) {
        return { ok: false, error: "对局尚未开始" };
      }
      try {
        const result = reduce(game, action, content);
        set((state) => ({
          game: result.state,
          fxQueue: [...state.fxQueue, ...result.events],
          log: [...state.log, ...describeAll(result.events, result.state, content)],
          status: result.state.phase === "finished" ? "finished" : "playing",
        }));
        scheduleBot();
        return { ok: true };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "该操作当前不可用";
        get().notify(message, "bad");
        return { ok: false, error: message };
      }
    },

    setAnimating: (value) => set({ animating: value }),
    shiftFx: () => {
      const queue = get().fxQueue;
      if (queue.length === 0) {
        return undefined;
      }
      const [head, ...rest] = queue;
      set({ fxQueue: rest });
      return head;
    },

    markLogRead: () => {
      set({ logReadCount: get().log.length });
    },

    notify: (text, tone = "info") => {
      toastSeq += 1;
      set({ toast: { id: toastSeq, text, tone } });
    },
    clearToast: () => set({ toast: null }),

    backToMenu: () => {
      cancelBot();
      set({
        mode: "menu",
        gameKey: 0,
        content: null,
        game: null,
        localPlayerId: null,
        status: "idle",
        fxQueue: [],
        log: [],
        logReadCount: 0,
        animating: false,
        toast: null,
      });
    },
  };
});

export function actorIdOf(state: GameState): PlayerId {
  return state.pending ? state.pending.playerId : currentPlayer(state).id;
}

export function isLocalActor(
  state: GameState | null,
  localPlayerId: PlayerId | null,
): boolean {
  if (!state || !localPlayerId) {
    return false;
  }
  return actorIdOf(state) === localPlayerId;
}

export function turnOwnerName(state: GameState): string {
  return playerName(state, actorIdOf(state));
}

export function cancelPendingBotTimer(): void {
  cancelBot();
}
