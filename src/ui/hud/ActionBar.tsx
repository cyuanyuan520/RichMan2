"use client";

import type {
  GameAction,
  GameContent,
  GameState,
  ItemInstanceId,
  PlayerId,
  TileDef,
} from "@/game/core/types";
import { getLegalActions } from "@/game/selectors";
import { formatMoney } from "@/lib/format";
import { Button, SectionTitle } from "@/ui/components/primitives";
import { cn } from "@/lib/format";

function has(actions: GameAction[], type: GameAction["type"]): boolean {
  return actions.some((action) => action.type === type);
}

export function ActionBar({
  state,
  content,
  localPlayerId,
  isActor,
  busy,
  onOpenShop,
  onOpenLottery,
  onEndTurn,
  onPayBail,
  onRoll,
}: {
  state: GameState;
  content: GameContent;
  localPlayerId: PlayerId | null;
  isActor: boolean;
  busy: boolean;
  onOpenShop: () => void;
  onOpenLottery: () => void;
  onEndTurn: () => void;
  onPayBail: () => void;
  onRoll: () => void;
}) {
  if (!localPlayerId) {
    return null;
  }
  const actions = getLegalActions(state, content, localPlayerId);
  const player = state.players.find((entry) => entry.id === localPlayerId);
  const here = state.tileDefs[player?.position ?? 0] as TileDef | undefined;

  if (state.phase === "finished") {
    return null;
  }

  if (!isActor) {
    const actor = state.players.find((entry) =>
      state.pending ? entry.id === state.pending.playerId : entry.seat === state.turnSeat,
    );
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-paper-200/70">
        等待 <span className="text-gold-300">{actor?.name ?? "对手"}</span>{" "}
        {actor?.isBot ? "思考中…" : "行动…"}
      </div>
    );
  }

  const canRoll = has(actions, "roll-dice");
  const canEnd = has(actions, "end-turn");
  const canBail = has(actions, "pay-jail-fine");
  const canShop = has(actions, "buy-item");
  const canLottery = has(actions, "buy-lottery");
  const jailed = player?.status === "jailed";

  return (
    <div className="space-y-2.5 rounded-2xl border border-gold-400/25 bg-gold-500/[0.06] p-3">
      <div className="flex items-center justify-between">
        <SectionTitle>你的行动</SectionTitle>
        <span className="text-[11px] text-paper-200/70">
          {state.phase === "await-roll"
            ? "掷骰前进"
            : state.phase === "await-decision"
              ? "请做出选择"
              : "可整理资产后结束回合"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {canRoll ? (
          <Button tone="gold" size="lg" disabled={busy} onClick={onRoll}>
            🎲 掷骰子
          </Button>
        ) : null}
        {canBail ? (
          <Button tone="jade" disabled={busy} onClick={onPayBail}>
            💰 缴纳保释 {formatMoney(state.config.economy.jailFine)}
          </Button>
        ) : null}
        {canShop ? (
          <Button disabled={busy} onClick={onOpenShop}>
            🛒 道具店
          </Button>
        ) : null}
        {canLottery ? (
          <Button disabled={busy} onClick={onOpenLottery}>
            🎟️ 买彩票 {formatMoney(state.config.economy.lotteryTicketPrice)}
          </Button>
        ) : null}
        {canEnd ? (
          <Button tone="ghost" size="lg" disabled={busy} onClick={onEndTurn}>
            ✅ 结束回合
          </Button>
        ) : null}
      </div>
      {jailed ? (
        <p className="text-[11px] text-paper-200/70">
          掷出双数可越狱；或缴纳保释金立即出狱。
        </p>
      ) : null}
      {here?.kind === "shop" ? (
        <p className="text-[11px] text-paper-200/70">
          你正站在道具店，可购买道具（背包上限 4 件）。
        </p>
      ) : null}
      {here?.kind === "lottery" ? (
        <p className="text-[11px] text-paper-200/70">每回合限购一张彩票。</p>
      ) : null}
    </div>
  );
}

