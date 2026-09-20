// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSetup } from "@/game/core/types";
import { asMapId } from "@/game/core/ids";
import { characters, economy, tokens } from "@/data/content";
import { cancelPendingBotTimer, useGameStore } from "@/store/game-store";
import { useNetStore } from "@/store/net-store";
import { GameScreen } from "./GameScreen";

vi.mock("@/audio/bgm", () => ({
  playBgm: () => {},
  stopBgm: () => {},
  applyBgmVolume: () => {},
  currentTrack: () => null,
  TRACK_LABELS: {},
}));

vi.mock("@/audio/sfx", () => ({
  playSfx: () => {},
}));

function makeSetup(): GameSetup {
  return {
    mapId: asMapId("ink"),
    seed: 77,
    targetRounds: 20,
    economy,
    players: [
      { name: "我", characterId: characters[0].id, tokenId: tokens[0].id, isBot: false },
      { name: "电脑", characterId: characters[1].id, tokenId: tokens[1].id, isBot: true, botDifficulty: "easy" },
    ],
  };
}

beforeEach(() => {
  useNetStore.setState({ status: "idle" });
});

afterEach(() => {
  cancelPendingBotTimer();
  useGameStore.getState().backToMenu();
  useNetStore.getState().leave();
});

describe("game screen", () => {
  it("renders the board, players and action bar once the opening animation drains", async () => {
    render(<GameScreen />);
    useGameStore.getState().startLocal(makeSetup());

    await waitFor(() => expect(useGameStore.getState().fxQueue).toHaveLength(0), { timeout: 15000 });
    await waitFor(() => expect(screen.getAllByText("我").length).toBeGreaterThan(0), { timeout: 15000 });
    expect(screen.getAllByText("电脑").length).toBeGreaterThan(0);

    const roll = await screen.findByText(/掷骰子/, undefined, { timeout: 15000 });
    await waitFor(() => expect(roll.closest("button")?.disabled).toBe(false), { timeout: 15000 });

    const seqBefore = useGameStore.getState().game!.seq;
    fireEvent.click(roll.closest("button")!);
    await waitFor(
      () => expect(useGameStore.getState().game!.seq).toBeGreaterThan(seqBefore),
      { timeout: 5000 },
    );
  }, 20000);
});
