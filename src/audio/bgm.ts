"use client";

import { useGameStore } from "@/store/game-store";

export type BgmTrack = "double-sixes" | "top-hat-and-thimble";

const TRACKS: Record<BgmTrack, string> = {
  "double-sixes": "/assets/audio/bgm/double-sixes.mp3",
  "top-hat-and-thimble": "/assets/audio/bgm/top-hat-and-thimble.mp3",
};

export const TRACK_LABELS: Record<BgmTrack, string> = {
  "double-sixes": "双六进行曲",
  "top-hat-and-thimble": "礼帽与顶针",
};

let element: HTMLAudioElement | null = null;
let current: BgmTrack | null = null;

function ensureElement(): HTMLAudioElement | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!element) {
    element = new window.Audio();
    element.loop = true;
    element.preload = "none";
  }
  return element;
}

export function playBgm(track: BgmTrack): void {
  const audio = ensureElement();
  if (!audio) {
    return;
  }
  const volume = useGameStore.getState().settings.bgmVolume;
  if (current !== track) {
    audio.src = TRACKS[track];
    current = track;
  }
  audio.volume = volume;
  if (volume > 0) {
    void audio.play().catch(() => {
      // Autoplay policy: the track starts after the first user gesture.
    });
  }
}

export function applyBgmVolume(): void {
  const audio = ensureElement();
  if (!audio) {
    return;
  }
  const volume = useGameStore.getState().settings.bgmVolume;
  audio.volume = volume;
  if (volume <= 0) {
    audio.pause();
  } else if (current && audio.paused) {
    void audio.play().catch(() => {});
  }
}

export function stopBgm(): void {
  const audio = ensureElement();
  if (!audio) {
    return;
  }
  audio.pause();
  current = null;
}

export function currentTrack(): BgmTrack | null {
  return current;
}
