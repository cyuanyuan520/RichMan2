// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDecisionVisible } from "./use-director";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("useDecisionVisible", () => {
  it("stays hidden while the director is still animating", async () => {
    const { result } = renderHook(() => useDecisionVisible(true, true, 5000));
    await sleep(40);
    expect(result.current).toBe(false);
  });

  it("reveals once the animation queue drains", async () => {
    const { result, rerender } = renderHook(
      ({ busy }: { busy: boolean }) => useDecisionVisible(true, busy, 5000),
      { initialProps: { busy: true } },
    );
    expect(result.current).toBe(false);
    rerender({ busy: false });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("reveals after the grace timeout when animations never drain", async () => {
    const { result } = renderHook(() => useDecisionVisible(true, true, 40));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("resets when the decision goes away", async () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useDecisionVisible(active, false, 40),
      { initialProps: { active: true } },
    );
    await waitFor(() => expect(result.current).toBe(true));
    rerender({ active: false });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("stays hidden while a long animation queue keeps making progress", async () => {
    const { result, rerender } = renderHook(
      ({ progress }: { progress: number }) =>
        useDecisionVisible(true, true, 200, progress, "buy-property"),
      { initialProps: { progress: 0 } },
    );
    for (let step = 1; step <= 12; step += 1) {
      await sleep(60);
      rerender({ progress: step });
      expect(result.current).toBe(false);
    }
  });

  it("reveals when a stalled queue stops making progress", async () => {
    const { result } = renderHook(() => useDecisionVisible(true, true, 60, 5, "buy"));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("hides again when the decision identity changes", async () => {
    const { result, rerender } = renderHook(
      ({ identity }: { identity: string }) =>
        useDecisionVisible(true, false, 40, 0, identity),
      { initialProps: { identity: "buy-property" } },
    );
    await waitFor(() => expect(result.current).toBe(true));
    rerender({ identity: "raise-funds" });
    await waitFor(() => expect(result.current).toBe(false));
  });
});
