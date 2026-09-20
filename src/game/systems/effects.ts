import type {
  CardEffect,
  GameContent,
  GameEvent,
  GameState,
  ItemTargetKind,
  ItemTargetOption,
  PlayerId,
  ResolutionTask,
  TileDef,
} from "../core/types";
import { EngineError } from "../core/errors";
import { asTileId } from "../core/ids";
import { addMoney, findPlayer, payMoney } from "../rules/money";
import {
  movePlayer,
  nearestTileIndex,
  teleportPlayer,
} from "../rules/movement";
import { addItem, findTileIndex, hospitalize, sendToJail } from "../rules/status";
import { mitigationFactor } from "./skills";
import { rngInt } from "../core/rng";

export type EffectsTask = Extract<ResolutionTask, { kind: "effects" }>;

export function targetKindOf(effect: CardEffect): ItemTargetKind | null {
  switch (effect.kind) {
    case "swap-position":
    case "skip-turn":
    case "audit":
      return "opponent";
    case "teleport":
    case "place-roadblock":
      return "tile";
    case "demolish":
    case "force-buy":
      return "opponent-property";
    default:
      return null;
  }
}

function isActiveTarget(state: GameState, playerId: PlayerId): boolean {
  const player = state.players.find((entry) => entry.id === playerId);
  return !!player && player.status !== "bankrupt";
}

export function targetOptions(
  state: GameState,
  playerId: PlayerId,
  kind: ItemTargetKind,
  targetRange?: number,
): ItemTargetOption[] {
  const self = findPlayer(state, playerId);
  switch (kind) {
    case "opponent":
      return state.players
        .filter((player) => player.id !== playerId && player.status !== "bankrupt")
        .map((player) => ({
          kind: "player" as const,
          playerId: player.id,
          label: player.name,
        }));
    case "opponent-property":
      return state.tiles
        .filter((tile) => {
          if (!tile.ownerId || tile.ownerId === playerId) {
            return false;
          }
          const def = state.tileDefs[tile.index] as TileDef;
          return def.kind === "property" || def.kind === "transport" || def.kind === "utility";
        })
        .map((tile) => {
          const def = state.tileDefs[tile.index] as TileDef;
          const owner = state.players.find((player) => player.id === tile.ownerId);
          return {
            kind: "tile" as const,
            tileIndex: tile.index,
            label: `${def.name}（${owner?.name ?? "对手"}）`,
          };
        });
    case "tile": {
      if (targetRange !== undefined && targetRange > 0) {
        const size = state.tiles.length;
        const options: ItemTargetOption[] = [];
        for (let step = 1; step <= targetRange; step += 1) {
          const index = (self.position + step) % size;
          const def = state.tileDefs[index] as TileDef;
          options.push({
            kind: "tile",
            tileIndex: index,
            label: `${def.name}（前方 ${step} 格）`,
          });
        }
        return options;
      }
      return state.tileDefs.map((def, index) => ({
        kind: "tile" as const,
        tileIndex: index,
        label: def.name,
      }));
    }
    default:
      return [];
  }
}

export function targetOptionsForItem(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
  itemDefId: string,
): ItemTargetOption[] {
  const def = content.items[itemDefId];
  if (!def) {
    return [];
  }
  const options = targetOptions(state, playerId, def.target, def.targetRange);
  if (def.target !== "opponent-property") {
    return options;
  }
  const player = findPlayer(state, playerId);
  const forceBuy = def.effects.find((effect) => effect.kind === "force-buy");
  const demolish = def.effects.some((effect) => effect.kind === "demolish");
  return options.filter((option) => {
    if (option.tileIndex === undefined) {
      return true;
    }
    const tile = state.tiles[option.tileIndex];
    const tileDef = state.tileDefs[option.tileIndex] as TileDef;
    if (!tile || !tileDef || tile.ownerId === null) {
      return false;
    }
    if (demolish && tile.level <= 0) {
      return false;
    }
    if (forceBuy) {
      const invested = (tileDef.upgradeCosts ?? [])
        .slice(0, tile.level)
        .reduce((sum, entry) => sum + entry, 0);
      const cost = Math.round(
        ((tileDef.price ?? 0) + invested) * forceBuy.multiplier,
      );
      if (player.money < cost) {
        return false;
      }
    }
    return true;
  });
}

