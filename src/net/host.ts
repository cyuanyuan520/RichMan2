import type {
  BotDifficulty,
  GameContent,
  GameEvent,
  GameSetup,
  GameState,
  PlayerId,
} from "@/game/core/types";
import { EngineError } from "@/game/core/errors";
import { asPlayerId } from "@/game/core/ids";
import { bootstrapGame } from "@/game/core/state";
import { reduce } from "@/game/core/reducer";
import { getLegalActions } from "@/game/selectors/legal";
import { chooseAiAction } from "@/game/ai";
import {
  MAX_CHAT_LENGTH,
  MAX_FAILED_HELLOS,
  PROTOCOL_VERSION,
  actionKey,
  clientMessageSchema,
  sanitizeState,
  seatInfosOf,
  toGameAction,
  type ChatBroadcast,
  type ClientIntent,
  type EmoteBroadcast,
  type EmoteId,
  type HostMessage,
  type RejectedMessage,
  type SeatInfo,
  type WelcomeMessage,
} from "./protocol";
import type { Transport } from "./transport";

interface HostSeat {
  playerId: PlayerId;
  name: string;
  characterId: string;
  tokenId: string;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  token: string;
  claimed: boolean;
  connected: boolean;
  transport: Transport | null;
  disconnectedAt: number | null;
  lastIntentSeq: number;
  chatTimes: number[];
  emoteTimes: number[];
  lastPingAt: number;
  awaitingPong: boolean;
  unansweredSince: number;
  lastPingReplyAt: number;
}

export interface HostOptions {
  now?: () => number;
  disconnectGraceMs?: number;
  chatLimitPerMinute?: number;
  emoteLimitPerMinute?: number;
  pingIntervalMs?: number;
  livenessTimeoutMs?: number;
  hostSeat?: number;
  onUpdate?: (state: GameState, events: GameEvent[]) => void;
  onSeatsChange?: () => void;
}

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

export class HostSession {
  readonly content: GameContent;
  readonly setup: GameSetup;
  readonly options: Required<Omit<HostOptions, "onUpdate" | "onSeatsChange">>;
  private readonly onUpdateCallback: HostOptions["onUpdate"] | null;
  private readonly onSeatsCallback: HostOptions["onSeatsChange"] | null;
  state: GameState | null = null;
  started = false;
  private seats: HostSeat[] = [];
  private pendingEvents: GameEvent[] = [];
  private recentEvents: GameEvent[] = [];
  private chatHistory: ChatBroadcast[] = [];
  private strikes = new Map<Transport, number>();

  constructor(setup: GameSetup, content: GameContent, options: HostOptions = {}) {
    this.setup = setup;
    this.content = content;
    this.onUpdateCallback = options.onUpdate ?? null;
    this.onSeatsCallback = options.onSeatsChange ?? null;
    this.options = {
      now: options.now ?? (() => Date.now()),
      disconnectGraceMs: options.disconnectGraceMs ?? 15000,
      chatLimitPerMinute: options.chatLimitPerMinute ?? 8,
      emoteLimitPerMinute: options.emoteLimitPerMinute ?? 12,
      pingIntervalMs: options.pingIntervalMs ?? 5000,
      livenessTimeoutMs: options.livenessTimeoutMs ?? 12000,
      hostSeat: options.hostSeat ?? 0,
    };
    this.seats = setup.players.map((player, index) => {
      const isHostSeat = index === this.options.hostSeat && !player.isBot;
      return {
        playerId: asPlayerId(`p${index + 1}`),
        name: player.name,
        characterId: player.characterId,
        tokenId: player.tokenId,
        isBot: player.isBot,
        botDifficulty: player.botDifficulty ?? "normal",
        token: isHostSeat ? this.newToken() : "",
        claimed: isHostSeat,
        connected: isHostSeat,
        transport: null,
        disconnectedAt: null,
        lastIntentSeq: -1,
        chatTimes: [],
        emoteTimes: [],
        lastPingAt: 0,
        awaitingPong: false,
        unansweredSince: 0,
        lastPingReplyAt: 0,
      };
    });
  }

  private newToken(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }

  private stashEvents(events: GameEvent[]): void {
    this.pendingEvents.push(...events);
    this.recentEvents.push(...events);
    if (this.recentEvents.length > 60) {
      this.recentEvents.splice(0, this.recentEvents.length - 60);
    }
  }

  get startedGame(): boolean {
    return this.started && this.state !== null;
  }

