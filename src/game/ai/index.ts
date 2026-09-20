import type {
  BotDifficulty,
  GameAction,
  GameContent,
  GameState,
  PlayerId,
  TileDef,
} from "../core/types";
import { createRng, rngNext } from "../core/rng";
import { getLegalActions } from "../selectors/legal";
import { findPlayer, netWorth } from "../selectors";

function aiRng(state: GameState) {
  return createRng((state.seed ^ (state.seq + 1) * 2654435761) >>> 0);
}

function pick<T>(state: GameState, items: T[]): T {
  const [value] = rngNext(aiRng(state));
  const index = Math.min(items.length - 1, Math.floor(value * items.length));
  return items[index] as T;
}

function roll0100(state: GameState): number {
  const [value] = rngNext(createRng((state.seq * 40503 + state.round) >>> 0));
  return value;
}

function bufferFor(difficulty: BotDifficulty): number {
  switch (difficulty) {
    case "easy":
      return 12000;
    case "hard":
      return 3000;
    default:
      return 6000;
  }
}

function groupCompletion(
  state: GameState,
  playerId: PlayerId,
  tileIndex: number,
): boolean {
  const def = state.tileDefs[tileIndex] as TileDef;
  if (def.kind !== "property" || !def.group) {
    return false;
  }
  const groupTiles = state.tileDefs
    .map((tile, index) => ({ tile, index }))
    .filter((entry) => entry.tile.group === def.group && entry.tile.kind === "property");
  const owned = groupTiles.filter(
    (entry) => state.tiles[entry.index]?.ownerId === playerId,
  ).length;
  return owned >= groupTiles.length - 1;
}

function pickAction(
  actions: GameAction[],
  type: GameAction["type"],
): GameAction | undefined {
  return actions.find((action) => action.type === type);
}

function handleBuyProperty(
  state: GameState,
  playerId: PlayerId,
  actions: GameAction[],
): GameAction {
  const buy = pickAction(actions, "buy-property") as
    | Extract<GameAction, { type: "buy-property" }>
    | undefined;
  const decline = pickAction(actions, "decline-buy") as GameAction;
  const pending = state.pending;
  if (!buy || !pending || pending.kind !== "buy-property") {
    return decline;
  }
  const player = findPlayer(state, playerId);
  const buffer = bufferFor(player.botDifficulty);
  const completes = groupCompletion(state, playerId, pending.tileIndex);
  if (completes || player.money - pending.price >= buffer) {
    return buy;
  }
  return decline;
}

function handleRaiseFunds(
  state: GameState,
  playerId: PlayerId,
  actions: GameAction[],
): GameAction | null {
  const player = findPlayer(state, playerId);
  if (player.money >= 0) {
    const done = pickAction(actions, "raise-funds-done");
    if (done) {
      return done;
    }
  }
  const sells = actions.filter(
    (action): action is Extract<GameAction, { type: "sell-building" }> =>
      action.type === "sell-building",
  );
  if (sells.length > 0) {
    const withLevel = sells
      .map((action) => ({
        action,
        level: state.tiles[action.tileIndex]?.level ?? 0,
      }))
      .sort((a, b) => a.level - b.level);
    return (withLevel[0] as (typeof withLevel)[number]).action;
  }
  const mortgages = actions.filter(
    (action): action is Extract<GameAction, { type: "mortgage-property" }> =>
      action.type === "mortgage-property",
  );
  if (mortgages.length > 0) {
    const priced = mortgages
      .map((action) => ({
        action,
        price: (state.tileDefs[action.tileIndex] as TileDef).price ?? 0,
      }))
      .sort((a, b) => a.price - b.price);
    return (priced[0] as (typeof priced)[number]).action;
  }
  const bankrupt = pickAction(actions, "declare-bankrupt");
  if (bankrupt) {
    return bankrupt;
  }
  return (actions[0] as GameAction | undefined) ?? null;
}

