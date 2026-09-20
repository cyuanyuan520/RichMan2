import { describe, expect, it } from "vitest";
import type { GameSetup } from "@/game/core/types";
import { asMapId } from "@/game/core/ids";
import { buildGameContent, characters, economy, tokens } from "@/data/content";
import { HostSession } from "./host";

function makeSetup(): GameSetup {
  return {
    mapId: asMapId("ink"),
    seed: 99,
    targetRounds: 20,
    economy,
    players: [
      {
        name: "甲",
        characterId: characters[0].id,
        tokenId: tokens[0].id,
        isBot: true,
        botDifficulty: "easy",
      },
      {
        name: "乙",
        characterId: characters[1].id,
        tokenId: tokens[1].id,
        isBot: true,
        botDifficulty: "easy",
      },
    ],
  };
}

describe("host AI pacing", () => {
  it("honours paceMs between bot actions and keeps unpaced ticks instant", () => {
    const setup = makeSetup();
    const host = new HostSession(setup, buildGameContent(setup.mapId), { now: () => 0 });
    host.begin();

    expect(host.tick(1000, 1000)).toBe(true);
    const afterFirst = host.state!.seq;

    expect(host.tick(1100, 1000)).toBe(false);
    expect(host.state!.seq).toBe(afterFirst);

    expect(host.tick(2100, 1000)).toBe(true);
    const afterPaced = host.state!.seq;
    expect(afterPaced).toBeGreaterThan(afterFirst);

    expect(host.tick(2150)).toBe(true);
    expect(host.state!.seq).toBeGreaterThan(afterPaced);
  });

  it("autoPlayUntil ignores pacing for headless simulations", () => {
    const setup = makeSetup();
    const host = new HostSession(setup, buildGameContent(setup.mapId), { now: () => 0 });
    host.begin();
    const steps = host.autoPlayUntil((state) => state.phase === "finished", 4000);
    expect(steps).toBeGreaterThan(0);
    expect(host.state!.phase).toBe("finished");
  });
});
