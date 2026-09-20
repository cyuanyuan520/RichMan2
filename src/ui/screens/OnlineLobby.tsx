"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { BotDifficulty } from "@/game/core/types";
import { characters, maps, tokens } from "@/data/content";
import { Button, Chip, SectionTitle } from "@/ui/components/primitives";
import { EMOTE_EMOJI, useNetStore } from "@/store/net-store";
import { EMOTE_IDS, MAX_CHAT_LENGTH } from "@/net/protocol";
import { cn } from "@/lib/format";
import { playSfx } from "@/audio/sfx";
import type { MenuRoute } from "./MainMenu";

export function OnlineLobby({ onNavigate }: { onNavigate: (route: MenuRoute) => void }) {
  const role = useNetStore((state) => state.role);
  const roomCode = useNetStore((state) => state.roomCode);
  const status = useNetStore((state) => state.status);
  const error = useNetStore((state) => state.error);
  const seats = useNetStore((state) => state.seats);
  const config = useNetStore((state) => state.lobbyConfig);
  const setLobbyConfig = useNetStore((state) => state.setLobbyConfig);
  const createRoom = useNetStore((state) => state.createRoom);
  const joinRoom = useNetStore((state) => state.joinRoom);
  const reconnect = useNetStore((state) => state.reconnect);
  const startGame = useNetStore((state) => state.startGame);
  const leave = useNetStore((state) => state.leave);

  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <SectionTitle>在线联机</SectionTitle>
          <h1 className="mt-1 font-display text-3xl text-gold-300">
            {role === null
              ? "创建或加入房间"
              : role === "host"
                ? "房间大厅（你是房主）"
                : "房间大厅"}
          </h1>
        </div>
        <Button
          tone="ghost"
          onClick={() => {
            leave();
            onNavigate("main");
          }}
        >
          ← 返回主菜单
        </Button>
      </header>

      {role === null ? (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="panel space-y-4 p-5">
            <SectionTitle>创建房间</SectionTitle>
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] text-paper-200/60">地图</p>
                <div className="grid grid-cols-3 gap-2">
                  {maps.map((map) => (
                    <button
                      key={map.id}
                      type="button"
                      onClick={() => setLobbyConfig({ mapId: map.id })}
                      className={cn(
                        "rounded-xl border px-2 py-2 text-[11px] transition-colors",
                        config.mapId === map.id
                          ? "border-gold-400/70 bg-gold-500/12 text-gold-200"
                          : "border-white/12 text-paper-200/70 hover:border-white/30",
                      )}
                    >
                      {map.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] text-paper-200/60">座位数（未加入的座位开局由 AI 接管）</p>
                <div className="flex gap-2">
                  {[2, 3, 4].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setLobbyConfig({ playerCount: count })}
                      className={cn(
                        "rounded-xl border px-4 py-2 text-xs transition-colors",
                        config.playerCount === count
                          ? "border-gold-400/70 bg-gold-500/12 text-gold-200"
                          : "border-white/12 text-paper-200/70 hover:border-white/30",
                      )}
                    >
                      {count} 人
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] text-paper-200/60">你的角色</p>
                <div className="grid grid-cols-3 gap-2">
                  {characters.map((character) => (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => setLobbyConfig({ characterId: character.id })}
                      className={cn(
                        "flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] transition-colors",
                        config.characterId === character.id
                          ? "border-gold-400/70 bg-gold-500/12 text-gold-200"
                          : "border-white/12 text-paper-200/70 hover:border-white/30",
                      )}
                    >
                      <span>{character.avatar}</span>
                      <span className="truncate">{character.name}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tokens.map((token) => (
                    <button
                      key={token.id}
                      type="button"
                      onClick={() => setLobbyConfig({ tokenId: token.id })}
                      title={token.name}
                      className={cn(
                        "grid h-8 w-8 place-items-center rounded-lg border text-base transition-colors",
                        config.tokenId === token.id
                          ? "border-gold-400/70 bg-gold-500/12"
                          : "border-white/12 hover:border-white/30",
                      )}
                    >
                      {token.icon}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] text-paper-200/60">AI 难度（补位与接管）</p>
                <div className="flex gap-2">
                  {(["easy", "normal", "hard"] as BotDifficulty[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLobbyConfig({ aiDifficulty: value })}
                      className={cn(
                        "rounded-xl border px-4 py-2 text-xs transition-colors",
                        config.aiDifficulty === value
                          ? "border-gold-400/70 bg-gold-500/12 text-gold-200"
                          : "border-white/12 text-paper-200/70 hover:border-white/30",
                      )}
                    >
                      {value === "easy" ? "简单" : value === "hard" ? "困难" : "普通"}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                tone="gold"
                size="lg"
                className="w-full"
                disabled={status === "connecting"}
                onClick={() => {
                  playSfx("click");
                  createRoom();
                }}
              >
                {status === "connecting" ? "正在创建…" : "创建房间"}
              </Button>
            </div>
          </section>

          <section className="panel space-y-4 p-5">
            <SectionTitle>加入房间</SectionTitle>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 5))}
              placeholder="输入 5 位房间号"
              className="w-full rounded-xl border border-white/15 bg-ink-950/60 px-3 py-3 text-center font-display text-2xl tracking-[0.4em] text-gold-200 outline-none focus:border-gold-400/60"
            />
            <Button
              tone="jade"
              size="lg"
              className="w-full"
              disabled={status === "connecting" || code.trim().length < 5}
              onClick={() => {
                playSfx("click");
                joinRoom(code);
              }}
            >
              {status === "connecting" ? "正在连接…" : "加入房间"}
            </Button>
            {error ? (
              <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
                {error}
              </p>
            ) : null}
            <p className="text-[11px] leading-relaxed text-paper-200/60">
              联机使用 PeerJS 点对点连接：房主为唯一权威，支持断线重连（本地保存房间令牌）、
              快捷聊天与表情。房间号由房主分享给好友。
            </p>
          </section>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <SectionTitle>座位</SectionTitle>
              {status === "connecting" ? (
                <span className="text-[11px] text-paper-200/60">连接信令服务器…</span>
              ) : (
                <span className="text-[11px] text-paper-200/60">
                  {seats.filter((seat) => seat.claimed && !seat.isBot).length} 名玩家已加入
                </span>
              )}
            </div>
            <div className="space-y-2">
              {seats.map((seat, index) => {
                const character = characters.find((entry) => entry.id === seat.characterId);
                const token = tokens.find((entry) => entry.id === seat.tokenId);
                return (
                  <motion.div
                    layout
                    key={seat.playerId}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2",
                      seat.claimed && !seat.isBot
                        ? "border-jade-500/40 bg-jade-500/10"
                        : "border-white/10 bg-white/[0.03]",
                    )}
                  >
                    <span className="w-5 text-center text-[11px] text-paper-200/50">
                      {index + 1}
                    </span>
                    <span className="text-lg">{token?.icon ?? "🎲"}</span>
                    <span className="flex-1 truncate text-sm text-paper-50">
                      {seat.name}
                      {index === 0 ? "（房主）" : ""}
                    </span>
                    <Chip>{character?.name ?? "角色"}</Chip>
                    {seat.isBot ? (
                      <Chip color="#7ec8e3">AI</Chip>
                    ) : seat.claimed ? (
                      <Chip color="#3aa07d">已就位</Chip>
                    ) : (
                      <Chip>等待加入</Chip>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {role === "host" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  tone="gold"
                  size="lg"
                  disabled={status !== "lobby"}
                  onClick={() => {
                    playSfx("click");
                    startGame();
                  }}
                >
                  🚩 开始对局
                </Button>
                <span className="text-[11px] text-paper-200/60">
                  空座位将由 AI 接管，对局中掉线也会由 AI 暂代。
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-paper-200/60">等待房主开始对局…</p>
            )}

            {error ? (
              <div className="flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2">
                <span className="flex-1 text-[11px] text-rose-200">{error}</span>
                {status === "closed" || status === "error" ? (
                  <Button
                    size="sm"
                    tone="ghost"
                    onClick={() => {
                      playSfx("click");
                      reconnect();
                    }}
                  >
                    重连
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="panel flex max-h-[32rem] flex-col space-y-3 p-5">
            <div className="flex items-center justify-between">
              <SectionTitle>房间号</SectionTitle>
              <button
                type="button"
                onClick={() => {
                  if (roomCode && typeof navigator !== "undefined") {
                    void navigator.clipboard?.writeText(roomCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }
                }}
                className="rounded-lg border border-gold-400/40 bg-gold-500/10 px-2 py-0.5 text-[10px] text-gold-200"
              >
                {copied ? "已复制" : "复制"}
              </button>
            </div>
            <p className="text-center font-display text-4xl tracking-[0.4em] text-gold-300">
              {roomCode}
            </p>
            <OnlineChat />
          </section>
        </div>
      )}
    </div>
  );
}

export function OnlineChat({ compact = false }: { compact?: boolean }) {
  const chat = useNetStore((state) => state.chat);
  const sendChat = useNetStore((state) => state.sendChat);
  const sendEmote = useNetStore((state) => state.sendEmote);
  const emote = useNetStore((state) => state.emote);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        className={cn(
          "min-h-0 flex-1 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-ink-950/40 p-2",
          compact ? "max-h-40" : "max-h-72",
        )}
      >
        {chat.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-paper-200/40">
            打个招呼吧 👋
          </p>
        ) : (
          chat.map((line) => (
            <div key={line.id} className="text-[11px] leading-snug">
              <span className="text-gold-300">{line.fromName}</span>
              <span className="text-paper-200/80">：{line.text}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-1.5">
        {EMOTE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => sendEmote(id)}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/12 bg-white/[0.04] text-sm transition-colors hover:border-gold-400/40 hover:bg-gold-500/10"
            title={id}
          >
            {EMOTE_EMOJI[id]}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          maxLength={MAX_CHAT_LENGTH}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              sendChat(text);
              setText("");
            }
          }}
          placeholder="输入消息，回车发送"
          className="flex-1 rounded-xl border border-white/15 bg-ink-950/60 px-3 py-2 text-xs text-paper-50 outline-none focus:border-gold-400/60"
        />
        <Button
          size="sm"
          tone="ghost"
          onClick={() => {
            sendChat(text);
            setText("");
          }}
        >
          发送
        </Button>
      </div>
      {emote ? (
        <motion.div
          key={emote.id}
          initial={{ opacity: 0, scale: 0.7, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="rounded-xl border border-gold-400/30 bg-gold-500/10 px-3 py-1.5 text-center text-[11px] text-gold-200"
        >
          {emote.fromName} {EMOTE_EMOJI[emote.emoteId]}
        </motion.div>
      ) : null}
    </div>
  );
}

