import type { GameEvent, GameState, PlayerId } from "@/game/core/types";
import {
  MAX_CHAT_LENGTH,
  type ChatBroadcast,
  type ClientIntent,
  type EmoteBroadcast,
  type EmoteId,
  type HostMessage,
  type RejectedMessage,
  type SeatInfo,
  type UpdateMessage,
  type WelcomeMessage,
} from "./protocol";
import type { Transport } from "./transport";

export interface ClientHandlers {
  onWelcome?(welcome: WelcomeMessage): void;
  onUpdate?(update: UpdateMessage): void;
  onRejected?(rejected: RejectedMessage): void;
  onChat?(chat: ChatBroadcast): void;
  onEmote?(emote: EmoteBroadcast): void;
  onSeatUpdate?(players: SeatInfo[]): void;
  onClose?(): void;
}

export interface HelloPayload {
  name: string;
  contentHash?: string;
  protocol: number;
  engine?: number;
  token?: string;
  characterId?: string;
  tokenId?: string;
  botDifficulty?: "easy" | "normal" | "hard";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class ClientSession {
  state: GameState | null = null;
  players: SeatInfo[] = [];
  seat: PlayerId | null = null;
  token: string | null = null;
  chat: ChatBroadcast[] = [];
  historyEvents: GameEvent[] = [];
  lastSeq = -1;
  private events: GameEvent[] = [];
  private intentSeq = 0;
  private transport: Transport | null = null;
  private handlers: ClientHandlers;

  constructor(handlers: ClientHandlers = {}) {
    this.handlers = handlers;
  }

  get connected(): boolean {
    return this.transport !== null && this.transport.isOpen();
  }

  connect(transport: Transport, hello: HelloPayload): void {
    const previous = this.transport;
    if (previous) {
      previous.onMessage(() => {});
      previous.onClose(() => {});
      previous.close();
    }
    this.transport = transport;
    transport.onClose(() => {
      if (this.transport === transport) {
        this.transport = null;
      }
      this.handlers.onClose?.();
    });
    transport.onMessage((raw) => this.handleMessage(raw));
    transport.send({ type: "hello", ...hello });
  }

  private handleMessage(raw: unknown): void {
    if (!isRecord(raw) || typeof raw.type !== "string") {
      return;
    }
    const message = raw as unknown as HostMessage;
    try {
      this.dispatch(message);
    } catch {
      // A broken handler must not wedge the session: drop the connection so the
      // UI can surface an error and reconnect with a clean state.
      this.close();
    }
  }

  private dispatch(message: HostMessage): void {
    switch (message.type) {
      case "welcome": {
        this.seat = message.seat;
        this.token = message.token;
        this.players = message.players;
        this.chat = message.chat ?? [];
        this.historyEvents = message.recentEvents ?? [];
        this.lastSeq = -1;
        this.state = null;
        this.events = [];
        this.intentSeq = message.resumeSeq;
        this.handlers.onWelcome?.(message);
        break;
      }
      case "update": {
        if (message.seq <= this.lastSeq) {
          return;
        }
        this.lastSeq = message.seq;
        this.state = message.snapshot;
        this.players = message.players;
        this.events.push(...message.events);
        this.handlers.onUpdate?.(message);
        break;
      }
      case "rejected": {
        this.handlers.onRejected?.(message);
        break;
      }
      case "chat": {
        this.chat.push(message);
        if (this.chat.length > 50) {
          this.chat.shift();
        }
        this.handlers.onChat?.(message);
        break;
      }
      case "emote": {
        this.handlers.onEmote?.(message);
        break;
      }
      case "seat-update": {
        this.players = message.players;
        this.handlers.onSeatUpdate?.(message.players);
        break;
      }
      case "pong":
        break;
      case "ping": {
        if (this.transport?.isOpen()) {
          this.transport.send({ type: "pong", t: message.t });
        }
        break;
      }
    }
  }

  consumeEvents(): GameEvent[] {
    const result = this.events;
    this.events = [];
    return result;
  }

  sendIntent(intent: ClientIntent): boolean {
    if (!this.connected || this.seat === null) {
      return false;
    }
    this.intentSeq += 1;
    this.transport?.send({ type: "intent", seq: this.intentSeq, intent });
    return true;
  }

  sendChat(text: string): boolean {
    const trimmed = text.trim().slice(0, MAX_CHAT_LENGTH);
    if (!this.connected || trimmed.length === 0) {
      return false;
    }
    this.transport?.send({ type: "chat", text: trimmed });
    return true;
  }

  sendEmote(emoteId: EmoteId): boolean {
    if (!this.connected) {
      return false;
    }
    this.transport?.send({ type: "emote", emoteId });
    return true;
  }

  ping(): boolean {
    if (!this.connected) {
      return false;
    }
    this.transport?.send({ type: "ping", t: Date.now() });
    return true;
  }

  close(): void {
    this.transport?.close();
    this.transport = null;
  }
}
