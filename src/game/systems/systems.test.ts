import { describe, expect, it } from "vitest";
import { EngineError } from "../core/errors";
import {
  P1,
  P2,
  act,
  content,
  grantTile,
  makeGame,
  roll,
  setActionWindow,
  tileIndexOf,
} from "../test-utils";
import { getLegalActions } from "../selectors/legal";
import { defaultEconomy as START } from "@/data/content/economy";

const STARTING = START.startingMoney;

describe("cards", () => {
  it("applies flat money gains from the chance deck", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.chanceDeck = ["chance-red-envelope"];
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.money).toBe(STARTING + 2000);
    expect(result.state.chanceDiscard).toContain("chance-red-envelope");
  });

  it("applies flat money losses from the fate deck", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.fateDeck = ["fate-lost-wallet"];
    state.players[0]!.position = 15;
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.position).toBe(17);
    expect(result.state.players[0]!.money).toBe(STARTING - 2000);
  });

  it("applies percent money cards", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.chanceDeck = ["chance-stock-up"];
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.money).toBe(STARTING + STARTING * 0.1);
  });

  it("halves negative card amounts for 锦鲤", () => {
    const state = makeGame({ characters: ["jin-li", "xue-ba"] });
    state.fateDeck = ["fate-lost-wallet"];
    state.players[0]!.position = 15;
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.money).toBe(STARTING - 1000);
  });

  it("collects from and pays every opponent", () => {
    const state = makeGame({
      playerCount: 3,
      characters: ["xue-ba", "xue-ba", "xue-ba"],
    });
    state.chanceDeck = ["chance-dividend"];
    const gained = roll(state, [1, 1]);
    expect(gained.state.players[0]!.money).toBe(STARTING + 1000);
    expect(gained.state.players[1]!.money).toBe(STARTING - 500);

    const state2 = makeGame({
      playerCount: 3,
      characters: ["xue-ba", "xue-ba", "xue-ba"],
    });
    state2.fateDeck = ["fate-treat-dinner"];
    state2.players[0]!.position = 15;
    const paid = roll(state2, [1, 1]);
    expect(paid.state.players[0]!.money).toBe(STARTING - 1600);
    expect(paid.state.players[1]!.money).toBe(STARTING + 800);
  });

  it("grants items from cards", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.chanceDeck = ["chance-free-item"];
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.items).toHaveLength(1);
    expect(result.state.players[0]!.items[0]!.defId).toBe("roadblock");
  });

  it("moves by steps and resolves the new landing", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.chanceDeck = ["chance-express"];
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.position).toBe(5);
    expect(result.state.pending?.kind).toBe("buy-property");
    expect(result.state.tileDefs[5]!.kind).toBe("transport");
  });

  it("moves to start and pays salary through the card", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.chanceDeck = ["chance-package-tour"];
    state.players[0]!.position = 31;
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.position).toBe(0);
    expect(result.state.players[0]!.money).toBe(
      STARTING + START.goSalary + START.startLandingBonus,
    );
  });

  it("sends players to jail and hospital from cards", () => {
    const jailed = makeGame({ characters: ["xue-ba", "xue-ba"] });
    jailed.fateDeck = ["fate-tax-evasion"];
    jailed.players[0]!.position = 15;
    const jailResult = roll(jailed, [1, 1]);
    expect(jailResult.state.players[0]!.status).toBe("jailed");
    expect(jailResult.state.players[0]!.position).toBe(tileIndexOf(jailed, "jail"));
    expect(jailResult.state.players[0]!.statusTurns).toBe(START.jailTurns);

    const hurt = makeGame({ characters: ["xue-ba", "xue-ba"] });
    hurt.fateDeck = ["fate-accident"];
    hurt.players[0]!.position = 15;
    const hospitalResult = roll(hurt, [1, 1]);
    expect(hospitalResult.state.players[0]!.status).toBe("hospitalized");
    expect(hospitalResult.state.players[0]!.statusTurns).toBe(START.hospitalTurns);
  });

  it("pays and collects per building level", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    grantTile(state, 3, P1, 2);
    state.chanceDeck = ["chance-subsidy"];
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.money).toBe(STARTING + 400);
  });

  it("reshuffles the discard pile when the deck runs out", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.chanceDeck = [];
    state.chanceDiscard = ["chance-red-envelope"];
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.money).toBe(STARTING + 2000);
    expect(result.state.chanceDeck).toHaveLength(0);
  });
});

