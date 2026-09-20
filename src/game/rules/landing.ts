import type { GameEvent, GameState, PlayerId, TileDef } from "../core/types";
import { addMoney, findPlayer, transferMoney } from "./money";
import { findTileIndex, teleportPlayer } from "./movement";
import { rentForTile } from "./rent";
import { rngShuffle } from "../core/rng";

export function sendToJail(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  turns?: number,
): void {
  const jailIndex = findTileIndex(state, "jail");
  const player = findPlayer(state, playerId);
  teleportPlayer(state, events, playerId, jailIndex);
  player.status = "jailed";
  player.statusTurns = turns ?? state.config.economy.jailTurns;
  player.doublesStreak = 0;
  events.push({ type: "jailed", playerId, turns: player.statusTurns });
  events.push({ type: "log", text: `${player.name} 被押入监狱`, icon: "🚔" });
}

export function hospitalize(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  turns?: number,
): void {
  const hospitalIndex = findTileIndex(state, "hospital");
  const player = findPlayer(state, playerId);
  teleportPlayer(state, events, playerId, hospitalIndex);
  player.status = "hospitalized";
  player.statusTurns = turns ?? state.config.economy.hospitalTurns;
  events.push({ type: "hospitalized", playerId, turns: player.statusTurns });
  events.push({ type: "log", text: `${player.name} 住进了医院`, icon: "🏥" });
}

export function releasePlayer(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  from: "jail" | "hospital",
): void {
  const player = findPlayer(state, playerId);
  player.status = "active";
  player.statusTurns = 0;
  events.push({ type: "released", playerId, from });
  events.push({
    type: "log",
    text: `${player.name} ${from === "jail" ? "重获自由" : "康复出院"}`,
    icon: from === "jail" ? "🔓" : "💚",
  });
}

export function drawCard(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  deck: "chance" | "fate",
): string | null {
  const deckKey = deck === "chance" ? "chanceDeck" : "fateDeck";
  const discardKey = deck === "chance" ? "chanceDiscard" : "fateDiscard";
  let cards = state[deckKey];
  if (cards.length === 0) {
    const [reshuffled, rng] = rngShuffle(state.rng, state[discardKey]);
    state.rng = rng;
    cards = reshuffled;
    state[discardKey] = [];
    state[deckKey] = cards;
  }
  const cardId = cards.shift();
  if (!cardId) {
    return null;
  }
  state[discardKey].push(cardId);
  const player = findPlayer(state, playerId);
  player.stats.cardsDrawn += 1;
  events.push({ type: "card-drawn", playerId, cardId, deck });
  return cardId;
}

export function bankruptPlayer(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  creditorId: PlayerId | null,
): void {
  const player = findPlayer(state, playerId);
  player.status = "bankrupt";
  player.money = 0;
  player.statusTurns = 0;
  player.items = [];
  for (const tile of state.tiles) {
    if (tile.ownerId === playerId) {
      tile.ownerId = null;
      tile.level = 0;
      tile.mortgaged = false;
      tile.effects = [];
    }
  }
  player.properties = [];
  events.push({ type: "player-bankrupt", playerId, creditorId });
  events.push({ type: "log", text: `${player.name} 破产离场`, icon: "💥" });
}

function resolvePropertyLanding(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  tileIndex: number,
  diceSum: number,
): void {
  const def = state.tileDefs[tileIndex] as TileDef;
  const tile = state.tiles[tileIndex];
  const player = findPlayer(state, playerId);
  if (!tile || !def) {
    return;
  }
  if (tile.ownerId === null) {
    const price = def.price ?? 0;
    if (player.money >= price) {
      state.pending = {
        kind: "buy-property",
        playerId,
        tileIndex,
        price,
      };
      events.push({ type: "decision-requested", decision: state.pending });
    } else {
      events.push({
        type: "log",
        text: `${player.name} 资金不足，无力购买 ${def.name}`,
        icon: "💸",
      });
    }
    return;
  }
  if (tile.ownerId === playerId) {
    return;
  }
  if (tile.mortgaged) {
    events.push({
      type: "log",
      text: `${def.name} 处于抵押状态，免收过路费`,
      icon: "🏦",
    });
    return;
  }
  const rent = rentForTile(state, tileIndex, diceSum);
  if (rent <= 0) {
    return;
  }
  if (player.rentShields > 0) {
    player.rentShields -= 1;
    events.push({
      type: "log",
      text: `${player.name} 使用免租卡，免除了 ${def.name} 的过路费`,
      icon: "🛡️",
    });
    return;
  }
  const owner = findPlayer(state, tile.ownerId);
  transferMoney(state, events, playerId, tile.ownerId, rent, "rent");
  player.stats.rentPaid += rent;
  owner.stats.rentReceived += rent;
  events.push({
    type: "rent-paid",
    fromId: playerId,
    toId: tile.ownerId,
    amount: rent,
    tileIndex,
  });
  events.push({
    type: "log",
    text: `${player.name} 向 ${owner.name} 支付过路费 ${rent} 元`,
    icon: "💸",
  });
  if (player.money < 0) {
    bankruptPlayer(state, events, playerId, tile.ownerId);
  }
}

function resolveTaxLanding(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  tileIndex: number,
): void {
  const def = state.tileDefs[tileIndex] as TileDef;
  const player = findPlayer(state, playerId);
  if (!def?.tax) {
    return;
  }
  const amount =
    def.tax.kind === "percent-cash"
      ? Math.round(Math.max(0, player.money) * def.tax.rate)
      : def.tax.amount;
  addMoney(state, events, playerId, -amount, "tax");
  player.stats.taxPaid += amount;
  events.push({ type: "tax-paid", playerId, amount, label: def.name });
  events.push({
    type: "log",
    text: `${player.name} 缴纳 ${def.name} ${amount} 元`,
    icon: "🧾",
  });
  if (player.money < 0) {
    bankruptPlayer(state, events, playerId, null);
  }
}

export function resolveLanding(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  diceSum: number,
): void {
  const player = findPlayer(state, playerId);
  const tileIndex = player.position;
  const def = state.tileDefs[tileIndex] as TileDef;
  if (!def) {
    return;
  }
  switch (def.kind) {
    case "start": {
      addMoney(
        state,
        events,
        playerId,
        state.config.economy.startLandingBonus,
        "salary",
      );
      events.push({
        type: "log",
        text: `${player.name} 停留起点，额外获得 ${state.config.economy.startLandingBonus} 元`,
        icon: "🎊",
      });
      return;
    }
    case "tax":
      resolveTaxLanding(state, events, playerId, tileIndex);
      return;
    case "goto-jail":
      sendToJail(state, events, playerId);
      return;
    case "chance":
    case "fate":
      drawCard(state, events, playerId, def.kind === "chance" ? "chance" : "fate");
      events.push({
        type: "log",
        text: `${player.name} 抽到一张${def.name}卡`,
        icon: "🎴",
      });
      return;
    case "property":
    case "transport":
    case "utility":
      resolvePropertyLanding(state, events, playerId, tileIndex, diceSum);
      return;
    default:
      return;
  }
}
