"use client";

import { create } from "zustand";
import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import type {
  BotDifficulty,
  GameAction,
  GameContent,
  GameEvent,
  GameSetup,
  GameState,
  PlayerId,
} from "@/game/core/types";
import { buildGameContent, characters, economy, tokens } from "@/data/content";
import { HostSession } from "@/net/host";
import { ClientSession } from "@/net/client";
import { PROTOCOL_VERSION, type SeatInfo, type EmoteId } from "@/net/protocol";
import { toIntent } from "@/net/intent";
import { connectRoom, createRoomPeer, peerTransport, randomRoomCode, waitForPeerOpen } from "@/net/peer-transport";
import {
  applyRemoteSnapshot,
  cancelPendingBotTimer,
  setOnlineDispatcher,
  useGameStore,
} from "./game-store";

export type NetRole = "host" | "client";
export type NetStatus = "idle" | "connecting" | "lobby" | "playing" | "error" | "closed";

export interface OnlineLobbyConfig {
  mapId: string;
  playerCount: number;
  targetRounds: number;
  aiDifficulty: BotDifficulty;
}

export interface ChatLine {
  id: number;
  fromId: PlayerId | null;
  fromName: string;
  text: string;
  at: number;
}

interface NetStore {
  role: NetRole | null;
  roomCode: string | null;
  status: NetStatus;
  error: string | null;
  seats: SeatInfo[];
  chat: ChatLine[];
  emote: { fromName: string; emoteId: EmoteId; at: number; id: number } | null;
  lobbyConfig: OnlineLobbyConfig;
  supportChat: boolean;
  setLobbyConfig: (patch: Partial<OnlineLobbyConfig>) => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  reconnect: () => void;
  startGame: () => void;
  leave: () => void;
  sendChat: (text: string) => void;
  sendEmote: (emoteId: EmoteId) => void;
}

export const EMOTE_EMOJI: Record<EmoteId, string> = {
  clap: "👏",
  cry: "😭",
  laugh: "😂",
  rage: "😡",
  cool: "😎",
  shock: "😱",
  sleep: "😴",
  think: "🤔",
};

let peer: Peer | null = null;
let connections: DataConnection[] = [];
let host: HostSession | null = null;
let client: ClientSession | null = null;
let clientPeer: Peer | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let tearingDown = false;
let chatSeq = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function tokenKey(code: string): string {
  return `richman2.token.${code.toUpperCase()}`;
}

function loadToken(code: string): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.localStorage.getItem(tokenKey(code)) ?? undefined;
}

function saveToken(code: string, token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(tokenKey(code), token);
  } catch {
    // Storage unavailable — reconnect falls back to a new seat.
  }
}