export function pendingTargetOptions(
  state: GameState,
  content: GameContent,
): ItemTargetOption[] | null {
  const pending = state.pending;
  if (!pending) {
    return null;
  }
  if (pending.kind === "item-target") {
    const item = state.players
      .find((player) => player.id === pending.playerId)
      ?.items.find((entry) => entry.id === pending.itemId);
    const def = item ? content.items[item.defId] : undefined;
    if (!def) {
      return [];
    }
    return targetOptionsForItem(state, content, pending.playerId, def.id);
  }
  if (pending.kind === "card-target") {
    const task = state.queue[0];
    if (!task || task.kind !== "effects") {
      return [];
    }
    const effect = task.effects[task.index];
    if (!effect) {
      return [];
    }
    const kind = targetKindOf(effect);
    if (!kind) {
      return [];
    }
    const range = effect.kind === "place-roadblock" ? 6 : undefined;
    return targetOptions(state, pending.playerId, kind, range);
  }
  return null;
}

function moveToTile(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  tileIndex: number,
): void {
  const player = findPlayer(state, playerId);
  const size = state.tiles.length;
  const steps = (tileIndex - player.position + size) % size;
  if (steps === 0) {
    return;
  }
  movePlayer(state, events, content, playerId, steps);
}

function applyNegative(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  amount: number,
  reason: "card" | "item" | "skill" | "tax",
  creditorId: PlayerId | null,
): boolean {
  const mitigation = mitigationFactor(state, content, playerId);
  const final = Math.max(0, Math.round(amount * mitigation));
  return payMoney(state, events, playerId, final, reason, creditorId);
}

function totalBuildingLevels(state: GameState, playerId: PlayerId): number {
  return state.tiles
    .filter((tile) => tile.ownerId === playerId)
    .reduce((total, tile) => total + tile.level, 0);
}

