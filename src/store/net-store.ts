"use client";

import { create } from "zustand";
import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import type {
  BotDifficulty,
  GameContent,
  GameEvent,
  GameSetup,
  GameState,
  PlayerId,
} from "@/game/core/types";
import { STATE_VERSION } from "@/game/core/state";
import { buildGameContent, characters, economy, tokens } from "@/data/content";
import { HostSession } from "@/net/host";
import { ClientSession } from "@/net/client";
import { PROTOCOL_VERSION, type SeatInfo, type EmoteId } from "@/net/protocol";
import { toIntent } from "@/net/intent";
import {
  applyRemoteSnapshot,
  cancelPendingBotTimer,
  setOnlineDispatcher,
  useGameStore,
} from "./game-store";

type PeerTransportModule = typeof import("@/net/peer-transport");

const PEER_MODULE_TIMEOUT_MS = 10000;

let peerTransportModule: Promise<PeerTransportModule> | null = null;

function loadPeerTransport(): Promise<PeerTransportModule> {
  if (!peerTransportModule) {
    const loading = import("@/net/peer-transport").catch((error: unknown) => {
      peerTransportModule = null;
      throw error;
    });
    peerTransportModule = loading;
  }
  const loading = peerTransportModule;
  return new Promise<PeerTransportModule>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("联机模块加载超时，请检查网络后重试"));
    }, PEER_MODULE_TIMEOUT_MS);
    loading.then(
      (module) => {
        clearTimeout(timer);
        resolve(module);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function peerModuleErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("加载超时")) {
    return error.message;
  }
  return "联机模块加载失败，请检查网络后重试";
}

export type NetRole = "host" | "client";
export type NetStatus = "idle" | "connecting" | "lobby" | "playing" | "error" | "closed";

