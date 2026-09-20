import type {
  CardEffect,
  EffectTarget,
  GameContent,
  GameEvent,
  GameState,
  ItemTargetOption,
  PlayerId,
  ResolutionTask,
} from "../core/types";
import { EngineError } from "../core/errors";
import { findPlayer } from "../rules/money";
import { resolveLanding } from "../rules/landing";
import { removeItem } from "../rules/status";
import { applyEffect, pendingTargetOptions, targetKindOf, type EffectsTask } from "./effects";

export function pushEffects(
  state: GameState,
  playerId: PlayerId,
  effects: CardEffect[],
  sourceKind: "card" | "item" | "skill",
  sourceId: string,
  target: EffectTarget | null = null,
): void {
  state.queue.push({
    kind: "effects",
    playerId,
    effects: [...effects],
    index: 0,
    target,
    sourceKind,
    sourceId,
  });
}

export function pump(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
): void {
  let guard = 0;
  while (state.queue.length > 0 && !state.pending) {
    guard += 1;
    if (guard > 1000) {
      throw new EngineError("CONTENT_ERROR", "Resolution queue exceeded limit");
    }
    const task = state.queue[0] as ResolutionTask;
    if (findPlayer(state, task.playerId).status === "bankrupt") {
      state.queue.shift();
      continue;
    }
    if (task.kind === "landing") {
      state.queue.shift();
      resolveLanding(state, events, content, task.playerId, task.diceSum);
      continue;
    }
    applyEffectsTask(state, events, content, task);
  }
}

function applyEffectsTask(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  task: EffectsTask,
): void {
  while (task.index < task.effects.length) {
    const effect = task.effects[task.index] as CardEffect;
    const requiresTarget = targetKindOf(effect) !== null;
    if (requiresTarget && !task.target) {
      state.pending = {
        kind: "card-target",
        playerId: task.playerId,
        sourceId: task.sourceId,
      };
      events.push({ type: "decision-requested", decision: state.pending });
      return;
    }
    applyEffect(state, events, content, task, effect);
    task.index += 1;
    task.target = null;
    if (state.pending) {
      return;
    }
  }
  state.queue.shift();
}

export function settlePhase(state: GameState): void {
  if (state.phase === "finished") {
    return;
  }
  if (state.pending) {
    state.phase = "await-decision";
    return;
  }
  if (state.phase === "await-decision" && state.queue.length === 0) {
    state.phase =
      state.rollAgain || state.lastRoll === null ? "await-roll" : "action-window";
  }
}

function optionMatches(option: ItemTargetOption, target: EffectTarget): boolean {
  if (option.kind === "player") {
    return !!option.playerId && option.playerId === target.playerId;
  }
  return option.tileIndex !== undefined && option.tileIndex === target.tileIndex;
}

export function resolveTargetPending(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  target: EffectTarget,
): void {
  const pending = state.pending;
  if (!pending) {
    throw new EngineError("NO_PENDING_DECISION", "No pending decision");
  }
  if (pending.playerId !== playerId) {
    throw new EngineError("NOT_YOUR_TURN", "Not your decision");
  }
  if (pending.kind !== "item-target" && pending.kind !== "card-target") {
    throw new EngineError("INVALID_ACTION", "No target decision pending");
  }
  const options = pendingTargetOptions(state, content) ?? [];
  if (!options.some((option) => optionMatches(option, target))) {
    throw new EngineError("INVALID_TARGET", "Target is not available");
  }
  if (pending.kind === "item-target") {
    const player = findPlayer(state, playerId);
    const item = player.items.find((entry) => entry.id === pending.itemId);
    const def = item ? content.items[item.defId] : undefined;
    if (!item || !def) {
      throw new EngineError("INVALID_TARGET", "Item is no longer available");
    }
    removeItem(state, playerId, item.id);
    player.stats.itemsUsed += 1;
    state.pending = null;
    events.push({ type: "decision-resolved", kind: "item-target", playerId });
    events.push({
      type: "item-used",
      playerId,
      itemDefId: def.id,
      targetId: target.playerId,
      tileIndex: target.tileIndex,
    });
    events.push({
      type: "log",
      text: `${player.name} 使用了 ${def.name}`,
      icon: def.icon ?? "🎒",
    });
    pushEffects(state, playerId, def.effects, "item", def.id, target);
  } else {
    const task = state.queue[0];
    if (!task || task.kind !== "effects") {
      state.pending = null;
      throw new EngineError("INVALID_ACTION", "No effect awaiting a target");
    }
    task.target = target;
    state.pending = null;
    events.push({ type: "decision-resolved", kind: "card-target", playerId });
  }
  pump(state, events, content);
  settlePhase(state);
}

export function cancelTargetPending(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
): void {
  const pending = state.pending;
  if (!pending) {
    throw new EngineError("NO_PENDING_DECISION", "No pending decision");
  }
  if (pending.playerId !== playerId) {
    throw new EngineError("NOT_YOUR_TURN", "Not your decision");
  }
  if (pending.kind === "item-target") {
    state.pending = null;
    events.push({ type: "decision-resolved", kind: "item-target", playerId });
    const player = findPlayer(state, playerId);
    events.push({
      type: "log",
      text: `${player.name} 取消了道具使用`,
      icon: "↩️",
    });
  } else if (pending.kind === "card-target") {
    const task = state.queue[0];
    if (task && task.kind === "effects") {
      task.index += 1;
      task.target = null;
    }
    state.pending = null;
    events.push({ type: "decision-resolved", kind: "card-target", playerId });
  } else {
    throw new EngineError("INVALID_ACTION", "This decision cannot be canceled");
  }
  pump(state, events, content);
  settlePhase(state);
}
