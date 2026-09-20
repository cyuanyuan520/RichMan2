import { describe, expect, it } from "vitest";
import { EngineError } from "../core/errors";
import {
  P1,
  P2,
  P3,
  act,
  content,
  grantTile,
  makeGame,
  roll,
  setActionWindow,
  tileIndexOf,
} from "../test-utils";
import { reduce } from "../core/reducer";
import { getLegalActions } from "../selectors/legal";
import { buildGameContent } from "@/data/content";
import { computeContentHash } from "../core/state";
import { defaultEconomy as START } from "@/data/content/economy";
import type { CardDef, GameContent } from "../core/types";

const STARTING = START.startingMoney;

describe("debt queue", () => {
  it("queues a second solvent debtor instead of bankrupting them", () => {
    const state = makeGame({
      playerCount: 3,
      characters: ["xue-ba", "xue-ba", "xue-ba"],
    });
    grantTile(state, tileIndexOf(state, "transport", 0), P2);
    grantTile(state, tileIndexOf(state, "transport", 1), P3);
    state.players[1]!.money = 100;
    state.players[2]!.money = 100;
    state.chanceDeck = ["chance-dividend"];
    const result = roll(state, [1, 1]);

    expect(result.state.pending?.kind).toBe("raise-funds");
    expect(result.state.pending?.playerId).toBe(P2);
    expect(result.state.players[1]!.status).toBe("active");
    expect(result.state.players[2]!.status).toBe("active");
    expect(result.state.debtQueue).toHaveLength(1);
    expect(result.state.debtQueue[0]!.playerId).toBe(P3);

    const first = act(result.state, {
      type: "mortgage-property",
      playerId: P2,
      tileIndex: tileIndexOf(state, "transport", 0),
    });
    expect(first.state.players[1]!.money).toBe(350);
    expect(first.state.pending?.playerId).toBe(P3);
    expect(first.state.debtQueue).toHaveLength(0);

    const second = act(first.state, {
      type: "mortgage-property",
      playerId: P3,
      tileIndex: tileIndexOf(state, "transport", 1),
    });
    expect(second.state.pending).toBeNull();
    expect(second.state.players[2]!.money).toBe(350);
    expect(second.state.players[0]!.money).toBe(STARTING + 1000);
    expect(second.state.players[1]!.status).toBe("active");
    expect(second.state.players[2]!.status).toBe("active");
  });

  it("keeps the game money supply conserved when a debtor goes bankrupt", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    grantTile(state, tileIndexOf(state, "transport", 0), P1);
    state.players[1]!.money = 100;
    state.players[1]!.position = 3;
    state.turnSeat = 1;
    const result = roll(state, [1, 1]);

    expect(result.state.players[1]!.status).toBe("bankrupt");
    expect(result.state.players[1]!.money).toBe(0);
    expect(result.state.players[0]!.money).toBe(STARTING + 100);

    const deltas = new Map<string, number>();
    for (const event of result.events) {
      if (event.type === "money-changed") {
        deltas.set(
          event.playerId,
          (deltas.get(event.playerId) ?? 0) + event.delta,
        );
      }
    }
    expect(STARTING + (deltas.get(P1) ?? 0)).toBe(
      result.state.players[0]!.money,
    );
    expect(100 + (deltas.get(P2) ?? 0)).toBe(result.state.players[1]!.money);
  });

  it("attributes each debt share to its own creditor", () => {
    const state = makeGame({
      playerCount: 3,
      characters: ["xue-ba", "xue-ba", "xue-ba"],
    });
    state.players[0]!.money = 100;
    grantTile(state, tileIndexOf(state, "transport", 0), P1);
    grantTile(state, tileIndexOf(state, "transport", 1), P1);
    state.fateDeck = ["fate-treat-dinner"];
    state.players[0]!.position = 15;

    const rolled = roll(state, [1, 1]);
    expect(rolled.state.pending?.kind).toBe("raise-funds");
    expect(rolled.state.pending?.playerId).toBe(P1);
    if (rolled.state.pending?.kind === "raise-funds") {
      expect(rolled.state.pending.shares).toEqual([
        { creditorId: P2, amount: 700, reason: "card" },
        { creditorId: P3, amount: 800, reason: "card" },
      ]);
    }

    const first = act(rolled.state, {
      type: "mortgage-property",
      playerId: P1,
      tileIndex: tileIndexOf(state, "transport", 0),
    });
    expect(first.state.pending?.kind).toBe("raise-funds");
    const second = act(first.state, {
      type: "mortgage-property",
      playerId: P1,
      tileIndex: tileIndexOf(state, "transport", 1),
    });
    expect(second.state.pending).toBeNull();
    expect(second.state.players[0]!.money).toBe(0);
    expect(second.state.players[1]!.money).toBe(STARTING + 800);
    expect(second.state.players[2]!.money).toBe(STARTING + 800);
  });

  it("promotes the queued debtor after the first declares bankrupt", () => {
    const state = makeGame({
      playerCount: 3,
      characters: ["xue-ba", "xue-ba", "xue-ba"],
    });
    grantTile(state, tileIndexOf(state, "transport", 0), P2);
    grantTile(state, tileIndexOf(state, "transport", 1), P3);
    state.players[1]!.money = 100;
    state.players[2]!.money = 100;
    state.chanceDeck = ["chance-dividend"];
    const rolled = roll(state, [1, 1]);
    expect(rolled.state.pending?.playerId).toBe(P2);

    const declared = act(rolled.state, {
      type: "declare-bankrupt",
      playerId: P2,
    });
    expect(declared.state.players[1]!.status).toBe("bankrupt");
    expect(declared.state.pending?.playerId).toBe(P3);
    expect(declared.state.debtQueue).toHaveLength(0);
    expect(declared.state.players[2]!.status).toBe("active");
    expect(declared.state.tiles[tileIndexOf(state, "transport", 1)]!.ownerId).toBe(
      P3,
    );
  });

  it("aborts the remaining card effects when the actor goes bankrupt mid-card", () => {
    const base = buildGameContent("ink");
    const card: CardDef = {
      id: "test-double-loss",
      deck: "chance",
      title: "测试卡",
      text: "测试用连击卡",
      effects: [
        { kind: "money", amount: -999999 },
        { kind: "gain-item", itemDefId: "roadblock" },
      ],
    };
    const custom: GameContent = {
      ...base,
      cards: { ...base.cards, "test-double-loss": card },
    };
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.chanceDeck = ["test-double-loss"];
    const result = reduce(
      state,
      { type: "roll-dice", playerId: P1, forcedDice: [1, 1] },
      custom,
    );
    expect(result.state.players[0]!.status).toBe("bankrupt");
    expect(result.state.players[0]!.items).toHaveLength(0);
    expect(result.state.queue).toHaveLength(0);
    expect(result.state.pending).toBeNull();
  });

  it("clears a stale own pending before going bankrupt", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.pending = {
      kind: "raise-funds",
      playerId: P1,
      creditorId: null,
      amount: 5000,
      reason: "tax",
      shares: [{ creditorId: null, amount: 5000, reason: "tax" }],
    };
    state.players[0]!.money = -5000;
    const result = act(state, { type: "declare-bankrupt", playerId: P1 });
    expect(result.state.pending).toBeNull();
    expect(result.state.players[0]!.status).toBe("bankrupt");
    expect(result.state.phase).toBe("finished");
  });
});

