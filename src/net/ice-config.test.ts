// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { iceConfig } from "./peer-transport";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("iceConfig", () => {
  it("returns nothing when no ICE or key env vars are set", () => {
    expect(iceConfig()).toEqual({});
  });

  it("nests ICE servers under config so PeerJS actually applies them", () => {
    const servers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "turn:turn.example.com:3478", username: "u", credential: "p" },
    ];
    vi.stubEnv("NEXT_PUBLIC_ICE_SERVERS", JSON.stringify(servers));

    const config = iceConfig();
    expect(config.config?.iceServers).toEqual(servers);
    expect((config as Record<string, unknown>).iceServers).toBeUndefined();
  });

  it("passes the broker key through as a top-level option", () => {
    vi.stubEnv("NEXT_PUBLIC_PEERJS_KEY", "my-peer-key");
    expect(iceConfig()).toEqual({ key: "my-peer-key" });
  });

  it("ignores malformed JSON instead of throwing", () => {
    vi.stubEnv("NEXT_PUBLIC_ICE_SERVERS", "{not json");
    expect(iceConfig()).toEqual({});
  });
});
