import type { BotDifficulty } from "@/game/core/types";

export interface AppSettings {
  playerName: string;
  defaultMapId: string;
  defaultDifficulty: BotDifficulty;
  aiSpeed: "slow" | "normal" | "fast";
  bgmVolume: number;
  sfxVolume: number;
  showHints: boolean;
}

export const defaultSettings: AppSettings = {
  playerName: "玩家",
  defaultMapId: "ink",
  defaultDifficulty: "normal",
  aiSpeed: "normal",
  bgmVolume: 0.5,
  sfxVolume: 0.7,
  showHints: true,
};

const STORAGE_KEY = "richman2.settings.v1";

function clamp01(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") {
    return { ...defaultSettings };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaultSettings };
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      playerName:
        typeof parsed.playerName === "string" && parsed.playerName.trim().length > 0
          ? parsed.playerName.trim().slice(0, 12)
          : defaultSettings.playerName,
      defaultMapId:
        typeof parsed.defaultMapId === "string"
          ? parsed.defaultMapId
          : defaultSettings.defaultMapId,
      defaultDifficulty:
        parsed.defaultDifficulty === "easy" ||
        parsed.defaultDifficulty === "hard" ||
        parsed.defaultDifficulty === "normal"
          ? parsed.defaultDifficulty
          : defaultSettings.defaultDifficulty,
      aiSpeed:
        parsed.aiSpeed === "slow" || parsed.aiSpeed === "fast"
          ? parsed.aiSpeed
          : defaultSettings.aiSpeed,
      bgmVolume: clamp01(parsed.bgmVolume, defaultSettings.bgmVolume),
      sfxVolume: clamp01(parsed.sfxVolume, defaultSettings.sfxVolume),
      showHints:
        typeof parsed.showHints === "boolean"
          ? parsed.showHints
          : defaultSettings.showHints,
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode / quota) — settings stay in memory.
  }
}

export function aiDelayMs(speed: AppSettings["aiSpeed"]): number {
  switch (speed) {
    case "slow":
      return 2000;
    case "fast":
      return 700;
    default:
      return 1300;
  }
}
