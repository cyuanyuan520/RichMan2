import type {
  GameAction,
  GameContent,
  GameState,
  PlayerId,
  TileDef,
} from "../core/types";
import { currentPlayer } from "../core/reducer";
import { pendingTargetOptions } from "../systems/effects";
import { discountedPrice } from "../systems/skills";

export { pendingTargetOptions };

export function getLegalActions(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
): GameAction[] {
  if (state.phase === "finished") {
    return [];
  }
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || player.status === "bankrupt") {
    return [];
  }
  const actions: GameAction[] = [{ type: "give-up", playerId }];
  const pending = state.pending;

  if (pending) {
    if (pending.playerId !== playerId) {
      return actions;
    }
    switch (pending.kind) {
      case "buy-property":
        actions.push({ type: "buy-property", playerId });
        actions.push({ type: "decline-buy", playerId });
        return actions;
      case "raise-funds": {
        for (const tile of state.tiles) {
          if (tile.ownerId !== playerId) {
            continue;
          }
          if (tile.level > 0) {
            actions.push({
              type: "sell-building",
              playerId,
              tileIndex: tile.index,
            });
          } else if (!tile.mortgaged) {
            actions.push({
              type: "mortgage-property",
              playerId,
              tileIndex: tile.index,
            });
          }
        }
        actions.push({ type: "raise-funds-done", playerId });
        actions.push({ type: "declare-bankrupt", playerId });
        return actions;
      }
      case "item-target":
      case "card-target": {
        for (const option of pendingTargetOptions(state, content) ?? []) {
          actions.push({
            type: "resolve-target",
            playerId,
            target: {
              playerId: option.playerId,
              tileIndex: option.tileIndex,
            },
          });
        }
        actions.push({ type: "cancel-target", playerId });
        return actions;
      }
      case "choose-dice": {
        for (let value = 1; value <= 6; value += 1) {
          actions.push({ type: "choose-dice", playerId, value });
        }
        return actions;
      }
      default:
        return actions;
    }
  }

  if (currentPlayer(state).id !== playerId) {
    return actions;
  }

  for (const item of player.items) {
    const def = content.items[item.defId];
    if (!def) {
      continue;
    }
    if (def.target === "none" || def.target === "self") {
      actions.push({ type: "use-item", playerId, itemId: item.id });
      continue;
    }
    const options = pendingTargetOptionsForUse(state, playerId, content, def.id);
    if (options > 0) {
      actions.push({ type: "use-item", playerId, itemId: item.id });
    }
  }

  for (const skill of content.characters[player.characterId]?.skills ?? []) {
    if (skill.trigger !== "active") {
      continue;
    }
    const effects = skill.effects ?? [];
    const escapeOnly =
      effects.length > 0 &&
      effects.every((effect) => effect.kind === "get-out-of-jail");
    if (escapeOnly && player.status !== "jailed") {
      continue;
    }
    if ((player.skillCharges[skill.id] ?? 0) <= 0 && skill.charges !== undefined) {
      continue;
    }
    if ((player.skillCooldowns[skill.id] ?? 0) > 0) {
      continue;
    }
    actions.push({ type: "use-skill", playerId, skillId: skill.id });
  }

  if (state.phase === "await-roll") {
    actions.push({ type: "roll-dice", playerId });
    if (player.status === "jailed" && player.money >= state.config.economy.jailFine) {
      actions.push({ type: "pay-jail-fine", playerId });
    }
    return actions;
  }

  if (state.phase === "action-window") {
    actions.push({ type: "end-turn", playerId });
    for (const tile of state.tiles) {
      if (tile.ownerId !== playerId) {
        continue;
      }
      const def = state.tileDefs[tile.index] as TileDef;
      if (tile.level > 0) {
        actions.push({ type: "sell-building", playerId, tileIndex: tile.index });
      }
      if (def.kind === "property" && !tile.mortgaged) {
        const base = def.upgradeCosts?.[tile.level] ?? 0;
        const cost = discountedPrice(state, content, playerId, base, "upgrade-discount");
        if (
          tile.level < state.config.economy.maxBuildingLevel &&
          player.money >= cost
        ) {
          actions.push({ type: "upgrade-property", playerId, tileIndex: tile.index });
        }
      }
      if (tile.level === 0 && !tile.mortgaged) {
        actions.push({ type: "mortgage-property", playerId, tileIndex: tile.index });
      }
      if (tile.mortgaged) {
        const cost = Math.round(
          (def.price ?? 0) *
            state.config.economy.mortgageRefundRate *
            (1 + state.config.economy.mortgageInterest),
        );
        if (player.money >= cost) {
          actions.push({ type: "unmortgage-property", playerId, tileIndex: tile.index });
        }
      }
    }
    const here = state.tileDefs[player.position] as TileDef | undefined;
    if (here?.kind === "shop") {
      for (const def of Object.values(content.items)) {
        if (player.money >= def.price) {
          actions.push({ type: "buy-item", playerId, itemDefId: def.id });
        }
      }
    }
    if (here?.kind === "lottery") {
      if (
        player.money >= state.config.economy.lotteryTicketPrice &&
        !player.lotteryBoughtThisTurn
      ) {
        actions.push({ type: "buy-lottery", playerId });
      }
    }
  }

  return actions;
}

function pendingTargetOptionsForUse(
  state: GameState,
  playerId: PlayerId,
  content: GameContent,
  itemDefId: string,
): number {
  const def = content.items[itemDefId];
  if (!def) {
    return 0;
  }
  if (def.target === "opponent") {
    return state.players.filter(
      (entry) => entry.id !== playerId && entry.status !== "bankrupt",
    ).length;
  }
  if (def.target === "opponent-property") {
    return state.tiles.filter(
      (tile) =>
        tile.ownerId !== null &&
        tile.ownerId !== playerId &&
        ["property", "transport", "utility"].includes(
          (state.tileDefs[tile.index] as TileDef).kind,
        ),
    ).length;
  }
  if (def.target === "tile") {
    return def.targetRange ?? state.tiles.length;
  }
  return 1;
}
