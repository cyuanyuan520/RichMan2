import { describe, expect, it } from "vitest";
import { HostSession } from "./host";
import { ClientSession } from "./client";
import { flush, memoryTransports } from "./transport";
import {
  PROTOCOL_VERSION,
  intentSchema,
  sanitizeState,
  type ClientIntent,
  type WelcomeMessage,
} from "./protocol";
import { STATE_VERSION } from "@/game/core/state";
import { buildGameContent } from "@/data/content";
import { defaultEconomy } from "@/data/content/economy";
import type { GameSetup } from "@/game/core/types";
import { createRng } from "@/game/core/rng";
import { asPlayerId } from "@/game/core/ids";

const content = buildGameContent("ink");

function makeSetup(bots: boolean[], seed = 42): GameSetup {
  return {
    mapId: "ink" as GameSetup["mapId"],
    players: bots.map((isBot, index) => ({
      name: `玩家${index + 1}`,
      characterId: (["cai-shen", "xue-ba", "ming-yi", "jin-li"][index] ??
        "cai-shen") as GameSetup["players"][number]["characterId"],
      tokenId: `token-${index}`,
      isBot,
      botDifficulty: "normal" as const,
    })),
    seed,
    targetRounds: 0,
    economy: defaultEconomy,
  };
}

const HELLO = {
  protocol: PROTOCOL_VERSION,
  engine: STATE_VERSION,
  contentHash: content.contentHash,
  name: "测试玩家",
};

describe("protocol", () => {
  it("strips host-only fields from client intents", () => {
    const parsed = intentSchema.safeParse({
      type: "roll-dice",
      forcedDice: [6, 6],
      playerId: "p2",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ type: "roll-dice" });
      expect("forcedDice" in parsed.data).toBe(false);
    }
  });

  it("rejects unknown intent types", () => {
    expect(intentSchema.safeParse({ type: "hack-the-dice" }).success).toBe(false);
    expect(
      intentSchema.safeParse({ type: "choose-dice", value: 99 }).success,
    ).toBe(false);
    expect(
      intentSchema.safeParse({ type: "choose-dice", value: 6 }).success,
    ).toBe(true);
  });

  it("sanitizes hidden state for broadcast", () => {
    const host = new HostSession(makeSetup([true, true]), content);
    host.begin();
    const sanitized = sanitizeState(host.state!);
    expect(sanitized.rng).toEqual(createRng(0));
    expect(sanitized.seed).toBe(0);
    expect(sanitized.chanceDeck).toHaveLength(0);
    expect(sanitized.fateDeck).toHaveLength(0);
    expect(host.state!.chanceDeck.length).toBeGreaterThan(0);
  });
});

