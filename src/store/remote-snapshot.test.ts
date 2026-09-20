import { afterEach, describe, expect, it } from "vitest";
import type { GameEvent, GameSetup } from "@/game/core/types";
import { asMapId } from "@/game/core/ids";
import { bootstrapGame } from "@/game/core/state";
import { buildGameContent, characters, economy, tokens } from "@/data/content";
import { applyRemoteSnapshot, useGameStore } from "./game-store";

function makeSetup(): GameSetup {
  return {
    mapId: asMapId("ink"),
    seed: 21,
    targetRounds: 0,
    economy,
    players: [
      { name: "甲", characterId: characters[0].id, tokenId: tokens[0].id, isBot: false },
      { name: "乙", characterId: characters[1].id, tokenId: tokens[1].id, isBot: false },
    ],
  };
}

const log = (text: string): GameEvent => ({ type: "log", text });

afterEach(() => {
  useGameStore.getState().backToMenu();
});

describe("applyRemoteSnapshot event queue", () => {
  it("appends contiguous events and drops stale ones after a sequence gap", () => {
    const content = buildGameContent("ink");
    const { state } = bootstrapGame(makeSetup(), content);
    const playerId = state.players[0].id;

    applyRemoteSnapshot(state, [log("a")], content, playerId);
    expect(useGameStore.getState().fxQueue.map((entry) => entry.type)).toEqual(["log"]);

    const contiguous = { ...state, seq: state.seq + 1 };
    applyRemoteSnapshot(contiguous, [log("b")], content, playerId);
    expect(useGameStore.getState().fxQueue).toHaveLength(2);

    const jumped = { ...state, seq: state.seq + 6 };
    applyRemoteSnapshot(jumped, [log("c")], content, playerId);
    expect(useGameStore.getState().fxQueue).toHaveLength(1);
    expect((useGameStore.getState().fxQueue[0] as { text: string }).text).toBe("c");
  });

  it("caps the animation backlog instead of replaying minutes of history", () => {
    const content = buildGameContent("ink");
    const { state } = bootstrapGame(makeSetup(), content);
    const playerId = state.players[0].id;

    applyRemoteSnapshot(
      state,
      Array.from({ length: 14 }, (_, index) => log(`bulk-${index}`)),
      content,
      playerId,
    );
    expect(useGameStore.getState().fxQueue).toHaveLength(14);

    const next = { ...state, seq: state.seq + 1 };
    applyRemoteSnapshot(next, [log("fresh")], content, playerId);
    expect(useGameStore.getState().fxQueue).toHaveLength(1);
    expect((useGameStore.getState().fxQueue[0] as { text: string }).text).toBe("fresh");
  });
});
