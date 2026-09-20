import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSetup } from "@/game/core/types";
import { asMapId } from "@/game/core/ids";
import { characters, economy, tokens } from "@/data/content";
import { chooseAiAction } from "@/game/ai";
import { cancelPendingBotTimer, useGameStore } from "./game-store";

function makeSetup(allBots: boolean, targetRounds = 10): GameSetup {
  return {
    mapId: asMapId("ink"),
    seed: 90210,
    targetRounds,
    economy,
    players: [
      {
        name: allBots ? "甲" : "我",
        characterId: characters[0].id,
        tokenId: tokens[0].id,
        isBot: allBots,
        botDifficulty: "easy",
      },
      {
        name: "电脑",
        characterId: characters[1].id,
        tokenId: tokens[1].id,
        isBot: true,
        botDifficulty: "easy",
      },
    ],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cancelPendingBotTimer();
  useGameStore.getState().backToMenu();
  vi.useRealTimers();
});

describe("local game integration", () => {
  it("plays a full local game through store dispatch and the bot loop", async () => {
    useGameStore.getState().startLocal(makeSetup(false));

    let guard = 0;
    while (useGameStore.getState().game?.phase !== "finished" && guard < 4000) {
      guard += 1;
      const { game, content } = useGameStore.getState();
      if (!game || !content) {
        break;
      }
      const actorId = game.pending ? game.pending.playerId : game.players[game.turnSeat].id;
      const actor = game.players.find((player) => player.id === actorId);
      if (!actor) {
        break;
      }
      if (actor.isBot) {
        await vi.advanceTimersByTimeAsync(1500);
        continue;
      }
      const action = chooseAiAction(game, content, actorId);
      expect(action).not.toBeNull();
      const result = useGameStore.getState().dispatch(action!);
      expect(result.ok).toBe(true);
    }

    const final = useGameStore.getState();
    expect(final.game!.phase).toBe("finished");
    expect(final.status).toBe("finished");
    expect(final.game!.seq).toBeGreaterThan(20);
    expect(final.game!.standings.length).toBeGreaterThan(0);
    expect(final.log.length).toBeGreaterThan(10);
    expect(guard).toBeLessThan(4000);
  });

  it("drives a bot-only table to completion without any human action", async () => {
    useGameStore.getState().startLocal(makeSetup(true));

    for (let index = 0; index < 600 && useGameStore.getState().game?.phase !== "finished"; index += 1) {
      await vi.advanceTimersByTimeAsync(1500);
    }

    const final = useGameStore.getState();
    expect(final.game!.phase).toBe("finished");
    expect(final.status).toBe("finished");
    expect(final.game!.round).toBeLessThanOrEqual(11);
  });
});
