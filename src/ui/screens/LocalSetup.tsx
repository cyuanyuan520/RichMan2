"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import type { BotDifficulty, CharacterId, GameSetup } from "@/game/core/types";
import { characters, economy, maps, tokens } from "@/data/content";
import { Button, Chip, SectionTitle } from "@/ui/components/primitives";
import { useGameStore } from "@/store/game-store";
import { cn } from "@/lib/format";
import { playSfx } from "@/audio/sfx";
import { playBgm } from "@/audio/bgm";
import type { MenuRoute } from "./MainMenu";

const DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: "简单",
  normal: "普通",
  hard: "困难",
};

const ROUND_OPTIONS = [0, 20, 30, 50];

export function LocalSetup({ onNavigate }: { onNavigate: (route: MenuRoute) => void }) {
  const settings = useGameStore((state) => state.settings);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const startLocal = useGameStore((state) => state.startLocal);

  const [mapId, setMapId] = useState(
    maps.some((map) => map.id === settings.defaultMapId)
      ? settings.defaultMapId
      : maps[0].id,
  );
  const [playerCount, setPlayerCount] = useState(3);
  const [difficulty, setDifficulty] = useState<BotDifficulty>(settings.defaultDifficulty);
  const [targetRounds, setTargetRounds] = useState(0);
  const [characterId, setCharacterId] = useState<CharacterId>(characters[0].id);
  const [tokenId, setTokenId] = useState<string>(tokens[0].id);

  const map = useMemo(() => maps.find((entry) => entry.id === mapId) ?? maps[0], [mapId]);

  const start = () => {
    const names = ["你", "阿福", "小满", "老周"];
    const setup: GameSetup = {
      mapId: map.id,
      seed: (Date.now() >>> 0) % 2147483647,
      targetRounds,
      economy,
      players: Array.from({ length: playerCount }).map((_, index) => ({
        name: index === 0 ? settings.playerName : names[index] ?? `电脑${index}`,
        characterId: index === 0 ? characterId : characters[(index * 2 + 1) % characters.length].id,
        tokenId: index === 0 ? tokenId : tokens[index % tokens.length].id,
        isBot: index !== 0,
        botDifficulty: difficulty,
      })),
    };
    updateSettings({ defaultMapId: map.id, defaultDifficulty: difficulty });
    playBgm("double-sixes");
    startLocal(setup, 0);
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <SectionTitle>单机人机</SectionTitle>
          <h1 className="mt-1 font-display text-3xl text-gold-300">对局设置</h1>
        </div>
        <Button tone="ghost" onClick={() => onNavigate("main")}>
          ← 返回主菜单
        </Button>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          <div className="space-y-3">
            <SectionTitle>选择地图</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {maps.map((entry) => (
                <motion.button
                  key={entry.id}
                  type="button"
                  whileHover={{ y: -3 }}
                  onClick={() => {
                    playSfx("click");
                    setMapId(entry.id);
                  }}
                  className={cn(
                    "overflow-hidden rounded-2xl border text-left transition-colors",
                    mapId === entry.id
                      ? "border-gold-400/70 ring-1 ring-gold-400/40"
                      : "border-white/10 hover:border-white/30",
                  )}
                >
                  <span className="relative block h-28">
                    <Image
                      src={entry.theme.backgroundImage}
                      alt={entry.name}
                      fill
                      sizes="33vw"
                      className="object-cover"
                    />
                  </span>
                  <span className="block space-y-1 p-3">
                    <span className="block font-display text-sm text-paper-50">
                      {entry.name}
                    </span>
                    <span className="block text-[11px] leading-snug text-paper-200/70">
                      {entry.description}
                    </span>
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <SectionTitle>玩家人数</SectionTitle>
            <div className="flex gap-2">
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setPlayerCount(count)}
                  className={cn(
                    "rounded-xl border px-5 py-2 text-sm transition-colors",
                    playerCount === count
                      ? "border-gold-400/70 bg-gold-500/12 text-gold-200"
                      : "border-white/12 text-paper-200/70 hover:border-white/30",
                  )}
                >
                  {count} 人
                  <span className="ml-1 text-[11px] text-paper-200/50">
                    （{count - 1} AI）
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <SectionTitle>AI 难度</SectionTitle>
              <div className="flex gap-2">
                {(["easy", "normal", "hard"] as BotDifficulty[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDifficulty(value)}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-sm transition-colors",
                      difficulty === value
                        ? "border-gold-400/70 bg-gold-500/12 text-gold-200"
                        : "border-white/12 text-paper-200/70 hover:border-white/30",
                    )}
                  >
                    {DIFFICULTY_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <SectionTitle>回合上限</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {ROUND_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTargetRounds(value)}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-sm transition-colors",
                      targetRounds === value
                        ? "border-gold-400/70 bg-gold-500/12 text-gold-200"
                        : "border-white/12 text-paper-200/70 hover:border-white/30",
                    )}
                  >
                    {value === 0 ? "不限" : `${value} 回合`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="panel space-y-3 p-4">
            <SectionTitle>你的角色</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {characters.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => setCharacterId(character.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors",
                    characterId === character.id
                      ? "border-gold-400/70 bg-gold-500/12"
                      : "border-white/10 hover:border-white/30",
                  )}
                >
                  <span className="text-lg">{character.avatar}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-paper-50">
                      {character.name}
                    </span>
                    <span className="block truncate text-[10px] text-paper-200/60">
                      {character.title}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-paper-200/70">
              {characters.find((entry) => entry.id === characterId)?.text}
            </p>
          </div>

          <div className="panel space-y-3 p-4">
            <SectionTitle>棋子</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {tokens.map((token) => (
                <button
                  key={token.id}
                  type="button"
                  onClick={() => setTokenId(token.id)}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl border text-lg transition-colors",
                    tokenId === token.id
                      ? "border-gold-400/70 bg-gold-500/12"
                      : "border-white/10 hover:border-white/30",
                  )}
                  title={token.name}
                >
                  {token.icon}
                </button>
              ))}
            </div>
          </div>

          <div className="panel space-y-2 p-4">
            <SectionTitle>开局概览</SectionTitle>
            <div className="flex flex-wrap gap-1.5 text-[11px] text-paper-200/75">
              <Chip>{map.name}</Chip>
              <Chip>{playerCount} 人</Chip>
              <Chip>{DIFFICULTY_LABEL[difficulty]}</Chip>
              <Chip>{targetRounds === 0 ? "不限回合" : `${targetRounds} 回合`}</Chip>
              <Chip>初始资金 ¥{economy.startingMoney.toLocaleString("zh-CN")}</Chip>
            </div>
            <Button tone="gold" size="lg" className="w-full" onClick={start}>
              🚩 开始对局
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
