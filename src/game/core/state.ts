import type {
  CardDef,
  DeckId,
  GameContent,
  GameEvent,
  GameSetup,
  GameState,
  Player,
} from "@/game/core/types";

export type { GameContent } from "@/game/core/types";
import { createRng, rngShuffle } from "@/game/core/rng";
import { EngineError } from "@/game/core/errors";
import { asPlayerId } from "@/game/core/ids";

export const STATE_VERSION = 3;

export function hashContent(input: string): string {
  let h1 = 2166136261;
  let h2 = 2166136261 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619);
    h2 ^= code;
    h2 = Math.imul(h2, 2246822519);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

export function computeContentHash(content: {
  map: unknown;
  cards: Record<string, unknown>;
  items: Record<string, unknown>;
  characters: Record<string, unknown>;
}): string {
  return hashContent(
    stableStringify({
      map: content.map,
      cards: content.cards,
      items: content.items,
      characters: content.characters,
    }),
  );
}

function expandDeck(cards: Record<string, CardDef>, deck: DeckId): string[] {
  const result: string[] = [];
  for (const card of Object.values(cards)) {
    if (card.deck !== deck) {
      continue;
    }
    const copies = Math.max(1, Math.floor(card.weight ?? 1));
    for (let i = 0; i < copies; i += 1) {
      result.push(card.id);
    }
  }
  return result;
}

export function createGameState(
  setup: GameSetup,
  content: GameContent,
): GameState {
  if (setup.players.length < 2 || setup.players.length > 4) {
    throw new EngineError("INVALID_ACTION", "Players must be 2 to 4");
  }
  const seed = setup.seed >>> 0;
  let rng = createRng(seed);
  const [chanceDeck, rngAfterChance] = rngShuffle(rng, expandDeck(content.cards, "chance"));
  rng = rngAfterChance;
  const [fateDeck, rngAfterFate] = rngShuffle(rng, expandDeck(content.cards, "fate"));
  rng = rngAfterFate;

  const players: Player[] = setup.players.map((entry, seat) => ({
    id: asPlayerId(`p${seat + 1}`),
    seat,
    name: entry.name,
    characterId: entry.characterId,
    tokenId: entry.tokenId,
    money: setup.economy.startingMoney,
    position: 0,
    properties: [],
    items: [],
    status: "active",
    statusTurns: 0,
    doublesStreak: 0,
    rentShields: 0,
    skipTurns: 0,
    forcedDice: null,
    jailFreeCards: 0,
    lotteryBoughtThisTurn: false,
    skillCooldowns: {},
    skillCharges: {},
    isBot: entry.isBot,
    botDifficulty: entry.botDifficulty ?? "normal",
    stats: {
      rolls: 0,
      doubles: 0,
      steps: 0,
      rentPaid: 0,
      rentReceived: 0,
      bought: 0,
      upgraded: 0,
      taxPaid: 0,
      itemsUsed: 0,
      cardsDrawn: 0,
    },
  }));

  return {
    version: STATE_VERSION,
    mapId: content.map.id,
    contentHash: content.contentHash,
    seq: 0,
    rng,
    seed,
    itemSeq: 0,
    round: 1,
    turnSeat: 0,
    phase: "await-roll",
    lastRoll: null,
    players,
    tiles: content.map.tiles.map((tile, index) => ({
      index,
      defId: tile.id,
      ownerId: null,
      level: 0,
      mortgaged: false,
      effects: [],
    })),
    tileDefs: content.map.tiles.map((tile) => ({ ...tile })),
    rollAgain: false,
    chanceDeck,
    fateDeck,
    chanceDiscard: [],
    fateDiscard: [],
    pending: null,
    debtQueue: [],
    queue: [],
    config: {
      targetRounds: setup.targetRounds,
      economy: setup.economy,
    },
    winnerId: null,
    standings: [],
    turnCount: 0,
  };
}

export function bootstrapGame(
  setup: GameSetup,
  content: GameContent,
): { state: GameState; events: GameEvent[] } {
  const state = createGameState(setup, content);
  const playerIds = state.players.map((player) => player.id);
  const events: GameEvent[] = [
    { type: "game-started", playerIds, mapId: state.mapId },
    {
      type: "turn-started",
      playerId: playerIds[0] as Player["id"],
      round: state.round,
    },
  ];
  for (const player of state.players) {
    for (const skill of content.characters[player.characterId]?.skills ?? []) {
      if (skill.charges !== undefined) {
        player.skillCharges[skill.id] = skill.charges;
      }
      if (skill.cooldownRounds !== undefined) {
        player.skillCooldowns[skill.id] = 0;
      }
    }
  }
  return { state, events };
}
