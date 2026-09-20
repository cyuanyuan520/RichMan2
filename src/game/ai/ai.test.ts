import { describe, expect, it } from "vitest";
import { chooseAiAction } from "./index";
import {
  P1,
  P2,
  P3,
  act,
  content,
  grantTile,
  makeGame,
  tileIndexOf,
} from "../test-utils";

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
    const playerId = state.pending?.playerId ?? state.players[state.turnSeat]!.id;
    const action = chooseAiAction(state, content, playerId);
    if (!action) {
      throw new Error(
        `AI produced no action at phase ${state.phase} pending ${state.pending?.kind}`,
      );
    }
    const next = act(state, action).state;
    if (
      !state.pending &&
      next.pending?.kind === "raise-funds" &&
      next.players.find((entry) => entry.id === next.pending?.playerId)?.status ===
        "bankrupt"
    ) {
      throw new Error("a solvent debtor was bankrupted by a multi-payment effect");
    }
    state = next;
    steps += 1;
  }
  return { state, steps };
}

describe("ai", () => {
  it("plays a full game to completion at every difficulty", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      for (const seed of [1234, 77, 9001]) {
        const { state, steps } = simulate(seed, difficulty);
        expect(state.phase).toBe("finished");
        expect(state.standings.length).toBeGreaterThanOrEqual(2);
        expect(steps).toBeLessThan(3000);
      }
    }
  });

  it("returns no action while another player owes a decision", () => {
    const state = makeGame({
      playerCount: 3,
      characters: ["xue-ba", "xue-ba", "xue-ba"],
    });
    grantTile(state, tileIndexOf(state, "transport", 0), P2);
    grantTile(state, tileIndexOf(state, "transport", 1), P3);
    state.players[1]!.money = 100;
    state.players[2]!.money = 100;
    state.chanceDeck = ["chance-dividend"];
    const rolled = act(state, {
      type: "roll-dice",
      playerId: P1,
      forcedDice: [1, 1],
    });
    expect(rolled.state.pending?.playerId).toBe(P2);
    expect(chooseAiAction(rolled.state, content, P1)).toBeNull();
    expect(chooseAiAction(rolled.state, content, P3)).toBeNull();
    const debtAction = chooseAiAction(rolled.state, content, P2);
    expect(debtAction?.type).toBe("mortgage-property");
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
