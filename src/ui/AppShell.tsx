"use client";

import { useState } from "react";
import { useGameStore } from "@/store/game-store";
import { useNetStore } from "@/store/net-store";
import { MainMenu, type MenuRoute } from "./screens/MainMenu";
import { LocalSetup } from "./screens/LocalSetup";
import { OnlineLobby, OnlineChat } from "./screens/OnlineLobby";
import { RulesScreen, SettingsScreen } from "./screens/InfoScreens";
import { GameScreen } from "./game/GameScreen";
import { Button } from "@/ui/components/primitives";

export function AppShell() {
  const mode = useGameStore((state) => state.mode);
  const game = useGameStore((state) => state.game);
  const gameKey = useGameStore((state) => state.gameKey);
  const netStatus = useNetStore((state) => state.status);
  const [route, setRoute] = useState<MenuRoute>("main");

  if (game && (mode === "local" || mode === "online")) {
    return <GameScreen key={gameKey} />;
  }

  if (mode === "online" && netStatus !== "idle") {
    return <OnlineLobby onNavigate={setRoute} />;
  }

  switch (route) {
    case "setup":
      return <LocalSetup onNavigate={setRoute} />;
    case "online":
      return <OnlineLobby onNavigate={setRoute} />;
    case "rules":
      return <RulesScreen onNavigate={setRoute} />;
    case "settings":
      return <SettingsScreen onNavigate={setRoute} />;
    default:
      return <MainMenu onNavigate={setRoute} />;
  }
}

export function OnlineChatDock() {
  const mode = useGameStore((state) => state.mode);
  const [open, setOpen] = useState(false);
  if (mode !== "online") {
    return null;
  }
  return (
    <div className="fixed right-4 bottom-4 z-50 w-72">
      {open ? (
        <div className="panel flex max-h-96 flex-col gap-2 p-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs tracking-[0.25em] text-gold-300">
              好友频道
            </span>
            <Button size="sm" tone="ghost" onClick={() => setOpen(false)}>
              收起
            </Button>
          </div>
          <OnlineChat compact />
        </div>
      ) : (
        <Button tone="gold" className="w-full" onClick={() => setOpen(true)}>
          💬 聊天 / 表情
        </Button>
      )}
    </div>
  );
}