function handleTarget(
  state: GameState,
  playerId: PlayerId,
  actions: GameAction[],
  difficulty: BotDifficulty,
): GameAction | null {
  const resolves = actions.filter(
    (action): action is Extract<GameAction, { type: "resolve-target" }> =>
      action.type === "resolve-target",
  );
  const cancel = pickAction(actions, "cancel-target");
  if (resolves.length === 0) {
    return cancel ?? null;
  }
  const resolve = pick(state, resolves);
  if (difficulty === "hard") {
    let best: GameAction | null = null;
    let bestScore = -Infinity;
    for (const action of resolves) {
      let score = 0;
      if (action.target.playerId) {
        score = netWorth(state, action.target.playerId);
      } else if (action.target.tileIndex !== undefined) {
        const tile = state.tiles[action.target.tileIndex];
        const def = state.tileDefs[action.target.tileIndex] as TileDef;
        score = (def.price ?? 0) + (tile?.level ?? 0) * 500;
      }
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    if (best) {
      return best;
    }
  }
  return resolve;
}

function tryUseItem(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
  actions: GameAction[],
  difficulty: BotDifficulty,
): GameAction | null {
  const chance =
    difficulty === "hard" ? 0.6 : difficulty === "normal" ? 0.35 : 0.15;
  if (roll0100(state) >= chance) {
    return null;
  }
  const player = findPlayer(state, playerId);
  const candidates = actions
    .filter(
      (action): action is Extract<GameAction, { type: "use-item" }> =>
        action.type === "use-item",
    )
    .map((action) => {
      const item = player.items.find((entry) => entry.id === action.itemId);
      const def = item ? content.items[item.defId] : undefined;
      return { action, def };
    })
    .filter((entry) => entry.def !== undefined);
  const worthwhile = candidates.filter((entry) =>
    (entry.def?.effects ?? []).some((effect) =>
      ["halt", "audit", "share-wealth", "force-buy", "demolish"].includes(
        effect.kind,
      ),
    ),
  );
  if (worthwhile.length === 0) {
    return null;
  }
  return pick(state, worthwhile).action;
}

function handleActionWindow(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
  actions: GameAction[],
): GameAction | null {
  const player = findPlayer(state, playerId);
  const difficulty = player.botDifficulty;
  const buffer = bufferFor(difficulty);

  if (difficulty !== "easy") {
    const shopActions = actions.filter(
      (action): action is Extract<GameAction, { type: "buy-item" }> =>
        action.type === "buy-item",
    );
    if (shopActions.length > 0 && player.items.length < 3) {
      const affordable = shopActions
        .map((action) => ({
          action,
          price: content.items[action.itemDefId]?.price ?? 0,
        }))
        .filter((entry) => player.money - entry.price >= buffer * 2)
        .sort((a, b) => a.price - b.price);
      if (affordable.length > 0) {
        return (pick(state, affordable) as (typeof affordable)[number]).action;
      }
    }
  }

  const upgrades = actions.filter(
    (action): action is Extract<GameAction, { type: "upgrade-property" }> =>
      action.type === "upgrade-property",
  );
  if (upgrades.length > 0) {
    const affordable = upgrades
      .map((action) => ({
        action,
        cost:
          (state.tileDefs[action.tileIndex] as TileDef).upgradeCosts?.[
            state.tiles[action.tileIndex]?.level ?? 0
          ] ?? 0,
      }))
      .filter((entry) => player.money - entry.cost >= buffer)
      .sort((a, b) => a.cost - b.cost);
    if (affordable.length > 0) {
      return (pick(state, affordable) as (typeof affordable)[number]).action;
    }
  }

  const lottery = pickAction(actions, "buy-lottery");
  if (
    lottery &&
    difficulty === "hard" &&
    player.money > state.config.economy.lotteryTicketPrice * 4
  ) {
    return lottery;
  }

  const item = tryUseItem(state, content, playerId, actions, difficulty);
  if (item) {
    return item;
  }

  const endTurn = pickAction(actions, "end-turn");
  if (endTurn) {
    return endTurn;
  }
  return null;
}

export function chooseAiAction(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
): GameAction | null {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || player.status === "bankrupt") {
    return null;
  }
  const actions = getLegalActions(state, content, playerId);
  if (actions.length === 0) {
    return null;
  }
  const pending = state.pending;
  if (pending && pending.playerId !== playerId) {
    return null;
  }
  if (pending && pending.playerId === playerId) {
    switch (pending.kind) {
      case "buy-property":
        return handleBuyProperty(state, playerId, actions);
      case "raise-funds":
        return handleRaiseFunds(state, playerId, actions);
      case "item-target":
      case "card-target":
        return handleTarget(state, playerId, actions, player.botDifficulty);
      case "choose-dice": {
        const values = actions.filter(
          (action): action is Extract<GameAction, { type: "choose-dice" }> =>
            action.type === "choose-dice",
        );
        const value = pick(state, values);
        return value ?? null;
      }
      default:
        return null;
    }
  }

  if (state.phase === "await-roll") {
    if (player.status === "jailed") {
      const bail = pickAction(actions, "pay-jail-fine");
      if (bail && player.money > state.config.economy.jailFine * 3) {
        return bail;
      }
    }
    const skill = actions.find((action) => action.type === "use-skill");
    if (skill) {
      const chance =
        player.botDifficulty === "hard" ? 1 : player.botDifficulty === "normal" ? 0.5 : 0.25;
      if (roll0100(state) < chance) {
        return skill;
      }
    }
    const item = tryUseItem(state, content, playerId, actions, player.botDifficulty);
    if (item) {
      return item;
    }
    const roll = pickAction(actions, "roll-dice");
    if (roll) {
      return roll;
    }
  }

  return handleActionWindow(state, content, playerId, actions);
}
