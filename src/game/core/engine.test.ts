import { describe, expect, it } from "vitest";
import { EngineError } from "./errors";
import { defaultEconomy } from "@/data/content/economy";
import { netWorth } from "./reducer";
import {
  P1,
  P2,
  act,
  content,
  makeGame,
  passTurn,
  roll,
} from "../test-utils";

describe("engine core loop", () => {
  it("creates an initial state with content hash and empty queue", () => {
    const state = makeGame();
    expect(state.players).toHaveLength(2);
    expect(state.tiles).toHaveLength(40);
    expect(state.phase).toBe("await-roll");
    expect(state.players[0]!.money).toBe(defaultEconomy.startingMoney);
    expect(state.players.every((player) => player.position === 0)).toBe(true);
    expect(state.chanceDeck).toHaveLength(12);
    expect(state.contentHash).toBe(content.contentHash);
    expect(state.queue).toEqual([]);
  });

  it("moves the player and requests a purchase decision", () => {
    const state = makeGame();
    const { state: next, events } = roll(state, [1, 2]);
    expect(next.players[0]!.position).toBe(3);
    expect(next.phase).toBe("await-decision");
    expect(next.pending?.kind).toBe("buy-property");
    const moved = events.find((event) => event.type === "token-moved");
    expect(moved).toMatchObject({ path: [1, 2, 3], passedStart: false });
    expect(events.some((event) => event.type === "decision-requested")).toBe(true);
  });

  it("buys a property and deducts money", () => {
    const rolled = roll(makeGame(), [1, 2]);
    const next = act(rolled.state, {
      type: "buy-property",
      playerId: P1,
    }).state;
    const tile = next.tiles[3]!;
    expect(tile.ownerId).toBe(P1);
    expect(next.players[0]!.money).toBe(
      defaultEconomy.startingMoney - 650,
    );
    expect(next.phase).toBe("action-window");
    expect(next.pending).toBeNull();
  });

  it("declines a purchase", () => {
    const rolled = roll(makeGame(), [1, 2]);
    const next = act(rolled.state, { type: "decline-buy", playerId: P1 }).state;
    expect(next.tiles[3]!.ownerId).toBeNull();
    expect(next.phase).toBe("action-window");
  });

  it("pays rent to the owner", () => {
    let state = makeGame();
    state = roll(state, [1, 2]).state;
    state = act(state, { type: "buy-property", playerId: P1 }).state;
    state = act(state, { type: "end-turn", playerId: P1 }).state;
    expect(state.turnSeat).toBe(1);
    const def = state.tileDefs[3]!;
    const expectedRent = def.rents![0]!;
    const paid = roll(state, [1, 2]);
    expect(paid.state.players[1]!.money).toBe(
      defaultEconomy.startingMoney - expectedRent,
    );
    expect(paid.state.players[0]!.money).toBe(
      defaultEconomy.startingMoney - 650 + expectedRent,
    );
    expect(paid.events.some((event) => event.type === "rent-paid")).toBe(true);
  });

  it("pays salary and start bonus when passing start", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.players[0]!.position = 38;
    const { state: next, events } = roll(state, [1, 1]);
    expect(next.players[0]!.position).toBe(0);
    expect(next.players[0]!.money).toBe(
      defaultEconomy.startingMoney +
        defaultEconomy.goSalary +
        defaultEconomy.startLandingBonus,
    );
    const moved = events.find((event) => event.type === "token-moved");
    expect(moved).toMatchObject({ passedStart: true });
    expect(next.phase).toBe("await-roll");
    expect(next.rollAgain).toBe(true);
  });

  it("jails a player after three doubles", () => {
    let state = makeGame();
    state = roll(state, [1, 1]).state;
    state = roll(state, [1, 1]).state;
    state = roll(state, [1, 1]).state;
    const player = state.players[0]!;
    expect(player.status).toBe("jailed");
    expect(player.position).toBe(10);
    expect(player.doublesStreak).toBe(0);
  });

  it("counts down jail turns and releases the player", () => {
    const state = makeGame();
    state.players[0]!.status = "jailed";
    state.players[0]!.statusTurns = 2;
    state.players[0]!.position = 10;

    const first = roll(state, [2, 3]).state;
    expect(first.players[0]!.status).toBe("jailed");
    expect(first.players[0]!.statusTurns).toBe(1);
    expect(first.turnSeat).toBe(1);

    const second = passTurn(roll(first, [2, 3]).state);
    expect(second.turnSeat).toBe(0);

    const third = roll(second, [2, 3]).state;
    expect(third.players[0]!.status).toBe("active");
    expect(third.turnSeat).toBe(1);
  });

  it("lets a jailed player pay bail", () => {
    const state = makeGame();
    state.players[0]!.status = "jailed";
    state.players[0]!.statusTurns = 2;
    state.players[0]!.position = 10;
    const next = act(state, { type: "pay-jail-fine", playerId: P1 }).state;
    expect(next.players[0]!.status).toBe("active");
    expect(next.players[0]!.money).toBe(
      defaultEconomy.startingMoney - defaultEconomy.jailFine,
    );
    expect(next.phase).toBe("await-roll");
  });

  it("ends the game when a player goes bankrupt", () => {
    const state = makeGame({
      economy: { transportRents: [50000, 50000, 50000, 50000] },
    });
    const target = state.tileDefs.findIndex((tile) => tile.kind === "transport");
    state.tiles[target]!.ownerId = P1;
    state.players[0]!.properties.push(state.tileDefs[target]!.id as never);
    state.turnSeat = 1;
    state.players[1]!.position = target - 3;
    const result = roll(state, [1, 2]);
    expect(result.state.players[1]!.status).toBe("bankrupt");
    expect(result.state.phase).toBe("finished");
    expect(result.state.winnerId).toBe(P1);
    expect(result.events.some((event) => event.type === "game-ended")).toBe(true);
  });

  it("rotates turns and counts rounds", () => {
    let state = makeGame({ playerCount: 3 });
    state = passTurn(roll(state, [2, 3]).state);
    expect(state.turnSeat).toBe(1);
    state = passTurn(roll(state, [2, 3]).state);
    expect(state.turnSeat).toBe(2);
    state = passTurn(roll(state, [2, 3]).state);
    expect(state.round).toBe(2);
    expect(state.turnSeat).toBe(0);
  });

  it("is deterministic for identical seeds and actions", () => {
    const a = makeGame({ seed: 777 });
    const b = makeGame({ seed: 777 });
    const a1 = roll(a, [3, 4]);
    const b1 = roll(b, [3, 4]);
    expect(a1.state).toEqual(b1.state);
    expect(a1.events).toEqual(b1.events);
  });

  it("upgrades an owned property", () => {
    let state = makeGame();
    state = roll(state, [1, 2]).state;
    state = act(state, { type: "buy-property", playerId: P1 }).state;
    const cost = state.tileDefs[3]!.upgradeCosts![0]!;
    state = act(state, {
      type: "upgrade-property",
      playerId: P1,
      tileIndex: 3,
    }).state;
    expect(state.tiles[3]!.level).toBe(1);
    expect(state.players[0]!.money).toBe(
      defaultEconomy.startingMoney - 650 - cost,
    );
  });

  it("blocks other actions while a decision is pending", () => {
    const rolled = roll(makeGame(), [1, 2]);
    expect(() => act(rolled.state, { type: "end-turn", playerId: P1 })).toThrowError(
      EngineError,
    );
    expect(() => act(rolled.state, { type: "roll-dice", playerId: P1 })).toThrowError(
      EngineError,
    );
  });

  it("rejects upgrading a property you do not own", () => {
    const state = makeGame();
    expect(() =>
      act(state, { type: "upgrade-property", playerId: P1, tileIndex: 3 }),
    ).toThrowError(EngineError);
  });

  it("rejects acting out of turn", () => {
    const state = makeGame();
    expect(() =>
      act(state, { type: "roll-dice", playerId: P2, forcedDice: [1, 1] }),
    ).toThrowError(EngineError);
  });

  it("does not stall when a jail break lands on costly rent (M1 regression)", () => {
    const state = makeGame({
      economy: { transportRents: [50000, 50000, 50000, 50000] },
    });
    const transport = state.tileDefs.findIndex((tile) => tile.kind === "transport");
    state.tiles[transport]!.ownerId = P1;
    state.players[0]!.properties.push(state.tileDefs[transport]!.id as never);
    state.turnSeat = 1;
    state.players[1]!.position = transport - 4;
    state.players[1]!.status = "jailed";
    state.players[1]!.statusTurns = 2;
    const result = roll(state, [2, 2]);
    expect(result.state.players[1]!.status).toBe("bankrupt");
    expect(result.state.phase).toBe("finished");
    expect(result.state.winnerId).toBe(P1);
  });

  it("advances past a bankrupt current player instead of stalling (M2 regression)", () => {
    const state = makeGame({
      playerCount: 3,
      economy: { transportRents: [50000, 50000, 50000, 50000] },
    });
    const transport = state.tileDefs.findIndex((tile) => tile.kind === "transport");
    state.tiles[transport]!.ownerId = P2;
    state.players[1]!.properties.push(state.tileDefs[transport]!.id as never);
    state.players[0]!.position = transport - 3;
    const result = roll(state, [1, 2]);
    expect(result.state.players[0]!.status).toBe("bankrupt");
    expect(result.state.phase).not.toBe("finished");
    expect(result.state.turnSeat).toBe(1);
    expect(result.state.phase).toBe("await-roll");
  });

  it("discounts mortgaged tiles in net worth (M3 regression)", () => {
    let state = makeGame();
    state = roll(state, [1, 2]).state;
    state = act(state, { type: "buy-property", playerId: P1 }).state;
    const before = netWorth(state, P1);
    state = act(state, {
      type: "mortgage-property",
      playerId: P1,
      tileIndex: 3,
    }).state;
    const after = netWorth(state, P1);
    expect(after).toBe(before);
    expect(after).toBe(
      defaultEconomy.startingMoney - 650 + Math.round(650 * 0.5) + Math.round(650 * 0.5),
    );
  });

  it("indexes transport rents by count (4-length table)", () => {
    const state = makeGame();
    const transports = state.tileDefs
      .map((tile, index) => ({ tile, index }))
      .filter((entry) => entry.tile.kind === "transport")
      .map((entry) => entry.index);
    for (const index of transports) {
      state.tiles[index]!.ownerId = P1;
    }
    state.turnSeat = 1;
    state.players[1]!.position = transports[0]! - 2;
    const result = roll(state, [1, 1]);
    expect(result.state.players[1]!.position).toBe(transports[0]);
    const expected =
      state.config.economy.transportRents[transports.length - 1] ?? 0;
    expect(result.state.players[1]!.money).toBe(
      defaultEconomy.startingMoney - expected,
    );
  });

  it("charges flat and percent-cash taxes", () => {
    const state = makeGame();
    const taxTiles = state.tileDefs
      .map((tile, index) => ({ tile, index }))
      .filter((entry) => entry.tile.kind === "tax");
    const percent = taxTiles.find((entry) => entry.tile.tax?.kind === "percent-cash")!;
    state.players[0]!.position = percent.index - 2;
    state.players[0]!.status = "active";
    const result = roll(state, [1, 1]);
    const rate = (percent.tile.tax as { rate: number }).rate;
    const expected = Math.round(
      defaultEconomy.startingMoney * rate,
    );
    expect(result.state.players[0]!.money).toBe(
      defaultEconomy.startingMoney - expected,
    );
  });

  it("hands out the start bonus when landing on start", () => {
    const state = makeGame({ characters: ["xue-ba", "xue-ba"] });
    state.players[0]!.position = 38;
    const result = roll(state, [1, 1]);
    expect(result.state.players[0]!.position).toBe(0);
    expect(result.state.players[0]!.money).toBe(
      defaultEconomy.startingMoney +
        defaultEconomy.goSalary +
        defaultEconomy.startLandingBonus,
    );
  });
});
