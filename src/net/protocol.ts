import { z } from "zod";
import type {
  BotDifficulty,
  EffectTarget,
  GameAction,
  GameState,
  ItemInstanceId,
  PlayerId,
} from "@/game/core/types";
import { createRng } from "@/game/core/rng";

export const PROTOCOL_VERSION = 1;
export const MAX_CHAT_LENGTH = 120;
export const MAX_NAME_LENGTH = 12;
export const MAX_INTENT_LOG = 64;

export const EMOTE_IDS = [
  "clap",
  "cry",
  "laugh",
  "rage",
  "cool",
  "shock",
  "sleep",
  "think",
] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

const emoteSchema = z.enum(EMOTE_IDS);

const targetSchema = z.object({
  playerId: z.string().optional(),
  tileIndex: z.number().int().optional(),
});

export const intentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("roll-dice") }),
  z.object({ type: z.literal("buy-property") }),
  z.object({ type: z.literal("decline-buy") }),
  z.object({ type: z.literal("upgrade-property"), tileIndex: z.number().int() }),
  z.object({ type: z.literal("sell-building"), tileIndex: z.number().int() }),
  z.object({ type: z.literal("mortgage-property"), tileIndex: z.number().int() }),
  z.object({ type: z.literal("unmortgage-property"), tileIndex: z.number().int() }),
  z.object({ type: z.literal("buy-item"), itemDefId: z.string() }),
  z.object({ type: z.literal("use-item"), itemId: z.string() }),
  z.object({ type: z.literal("use-skill"), skillId: z.string() }),
  z.object({ type: z.literal("buy-lottery") }),
  z.object({ type: z.literal("pay-jail-fine") }),
  z.object({ type: z.literal("resolve-target"), target: targetSchema }),
  z.object({ type: z.literal("cancel-target") }),
  z.object({ type: z.literal("choose-dice"), value: z.number().int() }),
  z.object({ type: z.literal("raise-funds-done") }),
  z.object({ type: z.literal("declare-bankrupt") }),
  z.object({ type: z.literal("give-up") }),
  z.object({ type: z.literal("end-turn") }),
]);

export type ClientIntent = z.infer<typeof intentSchema>;

export function toGameAction(intent: ClientIntent, playerId: PlayerId): GameAction {
  switch (intent.type) {
    case "roll-dice":
      return { type: "roll-dice", playerId };
    case "buy-property":
      return { type: "buy-property", playerId };
    case "decline-buy":
      return { type: "decline-buy", playerId };
    case "upgrade-property":
      return { type: "upgrade-property", playerId, tileIndex: intent.tileIndex };
    case "sell-building":
      return { type: "sell-building", playerId, tileIndex: intent.tileIndex };
    case "mortgage-property":
      return { type: "mortgage-property", playerId, tileIndex: intent.tileIndex };
    case "unmortgage-property":
      return {
        type: "unmortgage-property",
        playerId,
        tileIndex: intent.tileIndex,
      };
    case "buy-item":
      return { type: "buy-item", playerId, itemDefId: intent.itemDefId };
    case "use-item":
      return { type: "use-item", playerId, itemId: intent.itemId as ItemInstanceId };
    case "use-skill":
      return { type: "use-skill", playerId, skillId: intent.skillId };
    case "buy-lottery":
      return { type: "buy-lottery", playerId };
    case "pay-jail-fine":
      return { type: "pay-jail-fine", playerId };
    case "resolve-target":
      return {
        type: "resolve-target",
        playerId,
        target: compactTarget(intent.target),
      };
    case "cancel-target":
      return { type: "cancel-target", playerId };
    case "choose-dice":
      return { type: "choose-dice", playerId, value: intent.value };
    case "raise-funds-done":
      return { type: "raise-funds-done", playerId };
    case "declare-bankrupt":
      return { type: "declare-bankrupt", playerId };
    case "give-up":
      return { type: "give-up", playerId };
    case "end-turn":
      return { type: "end-turn", playerId };
  }
}

function compactTarget(target: {
  playerId?: string;
  tileIndex?: number;
}): EffectTarget {
  const result: EffectTarget = {};
  if (target.playerId !== undefined) {
    result.playerId = target.playerId as PlayerId;
  }
  if (target.tileIndex !== undefined) {
    result.tileIndex = target.tileIndex;
  }
  return result;
}

