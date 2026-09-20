import type {
  EconomyConfig,
  GameAction,
  GameState,
} from "@/game/core/types";
import { asPlayerId } from "@/game/core/ids";import { bootstrapGame } from "@/game/core/state";
import { reduce } from "@/game/core/reducer";
import { buildGameContent } from "@/data/content";
import { defaultEconomy } from "@/data/content/economy";

export const content = buildGameContent("ink");
export const P1 = asPlayerId("p1");
export const P2 = asPlayerId("p2");
export const P3 = asPlayerId("p3");
export const P4 = asPlayerId("p4");

export function makeGame(options?: {
  playerCount?: number;
  economy?: Partial<EconomyConfig>;
  seed?: number;
  targetRounds?: number;
  characters?: string[];
  bots?: boolean;
  difficulty?: "easy" | "normal" | "hard";
}): GameState {
  const playerCount = options?.playerCount ?? 2;
  const economy = { ...defaultEconomy, ...options?.economy };
  const characterIds = options?.characters ?? [
    "cai-shen",
    "xue-ba",
    "ming-yi",
    "jin-li",
  ];
  const result = bootstrapGame(
    {
      mapId: "ink" as never,
      players: Array.from({ length: playerCount }, (_, index) => ({
        name: `玩家${index + 1}`,
        characterId: characterIds[index] as never,
        tokenId: `token-${index}`,
        isBot: options?.bots ?? false,
        botDifficulty: options?.difficulty ?? "normal",
      })),
      seed: options?.seed ?? 42,
      targetRounds: options?.targetRounds ?? 0,
      economy,
    },
    content,
  );
  return result.state;
}

export function act(
  state: GameState,
  action: GameAction,
): { state: GameState; events: ReturnType<typeof reduce>["events"] } {
  return reduce(state, action, content);
}

export function roll(
  state: GameState,
  dice: [number, number],
): { state: GameState; events: ReturnType<typeof reduce>["events"] } {
  return act(state, {
    type: "roll-dice",
    playerId: state.players[state.turnSeat]!.id,
    forcedDice: dice,
  });
}

export function passTurn(state: GameState): GameState {
  const playerId = state.players[state.turnSeat]!.id;
  let next = state;
  if (next.pending?.kind === "buy-property") {
    next = act(next, { type: "decline-buy", playerId }).state;
  }
  return act(next, { type: "end-turn", playerId }).state;
}

export function grantTile(
  state: GameState,
  tileIndex: number,
  playerId: (typeof P1) | (typeof P2) | (typeof P3) | (typeof P4),
  level = 0,
): void {
  state.tiles[tileIndex]!.ownerId = playerId;
  state.tiles[tileIndex]!.level = level;
  state.players.find((player) => player.id === playerId)!.properties.push(
    state.tileDefs[tileIndex]!.id as never,
  );
}

export function setActionWindow(state: GameState, playerId: string): void {
  state.phase = "action-window";
  state.turnSeat = state.players.findIndex((player) => player.id === playerId);
}

export function tileIndexOf(state: GameState, kind: string, occurrence = 0): number {
  let seen = 0;
  for (let i = 0; i < state.tileDefs.length; i += 1) {
    if (state.tileDefs[i]!.kind === kind) {
      if (seen === occurrence) {
        return i;
      }
      seen += 1;
    }
  }
  return -1;
}