describe("force-buy valuation", () => {
  it("prices force-buy by land plus invested upgrades", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    grantTile(state, 3, P2, 2);
    const def = content.map.tiles[3]!;
    const invested = (def.upgradeCosts ?? [])
      .slice(0, 2)
      .reduce((sum, value) => sum + value, 0);
    const cost = Math.round(((def.price ?? 0) + invested) * 1.5);
    state.players[0]!.items.push({ id: "i1" as never, defId: "force-buy" });
    const targeted = act(state, {
      type: "use-item",
      playerId: P1,
      itemId: "i1" as never,
    });
    const resolved = act(targeted.state, {
      type: "resolve-target",
      playerId: P1,
      target: { tileIndex: 3 },
    });
    expect(resolved.state.tiles[3]!.ownerId).toBe(P1);
    expect(resolved.state.tiles[3]!.level).toBe(2);
    expect(resolved.state.players[0]!.money).toBe(STARTING - cost);
    expect(resolved.state.players[1]!.money).toBe(STARTING + cost);
  });

  it("refuses force-buy when no affordable target exists", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    grantTile(state, 3, P2, 2);
    state.players[0]!.money = 100;
    state.players[0]!.items.push({ id: "i1" as never, defId: "force-buy" });
    expect(() =>
      act(state, { type: "use-item", playerId: P1, itemId: "i1" as never }),
    ).toThrowError(EngineError);
  });
});