  seatInfos(): SeatInfo[] {
    const template = this.seats.map((seat) => ({
      playerId: seat.playerId,
      name: seat.name,
      characterId: seat.characterId,
      tokenId: seat.tokenId,
      isBot: seat.isBot,
      claimed: seat.claimed,
      connected: seat.connected,
      botDifficulty: seat.botDifficulty,
    }));
    if (!this.state) {
      return template;
    }
    const live = seatInfosOf(this.state, this.seats);
    return live.map((info) => {
      const local = template.find((entry) => entry.playerId === info.playerId);
      return {
        ...info,
        name: local?.name ?? info.name,
        characterId: local?.characterId ?? info.characterId,
        tokenId: local?.tokenId ?? info.tokenId,
        isBot: local?.isBot ?? info.isBot,
        claimed: local?.claimed ?? info.claimed,
        connected: local?.connected ?? info.connected,
      };
    });
  }

  connect(transport: Transport): void {
    transport.onMessage((raw) => this.handleRaw(raw, transport));
    transport.onClose(() => this.handleClose(transport));
  }

  private handleRaw(raw: unknown, transport: Transport): void {
    const parsed = clientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.strike(transport, "invalid", "无法识别的消息");
      return;
    }
    const message = parsed.data;
    switch (message.type) {
      case "hello":
        this.handleHello(message, transport);
        break;
      case "intent":
        this.handleIntentMessage(message.seq, message.intent, transport);
        break;
      case "chat":
        this.handleChat(message.text, transport);
        break;
      case "emote":
        this.handleEmote(message.emoteId, transport);
        break;
      case "ping": {
        const seat = this.seatForTransport(transport);
        const now = this.options.now();
        if (seat && now - seat.lastPingReplyAt >= 500) {
          seat.lastPingReplyAt = now;
          this.sendTo(transport, { type: "pong", t: message.t });
        }
        break;
      }
      case "pong": {
        const seat = this.seatForTransport(transport);
        if (seat) {
          seat.awaitingPong = false;
          seat.unansweredSince = 0;
        }
        break;
      }
    }
  }

  private seatForTransport(transport: Transport): HostSeat | undefined {
    return this.seats.find((seat) => seat.transport === transport);
  }

  private strike(
    transport: Transport,
    code: RejectedMessage["code"],
    reason: string,
  ): void {
    const count = (this.strikes.get(transport) ?? 0) + 1;
    if (count >= MAX_FAILED_HELLOS) {
      this.strikes.delete(transport);
      transport.close();
      return;
    }
    this.strikes.set(transport, count);
    this.sendTo(transport, { type: "rejected", code, reason });
  }

  private reject(
    transport: Transport,
    code: RejectedMessage["code"],
    reason: string,
  ): void {
    this.sendTo(transport, { type: "rejected", code, reason });
  }

  private handleHello(
    message: {
      protocol: number;
      contentHash?: string;
      token?: string;
      name: string;
      characterId?: string;
      tokenId?: string;
      botDifficulty?: BotDifficulty;
    },
    transport: Transport,
  ): void {
    if (this.seatForTransport(transport)) {
      this.strike(transport, "invalid", "该连接已加入房间");
      return;
    }
    if (message.protocol !== PROTOCOL_VERSION) {
      this.strike(transport, "version", "客户端版本不一致，请刷新页面");
      return;
    }
    if (
      message.contentHash !== undefined &&
      message.contentHash !== this.content.contentHash
    ) {
      this.strike(transport, "content", "游戏内容不一致，请刷新页面");
      return;
    }
    let seat =
      message.token !== undefined
        ? this.seats.find(
            (entry) => entry.token !== "" && entry.token === message.token,
          )
        : undefined;
    const matchedByToken = seat !== undefined;
    const wasClaimed = seat?.claimed ?? false;
    if (!seat) {
      if (this.started) {
        this.strike(transport, "started", "对局已开始，无法加入");
        return;
      }
      seat = this.seats.find((entry) => !entry.claimed && !entry.isBot);
    }
    if (!seat) {
      this.strike(transport, "full", "房间已满");
      return;
    }
    const hadLiveIncumbent =
      seat.transport !== null && seat.transport !== transport;
    if (hadLiveIncumbent) {
      seat.transport?.close();
    }
    const now = this.options.now();
    seat.transport = transport;
    seat.claimed = true;
    seat.connected = true;
    seat.disconnectedAt = null;
    seat.lastPingAt = now;
    seat.awaitingPong = false;
    seat.unansweredSince = 0;
    seat.name = message.name;
    if (message.characterId && this.content.characters[message.characterId]) {
      seat.characterId = message.characterId;
    }
    if (message.tokenId) {
      seat.tokenId = message.tokenId;
    }
    if (message.botDifficulty) {
      seat.botDifficulty = message.botDifficulty;
    }
    if (!matchedByToken || (wasClaimed && hadLiveIncumbent)) {
      seat.token = this.newToken();
    }
    this.strikes.delete(transport);
    const welcome: WelcomeMessage = {
      type: "welcome",
      protocol: PROTOCOL_VERSION,
      contentHash: this.content.contentHash,
      mapId: this.content.map.id,
      seat: seat.playerId,
      token: seat.token,
      resumeSeq: seat.lastIntentSeq,
      lobby: !this.started,
      players: this.seatInfos(),
      chat: this.chatHistory.slice(-20),
      recentEvents: [...this.recentEvents],
    };
    this.sendTo(transport, welcome);
    if (this.startedGame) {
      this.sendTo(transport, this.updateMessage());
    } else {
      this.broadcastSeats();
    }
  }

  private handleIntentMessage(
    seq: number,
    intent: ClientIntent,
    transport: Transport,
  ): void {
    const seat = this.seatForTransport(transport);
    if (!seat) {
      this.strike(transport, "invalid", "尚未加入房间");
      return;
    }
    if (seq <= seat.lastIntentSeq) {
      return;
    }
    seat.lastIntentSeq = seq;
    const result = this.submitIntent(seat.playerId, intent);
    if (!result.ok) {
      this.reject(transport, "invalid", result.error ?? "非法操作");
    }
  }

  submitIntent(playerId: PlayerId, intent: ClientIntent): SubmitResult {
    if (!this.startedGame || !this.state) {
      return { ok: false, error: "对局未开始" };
    }
    const seat = this.seats.find((entry) => entry.playerId === playerId);
    if (!seat || seat.isBot) {
      return { ok: false, error: "该座位由电脑控制" };
    }
    if (this.state.phase === "finished") {
      return { ok: false, error: "对局已结束" };
    }
    const action = toGameAction(intent, playerId);
    const legal = getLegalActions(this.state, this.content, playerId);
    const wanted = actionKey(action);
    if (!legal.some((entry) => actionKey(entry) === wanted)) {
      return { ok: false, error: "当前不能执行该操作" };
    }
    try {
      const result = reduce(this.state, action, this.content);
      this.state = result.state;
      this.stashEvents(result.events);
    } catch (error) {
      if (error instanceof EngineError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
    this.broadcastUpdate();
    if (this.state.phase === "finished") {
      this.broadcastSeats();
    }
    return { ok: true };
  }

  private handleChat(text: string, transport: Transport): void {
    const seat = this.seatForTransport(transport);
    if (!seat) {
      return;
    }
    this.sendChatFrom(seat.playerId, text);
  }

  sendChatFrom(playerId: PlayerId, text: string): boolean {
    const seat = this.seats.find((entry) => entry.playerId === playerId);
    if (!seat || seat.isBot) {
      return false;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return false;
    }
    const now = this.options.now();
    seat.chatTimes = seat.chatTimes.filter((time) => now - time < 60000);
    if (seat.chatTimes.length >= this.options.chatLimitPerMinute) {
      return false;
    }
    seat.chatTimes.push(now);
    const broadcast: ChatBroadcast = {
      type: "chat",
      fromId: seat.playerId,
      fromName: seat.name,
      text: trimmed.slice(0, MAX_CHAT_LENGTH),
      at: now,
    };
    this.chatHistory.push(broadcast);
    if (this.chatHistory.length > 50) {
      this.chatHistory.shift();
    }
    this.broadcast(broadcast);
    return true;
  }

  private handleEmote(emoteId: EmoteId, transport: Transport): void {
    const seat = this.seatForTransport(transport);
    if (!seat) {
      return;
    }
    this.sendEmoteFrom(seat.playerId, emoteId);
  }

  sendEmoteFrom(playerId: PlayerId, emoteId: EmoteId): boolean {
    const seat = this.seats.find((entry) => entry.playerId === playerId);
    if (!seat || seat.isBot) {
      return false;
    }
    const now = this.options.now();
    seat.emoteTimes = seat.emoteTimes.filter((time) => now - time < 60000);
    if (seat.emoteTimes.length >= this.options.emoteLimitPerMinute) {
      return false;
    }
    seat.emoteTimes.push(now);
    const broadcast: EmoteBroadcast = {
      type: "emote",
      fromId: seat.playerId,
      fromName: seat.name,
      emoteId,
      at: now,
    };
    this.broadcast(broadcast);
    return true;
  }

  private handleClose(transport: Transport): void {
    this.strikes.delete(transport);
    const seat = this.seatForTransport(transport);
    if (!seat) {
      return;
    }
    seat.transport = null;
    seat.connected = false;
    if (!this.started) {
      seat.claimed = false;
      seat.disconnectedAt = null;
      this.broadcastSeats();
      return;
    }
    seat.disconnectedAt = this.options.now();
    this.broadcastSeats();
  }

  begin(): void {
    if (this.started) {
      throw new EngineError("INVALID_ACTION", "Game already started");
    }
    const players = this.setup.players.map((template, index) => {
      const seat = this.seats[index];
      if (!seat) {
        return template;
      }
      if (!seat.claimed) {
        seat.isBot = true;
        seat.connected = true;
      }
      return {
        ...template,
        name: seat.name,
        characterId: seat.characterId as typeof template.characterId,
        tokenId: seat.tokenId,
        isBot: seat.isBot,
        botDifficulty: seat.botDifficulty,
      };
    });
    const started = bootstrapGame({ ...this.setup, players }, this.content);
    this.state = started.state;
    this.started = true;
    this.stashEvents(started.events);
    this.broadcastUpdate();
  }

  private isActorControllableByBot(actorId: PlayerId, now: number): boolean {
    const seat = this.seats.find((entry) => entry.playerId === actorId);
    if (!seat) {
      return false;
    }
    if (seat.isBot) {
      return true;
    }
    return (
      seat.claimed &&
      !seat.connected &&
      seat.disconnectedAt !== null &&
      now - seat.disconnectedAt >= this.options.disconnectGraceMs
    );
  }

  private maintainLiveness(now: number): void {
    for (const seat of this.seats) {
      if (seat.isBot || !seat.claimed || !seat.transport || !seat.connected) {
        continue;
      }
      if (now - seat.lastPingAt >= this.options.pingIntervalMs) {
        seat.lastPingAt = now;
        if (!seat.awaitingPong) {
          seat.awaitingPong = true;
          seat.unansweredSince = now;
        }
        this.sendTo(seat.transport, { type: "ping", t: now });
      }
      if (
        seat.awaitingPong &&
        now - seat.unansweredSince > this.options.livenessTimeoutMs
      ) {
        const transport = seat.transport;
        seat.transport = null;
        seat.connected = false;
        seat.disconnectedAt = now;
        seat.awaitingPong = false;
        seat.unansweredSince = 0;
        this.broadcastSeats();
        transport.close();
      }
    }
  }

  tick(now: number = this.options.now()): boolean {
    this.maintainLiveness(now);
    if (!this.startedGame || !this.state || this.state.phase === "finished") {
      return false;
    }
    const pending = this.state.pending;
    const actorId = pending
      ? pending.playerId
      : (this.state.players[this.state.turnSeat]?.id as PlayerId | undefined);
    if (!actorId || !this.isActorControllableByBot(actorId, now)) {
      return false;
    }
    const action = chooseAiAction(this.state, this.content, actorId);
    if (!action) {
      return false;
    }
    try {
      const result = reduce(this.state, action, this.content);
      this.state = result.state;
      this.stashEvents(result.events);
    } catch {
      return false;
    }
    this.broadcastUpdate();
    return true;
  }

  autoPlayUntil(
    shouldStop: (state: GameState) => boolean,
    maxSteps = 2000,
  ): number {
    let steps = 0;
    while (this.state && !shouldStop(this.state) && steps < maxSteps) {
      if (!this.tick()) {
        break;
      }
      steps += 1;
    }
    return steps;
  }

  private updateMessage(): HostMessage {
    if (!this.state) {
      throw new EngineError("INVALID_ACTION", "No game state");
    }
    const message = {
      type: "update" as const,
      seq: this.state.seq,
      snapshot: sanitizeState(this.state),
      events: [...this.pendingEvents],
      players: this.seatInfos(),
    };
    this.pendingEvents = [];
    return message;
  }

  private broadcastUpdate(): void {
    if (!this.state) {
      return;
    }
    const events = [...this.pendingEvents];
    const message = this.updateMessage();
    for (const seat of this.seats) {
      if (seat.transport && seat.connected) {
        this.sendTo(seat.transport, message);
      }
    }
    this.onUpdateCallback?.(this.state, events);
  }

  private broadcastSeats(): void {
    const players = this.seatInfos();
    for (const seat of this.seats) {
      if (seat.transport && seat.connected) {
        this.sendTo(seat.transport, { type: "seat-update", players });
      }
    }
    this.onSeatsCallback?.();
  }

  private broadcast(message: HostMessage): void {
    for (const seat of this.seats) {
      if (seat.transport && seat.connected) {
        this.sendTo(seat.transport, message);
      }
    }
  }

  private sendTo(transport: Transport, message: HostMessage): void {
    if (!transport.isOpen()) {
      return;
    }
    try {
      transport.send(message);
    } catch {
      return;
    }
  }
}