function stopTimers(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function teardown(): void {
  tearingDown = true;
  stopTimers();
  cancelPendingBotTimer();
  for (const connection of connections) {
    try {
      connection.close();
    } catch {
      // Already closed.
    }
  }
  connections = [];
  peer?.destroy();
  peer = null;
  client?.close();
  client = null;
  clientPeer?.destroy();
  clientPeer = null;
  host = null;
  setOnlineDispatcher(null);
  tearingDown = false;
}

function appendChat(line: Omit<ChatLine, "id">): void {
  chatSeq += 1;
  useNetStore.setState((current) => ({
    chat: [...current.chat, { ...line, id: chatSeq }].slice(-60),
  }));
}

function hostLocalPlayerId(): PlayerId | null {
  if (!host) {
    return null;
  }
  return host.state
    ? (host.state.players[0]?.id ?? null)
    : (host.seatInfos()[0]?.playerId ?? null);
}

function buildHostSetup(config: OnlineLobbyConfig): GameSetup {
  const settings = useGameStore.getState().settings;
  const count = Math.max(2, Math.min(4, config.playerCount));
  return {
    mapId: config.mapId as GameSetup["mapId"],
    seed: (Date.now() >>> 0) % 2147483647,
    targetRounds: config.targetRounds,
    economy,
    players: Array.from({ length: count }).map((_, index) => ({
      name: index === 0 ? settings.playerName : `玩家${index + 1}`,
      characterId: characters[index % characters.length].id,
      tokenId: tokens[index % tokens.length].id,
      isBot: false,
      botDifficulty: config.aiDifficulty,
    })),
  };
}

function pushHostState(state: GameState, events: GameEvent[]): void {
  const content = host?.content ?? buildGameContent(state.mapId);
  applyRemoteSnapshot(state, events, content, hostLocalPlayerId());
  useNetStore.setState({ seats: host?.seatInfos() ?? [], status: "playing" });
}

export const useNetStore = create<NetStore>((set, get) => ({
  role: null,
  roomCode: null,
  status: "idle",
  error: null,
  seats: [],
  chat: [],
  emote: null,
  supportChat: false,
  lobbyConfig: {
    mapId: useGameStore.getState().settings.defaultMapId,
    playerCount: 4,
    targetRounds: 0,
    aiDifficulty: useGameStore.getState().settings.defaultDifficulty,
  },

  setLobbyConfig: (patch) => set((current) => ({ lobbyConfig: { ...current.lobbyConfig, ...patch } })),

  createRoom: () => {
    teardown();
    const config = get().lobbyConfig;
    const code = randomRoomCode();
    set({ role: "host", roomCode: code, status: "connecting", error: null, seats: [], chat: [] });
    const content = buildGameContent(config.mapId);
    const setup = buildHostSetup(config);
    const session = new HostSession(setup, content, {
      hostSeat: 0,
      onUpdate: (state, events) => pushHostState(state, events),
      onSeatsChange: () => set({ seats: host?.seatInfos() ?? [] }),
    });
    host = session;
    const roomPeer = createRoomPeer(code);
    peer = roomPeer;
    roomPeer.on("connection", (connection) => {
      connections.push(connection);
      session.connect(peerTransport(connection));
    });
    roomPeer.on("error", (error) => {
      const message = String((error as Error)?.message ?? error);
      if (message.includes("is taken") || message.includes("unavailable-id")) {
        set({ status: "error", error: "房间号冲突，请重试" });
        teardown();
        return;
      }
      set({ status: "error", error: message });
    });
    void waitForPeerOpen(roomPeer)
      .then(() => {
        set({ status: "lobby", seats: session.seatInfos() });
        tickTimer = setInterval(() => {
          session.tick();
        }, 500);
      })
      .catch((error: unknown) => {
        set({
          status: "error",
          error: error instanceof Error ? error.message : "无法连接信令服务器",
        });
      });

    setOnlineDispatcher((action) => {
      if (!host) {
        return { ok: false, error: "房间已关闭" };
      }
      const playerId = hostLocalPlayerId();
      if (!playerId) {
        return { ok: false, error: "对局尚未开始" };
      }
      const intent = toIntent(action);
      if (!intent) {
        return { ok: false, error: "联机模式暂不支持该操作" };
      }
      const result = host.submitIntent(playerId, intent);
      if (!result.ok) {
        useGameStore.getState().notify(result.error ?? "操作无效", "bad");
      }
      return result;
    });
  },

  joinRoom: (rawCode) => {
    teardown();
    const code = rawCode.trim().toUpperCase();
    const settings = useGameStore.getState().settings;
    const characterId = characters[0].id;
    const tokenId = tokens[0].id;
    set({ role: "client", roomCode: code, status: "connecting", error: null, seats: [], chat: [] });
    const session = new ClientSession({
      onWelcome: (welcome) => {
        const content = buildGameContent(welcome.mapId);
        if (content.contentHash !== welcome.contentHash) {
          set({ status: "error", error: "游戏内容与主机不一致，请刷新页面后重试" });
          teardown();
          return;
        }
        saveToken(code, welcome.token);
        reconnectAttempts = 0;
        set({
          status: welcome.lobby ? "lobby" : "playing",
          seats: welcome.players,
          chat: welcome.chat.map((line) => ({
            id: (chatSeq += 1),
            fromId: line.fromId,
            fromName: line.fromName,
            text: line.text,
            at: line.at,
          })),
        });
        if (!welcome.lobby && session.state) {
          applyRemoteSnapshot(session.state, welcome.recentEvents, content, welcome.seat);
        }
      },
      onUpdate: (update) => {
        const content = buildGameContent(update.snapshot.mapId);
        set({ status: "playing", seats: update.players });
        const seat = session.seat;
        applyRemoteSnapshot(update.snapshot, update.events, content, seat);
      },
      onRejected: (rejected) => {
        if (rejected.code === "version" || rejected.code === "content" || rejected.code === "closed") {
          set({ status: "error", error: rejected.reason });
          teardown();
        } else {
          useGameStore.getState().notify(rejected.reason, "bad");
        }
      },
      onChat: (line) => {
        appendChat({ fromId: line.fromId, fromName: line.fromName, text: line.text, at: line.at });
      },
      onEmote: (line) => {
        chatSeq += 1;
        set({
          emote: { fromName: line.fromName, emoteId: line.emoteId, at: line.at, id: chatSeq },
        });
      },
      onSeatUpdate: (players) => set({ seats: players }),
      onClose: () => {
        if (tearingDown) {
          return;
        }
        if (get().status !== "idle" && get().status !== "error") {
          set({ status: "closed", error: "与主机的连接已断开" });
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts += 1;
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              if (get().status === "closed") {
                get().joinRoom(get().roomCode ?? "");
              }
            }, 2500);
          } else {
            set({
              status: "error",
              error: "多次重连失败，请返回主菜单重新加入房间",
            });
          }
        }
      },
    });
    client = session;
    void connectRoom(code)
      .then(({ connection, peer: roomPeer }) => {
        clientPeer = roomPeer;
        session.connect(peerTransport(connection), {
          name: settings.playerName,
          protocol: PROTOCOL_VERSION,
          token: loadToken(code),
          characterId,
          tokenId,
        });
      })
      .catch((error: unknown) => {
        set({
          status: "error",
          error: error instanceof Error ? error.message : "连接房间失败",
        });
      });

    setOnlineDispatcher((action) => {
      if (!client) {
        return { ok: false, error: "尚未连接房间" };
      }
      const intent = toIntent(action);
      if (!intent) {
        return { ok: false, error: "联机模式暂不支持该操作" };
      }
      client.sendIntent(intent);
      return { ok: true };
    });
  },

  reconnect: () => {
    const code = get().roomCode;
    if (!code) {
      return;
    }
    get().joinRoom(code);
  },

  startGame: () => {
    if (!host || host.started) {
      return;
    }
    try {
      host.begin();
      set({ status: "playing", seats: host.seatInfos() });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "无法开始对局" });
    }
  },

  leave: () => {
    teardown();
    set({ role: null, roomCode: null, status: "idle", error: null, seats: [], chat: [], emote: null });
    useGameStore.getState().backToMenu();
  },

  sendChat: (text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    const state = get();
    if (state.role === "host" && host) {
      const playerId = hostLocalPlayerId();
      if (!playerId) {
        return;
      }
      if (host.sendChatFrom(playerId, trimmed)) {
        appendChat({ fromId: playerId, fromName: "你", text: trimmed, at: Date.now() });
      } else {
        useGameStore.getState().notify("发言过于频繁", "bad");
      }
      return;
    }
    if (client) {
      if (!client.sendChat(trimmed)) {
        useGameStore.getState().notify("发言过于频繁", "bad");
      }
    }
  },

  sendEmote: (emoteId) => {
    const state = get();
    chatSeq += 1;
    set({ emote: { fromName: "你", emoteId, at: Date.now(), id: chatSeq } });
    if (state.role === "host" && host) {
      const playerId = hostLocalPlayerId();
      if (playerId) {
        host.sendEmoteFrom(playerId, emoteId);
      }
      return;
    }
    client?.sendEmote(emoteId);
  },
}));

export function hostSnapshot(): { state: GameState; content: GameContent } | null {
  if (!host || !host.state) {
    return null;
  }
  return { state: host.state, content: host.content };
}

export function currentSeatId(): PlayerId | null {
  return hostLocalPlayerId() ?? (client ? client.seat : null);
}