export function ItemsBar({
  state,
  content,
  localPlayerId,
  isActor,
  busy,
  onUse,
}: {
  state: GameState;
  content: GameContent;
  localPlayerId: PlayerId | null;
  isActor: boolean;
  busy: boolean;
  onUse: (itemId: ItemInstanceId) => void;
}) {
  const player = state.players.find((entry) => entry.id === localPlayerId);
  const legal = localPlayerId ? getLegalActions(state, content, localPlayerId) : [];
  const usable = new Set(
    legal
      .filter((action): action is Extract<GameAction, { type: "use-item" }> => action.type === "use-item")
      .map((action) => action.itemId),
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionTitle>道具背包</SectionTitle>
        <span className="text-[11px] text-paper-200/60">
          {player?.items.length ?? 0} / 4
        </span>
      </div>
      {(player?.items.length ?? 0) === 0 ? (
        <p className="rounded-xl border border-dashed border-white/12 px-3 py-2 text-[11px] text-paper-200/50">
          暂无道具，去道具店逛逛吧。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {player?.items.map((item) => {
            const def = content.items[item.defId];
            const enabled = isActor && usable.has(item.id) && !busy;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!enabled}
                onClick={() => onUse(item.id)}
                title={def?.text}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border p-2 text-left transition-colors",
                  enabled
                    ? "border-gold-400/40 bg-gold-500/10 hover:bg-gold-500/20"
                    : "border-white/10 bg-white/[0.02] opacity-50",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs text-paper-50">
                  <span>{def?.icon ?? "🎒"}</span>
                  <span className="truncate">{def?.name ?? item.defId}</span>
                </span>
                <span className="line-clamp-2 text-[10px] leading-snug text-paper-200/70">
                  {def?.text}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SkillsBar({
  state,
  content,
  localPlayerId,
  isActor,
  busy,
  onUse,
}: {
  state: GameState;
  content: GameContent;
  localPlayerId: PlayerId | null;
  isActor: boolean;
  busy: boolean;
  onUse: (skillId: string) => void;
}) {
  const player = state.players.find((entry) => entry.id === localPlayerId);
  const character = player ? content.characters[player.characterId] : null;
  const legal = localPlayerId ? getLegalActions(state, content, localPlayerId) : [];
  const usable = new Set(
    legal
      .filter((action): action is Extract<GameAction, { type: "use-skill" }> => action.type === "use-skill")
      .map((action) => action.skillId),
  );
  const skills = character?.skills ?? [];

  return (
    <div className="space-y-2">
      <SectionTitle>角色技能</SectionTitle>
      <div className="space-y-1.5">
        {skills.map((skill) => {
          const charges = player?.skillCharges[skill.id];
          const cooldown = player?.skillCooldowns[skill.id] ?? 0;
          const isActive = skill.trigger === "active";
          const enabled = isActive && isActor && usable.has(skill.id) && !busy;
          return (
            <div
              key={skill.id}
              className={cn(
                "flex items-start gap-2 rounded-xl border px-2.5 py-2",
                isActive ? "border-jade-500/35 bg-jade-500/10" : "border-white/10 bg-white/[0.02]",
              )}
            >
              <span className="text-base">{skill.icon ?? "✨"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-paper-50">{skill.name}</span>
                  {isActive ? (
                    <span className="text-[10px] text-jade-500">
                      主动
                      {charges !== undefined ? ` · 余 ${charges}` : ""}
                      {cooldown > 0 ? ` · 冷却 ${cooldown}` : ""}
                    </span>
                  ) : (
                    <span className="text-[10px] text-paper-200/50">被动</span>
                  )}
                </div>
                <p className="text-[10px] leading-snug text-paper-200/70">{skill.text}</p>
              </div>
              {isActive ? (
                <Button size="sm" tone="jade" disabled={!enabled} onClick={() => onUse(skill.id)}>
                  发动
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
