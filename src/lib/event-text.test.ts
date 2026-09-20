import { describe, expect, it } from "vitest";
import { asMapId } from "@/game/core/ids";
import { bootstrapGame } from "@/game/core/state";
import { reduce } from "@/game/core/reducer";
import type { GameSetup, GameState, PlayerId } from "@/game/core/types";
import { getLegalActions } from "@/game/selectors";
import { chooseAiAction } from "@/game/ai";
import { buildGameContent, characters, economy, tokens } from "@/data/content";
import { describeEvent, playerName, tileLabel } from "./event-text";

const content = buildGameContent("ink");

function makeSetup(playerCount: number, seed: number): GameSetup {
  return {
    mapId: asMapId("ink"),
    seed,
    targetRounds: 8,
    economy,
    players: Array.from({ length: playerCount }).map((_, index) => ({
      name: `测试${index + 1}`,
      characterId: characters[index % characters.length].id,
      tokenId: tokens[index % tokens.length].id,
      isBot: true,
      botDifficulty: "hard",
    })),
  };
}

function playFullGame(playerCount: number, seed: number): { state: GameState; events: number } {
  let { state } = bootstrapGame(makeSetup(playerCount, seed), content);
  let events = 0;
  for (let step = 0; step < 4000 && state.phase !== "finished"; step += 1) {
    const actorId: PlayerId = state.pending
      ? state.pending.playerId
      : (state.players[state.turnSeat]?.id as PlayerId);
    const action = chooseAiAction(state, content, actorId);
    if (!action) {
      break;
    }
    const legal = getLegalActions(state, content, actorId);
    expect(
      legal.length,
      `actor ${actorId} should always have legal actions in phase ${state.phase}`,
    ).toBeGreaterThan(0);
    const result = reduce(state, action, content);
    state = result.state;
    events += result.events.length;
    for (const event of result.events) {
      describeEvent(event, state, content);
    }
  }
  return { state, events };
}

describe("event text", () => {
  it("describes money, rent and property events with tones", () => {
    let { state } = bootstrapGame(makeSetup(2, 7), content);
    const events = [];
    for (let step = 0; step < 40 && state.phase !== "finished"; step += 1) {
      const actorId = state.pending
        ? state.pending.playerId
        : (state.players[state.turnSeat]?.id as PlayerId);
      const action = chooseAiAction(state, content, actorId);
      if (!action) {
        break;
      }
      const result = reduce(state, action, content);
      state = result.state;
      events.push(...result.events);
    }
    const described = events
      .map((event) => describeEvent(event, state, content))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    expect(described.length).toBeGreaterThan(10);
    expect(described.some((entry) => entry.tone === "good")).toBe(true);
    expect(described.every((entry) => entry.text.length > 0)).toBe(true);
  });

  it("names players and tiles from state", () => {
    const { state } = bootstrapGame(makeSetup(2, 1), content);
    const first = state.players[0];
    expect(playerName(state, first.id)).toBe("测试1");
    expect(tileLabel(state, 0)).toBe(state.tileDefs[0].name);
    expect(tileLabel(state, 9999)).toContain("9999");
  });
});

describe("headless local game", () => {
  it("plays 2-player games to completion without illegal state", () => {
    for (const seed of [11, 23, 47]) {
      const { state, events } = playFullGame(2, seed);
      expect(events).toBeGreaterThan(0);
      expect(
        state.phase === "finished" || state.round <= state.config.targetRounds + 1,
      ).toBe(true);
      for (const player of state.players) {
        if (player.status !== "bankrupt") {
          expect(Number.isFinite(player.money)).toBe(true);
        }
      }
    }
  });

  it("plays 4-player games with cards, items and skills without stalling", () => {
    for (const seed of [5, 19]) {
      const { state } = playFullGame(4, seed);
      expect(state.players.length).toBe(4);
      const alive = state.players.filter((player) => player.status !== "bankrupt");
      expect(alive.length).toBeGreaterThanOrEqual(1);
      const stats = state.players.reduce(
        (total, player) => total + player.stats.rolls,
        0,
      );
      expect(stats).toBeGreaterThan(10);
    }
  });
});