export function applyEffect(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  task: EffectsTask,
  effect: CardEffect,
): void {
  const playerId = task.playerId;
  const player = findPlayer(state, playerId);
  const target = task.target;

  switch (effect.kind) {
    case "money": {
      if (effect.amount >= 0) {
        addMoney(state, events, playerId, effect.amount, "card");
      } else {
        applyNegative(state, events, content, playerId, -effect.amount, "card", null);
      }
      return;
    }
    case "money-percent": {
      if (effect.rate >= 0) {
        addMoney(
          state,
          events,
          playerId,
          Math.round(player.money * effect.rate),
          "card",
        );
      } else {
        applyNegative(
          state,
          events,
          content,
          playerId,
          Math.round(Math.max(0, player.money) * -effect.rate),
          "card",
          null,
        );
      }
      return;
    }
    case "collect-from-each": {
      for (const other of state.players) {
        if (other.id === playerId || other.status === "bankrupt") {
          continue;
        }
        payMoney(state, events, other.id, effect.amount, "card", playerId);
      }
      return;
    }
    case "pay-each": {
      for (const other of state.players) {
        if (other.id === playerId || other.status === "bankrupt") {
          continue;
        }
        applyNegative(state, events, content, playerId, effect.amount, "card", other.id);
      }
      return;
    }
    case "collect-per-building": {
      const levels = totalBuildingLevels(state, playerId);
      if (levels > 0) {
        addMoney(state, events, playerId, levels * effect.amountPerLevel, "card");
      }
      return;
    }
    case "pay-per-building": {
      const levels = totalBuildingLevels(state, playerId);
      if (levels > 0) {
        applyNegative(
          state,
          events,
          content,
          playerId,
          levels * effect.amountPerLevel,
          "card",
          null,
        );
      }
      return;
    }
    case "move-to": {
      const landingDice = state.lastRoll
        ? state.lastRoll[0] + state.lastRoll[1]
        : 7;
      switch (effect.destination) {
        case "start": {
          moveToTile(state, events, content, playerId, 0);
          state.queue.push({ kind: "landing", playerId, diceSum: landingDice });
          return;
        }
        case "jail":
          sendToJail(state, events, content, playerId);
          return;
        case "hospital":
          hospitalize(state, events, content, playerId);
          return;
        case "shop": {
          const index = findTileIndex(state, "shop");
          if (index >= 0) {
            moveToTile(state, events, content, playerId, index);
            state.queue.push({ kind: "landing", playerId, diceSum: landingDice });
          }
          return;
        }
        case "lottery": {
          const index = findTileIndex(state, "lottery");
          if (index >= 0) {
            moveToTile(state, events, content, playerId, index);
            state.queue.push({ kind: "landing", playerId, diceSum: landingDice });
          }
          return;
        }
        case "nearest-transport": {
          const index = nearestTileIndex(state, player.position, "transport");
          if (index >= 0) {
            moveToTile(state, events, content, playerId, index);
            state.queue.push({ kind: "landing", playerId, diceSum: landingDice });
          }
          return;
        }
        case "random-property": {
          const propertyTiles = state.tileDefs
            .map((def, index) => ({ def, index }))
            .filter((entry) => entry.def.kind === "property");
          if (propertyTiles.length > 0) {
            const [pick, rng] = rngInt(state.rng, 0, propertyTiles.length - 1);
            state.rng = rng;
            const chosen = propertyTiles[pick]!;
            moveToTile(state, events, content, playerId, chosen.index);
            state.queue.push({ kind: "landing", playerId, diceSum: landingDice });
          }
          return;
        }
      }
      return;
    }
    case "move-steps": {
      movePlayer(state, events, content, playerId, effect.steps);
      state.queue.push({
        kind: "landing",
        playerId,
        diceSum: Math.abs(effect.steps),
      });
      return;
    }
    case "jail":
      sendToJail(state, events, content, playerId, effect.turns);
      return;
    case "hospital":
      hospitalize(state, events, content, playerId, effect.turns);
      return;
    case "get-out-of-jail": {
      player.jailFreeCards += 1;
      events.push({
        type: "log",
        text: `${player.name} 获得一张出狱许可`,
        icon: "🔑",
      });
      return;
    }
    case "gain-item": {
      const def = content.items[effect.itemDefId];
      const gained = addItem(state, events, playerId, effect.itemDefId);
      events.push({
        type: "log",
        text: gained
          ? `${player.name} 获得了 ${def?.name ?? effect.itemDefId}`
          : `${player.name} 的道具背包已满，${def?.name ?? effect.itemDefId} 失效`,
        icon: gained ? (def?.icon ?? "🎁") : "🎒",
      });
      return;
    }
    case "free-rent-turns":
    case "rent-shield": {
      const turns = effect.kind === "rent-shield" ? 1 : effect.turns;
      player.rentShields += turns;
      return;
    }
    case "choose-dice": {
      state.pending = { kind: "choose-dice", playerId };
      events.push({ type: "decision-requested", decision: state.pending });
      return;
    }
    case "place-roadblock": {
      const tileIndex = target?.tileIndex;
      if (tileIndex === undefined || !state.tiles[tileIndex]) {
        throw new EngineError("INVALID_TARGET", "Roadblock requires a tile");
      }
      state.tiles[tileIndex].effects.push({ kind: "roadblock", ownerId: playerId });
      events.push({ type: "roadblock-placed", playerId, tileIndex });
      events.push({
        type: "log",
        text: `${player.name} 在 ${state.tileDefs[tileIndex]?.name ?? "此处"} 放置了路障`,
        icon: "🚧",
      });
      return;
    }
    case "demolish": {
      const tileIndex = target?.tileIndex;
      if (tileIndex === undefined) {
        throw new EngineError("INVALID_TARGET", "Demolish requires a property");
      }
      const tile = state.tiles[tileIndex];
      const def = state.tileDefs[tileIndex] as TileDef;
      const levels = effect.levels ?? 1;
      if (tile && tile.ownerId && tile.level > 0) {
        tile.level = Math.max(0, tile.level - levels);
        events.push({
          type: "log",
          text: `${player.name} 把 ${def.name} 拆到了 ${tile.level} 级`,
          icon: "🔨",
        });
      } else if (tile && tile.ownerId) {
        events.push({
          type: "log",
          text: `${def.name} 没有建筑可拆`,
          icon: "🔨",
        });
      }
      return;
    }
    case "skip-turn": {
      const targetId = target?.playerId;
      if (!targetId) {
        throw new EngineError("INVALID_TARGET", "Skip-turn requires a player");
      }
      const victim = findPlayer(state, targetId);
      victim.skipTurns += 1;
      events.push({
        type: "log",
        text: `${victim.name} 被罚暂停一回合`,
        icon: "⏸️",
      });
      return;
    }
    case "audit": {
      const targetId = target?.playerId;
      if (!targetId) {
        throw new EngineError("INVALID_TARGET", "Audit requires a player");
      }
      const victim = findPlayer(state, targetId);
      const amount = Math.round(Math.max(0, victim.money) * effect.rate);
      payMoney(state, events, targetId, amount, "card", playerId);
      events.push({
        type: "log",
        text: `${player.name} 查税，${victim.name} 缴纳 ${amount} 元`,
        icon: "📋",
      });
      return;
    }
    case "force-buy": {
      const tileIndex = target?.tileIndex;
      if (tileIndex === undefined) {
        throw new EngineError("INVALID_TARGET", "Force-buy requires a property");
      }
      const tile = state.tiles[tileIndex];
      const def = state.tileDefs[tileIndex] as TileDef;
      if (!tile || !tile.ownerId) {
        return;
      }
      const ownerId = tile.ownerId;
      const invested = (def.upgradeCosts ?? [])
        .slice(0, tile.level)
        .reduce((sum, entry) => sum + entry, 0);
      const cost = Math.round(
        ((def.price ?? 0) + invested) * effect.multiplier,
      );
      if (player.money < cost) {
        events.push({
          type: "log",
          text: `${player.name} 现金不足，收购 ${def.name} 失败`,
          icon: "🏷️",
        });
        return;
      }
      const owner = findPlayer(state, ownerId);
      payMoney(state, events, playerId, cost, "item", ownerId);
      tile.ownerId = playerId;
      const tileId = asTileId(tile.defId);
      owner.properties = owner.properties.filter((entry) => entry !== tileId);
      player.properties.push(tileId);
      events.push({
        type: "log",
        text: `${player.name} 以 ${cost} 元从 ${owner.name} 手中收购了 ${def.name}`,
        icon: "🏷️",
      });
      return;
    }
    case "swap-position": {
      const targetId = target?.playerId;
      if (!targetId) {
        throw new EngineError("INVALID_TARGET", "Swap requires a player");
      }
      if (!isActiveTarget(state, targetId)) {
        return;
      }
      const other = findPlayer(state, targetId);
      const myPosition = player.position;
      const theirPosition = other.position;
      teleportPlayer(state, events, playerId, theirPosition);
      teleportPlayer(state, events, targetId, myPosition);
      events.push({
        type: "log",
        text: `${player.name} 与 ${other.name} 交换了位置`,
        icon: "🔄",
      });
      return;
    }
    case "teleport": {
      const tileIndex = target?.tileIndex;
      if (tileIndex === undefined || !state.tiles[tileIndex]) {
        throw new EngineError("INVALID_TARGET", "Teleport requires a tile");
      }
      teleportPlayer(state, events, playerId, tileIndex);
      events.push({
        type: "log",
        text: `${player.name} 传送到了 ${state.tileDefs[tileIndex]?.name ?? "目的地"}`,
        icon: "🌀",
      });
      return;
    }
    case "share-wealth": {
      const alive = state.players.filter((entry) => entry.status !== "bankrupt");
      if (alive.length === 0) {
        return;
      }
      const total = alive.reduce((sum, entry) => sum + Math.max(0, entry.money), 0);
      const share = Math.floor(total / alive.length);
      const amounts: Array<{ playerId: PlayerId; amount: number }> = [];
      for (const entry of alive) {
        const delta = share - entry.money;
        amounts.push({ playerId: entry.id, amount: delta });
        addMoney(state, events, entry.id, delta, "share-wealth");
      }
      events.push({ type: "share-wealth", amounts });
      events.push({
        type: "log",
        text: `${player.name} 发动均富卡，所有玩家现金平均为 ${share} 元`,
        icon: "⚖️",
      });
      return;
    }
  }
}