describe("items", () => {
  it("buys items only at the shop and uses shield items", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    state.players[0]!.position = tileIndexOf(state, "shop");
    const bought = act(state, {
      type: "buy-item",
      playerId: P1,
      itemDefId: "rent-shield",
    });
    expect(bought.state.players[0]!.money).toBe(
      STARTING - content.items["rent-shield"]!.price,
    );
    expect(bought.state.players[0]!.items).toHaveLength(1);
    const used = act(bought.state, {
      type: "use-item",
      playerId: P1,
      itemId: bought.state.players[0]!.items[0]!.id,
    });
    expect(used.state.players[0]!.rentShields).toBe(1);
  });

  it("places a roadblock and stops opponents on it", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    state.lastRoll = [1, 1];
    state.players[0]!.items.push({ id: "i1" as never, defId: "roadblock" });
    const targeted = act(state, { type: "use-item", playerId: P1, itemId: "i1" as never });
    expect(targeted.state.pending?.kind).toBe("item-target");
    const resolved = act(targeted.state, {
      type: "resolve-target",
      playerId: P1,
      target: { tileIndex: 3 },
    });
    expect(resolved.state.tiles[3]!.effects).toHaveLength(1);
    expect(resolved.state.players[0]!.items).toHaveLength(0);

    const moved = act(resolved.state, { type: "end-turn", playerId: P1 }).state;
    moved.players[1]!.position = 1;
    const result = roll(moved, [1, 1]);
    expect(result.state.players[1]!.position).toBe(3);
    expect(result.state.tiles[3]!.effects).toHaveLength(0);
    expect(
      result.events.some((event) => event.type === "roadblock-triggered"),
    ).toBe(true);
  });

  it("teleports to any tile", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    state.players[0]!.items.push({ id: "i1" as never, defId: "teleport" });
    const targeted = act(state, { type: "use-item", playerId: P1, itemId: "i1" as never });
    const options = getLegalActions(
      targeted.state,
      content,
      P1,
    ).filter((action) => action.type === "resolve-target");
    expect(options).toHaveLength(40);
    const resolved = act(targeted.state, {
      type: "resolve-target",
      playerId: P1,
      target: { tileIndex: 20 },
    });
    expect(resolved.state.players[0]!.position).toBe(20);
  });

  it("demolishes an opponent building", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    grantTile(state, 3, P2, 2);
    state.players[0]!.items.push({ id: "i1" as never, defId: "demolish" });
    const targeted = act(state, { type: "use-item", playerId: P1, itemId: "i1" as never });
    const resolved = act(targeted.state, {
      type: "resolve-target",
      playerId: P1,
      target: { tileIndex: 3 },
    });
    expect(resolved.state.tiles[3]!.level).toBe(1);
  });

  it("audits an opponent", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    state.players[0]!.items.push({ id: "i1" as never, defId: "audit" });
    const targeted = act(state, { type: "use-item", playerId: P1, itemId: "i1" as never });
    const resolved = act(targeted.state, {
      type: "resolve-target",
      playerId: P1,
      target: { playerId: P2 },
    });
    expect(resolved.state.players[0]!.money).toBe(STARTING + 2000);
    expect(resolved.state.players[1]!.money).toBe(STARTING - 2000);
  });

  it("force-buys an opponent property", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    grantTile(state, 3, P2, 0);
    state.players[0]!.items.push({ id: "i1" as never, defId: "force-buy" });
    const targeted = act(state, { type: "use-item", playerId: P1, itemId: "i1" as never });
    const resolved = act(targeted.state, {
      type: "resolve-target",
      playerId: P1,
      target: { tileIndex: 3 },
    });
    const cost = Math.round(650 * 1.5);
    expect(resolved.state.tiles[3]!.ownerId).toBe(P1);
    expect(resolved.state.players[0]!.money).toBe(STARTING - cost);
    expect(resolved.state.players[1]!.money).toBe(STARTING + cost);
  });

  it("swaps positions with an opponent", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    state.players[1]!.position = 25;
    state.players[0]!.items.push({ id: "i1" as never, defId: "swap" });
    const targeted = act(state, { type: "use-item", playerId: P1, itemId: "i1" as never });
    const resolved = act(targeted.state, {
      type: "resolve-target",
      playerId: P1,
      target: { playerId: P2 },
    });
    expect(resolved.state.players[0]!.position).toBe(25);
    expect(resolved.state.players[1]!.position).toBe(0);
  });

  it("averages cash with the share wealth item", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    state.players[0]!.money = 30000;
    state.players[1]!.money = 10000;
    state.players[0]!.items.push({ id: "i1" as never, defId: "share-wealth" });
    const result = act(state, { type: "use-item", playerId: P1, itemId: "i1" as never });
    expect(result.state.players[0]!.money).toBe(20000);
    expect(result.state.players[1]!.money).toBe(20000);
  });

  it("lets a loaded dice force the next roll", () => {
    const state = makeGame();
    state.players[0]!.items.push({ id: "i1" as never, defId: "loaded-dice" });
    const used = act(state, { type: "use-item", playerId: P1, itemId: "i1" as never });
    expect(used.state.pending?.kind).toBe("choose-dice");
    const chosen = act(used.state, { type: "choose-dice", playerId: P1, value: 6 });
    expect(chosen.state.players[0]!.forcedDice).toBe(6);
    const result = roll(chosen.state, [6, 6]);
    expect(result.state.lastRoll).toEqual([6, 6]);
  });

  it("cancels a targeted item without consuming it", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    state.players[0]!.items.push({ id: "i1" as never, defId: "halt" });
    const targeted = act(state, { type: "use-item", playerId: P1, itemId: "i1" as never });
    const canceled = act(targeted.state, { type: "cancel-target", playerId: P1 });
    expect(canceled.state.pending).toBeNull();
    expect(canceled.state.players[0]!.items).toHaveLength(1);
  });
});

