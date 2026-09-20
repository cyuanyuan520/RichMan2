import { afterEach, describe, expect, it } from "vitest";
import type { GameSetup } from "@/game/core/types";
import { characters, economy, tokens } from "@/data/content";
import { actorIdOf, cancelPendingBotTimer, isLocalActor, useGameStore } from "./game-store";

function makeSetup(seed = 99): GameSetup {
  return {
    mapId: "nostalgia",
    seed,
    targetRounds: 12,
    economy,
    players: [
      {
        name: "我",
        characterId: characters[0].id,
        tokenId: tokens[0].id,
        isBot: false,
      },
      {
        name: "电脑",
        characterId: characters[1].id,
        tokenId: tokens[1].id,
        isBot: true,
        botDifficulty: "normal",
      },
    ],
  };
}

afterEach(() => {
  cancelPendingBotTimer();
  useGameStore.getState().backToMenu();
});

describe("local game store", () => {
  it("bootstraps a local game with content, log and events", () => {
    useGameStore.getState().startLocal(makeSetup());
    const state = useGameStore.getState();
    expect(state.mode).toBe("local");
    expect(state.game).not.toBeNull();
    expect(state.content?.map.id).toBe("nostalgia");
    expect(state.localPlayerId).toBe(state.game!.players[0].id);
    expect(state.status).toBe("playing");
    expect(state.fxQueue.some((event) => event.type === "game-started")).toBe(true);
    expect(state.log.length).toBeGreaterThan(0);
    expect(state.log[0].text).toContain("开局");
  });

  it("dispatches the local player's action and advances the engine", () => {
    useGameStore.getState().startLocal(makeSetup(123));
    const before = useGameStore.getState();
    const localId = before.localPlayerId!;
    expect(actorIdOf(before.game!)).toBe(localId);
    expect(isLocalActor(before.game, localId)).toBe(true);

    const result = useGameStore.getState().dispatch({ type: "roll-dice", playerId: localId });
    expect(result.ok).toBe(true);
    const after = useGameStore.getState();
    expect(after.game!.seq).toBeGreaterThan(before.game!.seq);
    expect(after.fxQueue.some((event) => event.type === "dice-rolled")).toBe(true);
    expect(after.log.some((entry) => entry.text.includes("掷出"))).toBe(true);
  });

  it("reports illegal actions as a toast instead of throwing", () => {
    useGameStore.getState().startLocal(makeSetup(321));
    const localId = useGameStore.getState().localPlayerId!;
    const bad = useGameStore
      .getState()
      .dispatch({ type: "end-turn", playerId: localId });
    expect(bad.ok).toBe(false);
    expect(useGameStore.getState().toast?.tone).toBe("bad");
  });

  it("keeps the setup for a rematch and resets on exit", () => {
    const setup = makeSetup(7);
    useGameStore.getState().startLocal(setup);
    expect(useGameStore.getState().lastSetup).toEqual(setup);
    useGameStore.getState().backToMenu();
    const after = useGameStore.getState();
    expect(after.mode).toBe("menu");
    expect(after.game).toBeNull();
    expect(after.lastSetup).toEqual(setup);
  });

  it("persists settings through the store", () => {
    useGameStore.getState().updateSettings({ playerName: "棋圣", sfxVolume: 0.25 });
    const settings = useGameStore.getState().settings;
    expect(settings.playerName).toBe("棋圣");
    expect(settings.sfxVolume).toBe(0.25);
  });
});