describe("host/client over memory transport", () => {
  it("lets a client claim a seat and receive welcome", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);

    const client = new ClientSession();
    client.connect(clientSide, { ...HELLO, name: "小明" });
    await flush();

    expect(client.seat).toBe(asPlayerId("p2"));
    expect(client.token).toBeTruthy();
    expect(client.players).toHaveLength(4);
    const seat = client.players.find((entry) => entry.playerId === client.seat);
    expect(seat?.name).toBe("小明");
    expect(seat?.claimed).toBe(true);
    expect(client.players[2]!.isBot).toBe(true);
  });

  it("rejects a hello from a different engine version", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const rejections: string[] = [];
    const client = new ClientSession({
      onRejected: (rejected) => rejections.push(rejected.code),
    });
    client.connect(clientSide, { ...HELLO, engine: STATE_VERSION + 1 });
    await flush();
    expect(rejections).toContain("version");
    expect(client.seat).toBeNull();
  });

  it("advertises engine version, map id and accepts a hello without a content hash", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);

    const welcomes: WelcomeMessage[] = [];
    const client = new ClientSession({ onWelcome: (welcome) => welcomes.push(welcome) });
    client.connect(clientSide, {
      protocol: PROTOCOL_VERSION,
      engine: STATE_VERSION,
      name: "后进房",
    });
    await flush();

    expect(welcomes).toHaveLength(1);
    expect(welcomes[0]!.mapId).toBe("ink");
    expect(welcomes[0]!.engine).toBe(STATE_VERSION);
    expect(welcomes[0]!.contentHash).toBe(content.contentHash);
    expect(client.seat).toBe(asPlayerId("p2"));
  });

  it("rejects a hello whose content hash mismatches", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const rejections: string[] = [];
    const client = new ClientSession({
      onRejected: (rejected) => rejections.push(rejected.code),
    });
    client.connect(clientSide, { ...HELLO, contentHash: "deadbeefdeadbeef" });
    await flush();
    expect(rejections).toContain("content");
    expect(client.seat).toBeNull();
  });

  it("lets the host send chat and emotes from its own seat", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const chats: string[] = [];
    const emotes: string[] = [];
    const client = new ClientSession({
      onChat: (chat) => chats.push(chat.text),
      onEmote: (emote) => emotes.push(emote.emoteId),
    });
    client.connect(clientSide, HELLO);
    await flush();

    expect(host.sendChatFrom(asPlayerId("p1"), "大家好")).toBe(true);
    expect(host.sendEmoteFrom(asPlayerId("p1"), "clap")).toBe(true);
    await flush();
    expect(chats).toContain("大家好");
    expect(emotes).toContain("clap");
    expect(host.sendChatFrom(asPlayerId("p3"), "AI 不能发言")).toBe(false);
  });

  it("starts the game and streams updates with events", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();

    host.begin();
    await flush();
    expect(client.state).not.toBeNull();
    expect(client.state!.phase).toBe("await-roll");
    const started = client.consumeEvents();
    expect(started.some((event) => event.type === "game-started")).toBe(true);

    const roll = host.submitIntent(asPlayerId("p1"), { type: "roll-dice" });
    expect(roll.ok).toBe(true);
    await flush();
    expect(client.state!.seq).toBe(1);
    const rolled = client.consumeEvents();
    expect(rolled.some((event) => event.type === "dice-rolled")).toBe(true);
  });

  it("rejects illegal intents from the wrong player", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const rejects: string[] = [];
    const client = new ClientSession({
      onRejected: (message) => rejects.push(message.reason),
    });
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();

    expect(host.submitIntent(asPlayerId("p2"), { type: "roll-dice" })).toEqual({
      ok: false,
      error: "当前不能执行该操作",
    });
    client.sendIntent({ type: "roll-dice" });
    await flush();
    expect(rejects).toHaveLength(1);

    expect(host.submitIntent(asPlayerId("p1"), { type: "roll-dice" }).ok).toBe(
      true,
    );
    await flush();
    expect(client.state!.seq).toBe(1);
  });

  it("ignores duplicate intent sequence numbers", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      hostSeat: -1,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const rejects: string[] = [];
    const client = new ClientSession({
      onRejected: (message) => rejects.push(message.reason),
    });
    client.connect(clientSide, HELLO);
    await flush();
    expect(client.seat).toBe(asPlayerId("p1"));
    host.begin();
    await flush();

    const intent: ClientIntent = { type: "roll-dice" };
    clientSide.send({ type: "intent", seq: 1, intent });
    await flush();
    expect(client.state!.seq).toBe(1);
    expect(rejects).toHaveLength(0);

    clientSide.send({ type: "intent", seq: 1, intent });
    await flush();
    expect(client.state!.seq).toBe(1);
    expect(rejects).toHaveLength(0);

    clientSide.send({ type: "intent", seq: 2, intent: { type: "buy-lottery" } });
    await flush();
    expect(client.state!.seq).toBe(1);
    expect(rejects).toHaveLength(1);
  });

  it("rejects malformed messages without crashing", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const rejects: string[] = [];
    const client = new ClientSession({
      onRejected: (message) => rejects.push(message.code),
    });
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();

    clientSide.send({ type: "not-a-real-message" });
    await flush();
    expect(rejects).toContain("invalid");
    expect(client.state!.phase).toBe("await-roll");
  });

  it("reconnects with a token and refuses strangers after start", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      disconnectGraceMs: 0,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();
    const token = client.token!;

    const [hostSide2, clientSide2] = memoryTransports("host", "client2");
    host.connect(hostSide2);
    const client2 = new ClientSession();
    client2.connect(clientSide2, { ...HELLO, name: "陌生人" });
    await flush();
    expect(client2.seat).toBeNull();

    const [hostSide3, clientSide3] = memoryTransports("host", "client3");
    host.connect(hostSide3);
    const client3 = new ClientSession();
    client3.connect(clientSide3, { ...HELLO, token, name: "回归玩家" });
    await flush();
    expect(client3.seat).toBe(asPlayerId("p2"));
    expect(client3.state).not.toBeNull();
    expect(client3.state!.phase).toBe("await-roll");
  });

  it("broadcasts chat and emotes with rate limiting", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      chatLimitPerMinute: 2,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const received: string[] = [];
    const emotes: string[] = [];
    const client = new ClientSession({
      onChat: (chat) => received.push(chat.text),
      onEmote: (emote) => emotes.push(emote.emoteId),
    });
    client.connect(clientSide, HELLO);
    await flush();

    client.sendChat("大家好");
    client.sendChat("我又来了");
    client.sendChat("第三条应该被限流");
    client.sendEmote("clap");
    await flush();

    expect(received).toEqual(["大家好", "我又来了"]);
    expect(emotes).toEqual(["clap"]);
  });

  it("auto-plays disconnected human seats through the AI", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      disconnectGraceMs: 0,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();
    client.close();
    await flush();

    host.state!.turnSeat = 1;
    host.state!.phase = "await-roll";
    const seqBefore = host.state!.seq;
    const acted = host.tick();
    expect(acted).toBe(true);
    expect(host.state!.seq).toBeGreaterThan(seqBefore);
  });

  it("resumes intent sequencing after a reconnect", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      hostSeat: -1,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();
    expect(client.seat).toBe(asPlayerId("p1"));
    host.begin();
    await flush();
    const token = client.token!;

    clientSide.send({ type: "intent", seq: 1, intent: { type: "buy-lottery" } });
    await flush();
    expect(host.state!.seq).toBe(0);

    const [hostSide2, clientSide2] = memoryTransports("host", "client2");
    host.connect(hostSide2);
    const client2 = new ClientSession();
    client2.connect(clientSide2, { ...HELLO, token });
    await flush();
    expect(client2.seat).toBe(asPlayerId("p1"));

    client2.sendIntent({ type: "roll-dice" });
    await flush();
    expect(host.state!.seq).toBe(1);
    expect(client2.state!.seq).toBe(1);
  });

  it("rebinds a lobby seat by token without rotating it", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();
    expect(client.seat).toBe(asPlayerId("p2"));
    const token = client.token!;
    client.close();
    await flush();

    const [hostSide2, clientSide2] = memoryTransports("host", "client2");
    host.connect(hostSide2);
    const client2 = new ClientSession();
    client2.connect(clientSide2, { ...HELLO, token });
    await flush();
    expect(client2.seat).toBe(asPlayerId("p2"));
    expect(client2.token).toBe(token);
    const seat = host.seatInfos().find((entry) => entry.playerId === "p2");
    expect(seat?.claimed).toBe(true);
    expect(seat?.connected).toBe(true);
  });

  it("rejects a second hello on the same transport", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      hostSeat: -1,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();

    clientSide.send({ ...HELLO, type: "hello" });
    await flush();
    const claimed = host.seatInfos().filter((entry) => entry.claimed);
    expect(claimed).toHaveLength(1);
    expect(client.connected).toBe(true);
    expect(client.seat).toBe(asPlayerId("p1"));
  });

  it("keeps the incumbent transport when a stranger guesses a token", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();

    const [hostSide2, clientSide2] = memoryTransports("host", "client2");
    host.connect(hostSide2);
    const rejects: string[] = [];
    const attacker = new ClientSession({
      onRejected: (message) => rejects.push(message.code),
    });
    attacker.connect(clientSide2, { ...HELLO, token: "deadbeef".repeat(4) });
    await flush();
    expect(attacker.seat).toBeNull();
    expect(rejects.length).toBeGreaterThan(0);
    expect(client.connected).toBe(true);

    clientSide2.send({ ...HELLO, type: "hello", token: "deadbeef".repeat(4) });
    await flush();
    for (let i = 0; i < 6; i += 1) {
      clientSide2.send({ ...HELLO, type: "hello", token: "deadbeef".repeat(4) });
    }
    await flush();
    expect(clientSide2.isOpen()).toBe(false);
  });

  it("rate limits emotes", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      emoteLimitPerMinute: 2,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const emotes: string[] = [];
    const client = new ClientSession({
      onEmote: (emote) => emotes.push(emote.emoteId),
    });
    client.connect(clientSide, HELLO);
    await flush();

    client.sendEmote("clap");
    client.sendEmote("cry");
    client.sendEmote("laugh");
    client.sendEmote("rage");
    await flush();
    expect(emotes).toEqual(["clap", "cry"]);
  });

  it("bot-fills a seat whose transport stopped answering pings", async () => {
    const clock = { value: 0 };
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      now: () => clock.value,
      disconnectGraceMs: 0,
      pingIntervalMs: 1000,
      livenessTimeoutMs: 2500,
      hostSeat: -1,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    clientSide.send({ ...HELLO, type: "hello" });
    await flush();
    host.begin();
    await flush();

    clock.value = 1000;
    host.tick(clock.value);
    await flush();
    expect(clientSide.isOpen()).toBe(true);

    clock.value = 4000;
    host.tick(clock.value);
    await flush();
    expect(clientSide.isOpen()).toBe(false);
    const seat = host.seatInfos().find((entry) => entry.playerId === "p1");
    expect(seat?.connected).toBe(false);

    clock.value = 5000;
    const seqBefore = host.state!.seq;
    const acted = host.tick(clock.value);
    expect(acted).toBe(true);
    expect(host.state!.seq).toBeGreaterThan(seqBefore);
  });

  it("rejects targeting another player's pending decision", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      hostSeat: -1,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const rejects: string[] = [];
    const client = new ClientSession({
      onRejected: (message) => rejects.push(message.reason),
    });
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();

    host.state!.pending = {
      kind: "raise-funds",
      playerId: asPlayerId("p2"),
      amount: 100,
      reason: "rent",
      creditorId: null,
      shares: [],
    };
    client.sendIntent({
      type: "resolve-target",
      target: { tileIndex: 1 },
    });
    await flush();
    expect(rejects).toContain("当前不能执行该操作");
    expect(host.state!.pending?.playerId).toBe(asPlayerId("p2"));
  });

  it("reports connectivity changes through seat infos", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      hostSeat: -1,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();
    const token = client.token!;
    expect(
      host.seatInfos().find((entry) => entry.playerId === "p1")?.connected,
    ).toBe(true);

    client.close();
    await flush();
    expect(
      host.seatInfos().find((entry) => entry.playerId === "p1")?.connected,
    ).toBe(false);

    const [hostSide2, clientSide2] = memoryTransports("host", "client2");
    host.connect(hostSide2);
    const client2 = new ClientSession();
    client2.connect(clientSide2, { ...HELLO, token });
    await flush();
    expect(
      host.seatInfos().find((entry) => entry.playerId === "p1")?.connected,
    ).toBe(true);
  });

  it("ignores stale update sequences", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();
    host.submitIntent(asPlayerId("p1"), { type: "roll-dice" });
    await flush();
    expect(client.state!.seq).toBe(1);

    clientSide.send({
      type: "update",
      seq: 0,
      snapshot: client.state,
      events: [],
      players: client.players,
    });
    await flush();
    expect(client.state!.seq).toBe(1);
  });

  it("caps welcome chat history at twenty messages", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      chatLimitPerMinute: 40,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();
    const token = client.token!;
    for (let i = 0; i < 25; i += 1) {
      client.sendChat(`消息 ${i}`);
    }
    await flush();

    const [hostSide2, clientSide2] = memoryTransports("host", "client2");
    host.connect(hostSide2);
    const client2 = new ClientSession();
    client2.connect(clientSide2, { ...HELLO, token });
    await flush();
    expect(client2.chat.length).toBe(20);
    expect(client2.chat[0]!.text).toBe("消息 5");
  });

  it("rejects oversized wire strings", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const rejects: string[] = [];
    const client = new ClientSession({
      onRejected: (message) => rejects.push(message.code),
    });
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();

    clientSide.send({
      type: "intent",
      seq: 1,
      intent: { type: "buy-item", itemDefId: "x".repeat(200) },
    });
    clientSide.send({
      type: "hello",
      ...HELLO,
      tokenId: "y".repeat(200),
    });
    await flush();
    expect(rejects).toEqual(["invalid", "invalid"]);
  });

  it("rejects intents after the game finished", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      hostSeat: -1,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const rejects: string[] = [];
    const client = new ClientSession({
      onRejected: (message) => rejects.push(message.reason),
    });
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();
    host.state!.phase = "finished";

    client.sendIntent({ type: "roll-dice" });
    await flush();
    expect(rejects).toContain("对局已结束");
  });

  it("keeps a healthy client through a long lobby wait", async () => {
    const clock = { value: 0 };
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      now: () => clock.value,
      pingIntervalMs: 1000,
      livenessTimeoutMs: 2500,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();

    clock.value = 60000;
    host.begin();
    clock.value = 60001;
    host.tick(clock.value);
    await flush();
    expect(clientSide.isOpen()).toBe(true);

    clock.value = 75000;
    host.tick(clock.value);
    await flush();
    expect(clientSide.isOpen()).toBe(true);
    expect(
      host.seatInfos().find((entry) => entry.playerId === "p2")?.connected,
    ).toBe(true);
  });

  it("waits a full unanswered interval before disconnecting a wedged client", async () => {
    const clock = { value: 0 };
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      now: () => clock.value,
      disconnectGraceMs: 0,
      pingIntervalMs: 1000,
      livenessTimeoutMs: 2500,
      hostSeat: -1,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    clientSide.send({ ...HELLO, type: "hello" });
    await flush();
    host.begin();
    clock.value = 60001;
    host.tick(clock.value);
    await flush();
    expect(clientSide.isOpen()).toBe(true);

    clock.value = 75000;
    host.tick(clock.value);
    await flush();
    expect(clientSide.isOpen()).toBe(false);
  });

  it("keeps the token when rebinding a disconnected seat", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content, {
      hostSeat: -1,
    });
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();
    const token = client.token!;
    client.close();
    await flush();

    const [hostSide2, clientSide2] = memoryTransports("host", "client2");
    host.connect(hostSide2);
    const client2 = new ClientSession();
    client2.connect(clientSide2, { ...HELLO, token });
    await flush();
    expect(client2.seat).toBe(asPlayerId("p1"));
    expect(client2.token).toBe(token);

    client2.close();
    await flush();
    const [hostSide3, clientSide3] = memoryTransports("host", "client3");
    host.connect(hostSide3);
    const client3 = new ClientSession();
    client3.connect(clientSide3, { ...HELLO, token });
    await flush();
    expect(client3.seat).toBe(asPlayerId("p1"));
  });

  it("rotates the token when taking over a live connection", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    const client = new ClientSession();
    client.connect(clientSide, HELLO);
    await flush();
    host.begin();
    await flush();
    const token = client.token!;

    const [hostSide2, clientSide2] = memoryTransports("host", "client2");
    host.connect(hostSide2);
    const client2 = new ClientSession();
    client2.connect(clientSide2, { ...HELLO, token });
    await flush();
    expect(client2.seat).toBe(asPlayerId("p2"));
    expect(client2.token).not.toBe(token);
  });

  it("strikes unjoined transports that spam intents", async () => {
    const host = new HostSession(makeSetup([false, false, true, true]), content);
    const [hostSide, clientSide] = memoryTransports("host", "client");
    host.connect(hostSide);
    for (let i = 0; i < 6; i += 1) {
      clientSide.send({ type: "intent", seq: i + 1, intent: { type: "roll-dice" } });
    }
    await flush();
    expect(clientSide.isOpen()).toBe(false);
  });

  it("plays a full bot-only game to completion through ticks", () => {
    const host = new HostSession(makeSetup([true, true, true, true]), content);
    host.begin();
    const steps = host.autoPlayUntil((state) => state.phase === "finished", 4000);
    expect(host.state!.phase).toBe("finished");
    expect(host.state!.standings.length).toBe(4);
    expect(steps).toBeLessThan(4000);
  });
});