describe("skills", () => {
  it("grants 财神爷 a bonus when passing start", () => {
    const state = makeGame({ characters: ["cai-shen", "xue-ba"] });
    state.players[0]!.position = 38;
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.money).toBe(
      STARTING + START.goSalary + 1000 + START.startLandingBonus,
    );
  });

  it("applies 学霸 purchase and upgrade discounts", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    const rolled = roll(state, [1, 2]);
    const pending = rolled.state.pending;
    expect(pending?.kind).toBe("buy-property");
    if (pending?.kind === "buy-property") {
      expect(pending.price).toBe(Math.round(650 * 0.85));
    }
    const bought = act(rolled.state, { type: "buy-property", playerId: P1 }).state;
    const upgraded = act(bought, {
      type: "upgrade-property",
      playerId: P1,
      tileIndex: 3,
    }).state;
    const base = state.tileDefs[3]!.upgradeCosts![0]!;
    expect(upgraded.players[0]!.money).toBe(
      STARTING - Math.round(650 * 0.85) - Math.round(base * 0.85),
    );
  });

  it("boosts rent for 貔貅 owners", () => {
    const state = makeGame({ characters: ["xue-ba", "pi-xiu"] });
    grantTile(state, 3, P2, 0);
    const baseRent = state.tileDefs[3]!.rents![0]!;
    const result = roll(state, [1, 2]);
    expect(result.state.players[0]!.money).toBe(
      STARTING - Math.round(baseRent * 1.15),
    );
  });

  it("reduces hospital stay for 名医", () => {
    const state = makeGame({ characters: ["xue-ba", "ming-yi"] });
    state.fateDeck = ["fate-accident"];
    state.turnSeat = 1;
    state.players[1]!.position = 15;
    const result = roll(state, [1, 1]);
    expect(result.state.players[1]!.status).toBe("hospitalized");
    expect(result.state.players[1]!.statusTurns).toBe(1);
  });

  it("lets 名医 escape jail once and then exhausts the charge", () => {
    const state = makeGame({ characters: ["ming-yi", "xue-ba"], seed: 5 });
    state.players[0]!.status = "jailed";
    state.players[0]!.position = tileIndexOf(state, "jail");
    const escaped = act(state, {
      type: "use-skill",
      playerId: P1,
      skillId: "ming-yi-active",
    });
    expect(escaped.state.players[0]!.status).toBe("active");
    expect(escaped.state.players[0]!.skillCharges["ming-yi-active"]).toBe(0);
    expect(() =>
      act(escaped.state, {
        type: "use-skill",
        playerId: P1,
        skillId: "ming-yi-active",
      }),
    ).toThrowError(EngineError);
  });

  it("collects from every opponent with 熊孩子 and respects the cooldown", () => {
    const state = makeGame({ characters: ["xue-ba", "xiong-hai-zi"] });
    state.players[1]!.position = 0;
    state.turnSeat = 1;
    setActionWindow(state, P2);
    const used = act(state, {
      type: "use-skill",
      playerId: P2,
      skillId: "xiong-hai-zi-active",
    });
    expect(used.state.players[1]!.money).toBe(STARTING + 300);
    expect(used.state.players[0]!.money).toBe(STARTING - 300);
    expect(used.state.players[1]!.skillCooldowns["xiong-hai-zi-active"]).toBe(3);
    expect(() =>
      act(used.state, {
        type: "use-skill",
        playerId: P2,
        skillId: "xiong-hai-zi-active",
      }),
    ).toThrowError(EngineError);
  });
});

