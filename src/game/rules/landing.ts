import type {
  DeckId,
  GameContent,
  GameEvent,
  GameState,
  PlayerId,
  TileDef,
  TileKind,
} from "../core/types";
import { addMoney, findPlayer, payMoney } from "./money";
import { rentForTile } from "./rent";
import { sendToJail } from "./status";
import { discountedPrice, mitigationFactor } from "../systems/skills";
import { rngShuffle } from "../core/rng";

interface LandingContext {
  state: GameState;
  events: GameEvent[];
  content: GameContent;
  playerId: PlayerId;
  tileIndex: number;
  diceSum: number;
}

export function drawCard(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  deck: DeckId,
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

function handleStart(ctx: LandingContext): void {
  const { state, events, playerId } = ctx;
  const bonus = state.config.economy.startLandingBonus;
  const player = findPlayer(state, playerId);
  if (bonus > 0) {
    addMoney(state, events, playerId, bonus, "salary");
    events.push({
      type: "log",
      text: `${player.name} 停留起点，额外获得 ${bonus} 元`,
      icon: "🎊",
    });
  }
}

function handleProperty(ctx: LandingContext): void {
  const { state, events, content, playerId, tileIndex, diceSum } = ctx;
  const def = state.tileDefs[tileIndex] as TileDef;
  const tile = state.tiles[tileIndex];
  const player = findPlayer(state, playerId);
  if (!tile || !def) {
    return;
  }
  if (tile.ownerId === null) {
    const price = discountedPrice(state, content, playerId, def.price ?? 0, "buy-discount");
    if (player.money >= price) {
      state.pending = { kind: "buy-property", playerId, tileIndex, price };
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
  const rent = rentForTile(state, content, tileIndex, diceSum, playerId);
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
  payMoney(state, events, playerId, rent, "rent", tile.ownerId);
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
}

function handleTax(ctx: LandingContext): void {
  const { state, events, content, playerId, tileIndex } = ctx;
  const def = state.tileDefs[tileIndex] as TileDef;
  const player = findPlayer(state, playerId);
  if (!def?.tax) {
    return;
  }
  const raw =
    def.tax.kind === "percent-cash"
      ? Math.round(Math.max(0, player.money) * def.tax.rate)
      : def.tax.amount;
  const amount = Math.max(
    0,
    Math.round(raw * mitigationFactor(state, content, playerId)),
  );
  payMoney(state, events, playerId, amount, "tax", null);
  player.stats.taxPaid += amount;
  events.push({ type: "tax-paid", playerId, amount, label: def.name });
  events.push({
    type: "log",
    text: `${player.name} 缴纳 ${def.name} ${amount} 元`,
    icon: "🧾",
  });
}

function handleCard(ctx: LandingContext): void {
  const { state, events, content, playerId, tileIndex } = ctx;
  const def = state.tileDefs[tileIndex] as TileDef;
  const deck: DeckId = def.kind === "chance" ? "chance" : "fate";
  const cardId = drawCard(state, events, playerId, deck);
  if (!cardId) {
    return;
  }
  const card = content.cards[cardId];
  if (!card) {
    return;
  }
  events.push({
    type: "card-played",
    playerId,
    cardId,
  });
  events.push({ type: "log", text: `${card.title}：${card.text}`, icon: card.icon ?? "🎴" });
  state.queue.push({
    kind: "effects",
    playerId,
    effects: card.effects,
    index: 0,
    target: null,
    sourceKind: "card",
    sourceId: cardId,
  });
}

function handleGotoJail(ctx: LandingContext): void {
  const { state, events, content, playerId } = ctx;
  const player = findPlayer(state, playerId);
  events.push({
    type: "log",
    text: `${player.name} 被巡捕抓住，直接入狱`,
    icon: "🚔",
  });
  sendToJail(state, events, content, playerId);
}

function handleIdle(message: string): (ctx: LandingContext) => void {
  return (ctx) => {
    const player = findPlayer(ctx.state, ctx.playerId);
    ctx.events.push({
      type: "log",
      text: `${player.name} ${message}`,
      icon: "⛩️",
    });
  };
}

const TILE_HANDLERS: Record<TileKind, (ctx: LandingContext) => void> = {
  start: handleStart,
  property: handleProperty,
  transport: handleProperty,
  utility: handleProperty,
  chance: handleCard,
  fate: handleCard,
  tax: handleTax,
  "goto-jail": handleGotoJail,
  jail: handleIdle("路过监狱，安然无恙"),
  hospital: handleIdle("到医院探望病人"),
  shop: handleIdle("到达商店街，可以购买道具"),
  lottery: handleIdle("到达彩票站，可以试试手气"),
};

export function resolveLanding(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  diceSum: number,
): void {
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    return;
  }
  const tileIndex = player.position;
  const def = state.tileDefs[tileIndex] as TileDef;
  if (!def) {
    return;
  }
  const handler = TILE_HANDLERS[def.kind];
  if (!handler) {
    return;
  }
  handler({ state, events, content, playerId, tileIndex, diceSum });
}
