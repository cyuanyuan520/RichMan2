import type {
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
  token: string;
  claimed: boolean;
  connected: boolean;
  transport: Transport | null;
  disconnectedAt: number | null;
  lastIntentSeq: number;
  chatTimes: number[];
}

export interface HostOptions {
  now?: () => number;
  disconnectGraceMs?: number;
  chatLimitPerMinute?: number;
  hostSeat?: number;
}

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

export class HostSession {
  readonly content: GameContent;
  readonly setup: GameSetup;
  readonly options: Required<HostOptions>;
  state: GameState | null = null;
  started = false;
  private seats: HostSeat[] = [];
  private pendingEvents: GameEvent[] = [];
  private chatHistory: ChatBroadcast[] = [];
  private tokenCounter = 0;

  constructor(setup: GameSetup, content: GameContent, options: HostOptions = {}) {
    this.setup = setup;
    this.content = content;
    this.options = {
      now: options.now ?? (() => Date.now()),
      disconnectGraceMs: options.disconnectGraceMs ?? 15000,
      chatLimitPerMinute: options.chatLimitPerMinute ?? 8,
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
        token: isHostSeat ? this.newToken(index + 1) : "",
        claimed: isHostSeat,
        connected: isHostSeat,
        transport: null,
        disconnectedAt: null,
        lastIntentSeq: -1,
        chatTimes: [],
      };
    });
  }

  private newToken(seatNumber: number): string {
    this.tokenCounter += 1;
    const now = Math.floor(this.options.now()).toString(36);
    return `t${seatNumber.toString(36)}-${this.tokenCounter.toString(36)}-${now}`;
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
      botDifficulty: (
        this.state?.players.find((player) => player.id === seat.playerId)
          ?.botDifficulty ?? "normal"
      ) as SeatInfo["botDifficulty"],
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
      this.sendTo(transport, {
        type: "rejected",
        code: "invalid",
        reason: "无法识别的消息",
      });
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
      case "ping":
        this.sendTo(transport, { type: "pong", t: message.t });
        break;
    }
  }

  private seatForTransport(transport: Transport): HostSeat | undefined {
    return this.seats.find((seat) => seat.transport === transport);
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
      contentHash: string;
      token?: string;
      name: string;
      characterId?: string;
      tokenId?: string;
    },
    transport: Transport,
  ): void {
    if (message.protocol !== PROTOCOL_VERSION) {
      this.reject(transport, "version", "客户端版本不一致，请刷新页面");
      return;
    }
    if (message.contentHash !== this.content.contentHash) {
      this.reject(transport, "content", "游戏内容不一致，请刷新页面");
      return;
    }
    let seat =
      message.token !== undefined
        ? this.seats.find(
            (entry) => entry.claimed && entry.token === message.token,
          )
        : undefined;
    const reconnecting = seat !== undefined;
    if (!seat) {
      if (this.started) {
        this.reject(transport, "started", "对局已开始，无法加入");
        return;
      }
      seat = this.seats.find((entry) => !entry.claimed && !entry.isBot);
    }
    if (!seat) {
      this.reject(transport, "full", "房间已满");
      return;
    }
    seat.transport?.close();
    seat.transport = transport;
    seat.claimed = true;
    seat.connected = true;
    seat.disconnectedAt = null;
    seat.name = message.name;
    if (message.characterId && this.content.characters[message.characterId]) {
      seat.characterId = message.characterId;
    }
    if (message.tokenId) {
      seat.tokenId = message.tokenId;
    }
    if (!reconnecting) {
      seat.token = this.newToken(this.seats.indexOf(seat) + 1);
    }
    const welcome: WelcomeMessage = {
      type: "welcome",
      protocol: PROTOCOL_VERSION,
      contentHash: this.content.contentHash,
      seat: seat.playerId,
      token: seat.token,
      lobby: !this.started,
      players: this.seatInfos(),
      chat: this.chatHistory.slice(-20),
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
      this.reject(transport, "invalid", "尚未加入房间");
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
      this.pendingEvents.push(...result.events);
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
    const now = this.options.now();
    seat.chatTimes = seat.chatTimes.filter((time) => now - time < 60000);
    if (seat.chatTimes.length >= this.options.chatLimitPerMinute) {
      return;
    }
    seat.chatTimes.push(now);
    const broadcast: ChatBroadcast = {
      type: "chat",
      fromId: seat.playerId,
      fromName: seat.name,
      text: text.slice(0, MAX_CHAT_LENGTH),
      at: now,
    };
    this.chatHistory.push(broadcast);
    if (this.chatHistory.length > 50) {
      this.chatHistory.shift();
    }
    this.broadcast(broadcast);
  }

  private handleEmote(emoteId: EmoteId, transport: Transport): void {
    const seat = this.seatForTransport(transport);
    if (!seat) {
      return;
    }
    const broadcast: EmoteBroadcast = {
      type: "emote",
      fromId: seat.playerId,
      fromName: seat.name,
      emoteId,
      at: this.options.now(),
    };
    this.broadcast(broadcast);
  }

  private handleClose(transport: Transport): void {
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
      };
    });
    const started = bootstrapGame({ ...this.setup, players }, this.content);
    this.state = started.state;
    this.started = true;
    this.pendingEvents.push(...started.events);
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

  tick(now: number = this.options.now()): boolean {
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
      this.pendingEvents.push(...result.events);
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
    const message = this.updateMessage();
    for (const seat of this.seats) {
      if (seat.transport && seat.connected) {
        this.sendTo(seat.transport, message);
      }
    }
  }

  private broadcastSeats(): void {
    const players = this.seatInfos();
    for (const seat of this.seats) {
      if (seat.transport && seat.connected) {
        this.sendTo(seat.transport, { type: "seat-update", players });
      }
    }
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
