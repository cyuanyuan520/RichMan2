"use client";

import { useState } from "react";
import type { BotDifficulty } from "@/game/core/types";
import { characters, economy, items, maps } from "@/data/content";
import { Button, Chip, SectionTitle } from "@/ui/components/primitives";
import { useGameStore } from "@/store/game-store";
import { applyBgmVolume } from "@/audio/bgm";
import type { MenuRoute } from "./MainMenu";

export function RulesScreen({ onNavigate }: { onNavigate: (route: MenuRoute) => void }) {
  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <SectionTitle>规则手册</SectionTitle>
          <h1 className="mt-1 font-display text-3xl text-gold-300">怎么玩</h1>
        </div>
        <Button tone="ghost" onClick={() => onNavigate("main")}>
          ← 返回主菜单
        </Button>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <RuleCard title="回合流程" icon="🎲">
          <li>掷两枚骰子前进，落在无主地产可购买，落在他人地产需付过路费。</li>
          <li>掷出双数可再掷一次；连续三次双数直接入狱。</li>
          <li>经过起点 +{economy.goSalary}，正好停在起点再 +{economy.startLandingBonus}。</li>
          <li>回合内可升级 / 变卖 / 抵押地产，整理完毕后结束回合。</li>
        </RuleCard>
        <RuleCard title="经济与地产" icon="🏠">
          <li>初始资金 ¥{economy.startingMoney.toLocaleString("zh-CN")}，地产共 8 组 22 块。</li>
          <li>集齐同组地产，该组租金 ×{economy.groupMonopolyRentBonus}。</li>
          <li>交通枢纽按持有点数收租；公共事业按骰子点数倍数收费。</li>
          <li>抵押得地价 {Math.round(economy.mortgageRefundRate * 100)}%，赎回多付 {(economy.mortgageInterest * 100).toFixed(0)}% 利息。</li>
          <li>变卖建筑返还投入的 {Math.round(economy.sellRefundRate * 100)}%，需先拆完建筑才能抵押。</li>
        </RuleCard>
        <RuleCard title="欠款与破产" icon="💸">
          <li>现金不足以支付时进入「筹集欠款」：变卖或抵押直到补足。</li>
          <li>现金回正自动结清；全部资产变卖仍不足则自动破产。</li>
          <li>破产后资产回归银行，现金转给债主，道具清空。</li>
        </RuleCard>
        <RuleCard title="特殊格子" icon="✨">
          <li>机遇 / 命运：抽卡结算（红包、罚款、维修、住院、入狱、均富等）。</li>
          <li>监狱：暂停行动，可缴 ¥{economy.jailFine} 保释或掷双数越狱。</li>
          <li>医院：住院 {economy.hospitalTurns} 回合；税务局按规则征税。</li>
          <li>道具店购买道具；彩票行每回合限购一张（¥{economy.lotteryTicketPrice}）。</li>
        </RuleCard>
        <RuleCard title="道具" icon="🎒">
          {items.map((item) => (
            <li key={item.id}>
              <b className="text-paper-100">
                {item.icon} {item.name}
              </b>
              ：{item.text}
            </li>
          ))}
        </RuleCard>
        <RuleCard title="角色技能" icon="🧑">
          {characters.map((character) => (
            <li key={character.id}>
              <b className="text-paper-100">
                {character.avatar} {character.name}
              </b>
              ：{character.text}
            </li>
          ))}
        </RuleCard>
      </div>

      <div className="mt-6 panel space-y-2 p-4">
        <SectionTitle>地图</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {maps.map((map) => (
            <Chip key={map.id}>
              {map.name} · {map.description}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function RuleCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-4">
      <h2 className="flex items-center gap-2 font-display text-base text-gold-300">
        <span>{icon}</span>
        {title}
      </h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-paper-200/80">
        {children}
      </ul>
    </section>
  );
}

export function SettingsScreen({ onNavigate }: { onNavigate: (route: MenuRoute) => void }) {
  const settings = useGameStore((state) => state.settings);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const [name, setName] = useState(settings.playerName);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <SectionTitle>偏好设置</SectionTitle>
          <h1 className="mt-1 font-display text-3xl text-gold-300">设置</h1>
        </div>
        <Button tone="ghost" onClick={() => onNavigate("main")}>
          ← 返回主菜单
        </Button>
      </header>

      <div className="mt-8 space-y-4">
        <section className="panel space-y-3 p-4">
          <SectionTitle>玩家名称</SectionTitle>
          <div className="flex gap-2">
            <input
              value={name}
              maxLength={12}
              onChange={(event) => setName(event.target.value)}
              className="flex-1 rounded-xl border border-white/15 bg-ink-950/60 px-3 py-2 text-sm text-paper-50 outline-none focus:border-gold-400/60"
              placeholder="输入昵称"
            />
            <Button
              tone="gold"
              onClick={() => {
                const trimmed = name.trim() || "玩家";
                setName(trimmed);
                updateSettings({ playerName: trimmed });
              }}
            >
              保存
            </Button>
          </div>
        </section>

        <section className="panel space-y-3 p-4">
          <SectionTitle>对局默认值</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {maps.map((map) => (
              <button
                key={map.id}
                type="button"
                onClick={() => updateSettings({ defaultMapId: map.id })}
                className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
                  settings.defaultMapId === map.id
                    ? "border-gold-400/70 bg-gold-500/12 text-gold-200"
                    : "border-white/12 text-paper-200/70 hover:border-white/30"
                }`}
              >
                {map.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["easy", "normal", "hard"] as BotDifficulty[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => updateSettings({ defaultDifficulty: value })}
                className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
                  settings.defaultDifficulty === value
                    ? "border-gold-400/70 bg-gold-500/12 text-gold-200"
                    : "border-white/12 text-paper-200/70 hover:border-white/30"
                }`}
              >
                AI {value === "easy" ? "简单" : value === "hard" ? "困难" : "普通"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["slow", "慢速"],
                ["normal", "标准"],
                ["fast", "快速"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => updateSettings({ aiSpeed: value })}
                className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
                  settings.aiSpeed === value
                    ? "border-gold-400/70 bg-gold-500/12 text-gold-200"
                    : "border-white/12 text-paper-200/70 hover:border-white/30"
                }`}
              >
                AI 速度 · {label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel space-y-4 p-4">
          <SectionTitle>声音</SectionTitle>
          <VolumeRow
            label="背景音乐"
            value={settings.bgmVolume}
            onChange={(value) => {
              updateSettings({ bgmVolume: value });
              applyBgmVolume();
            }}
          />
          <VolumeRow
            label="音效"
            value={settings.sfxVolume}
            onChange={(value) => updateSettings({ sfxVolume: value })}
          />
        </section>

        <section className="panel space-y-3 p-4">
          <SectionTitle>提示</SectionTitle>
          <button
            type="button"
            onClick={() => updateSettings({ showHints: !settings.showHints })}
            className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
              settings.showHints
                ? "border-jade-500/50 bg-jade-500/12 text-emerald-200"
                : "border-white/12 text-paper-200/60"
            }`}
          >
            {settings.showHints ? "已开启操作提示" : "已关闭操作提示"}
          </button>
        </section>
      </div>
    </div>
  );
}

function VolumeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-xs text-paper-200/80">
      <span className="w-20">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 accent-[#e0b64f]"
      />
      <span className="w-10 text-right text-paper-100">{Math.round(value * 100)}</span>
    </label>
  );
}
