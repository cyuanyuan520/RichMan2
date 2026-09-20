import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSetup } from "@/game/core/types";
import { asMapId } from "@/game/core/ids";
import { characters, economy, tokens } from "@/data/content";
import { cancelPendingBotTimer, useGameStore } from "./game-store";

function makeSetup(): GameSetup {
  return {
    mapId: asMapId("ink"),
    seed: 31337,
    targetRounds: 30,
    economy,
    players: [
      {
        name: "电脑",
        characterId: characters[0].id,
        tokenId: tokens[0].id,
        isBot: true,
        botDifficulty: "easy",
      },
      { name: "我", characterId: characters[1].id, tokenId: tokens[1].id, isBot: false },
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

describe("AI pacing", () => {
  it("holds bot actions while an animation is playing and resumes afterwards", async () => {
    useGameStore.getState().startLocal(makeSetup(), 1);
    useGameStore.setState({ animating: true });

    const seqBefore = useGameStore.getState().game!.seq;
    await vi.advanceTimersByTimeAsync(8000);
    expect(useGameStore.getState().game!.seq).toBe(seqBefore);

    useGameStore.setState({ animating: false });
    await vi.advanceTimersByTimeAsync(4000);
    expect(useGameStore.getState().game!.seq).toBeGreaterThan(seqBefore);
  });
});
