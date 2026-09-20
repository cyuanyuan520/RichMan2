import { describe, expect, it } from "vitest";
import { chooseAiAction } from "./index";
import { act, content, makeGame } from "../test-utils";

function simulate(seed: number, difficulty: "easy" | "normal" | "hard") {
  let state = makeGame({
    playerCount: 4,
    seed,
    targetRounds: 8,
    bots: true,
    difficulty,
  });
  let steps = 0;
  while (state.phase !== "finished" && steps < 3000) {
    const playerId = state.players[state.turnSeat]!.id;
    const action = chooseAiAction(state, content, playerId);
    if (!action) {
      throw new Error(
        `AI produced no action at phase ${state.phase} pending ${state.pending?.kind}`,
      );
    }
    state = act(state, action).state;
    steps += 1;
  }
  return { state, steps };
}

describe("ai", () => {
  it("plays a full game to completion at every difficulty", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const { state, steps } = simulate(1234, difficulty);
      expect(state.phase).toBe("finished");
      expect(state.standings.length).toBeGreaterThanOrEqual(2);
      expect(steps).toBeLessThan(3000);
    }
  });

  it("buys a property when it can comfortably afford it", () => {
    const state = makeGame({ bots: true, difficulty: "hard", seed: 99 });
    const rolled = act(state, {
      type: "roll-dice",
      playerId: state.players[0]!.id,
      forcedDice: [1, 2],
    });
    expect(rolled.state.pending?.kind).toBe("buy-property");
    const action = chooseAiAction(rolled.state, content, state.players[0]!.id);
    expect(action?.type).toBe("buy-property");
  });

  it("declines when the purchase would leave it broke", () => {
    const state = makeGame({ bots: true, difficulty: "normal", seed: 7 });
    const rolled = act(state, {
      type: "roll-dice",
      playerId: state.players[0]!.id,
      forcedDice: [1, 2],
    });
    const broke = structuredClone(rolled.state);
    broke.players[0]!.money = 700;
    if (broke.pending?.kind === "buy-property") {
      broke.pending.price = 650;
    }
    const action = chooseAiAction(broke, content, broke.players[0]!.id);
    expect(action?.type).toBe("decline-buy");
  });
});
