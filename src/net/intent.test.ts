import { describe, expect, it } from "vitest";
import type { GameAction } from "@/game/core/types";
import { asPlayerId } from "@/game/core/ids";
import { intentSchema } from "./protocol";
import { toIntent } from "./intent";

const P1 = asPlayerId("p1");

describe("toIntent", () => {
  it("strips playerId and forcedDice from roll-dice", () => {
    const action: GameAction = {
      type: "roll-dice",
      playerId: P1,
      forcedDice: [6, 6],
    };
    const intent = toIntent(action);
    expect(intent).toEqual({ type: "roll-dice" });
    expect(Object.keys(intent ?? {})).not.toContain("forcedDice");
    expect(intentSchema.safeParse(intent).success).toBe(true);
  });

  it("maps every client-actionable action to a schema-valid intent", () => {
    const actions: GameAction[] = [
      { type: "roll-dice", playerId: P1 },
      { type: "buy-property", playerId: P1 },
      { type: "decline-buy", playerId: P1 },
      { type: "upgrade-property", playerId: P1, tileIndex: 3 },
      { type: "sell-building", playerId: P1, tileIndex: 3 },
      { type: "mortgage-property", playerId: P1, tileIndex: 3 },
      { type: "unmortgage-property", playerId: P1, tileIndex: 3 },
      { type: "buy-item", playerId: P1, itemDefId: "loaded-dice" },
      { type: "use-item", playerId: P1, itemId: "i1" as never },
      { type: "use-skill", playerId: P1, skillId: "xiong-haizi" },
      { type: "buy-lottery", playerId: P1 },
      { type: "pay-jail-fine", playerId: P1 },
      { type: "resolve-target", playerId: P1, target: { tileIndex: 5 } },
      { type: "resolve-target", playerId: P1, target: { playerId: asPlayerId("p2") } },
      { type: "cancel-target", playerId: P1 },
      { type: "choose-dice", playerId: P1, value: 4 },
      { type: "raise-funds-done", playerId: P1 },
      { type: "declare-bankrupt", playerId: P1 },
      { type: "give-up", playerId: P1 },
      { type: "end-turn", playerId: P1 },
    ];
    for (const action of actions) {
      const intent = toIntent(action);
      expect(intent, `${action.type} should map`).not.toBeNull();
      const parsed = intentSchema.safeParse(intent);
      expect(parsed.success, `${action.type} should be schema-valid`).toBe(true);
      expect(JSON.stringify(intent)).not.toContain("p1");
    }
  });

  it("round-trips through toGameAction with the acting player", async () => {
    const { toGameAction } = await import("./protocol");
    const action: GameAction = { type: "upgrade-property", playerId: P1, tileIndex: 7 };
    const intent = toIntent(action);
    expect(intent).not.toBeNull();
    const rebuilt = toGameAction(intent as never, P1);
    expect(rebuilt).toEqual(action);
  });
});
