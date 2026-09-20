import { describe, expect, it } from "vitest";
import type { EconomyConfig, GameState } from "./types";
import { EngineError } from "./errors";
import { asPlayerId } from "./ids";
import { createGameState, type GameContent } from "./state";
import { reduce } from "./reducer";
import { inkMap } from "@/data/maps/ink";
import { defaultEconomy } from "@/data/content/economy";
import { chanceCards, fateCards } from "@/data/content/cards";
import { characterDefs } from "@/data/content/characters";

const P1 = asPlayerId("p1");
const P2 = asPlayerId("p2");

const content: GameContent = {
  map: inkMap,
  chanceDeck: chanceCards.map((card) => card.id),
  fateDeck: fateCards.map((card) => card.id),
};

function makeGame(options?: {
  playerCount?: number;
  economy?: Partial<EconomyConfig>;
  seed?: number;
  targetRounds?: number;
}): GameState {
  const playerCount = options?.playerCount ?? 2;
  const economy = { ...defaultEconomy, ...options?.economy };
  return createGameState(
    {
      mapId: inkMap.id,
      players: Array.from({ length: playerCount }, (_, index) => ({
        name: `玩家${index + 1}`,
        characterId: characterDefs[index]!.id,
        tokenId: `token-${index}`,
        isBot: false,
      })),
      seed: options?.seed ?? 42,
      targetRounds: options?.targetRounds ?? 0,
      economy,
    },
    content,
  );
}

function roll(
  state: GameState,
  dice: [number, number],
): { state: GameState; events: ReturnType<typeof reduce>["events"] } {
  const result = reduce(state, {
    type: "roll-dice",
    playerId: state.players[state.turnSeat]!.id,
    forcedDice: dice,
  });
  return result;
}

function passTurn(state: GameState): GameState {
  const playerId = state.players[state.turnSeat]!.id;
  let next = state;
  if (next.pending?.kind === "buy-property") {
    next = reduce(next, { type: "decline-buy", playerId }).state;
  }
  return reduce(next, { type: "end-turn", playerId }).state;
}

describe("engine core loop", () => {
  it("creates an initial state", () => {
    const state = makeGame();
    expect(state.players).toHaveLength(2);
    expect(state.tiles).toHaveLength(40);
    expect(state.phase).toBe("await-roll");
    expect(state.players[0]!.money).toBe(defaultEconomy.startingMoney);
    expect(state.players.every((player) => player.position === 0)).toBe(true);
    expect(state.chanceDeck).toHaveLength(chanceCards.length);
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
    const state = makeGame();
    const rolled = roll(state, [1, 2]);
    const next = reduce(rolled.state, {
      type: "buy-property",
      playerId: rolled.state.players[0]!.id,
    }).state;
    const tile = next.tiles[3]!;
    expect(tile.ownerId).toBe(P1);
    expect(next.players[0]!.money).toBe(defaultEconomy.startingMoney - 650);
    expect(next.phase).toBe("action-window");
    expect(next.pending).toBeNull();
  });

  it("declines a purchase", () => {
    const state = makeGame();
    const rolled = roll(state, [1, 2]);
    const next = reduce(rolled.state, {
      type: "decline-buy",
      playerId: rolled.state.players[0]!.id,
    }).state;
    expect(next.tiles[3]!.ownerId).toBeNull();
    expect(next.phase).toBe("action-window");
  });

  it("pays rent to the owner", () => {
    let state = makeGame();
    state = roll(state, [1, 2]).state;
    state = reduce(state, { type: "buy-property", playerId: P1 }).state;
    state = reduce(state, { type: "end-turn", playerId: P1 }).state;
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
    const state = makeGame();
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
    let state = makeGame();
    state.players[0]!.status = "jailed";
    state.players[0]!.statusTurns = 2;
    state.players[0]!.position = 10;

    state = roll(state, [2, 3]).state;
    expect(state.players[0]!.status).toBe("jailed");
    expect(state.players[0]!.statusTurns).toBe(1);
    expect(state.turnSeat).toBe(1);

    state = passTurn(roll(state, [2, 3]).state);
    expect(state.turnSeat).toBe(0);

    state = roll(state, [2, 3]).state;
    expect(state.players[0]!.status).toBe("active");
    expect(state.turnSeat).toBe(1);
  });

  it("lets a jailed player pay bail", () => {
    let state = makeGame();
    state.players[0]!.status = "jailed";
    state.players[0]!.statusTurns = 2;
    state.players[0]!.position = 10;
    state = reduce(state, { type: "pay-jail-fine", playerId: P1 }).state;
    expect(state.players[0]!.status).toBe("active");
    expect(state.players[0]!.money).toBe(
      defaultEconomy.startingMoney - defaultEconomy.jailFine,
    );
    expect(state.phase).toBe("await-roll");
  });

  it("ends the game when a player goes bankrupt", () => {
    let state = makeGame({
      economy: { transportRents: [0, 50000, 50000, 50000, 50000] },
    });
    state = roll(state, [2, 3]).state;
    expect(state.pending?.kind).toBe("buy-property");
    state = reduce(state, { type: "buy-property", playerId: P1 }).state;
    state = reduce(state, { type: "end-turn", playerId: P1 }).state;
    const result = roll(state, [2, 3]);
    state = result.state;
    expect(state.players[1]!.status).toBe("bankrupt");
    expect(state.phase).toBe("finished");
    expect(state.winnerId).toBe(P1);
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
    state = reduce(state, { type: "buy-property", playerId: P1 }).state;
    const cost = state.tileDefs[3]!.upgradeCosts![0]!;
    state = reduce(state, {
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
    const state = makeGame();
    const rolled = roll(state, [1, 2]);
    expect(() =>
      reduce(rolled.state, { type: "end-turn", playerId: P1 }),
    ).toThrowError(EngineError);
    expect(() =>
      reduce(rolled.state, { type: "roll-dice", playerId: P1 }),
    ).toThrowError(EngineError);
  });

  it("rejects upgrading a property you do not own", () => {
    const state = makeGame();
    expect(() =>
      reduce(state, { type: "upgrade-property", playerId: P1, tileIndex: 3 }),
    ).toThrowError(EngineError);
  });

  it("rejects acting out of turn", () => {
    const state = makeGame();
    expect(() =>
      reduce(state, { type: "roll-dice", playerId: P2, forcedDice: [1, 1] }),
    ).toThrowError(EngineError);
  });
});
