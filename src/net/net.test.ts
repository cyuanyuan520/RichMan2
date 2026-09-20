import { describe, expect, it } from "vitest";
import { HostSession } from "./host";
import { ClientSession } from "./client";
import { flush, memoryTransports } from "./transport";
import {
  PROTOCOL_VERSION,
  intentSchema,
  sanitizeState,
  type ClientIntent,
} from "./protocol";
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

  it("plays a full bot-only game to completion through ticks", () => {
    const host = new HostSession(makeSetup([true, true, true, true]), content);
    host.begin();
    const steps = host.autoPlayUntil((state) => state.phase === "finished", 4000);
    expect(host.state!.phase).toBe("finished");
    expect(host.state!.standings.length).toBe(4);
    expect(steps).toBeLessThan(4000);
  });
});