describe("content hash", () => {
  it("changes when any content value changes", () => {
    const base = buildGameContent("ink");
    expect(computeContentHash(base)).toBe(base.contentHash);

    const mutatedTile = structuredClone(base) as GameContent;
    const tile = mutatedTile.map.tiles[3]!;
    tile.price = (tile.price ?? 0) + 10;
    expect(computeContentHash(mutatedTile)).not.toBe(base.contentHash);

    const mutatedCard = structuredClone(base) as GameContent;
    const cardId = Object.keys(mutatedCard.cards)[0]!;
    mutatedCard.cards[cardId]!.effects = [{ kind: "money", amount: 12345 }];
    expect(computeContentHash(mutatedCard)).not.toBe(base.contentHash);

    const mutatedCharacter = structuredClone(base) as GameContent;
    const characterId = Object.keys(mutatedCharacter.characters)[0]!;
    mutatedCharacter.characters[characterId]!.skills = [];
    expect(computeContentHash(mutatedCharacter)).not.toBe(base.contentHash);
  });
});

describe("turn machine", () => {
  it("preserves the doubles extra roll after a purchase decision", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.players[0]!.position = 1;
    const rolled = roll(state, [1, 1]);
    expect(rolled.state.pending?.kind).toBe("buy-property");
    const declined = act(rolled.state, { type: "decline-buy", playerId: P1 });
    expect(declined.state.phase).toBe("await-roll");
    expect(declined.state.rollAgain).toBe(true);
    const again = roll(declined.state, [1, 2]);
    expect(again.state.players[0]!.position).toBe(6);
  });

  it("does not let jailed players use items", () => {
    const state = makeGame();
    state.players[0]!.status = "jailed";
    state.players[0]!.statusTurns = 2;
    state.players[0]!.items.push({ id: "i1" as never, defId: "teleport" });
    expect(() =>
      act(state, { type: "use-item", playerId: P1, itemId: "i1" as never }),
    ).toThrowError(EngineError);
  });

  it("caps upgrades at the data tables even if economy allows more", () => {
    const state = makeGame({ economy: { maxBuildingLevel: 6 } });
    setActionWindow(state, P1);
    grantTile(state, 3, P1, 4);
    const actions = getLegalActions(state, content, P1);
    expect(actions.some((action) => action.type === "upgrade-property")).toBe(
      false,
    );
    expect(() =>
      act(state, {
        type: "upgrade-property",
        playerId: P1,
        tileIndex: 3,
      }),
    ).toThrowError(EngineError);
  });

  it("lets a targeted card effect be canceled and rejects invalid targets", () => {
    const base = buildGameContent("ink");
    const card: CardDef = {
      id: "test-targeted",
      deck: "chance",
      title: "测试卡",
      text: "测试用目标卡",
      effects: [{ kind: "force-buy", multiplier: 1.5 }],
    };
    const custom: GameContent = {
      ...base,
      cards: { ...base.cards, "test-targeted": card },
    };
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    grantTile(state, 3, P2, 0);
    state.chanceDeck = ["test-targeted"];

    const rolled = reduce(
      state,
      { type: "roll-dice", playerId: P1, forcedDice: [1, 1] },
      custom,
    );
    expect(rolled.state.pending?.kind).toBe("card-target");
    const canceled = reduce(
      rolled.state,
      { type: "cancel-target", playerId: P1 },
      custom,
    );
    expect(canceled.state.pending).toBeNull();
    expect(canceled.state.players[0]!.money).toBe(STARTING);
    expect(canceled.state.tiles[3]!.ownerId).toBe(P2);

    const rolledAgain = reduce(
      state,
      { type: "roll-dice", playerId: P1, forcedDice: [1, 1] },
      custom,
    );
    expect(rolledAgain.state.pending?.kind).toBe("card-target");
    expect(() =>
      reduce(
        rolledAgain.state,
        {
          type: "resolve-target",
          playerId: P1,
          target: { tileIndex: 0 },
        },
        custom,
      ),
    ).toThrowError(EngineError);
  });
});
