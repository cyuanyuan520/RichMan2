"use client";

import { useGameStore } from "@/store/game-store";

export type SfxName =
  | "dice"
  | "step"
  | "money-in"
  | "money-out"
  | "buy"
  | "card"
  | "jail"
  | "win"
  | "click"
  | "error"
  | "lottery";

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      return null;
    }
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

interface ToneSpec {
  type: OscillatorType;
  freq: number;
  to?: number;
  duration: number;
  gain: number;
  delay?: number;
}

function tone(context: AudioContext, spec: ToneSpec, volume: number): void {
  const start = context.currentTime + (spec.delay ?? 0);
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freq, start);
  if (spec.to && spec.to !== spec.freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, spec.to), start + spec.duration);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, spec.gain * volume), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + spec.duration);
  osc.connect(gain).connect(context.destination);
  osc.start(start);
  osc.stop(start + spec.duration + 0.02);
}

const RECIPES: Record<SfxName, ToneSpec[]> = {
  dice: [
    { type: "triangle", freq: 240, to: 120, duration: 0.12, gain: 0.5 },
    { type: "triangle", freq: 320, to: 140, duration: 0.12, gain: 0.4, delay: 0.1 },
    { type: "square", freq: 180, to: 90, duration: 0.1, gain: 0.25, delay: 0.2 },
  ],
  step: [{ type: "sine", freq: 520, to: 660, duration: 0.07, gain: 0.22 }],
  "money-in": [
    { type: "sine", freq: 880, duration: 0.1, gain: 0.32 },
    { type: "sine", freq: 1320, duration: 0.14, gain: 0.26, delay: 0.08 },
  ],
  "money-out": [
    { type: "sawtooth", freq: 420, to: 180, duration: 0.2, gain: 0.3 },
  ],
  buy: [
    { type: "triangle", freq: 660, duration: 0.1, gain: 0.3 },
    { type: "triangle", freq: 990, duration: 0.16, gain: 0.28, delay: 0.09 },
  ],
  card: [
    { type: "sine", freq: 700, to: 1400, duration: 0.22, gain: 0.24 },
  ],
  jail: [
    { type: "square", freq: 160, to: 60, duration: 0.42, gain: 0.3 },
    { type: "sawtooth", freq: 90, duration: 0.4, gain: 0.22, delay: 0.06 },
  ],
  win: [
    { type: "triangle", freq: 660, duration: 0.16, gain: 0.32 },
    { type: "triangle", freq: 880, duration: 0.16, gain: 0.32, delay: 0.14 },
    { type: "triangle", freq: 1320, duration: 0.3, gain: 0.3, delay: 0.28 },
  ],
  click: [{ type: "sine", freq: 480, duration: 0.05, gain: 0.18 }],
  error: [{ type: "square", freq: 200, to: 130, duration: 0.22, gain: 0.24 }],
  lottery: [
    { type: "triangle", freq: 520, to: 1040, duration: 0.18, gain: 0.26 },
    { type: "triangle", freq: 780, to: 1560, duration: 0.26, gain: 0.22, delay: 0.16 },
  ],
};

export function playSfx(name: SfxName): void {
  const context = audioContext();
  if (!context) {
    return;
  }
  const volume = useGameStore.getState().settings.sfxVolume;
  if (volume <= 0) {
    return;
  }
  for (const spec of RECIPES[name]) {
    tone(context, spec, volume);
  }
}
