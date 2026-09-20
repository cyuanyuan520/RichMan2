import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSetup } from "@/game/core/types";
import { asMapId } from "@/game/core/ids";
import { bootstrapGame } from "@/game/core/state";
import { buildGameContent, characters, economy, tokens } from "@/data/content";
import { applyRemoteSnapshot, setOnlineDispatcher, useGameStore } from "./game-store";
import { useNetStore } from "./net-store";

const connectRoomMock = vi.fn();
const connectHolder = vi.hoisted(() => ({
  pending: null as null | {
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  },
}));
const createPeerHolder = vi.hoisted(() => ({
  impl: (() => {
    throw new Error("createRoomPeer is not used in these tests");
  }) as () => unknown,
}));

vi.mock("@/net/peer-transport", () => ({
  ROOM_CODE_LENGTH: 5,
  randomRoomCode: () => "ABCDE",
  hostPeerId: (code: string) => `richman2-${code}`,
  peerOptions: () => ({}),
  iceConfig: () => ({}),
  createRoomPeer: () => createPeerHolder.impl(),
  waitForPeerOpen: async () => "richman2-abcde",
  connectRoom: (...args: unknown[]) => {
    connectRoomMock(...args);
    return new Promise((resolve, reject) => {
      connectHolder.pending = { resolve, reject };
    });
  },
  connectToRoom: (...args: unknown[]) => {
    connectRoomMock(...args);
    return new Promise((resolve, reject) => {
      connectHolder.pending = { resolve, reject };
    });
  },
  peerTransport: () => {
    throw new Error("peerTransport is not used in these tests");
  },
}));

function makeSetup(): GameSetup {
  return {
    mapId: asMapId("ink"),
    seed: 5,
    targetRounds: 0,
    economy,
    players: [
      { name: "甲", characterId: characters[0].id, tokenId: tokens[0].id, isBot: false },
      { name: "乙", characterId: characters[1].id, tokenId: tokens[1].id, isBot: false },
    ],
  };
}

function seedOnlineGame(): void {
  const content = buildGameContent("ink");
  const { state } = bootstrapGame(makeSetup(), content);
  applyRemoteSnapshot(state, [], content, state.players[0].id);
}

beforeEach(() => {
  connectRoomMock.mockReset();
  connectHolder.pending = null;
  createPeerHolder.impl = () => {
    throw new Error("createRoomPeer is not used in these tests");
  };
  setOnlineDispatcher(null);
});

afterEach(() => {
  vi.useRealTimers();
  useNetStore.getState().leave();
  setOnlineDispatcher(null);
});

describe("net store", () => {
  it("refuses to reduce locally when online without a session", () => {
    seedOnlineGame();
    const before = useGameStore.getState().game!;
    const result = useGameStore
      .getState()
      .dispatch({ type: "roll-dice", playerId: before.players[0].id });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("连接");
    const after = useGameStore.getState().game!;
    expect(after.seq).toBe(before.seq);
    expect(useGameStore.getState().toast?.tone).toBe("bad");
  });

  it("routes dispatch through the registered online dispatcher", () => {
    seedOnlineGame();
    setOnlineDispatcher(() => ({ ok: true }));
    const before = useGameStore.getState().game!;
    const result = useGameStore
      .getState()
      .dispatch({ type: "roll-dice", playerId: before.players[0].id });
    expect(result.ok).toBe(true);
    expect(useGameStore.getState().game!.seq).toBe(before.seq);
  });

  it("retries the connection when joining fails and exposes a manual retry", async () => {
    vi.useFakeTimers();

    useNetStore.getState().joinRoom("abcde");
    await vi.advanceTimersByTimeAsync(0);
    connectHolder.pending!.reject(new Error("连接超时"));
    await vi.advanceTimersByTimeAsync(0);

    expect(connectRoomMock).toHaveBeenCalledTimes(1);
    const afterFailure = useNetStore.getState();
    expect(afterFailure.role).toBe("client");
    expect(afterFailure.roomCode).toBe("ABCDE");
    expect(afterFailure.status).toBe("closed");
    expect(afterFailure.error).toContain("重试");

    await vi.advanceTimersByTimeAsync(2600);
    expect(connectRoomMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    connectHolder.pending!.reject(new Error("连接超时"));
    await vi.advanceTimersByTimeAsync(0);

    useNetStore.getState().reconnect();
    await vi.advanceTimersByTimeAsync(0);
    expect(connectRoomMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("ignores a late connect result after the player left", async () => {
    vi.useFakeTimers();
    const closed = vi.fn();
    const destroyed = vi.fn();
    const sent: unknown[] = [];

    useNetStore.getState().joinRoom("ABCDE");
    await vi.advanceTimersByTimeAsync(0);
    expect(connectHolder.pending).not.toBeNull();

    useNetStore.getState().leave();
    connectHolder.pending!.resolve({
      connection: { close: closed, open: true, send: (m: unknown) => sent.push(m) },
      peer: { destroy: destroyed },
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(closed).toHaveBeenCalled();
    expect(destroyed).toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    expect(useNetStore.getState().role).toBeNull();
  });

  it("queues a client with the lobby character and token selection", async () => {
    vi.useFakeTimers();
    useNetStore.getState().setLobbyConfig({
      characterId: characters[2].id,
      tokenId: tokens[3].id,
    });
    useNetStore.getState().joinRoom("zzzzz");
    await vi.advanceTimersByTimeAsync(0);

    const config = useNetStore.getState().lobbyConfig;
    expect(config.characterId).toBe(characters[2].id);
    expect(config.tokenId).toBe(tokens[3].id);
    expect(useNetStore.getState().roomCode).toBe("ZZZZZ");
  });

  it("stops retrying after the attempt budget and reports an error", async () => {
    vi.useFakeTimers();
    useNetStore.getState().joinRoom("qqqqq");
    await vi.advanceTimersByTimeAsync(0);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      connectHolder.pending?.reject(new Error("连接超时"));
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2600);
    }

    const state = useNetStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toContain("多次重连失败");
    expect(state.retryable).toBe(true);
    const callsAtError = connectRoomMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(connectRoomMock.mock.calls.length).toBe(callsAtError);
  });

  it("enters the lobby after creating a room through the lazy peer module and stops its tick on leave", async () => {
    vi.useFakeTimers();
    const destroyed = vi.fn();
    createPeerHolder.impl = () => ({
      on: vi.fn(),
      open: false,
      id: "richman2-abcde",
      destroy: destroyed,
    });

    useNetStore.getState().createRoom();
    await vi.advanceTimersByTimeAsync(0);

    const created = useNetStore.getState();
    expect(created.status).toBe("lobby");
    expect(created.roomCode).toBe("ABCDE");
    expect(created.role).toBe("host");
    expect(created.seats.length).toBe(created.lobbyConfig.playerCount);

    useNetStore.getState().leave();
    await vi.advanceTimersByTimeAsync(2000);

    expect(useNetStore.getState().status).toBe("idle");
    expect(useNetStore.getState().role).toBeNull();
  });
});