describe("raise funds", () => {
  it("requests asset liquidation when cash goes negative and settles by selling", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    grantTile(state, 5, P2, 0);
    grantTile(state, 3, P1, 1);
    const transport = state.tileDefs[5]!;
    state.players[0]!.money = 100;
    state.players[0]!.position = 3;
    const rent = state.config.economy.transportRents[0]!;
    const rentResult = roll(state, [1, 1]);
    expect(transport.kind).toBe("transport");
    expect(rentResult.state.pending?.kind).toBe("raise-funds");
    expect(rentResult.state.players[0]!.money).toBe(100 - rent);
    const sold = act(rentResult.state, {
      type: "sell-building",
      playerId: P1,
      tileIndex: 3,
    });
    expect(sold.state.pending).toBeNull();
    expect(sold.state.players[0]!.money).toBeGreaterThanOrEqual(0);
  });

  it("allows declaring bankruptcy while in debt", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    grantTile(state, 5, P2, 0);
    grantTile(state, 3, P1, 0);
    state.players[0]!.money = 0;
    state.players[0]!.position = 3;
    const rentResult = roll(state, [1, 1]);
    expect(rentResult.state.pending?.kind).toBe("raise-funds");
    const bankrupt = act(rentResult.state, {
      type: "declare-bankrupt",
      playerId: P1,
    });
    expect(bankrupt.state.players[0]!.status).toBe("bankrupt");
    expect(bankrupt.state.phase).toBe("finished");
  });

  it("mortgages and redeems properties", () => {
    const state = makeGame();
    const rolled = roll(state, [1, 2]);
    const bought = act(rolled.state, { type: "buy-property", playerId: P1 }).state;
    const mortgaged = act(bought, {
      type: "mortgage-property",
      playerId: P1,
      tileIndex: 3,
    }).state;
    const refund = Math.round(650 * bought.config.economy.mortgageRefundRate);
    expect(mortgaged.players[0]!.money).toBe(STARTING - 650 + refund);
    const redeem = Math.round(
      650 *
        bought.config.economy.mortgageRefundRate *
        (1 + bought.config.economy.mortgageInterest),
    );
    const redeemed = act(mortgaged, {
      type: "unmortgage-property",
      playerId: P1,
      tileIndex: 3,
    }).state;
    expect(redeemed.players[0]!.money).toBe(STARTING - 650 + refund - redeem);
    expect(redeemed.tiles[3]!.mortgaged).toBe(false);
  });
});

describe("lottery and legal actions", () => {
  it("sells a lottery ticket and pays the prize", () => {
    const state = makeGame();
    setActionWindow(state, P1);
    state.players[0]!.position = tileIndexOf(state, "lottery");
    const result = act(state, { type: "buy-lottery", playerId: P1 });
    const event = result.events.find((entry) => entry.type === "lottery-result");
    expect(event).toBeDefined();
    if (event && event.type === "lottery-result") {
      expect(event.cost).toBe(state.config.economy.lotteryTicketPrice);
      expect(result.state.players[0]!.money).toBe(
        STARTING - event.cost + event.prize,
      );
    }
  });

  it("lists legal actions for the current player", () => {
    const state = makeGame();
    const actions = getLegalActions(state, content, P1);
    expect(actions.some((action) => action.type === "roll-dice")).toBe(true);
    expect(actions.some((action) => action.type === "give-up")).toBe(true);
    expect(getLegalActions(state, content, P2)).toHaveLength(1);
  });
});
