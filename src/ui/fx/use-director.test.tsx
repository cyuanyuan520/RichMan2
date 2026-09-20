// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GameSetup } from "@/game/core/types";
import { asMapId } from "@/game/core/ids";
import { characters, economy, tokens } from "@/data/content";
import { cancelPendingBotTimer, useGameStore } from "@/store/game-store";
import { useDirector } from "./use-director";

function makeSetup(targetRounds = 10): GameSetup {
  return {
    mapId: asMapId("ink"),
    seed: 4242,
    targetRounds,
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
        botDifficulty: "easy",
      },
    ],
  };
}

beforeEach(() => {
  useGameStore.getState().backToMenu();
});

afterEach(() => {
  cancelPendingBotTimer();
  useGameStore.getState().backToMenu();
});

describe("event director", () => {
  it("drains the bootstrap event queue and clears busy", async () => {
    const { result } = renderHook(() => useDirector());
    act(() => {
      useGameStore.getState().startLocal(makeSetup());
    });

    await waitFor(() => expect(useGameStore.getState().fxQueue).toHaveLength(0), {
      timeout: 5000,
    });
    await waitFor(() => expect(result.current.busy).toBe(false), { timeout: 5000 });
    expect(useGameStore.getState().animating).toBe(false);
  });

  it("walks the token step by step and lands on the rolled tile", async () => {
    const { result } = renderHook(() => useDirector());
    act(() => {
      useGameStore.getState().startLocal(makeSetup());
    });
    await waitFor(() => expect(result.current.busy).toBe(false), { timeout: 5000 });

    const localId = useGameStore.getState().localPlayerId!;
    act(() => {
      const dispatch = useGameStore.getState().dispatch;
      const game = useGameStore.getState().game!;
      dispatch({ type: "roll-dice", playerId: localId, forcedDice: [2, 3] });
      expect(game.players[0].position).toBe(0);
    });

    await waitFor(
      () => expect(result.current.display[localId]).toBe(5),
      { timeout: 8000 },
    );
    await waitFor(() => expect(result.current.busy).toBe(false), { timeout: 8000 });
    expect(useGameStore.getState().game!.players[0].position).toBe(5);
    expect(useGameStore.getState().animating).toBe(false);
  });

  it("resyncs token positions when the state jumps (reconnect/missed updates)", async () => {
    const { result } = renderHook(() => useDirector());
    act(() => {
      useGameStore.getState().startLocal(makeSetup());
    });
    await waitFor(() => expect(result.current.busy).toBe(false), { timeout: 5000 });

    const localId = useGameStore.getState().localPlayerId!;
    const before = useGameStore.getState().game!;
    const jumped = structuredClone(before);
    jumped.seq = before.seq + 5;
    jumped.players[0].position = 17;

    act(() => {
      useGameStore.setState({ game: jumped });
    });

    await waitFor(() => expect(result.current.display[localId]).toBe(17), {
      timeout: 3000,
    });
  });

  it("keeps draining events for a long AI chain without getting stuck", async () => {
    useGameStore.getState().startLocal(makeSetup(30));
    const { result } = renderHook(() => useDirector());

    for (let step = 0; step < 12; step += 1) {
      const localId = useGameStore.getState().localPlayerId!;
      const game = useGameStore.getState().game!;
      const actor = game.pending ? game.pending.playerId : game.players[game.turnSeat]?.id;
      if (actor !== localId || game.phase === "finished") {
        break;
      }
      act(() => {
        const actions =
          game.phase === "await-roll"
            ? ({ type: "roll-dice", playerId: localId } as const)
            : ({ type: "end-turn", playerId: localId } as const);
        useGameStore.getState().dispatch(actions);
      });
      await waitFor(() => expect(result.current.busy).toBe(false), { timeout: 12000 });
    }

    expect(result.current.busy).toBe(false);
    expect(useGameStore.getState().animating).toBe(false);
    expect(useGameStore.getState().fxQueue).toHaveLength(0);
  }, 60000);
});
