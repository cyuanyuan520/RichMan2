import type { GameSetup, GameState, MapDef, Player } from "@/game/core/types";
import { createRng, rngShuffle } from "@/game/core/rng";
import { EngineError } from "@/game/core/errors";
import { asPlayerId } from "@/game/core/ids";

export interface GameContent {
  map: MapDef;
  chanceDeck: string[];
  fateDeck: string[];
}

export const STATE_VERSION = 1;

export function createGameState(
  setup: GameSetup,
  content: GameContent,
): GameState {
  if (setup.players.length < 2 || setup.players.length > 4) {
    throw new EngineError("INVALID_ACTION", "Players must be 2 to 4");
  }
  const seed = setup.seed >>> 0;
  let rng = createRng(seed);
  const [chanceDeck, rngAfterChance] = rngShuffle(rng, content.chanceDeck);
  rng = rngAfterChance;
  const [fateDeck, rngAfterFate] = rngShuffle(rng, content.fateDeck);
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
    skillCooldowns: {},
    skillCharges: {},
    isBot: entry.isBot,
    botDifficulty: entry.botDifficulty ?? "normal",
    connected: true,
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
    seq: 0,
    rng,
    seed,
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
    config: {
      targetRounds: setup.targetRounds,
      economy: setup.economy,
    },
    winnerId: null,
    standings: [],
    turnCount: 0,
  };
}

export function initialEvents(state: GameState) {
  const playerIds = state.players.map((player) => player.id);
  return [
    { type: "game-started" as const, playerIds, mapId: state.mapId },
    {
      type: "turn-started" as const,
      playerId: playerIds[0] as Player["id"],
      round: state.round,
    },
  ];
}
