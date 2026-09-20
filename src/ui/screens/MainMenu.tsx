"use client";

import { useEffect } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { maps, characters, items } from "@/data/content";
import { Button, Chip } from "@/ui/components/primitives";
import { useGameStore } from "@/store/game-store";
import { playSfx } from "@/audio/sfx";
import { stopBgm } from "@/audio/bgm";

export type MenuRoute = "main" | "setup" | "online" | "rules" | "settings";

export function MainMenu({
  onNavigate,
}: {
  onNavigate: (route: MenuRoute) => void;
}) {
  const lastSetup = useGameStore((state) => state.lastSetup);
  const startLocal = useGameStore((state) => state.startLocal);

  useEffect(() => {
    stopBgm();
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-25"
        style={{ backgroundImage: `url(${maps[0]?.theme.backgroundImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/70 via-ink-950/85 to-ink-950" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-14">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="text-center"
        >
          <p className="font-display text-sm tracking-[0.6em] text-gold-400/80">
            神州风云 · RICHMAN
          </p>
          <h1 className="mt-4 font-display text-6xl leading-tight">
            <span className="gold-text">大富翁</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper-200/80">
            水墨江南、老街旧梦、中国之旅三张画卷；机遇与命运卡、十种道具、
            六位角色技能、AI 补位与 PeerJS 实时联机。
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Button size="lg" tone="gold" onClick={() => onNavigate("setup")}>
            🎮 单机人机
          </Button>
          <Button
            size="lg"
            onClick={() => {
              playSfx("click");
              onNavigate("online");
            }}
          >
            🌐 在线联机
          </Button>
          {lastSetup ? (
            <Button
              size="lg"
              tone="jade"
              onClick={() => {
                playSfx("click");
                startLocal({ ...lastSetup, seed: (Date.now() >>> 0) % 2147483647 });
              }}
            >
              ⏩ 再来一局
            </Button>
          ) : null}
          <Button size="lg" tone="ghost" onClick={() => onNavigate("rules")}>
            📜 游戏规则
          </Button>
          <Button size="lg" tone="ghost" onClick={() => onNavigate("settings")}>
            ⚙️ 设置
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="mt-14 grid w-full grid-cols-1 gap-4 sm:grid-cols-3"
        >
          {maps.map((map) => (
            <article
              key={map.id}
              className="panel group overflow-hidden transition-transform hover:-translate-y-1"
            >
              <div className="relative h-40 overflow-hidden">
                <Image
                  src={map.theme.backgroundImage}
                  alt={map.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
                <span className="absolute bottom-2 left-3 font-display text-lg text-gold-200">
                  {map.name}
                </span>
              </div>
              <div className="space-y-2 p-4">
                <p className="text-xs leading-relaxed text-paper-200/75">{map.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {map.tags.slice(0, 4).map((tag) => (
                    <Chip key={tag}>{tag}</Chip>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </motion.div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[11px] text-paper-200/50">
          <span>🗺️ {maps.length} 张地图</span>
          <span>🧑 {characters.length} 位角色</span>
          <span>🎒 {items.length} 种道具</span>
          <span>🌐 PeerJS 联机 · 断线重连 · AI 补位</span>
        </div>
      </div>
    </div>
  );
}