export function actionKey(action: GameAction): string {
  switch (action.type) {
    case "upgrade-property":
    case "sell-building":
    case "mortgage-property":
    case "unmortgage-property":
      return `${action.type}:${action.tileIndex}`;
    case "buy-item":
      return `${action.type}:${action.itemDefId}`;
    case "use-item":
      return `${action.type}:${action.itemId}`;
    case "use-skill":
      return `${action.type}:${action.skillId}`;
    case "resolve-target":
      return `${action.type}:${action.target.playerId ?? ""}:${action.target.tileIndex ?? ""}`;
    case "choose-dice":
      return `${action.type}:${action.value}`;
    default:
      return action.type;
  }
}

export const helloMessageSchema = z.object({
  type: z.literal("hello"),
  protocol: z.number().int(),
  contentHash: z.string(),
  token: z.string().max(64).optional(),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  characterId: z.string().optional(),
  tokenId: z.string().optional(),
  botDifficulty: z.enum(["easy", "normal", "hard"]).optional(),
});

export const intentMessageSchema = z.object({
  type: z.literal("intent"),
  seq: z.number().int().nonnegative(),
  intent: intentSchema,
});

export const chatMessageSchema = z.object({
  type: z.literal("chat"),
  text: z.string().min(1).max(MAX_CHAT_LENGTH),
});

export const emoteMessageSchema = z.object({
  type: z.literal("emote"),
  emoteId: emoteSchema,
});

export const pingMessageSchema = z.object({
  type: z.literal("ping"),
  t: z.number(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  helloMessageSchema,
  intentMessageSchema,
  chatMessageSchema,
  emoteMessageSchema,
  pingMessageSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export interface SeatInfo {
  playerId: PlayerId;
  name: string;
  characterId: string;
  tokenId: string;
  isBot: boolean;
  claimed: boolean;
  connected: boolean;
  botDifficulty: BotDifficulty;
}

export interface WelcomeMessage {
  type: "welcome";
  protocol: number;
  contentHash: string;
  seat: PlayerId;
  token: string;
  lobby: boolean;
  players: SeatInfo[];
  chat: ChatBroadcast[];
}

export interface UpdateMessage {
  type: "update";
  seq: number;
  snapshot: GameState;
  events: import("@/game/core/types").GameEvent[];
  players: SeatInfo[];
}

export interface RejectedMessage {
  type: "rejected";
  code: "full" | "version" | "content" | "closed" | "started" | "invalid";
  reason: string;
}

export interface ChatBroadcast {
  type: "chat";
  fromId: PlayerId | null;
  fromName: string;
  text: string;
  at: number;
}

export interface EmoteBroadcast {
  type: "emote";
  fromId: PlayerId | null;
  fromName: string;
  emoteId: EmoteId;
  at: number;
}

export interface PongMessage {
  type: "pong";
  t: number;
}

export interface SeatUpdateMessage {
  type: "seat-update";
  players: SeatInfo[];
}

export type HostMessage =
  | WelcomeMessage
  | UpdateMessage
  | RejectedMessage
  | ChatBroadcast
  | EmoteBroadcast
  | PongMessage
  | SeatUpdateMessage;

export const HIDDEN_STATE_KEYS = [
  "rng",
  "seed",
  "chanceDeck",
  "fateDeck",
  "chanceDiscard",
  "fateDiscard",
] as const;

export function sanitizeState(state: GameState): GameState {
  const clone = structuredClone(state);
  clone.rng = createRng(0);
  clone.seed = 0;
  clone.chanceDeck = [];
  clone.fateDeck = [];
  clone.chanceDiscard = [];
  clone.fateDiscard = [];
  return clone;
}

export function seatInfosOf(
  state: GameState,
  seats: Array<{
    playerId: PlayerId;
    claimed: boolean;
    connected: boolean;
  }>,
): SeatInfo[] {
  const runtime = seats.map((seat) => ({
    playerId: seat.playerId,
    claimed: seat.claimed,
    connected: seat.connected,
  }));
  return state.players.map((player) => {
    const seat = runtime.find((entry) => entry.playerId === player.id);
    return {
      playerId: player.id,
      name: player.name,
      characterId: player.characterId,
      tokenId: player.tokenId,
      isBot: player.isBot,
      claimed: seat?.claimed ?? player.isBot,
      connected: seat?.connected ?? player.isBot,
      botDifficulty: player.botDifficulty,
    };
  });
}
