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
});
