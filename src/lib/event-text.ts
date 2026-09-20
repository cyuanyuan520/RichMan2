import type {
  GameContent,
  GameEvent,
  GameState,
  PlayerId,
  TileDef,
} from "@/game/core/types";

export type LogTone = "info" | "good" | "bad" | "gold";

export interface DescribedEvent {
  text: string;
  tone: LogTone;
  icon?: string;
}

export function playerName(state: GameState, playerId: PlayerId): string {
  return state.players.find((player) => player.id === playerId)?.name ?? "玩家";
}

export function tileDef(state: GameState, index: number): TileDef | undefined {
  return state.tileDefs[index];
}

export function tileLabel(state: GameState, index: number): string {
  const def = state.tileDefs[index];
  if (!def) {
    return `第 ${index} 格`;
  }
  return def.name;
}

function money(value: number): string {
  return Math.abs(value).toLocaleString("zh-CN");
}

export function describeEvent(
  event: GameEvent,
  state: GameState,
  content: GameContent,
): DescribedEvent | null {
  switch (event.type) {
    case "game-started": {
      const map = content.map;
      return { text: `对局开始 · ${map.name}`, tone: "gold", icon: "🗺️" };
    }
    case "turn-started":
      return {
        text: `第 ${event.round} 回合 · ${playerName(state, event.playerId)} 行动`,
        tone: "info",
        icon: "🎲",
      };
    case "dice-rolled":
      return {
        text: `${playerName(state, event.playerId)} 掷出 ${event.dice[0]} + ${event.dice[1]}${
          event.doubles ? "（双数）" : ""
        }`,
        tone: event.doubles ? "gold" : "info",
        icon: "🎲",
      };
    case "token-moved":
      return {
        text: `${playerName(state, event.playerId)} 前进至 ${tileLabel(state, event.to)}`,
        tone: "info",
        icon: "👣",
      };
    case "money-changed": {
      if (event.delta === 0) {
        return null;
      }
      const sign = event.delta > 0 ? "+" : "-";
      return {
        text: `${playerName(state, event.playerId)} ${sign}${money(event.delta)} 元`,
        tone: event.delta > 0 ? "good" : "bad",
        icon: event.delta > 0 ? "💰" : "💸",
      };
    }
    case "rent-paid":
      return {
        text: `${playerName(state, event.fromId)} 向 ${playerName(
          state,
          event.toId,
        )} 支付过路费 ${money(event.amount)} 元（${tileLabel(state, event.tileIndex)}）`,
        tone: "bad",
        icon: "🏠",
      };
    case "property-bought":
      return {
        text: `${playerName(state, event.playerId)} 买下 ${tileLabel(
          state,
          event.tileIndex,
        )}，花费 ${money(event.price)} 元`,
        tone: "good",
        icon: "🔑",
      };
    case "property-upgraded":
      return {
        text: `${playerName(state, event.playerId)} 将 ${tileLabel(
          state,
          event.tileIndex,
        )} 升至 ${event.level} 级，花费 ${money(event.cost)} 元`,
        tone: "good",
        icon: "🔨",
      };
    case "property-mortgaged":
      return {
        text: `${playerName(state, event.playerId)} 抵押 ${tileLabel(
          state,
          event.tileIndex,
        )}，获得 ${money(event.amount)} 元`,
        tone: "info",
        icon: "📜",
      };
    case "property-unmortgaged":
      return {
        text: `${playerName(state, event.playerId)} 赎回 ${tileLabel(
          state,
          event.tileIndex,
        )}，支付 ${money(event.cost)} 元`,
        tone: "info",
        icon: "🧾",
      };
    case "building-sold":
      return {
        text: `${playerName(state, event.playerId)} 拆除 ${tileLabel(
          state,
          event.tileIndex,
        )} 的建筑，返还 ${money(event.amount)} 元`,
        tone: "info",
        icon: "🧱",
      };
    case "tax-paid":
      return {
        text: `${playerName(state, event.playerId)} 缴纳${event.label} ${money(
          event.amount,
        )} 元`,
        tone: "bad",
        icon: "🏛️",
      };
    case "card-drawn": {
      const card = content.cards[event.cardId];
      return {
        text: `${playerName(state, event.playerId)} 抽到${card?.title ?? "卡片"}`,
        tone: "gold",
        icon: card?.icon ?? "🃏",
      };
    }
    case "card-played": {
      const card = content.cards[event.cardId];
      return {
        text: `${card?.title ?? "卡片"}：${card?.text ?? ""}`,
        tone: "gold",
        icon: card?.icon ?? "🃏",
      };
    }
    case "item-bought": {
      const item = content.items[event.itemDefId];
      return {
        text: `${playerName(state, event.playerId)} 购买道具「${item?.name ?? ""}」`,
        tone: "good",
        icon: item?.icon ?? "🎒",
      };
    }
    case "item-gained": {
      const item = content.items[event.itemDefId];
      return {
        text: `${playerName(state, event.playerId)} 获得道具「${item?.name ?? ""}」`,
        tone: "good",
        icon: item?.icon ?? "🎁",
      };
    }
    case "item-used": {
      const item = content.items[event.itemDefId];
      return {
        text: `${playerName(state, event.playerId)} 使用「${item?.name ?? "道具"}」`,
        tone: "gold",
        icon: item?.icon ?? "🎒",
      };
    }
    case "skill-used": {
      const skill = Object.values(content.characters)
        .flatMap((character) => character.skills)
        .find((entry) => entry.id === event.skillId);
      return {
        text: `${playerName(state, event.playerId)} 发动技能「${skill?.name ?? ""}」`,
        tone: "gold",
        icon: skill?.icon ?? "✨",
      };
    }
    case "roadblock-placed":
      return {
        text: `${playerName(state, event.playerId)} 在 ${tileLabel(
          state,
          event.tileIndex,
        )} 放置路障`,
        tone: "info",
        icon: "🚧",
      };
    case "roadblock-triggered":
      return {
        text: `${playerName(state, event.playerId)} 被路障拦停在 ${tileLabel(
          state,
          event.tileIndex,
        )}`,
        tone: "bad",
        icon: "🚧",
      };
    case "jailed":
      return {
        text: `${playerName(state, event.playerId)} 被关进监狱 ${event.turns} 回合`,
        tone: "bad",
        icon: "⛓️",
      };
    case "hospitalized":
      return {
        text: `${playerName(state, event.playerId)} 住院 ${event.turns} 回合`,
        tone: "bad",
        icon: "🏥",
      };
    case "released":
      return {
        text: `${playerName(state, event.playerId)} 从${
          event.from === "jail" ? "监狱" : "医院"
        }出来了`,
        tone: "good",
        icon: "🕊️",
      };
    case "lottery-result":
      return event.prize > 0
        ? {
            text: `${playerName(state, event.playerId)} 中奖 ${money(
              event.prize,
            )} 元！`,
            tone: "gold",
            icon: "🎟️",
          }
        : {
            text: `${playerName(state, event.playerId)} 的彩票没有中奖`,
            tone: "info",
            icon: "🎟️",
          };
    case "share-wealth":
      return {
        text: `均富卡结算：${event.amounts
          .map((entry) => `${playerName(state, entry.playerId)} ${money(entry.amount)}`)
          .join(" / ")}`,
        tone: "gold",
        icon: "⚖️",
      };
    case "player-bankrupt":
      return {
        text: `${playerName(state, event.playerId)} 破产出局`,
        tone: "bad",
        icon: "💀",
      };
    case "doubles-again":
      return {
        text: `${playerName(state, event.playerId)} 掷出双数，可再掷一次`,
        tone: "gold",
        icon: "🔁",
      };
    case "turn-ended":
      return {
        text: `${playerName(state, event.playerId)} 结束回合`,
        tone: "info",
        icon: "➡️",
      };
    case "decision-requested":
      return null;
    case "decision-resolved":
      return null;
    case "game-ended": {
      return {
        text: `对局结束，冠军：${playerName(state, event.winnerId)}`,
        tone: "gold",
        icon: "🏆",
      };
    }
    case "log":
      return { text: event.text, tone: "info", icon: event.icon };
    default:
      return null;
  }
}