export interface OnlineLobbyConfig {
  mapId: string;
  playerCount: number;
  targetRounds: number;
  aiDifficulty: BotDifficulty;
  characterId: string;
  tokenId: string;
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
  retryable: boolean;
  chat: ChatLine[];
  emote: { fromName: string; emoteId: EmoteId; at: number; id: number } | null;
  lobbyConfig: OnlineLobbyConfig;
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
let verifiedContentHash: string | null = null;
let sessionGeneration = 0;
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
  sessionGeneration += 1;
  verifiedContentHash = null;
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

function scheduleReconnect(generation: number): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    useNetStore.setState({
      status: "error",
      error: "多次重连失败，请点击重连或返回主菜单重新加入",
      retryable: true,
    });
    return;
  }
  reconnectAttempts += 1;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (generation !== sessionGeneration) {
      return;
    }
    const current = useNetStore.getState();
    if (current.status !== "closed" || !current.roomCode) {
      return;
    }
    current.joinRoom(current.roomCode);
  }, 2500);
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
      characterId: (index === 0
        ? (config.characterId as GameSetup["players"][number]["characterId"])
        : characters[index % characters.length].id),
      tokenId: index === 0 ? config.tokenId : tokens[index % tokens.length].id,
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
  retryable: false,
  chat: [],
  emote: null,
  lobbyConfig: {
    mapId: useGameStore.getState().settings.defaultMapId,
    playerCount: 4,
    targetRounds: 0,
    aiDifficulty: useGameStore.getState().settings.defaultDifficulty,
    characterId: characters[0].id as string,
    tokenId: tokens[0].id as string,
  },

  setLobbyConfig: (patch) => set((current) => ({ lobbyConfig: { ...current.lobbyConfig, ...patch } })),

  createRoom: () => {
    teardown();
    const config = get().lobbyConfig;
    set({
      role: "host",
      roomCode: null,
      status: "connecting",
      error: null,
      retryable: false,
      seats: [],
      chat: [],
    });
    const content = buildGameContent(config.mapId);
    const setup = buildHostSetup(config);
    const session = new HostSession(setup, content, {
      hostSeat: 0,
      onUpdate: (state, events) => pushHostState(state, events),
      onSeatsChange: () => set({ seats: host?.seatInfos() ?? [] }),
    });
    host = session;
    void loadPeerTransport()
      .then(({ createRoomPeer, peerTransport, randomRoomCode, waitForPeerOpen }) => {
        if (host !== session) {
          return;
        }
        const code = randomRoomCode();
        set({ roomCode: code });
        const roomPeer = createRoomPeer(code);
        peer = roomPeer;
        roomPeer.on("connection", (connection) => {
          connections.push(connection);
          session.connect(peerTransport(connection));
        });
        roomPeer.on("error", (error) => {
          if (host !== session) {
            return;
          }
          const message = String((error as Error)?.message ?? error);
          if (message.includes("is taken") || message.includes("unavailable-id")) {
            set({ status: "error", error: "房间号冲突，请重试" });
            teardown();
            return;
          }
          set({ status: "error", error: message });
        });
        return waitForPeerOpen(roomPeer)
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
      })
      .catch((error: unknown) => {
        set({
          status: "error",
          error: peerModuleErrorMessage(error),
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
    const config = get().lobbyConfig;
    const characterId = config.characterId;
    const tokenId = config.tokenId;
    sessionGeneration += 1;
    const generation = sessionGeneration;
    verifiedContentHash = null;
    set({
      role: "client",
      roomCode: code,
      status: "connecting",
      error: null,
      retryable: false,
      seats: [],
      chat: [],
    });
    const session = new ClientSession({
      onWelcome: (welcome) => {
        if (generation !== sessionGeneration) {
          return;
        }
        if (welcome.engine !== STATE_VERSION) {
          set({ status: "error", error: "主机引擎版本不一致，请刷新页面" });
          teardown();
          return;
        }
        let content: GameContent;
        try {
          content = buildGameContent(welcome.mapId);
        } catch {
          set({ status: "error", error: "主机使用了未知地图，请刷新页面" });
          teardown();
          return;
        }
        if (content.contentHash !== welcome.contentHash) {
          set({ status: "error", error: "游戏内容与主机不一致，请刷新页面后重试" });
          teardown();
          return;
        }
        verifiedContentHash = content.contentHash;
        saveToken(code, welcome.token);
        reconnectAttempts = 0;
        set({
          status: welcome.lobby ? "lobby" : "playing",
          error: null,
          retryable: false,
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
        if (generation !== sessionGeneration) {
          return;
        }
        let content: GameContent;
        try {
          content = buildGameContent(update.snapshot.mapId);
        } catch {
          set({ status: "error", error: "主机使用了未知地图，请刷新页面" });
          teardown();
          return;
        }
        if (
          verifiedContentHash !== null &&
          (content.contentHash !== verifiedContentHash ||
            update.snapshot.contentHash !== verifiedContentHash)
        ) {
          set({ status: "error", error: "主机内容与握手校验不一致，已断开连接" });
          teardown();
          return;
        }
        set({ status: "playing", seats: update.players });
        const seat = session.seat;
        applyRemoteSnapshot(update.snapshot, update.events, content, seat);
      },
      onRejected: (rejected) => {
        if (generation !== sessionGeneration) {
          return;
        }
        if (rejected.code === "closed") {
          set({ status: "closed", error: rejected.reason, retryable: true });
          scheduleReconnect(generation);
          return;
        }
        set({ status: "error", error: rejected.reason, retryable: false });
        teardown();
      },
      onChat: (line) => {
        if (generation !== sessionGeneration) {
          return;
        }
        appendChat({ fromId: line.fromId, fromName: line.fromName, text: line.text, at: line.at });
      },
      onEmote: (line) => {
        if (generation !== sessionGeneration) {
          return;
        }
        chatSeq += 1;
        set({
          emote: { fromName: line.fromName, emoteId: line.emoteId, at: line.at, id: chatSeq },
        });
      },
      onSeatUpdate: (players) => {
        if (generation === sessionGeneration) {
          set({ seats: players });
        }
      },
      onClose: () => {
        if (tearingDown || generation !== sessionGeneration) {
          return;
        }
        if (get().status !== "idle" && get().status !== "error") {
          set({ status: "closed", error: "与主机的连接已断开", retryable: true });
          scheduleReconnect(generation);
        }
      },
    });
    client = session;
    void loadPeerTransport()
      .then(async (transportModule) => ({ module: transportModule, room: await transportModule.connectRoom(code) }))
      .then(({ module, room }) => {
        const { connection, peer: roomPeer } = room;
        if (generation !== sessionGeneration) {
          try {
            connection.close();
          } catch {
            // Already closed.
          }
          roomPeer.destroy();
          return;
        }
        clientPeer = roomPeer;
        session.connect(module.peerTransport(connection), {
          name: settings.playerName,
          protocol: PROTOCOL_VERSION,
          engine: STATE_VERSION,
          token: loadToken(code),
          characterId,
          tokenId,
        });
      })
      .catch((error: unknown) => {
        if (generation !== sessionGeneration) {
          return;
        }
        const message = error instanceof Error ? error.message : "连接房间失败";
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          set({ status: "closed", error: `${message}，正在重试…`, retryable: true });
          scheduleReconnect(generation);
          return;
        }
        set({ status: "error", error: `多次重连失败：${message}`, retryable: true });
      });

    setOnlineDispatcher((action) => {
      if (!client) {
        const message = "尚未连接房间";
        useGameStore.getState().notify(message, "bad");
        return { ok: false, error: message };
      }
      const intent = toIntent(action);
      if (!intent) {
        const message = "联机模式暂不支持该操作";
        useGameStore.getState().notify(message, "bad");
        return { ok: false, error: message };
      }
      if (!client.sendIntent(intent)) {
        const message = "未连接到主机";
        useGameStore.getState().notify(message, "bad");
        return { ok: false, error: message };
      }
      return { ok: true };
    });
  },

  reconnect: () => {
    const code = get().roomCode;
    if (!code) {
      return;
    }
    reconnectAttempts = 0;
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

