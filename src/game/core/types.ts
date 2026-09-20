import type {
  CharacterId,
  ItemInstanceId,
  MapId,
  PlayerId,
  TileId,
} from "./ids";
import type { RngState } from "./rng";

export type {
  CharacterId,
  ItemInstanceId,
  MapId,
  PlayerId,
  TileId,
} from "./ids";

export type TileKind =
  | "start"
  | "property"
  | "transport"
  | "utility"
  | "chance"
  | "fate"
  | "tax"
  | "jail"
  | "hospital"
  | "goto-jail"
  | "shop"
  | "lottery";

export type DeckId = "chance" | "fate";

export interface TileCoord {
  x: number;
  y: number;
}

export interface TileDef {
  id: string;
  kind: TileKind;
  name: string;
  subtitle?: string;
  group?: string;
  price?: number;
  rents?: number[];
  upgradeCosts?: number[];
  tax?:
    | { kind: "percent-cash"; rate: number }
    | { kind: "flat"; amount: number };
  icon?: string;
  coord?: TileCoord;
  desc?: string;
}

export interface GroupDef {
  id: string;
  name: string;
  color: string;
  tier: number;
}

export interface MapTheme {
  backgroundImage: string;
  backgroundSize: "cover" | "contain";
  boardArea: { top: number; left: number; width: number; height: number };
  accent: string;
  accentSoft: string;
  boardBg: string;
  boardBorder: string;
  panelBg: string;
  panelText: string;
}

export interface MapDef {
  id: MapId;
  name: string;
  description: string;
  layout: "ring" | "path";
  tags: string[];
  theme: MapTheme;
  groups: GroupDef[];
  tiles: TileDef[];
}

export interface EconomyConfig {
  startingMoney: number;
  goSalary: number;
  startLandingBonus: number;
  jailFine: number;
  jailTurns: number;
  hospitalTurns: number;
  maxBuildingLevel: number;
  groupMonopolyRentBonus: number;
  transportRents: number[];
  utilityMultipliers: number[];
  mortgageRefundRate: number;
  mortgageInterest: number;
  sellRefundRate: number;
  lotteryTicketPrice: number;
  lotteryPrizes: number[];
}

export type MoveDestination =
  | "start"
  | "jail"
  | "hospital"
  | "shop"
  | "lottery"
  | "nearest-transport"
  | "random-property";

export type CardEffect =
  | { kind: "money"; amount: number }
  | { kind: "money-percent"; rate: number }
  | { kind: "collect-from-each"; amount: number }
  | { kind: "pay-each"; amount: number }
  | { kind: "move-to"; destination: MoveDestination }
  | { kind: "move-steps"; steps: number }
  | { kind: "jail"; turns: number }
  | { kind: "hospital"; turns: number }
  | { kind: "get-out-of-jail" }
  | { kind: "gain-item"; itemDefId: string }
  | { kind: "collect-per-building"; amountPerLevel: number }
  | { kind: "pay-per-building"; amountPerLevel: number }
  | { kind: "swap-position" }
  | { kind: "teleport" }
  | { kind: "free-rent-turns"; turns: number }
  | { kind: "choose-dice" }
  | { kind: "place-roadblock" }
  | { kind: "rent-shield" }
  | { kind: "demolish"; levels?: number }
  | { kind: "skip-turn" }
  | { kind: "audit"; rate: number }
  | { kind: "force-buy"; multiplier: number }
  | { kind: "share-wealth" };

export type TargetedEffectKind =
  | "swap-position"
  | "teleport"
  | "place-roadblock"
  | "demolish"
  | "skip-turn"
  | "audit"
  | "force-buy";

export interface EffectTarget {
  playerId?: PlayerId;
  tileIndex?: number;
}

export interface CardDef {
  id: string;
  deck: DeckId;
  title: string;
  text: string;
  icon?: string;
  effects: CardEffect[];
  weight?: number;
}

export type ItemTargetKind = "none" | "self" | "opponent" | "tile" | "opponent-property";

export interface ItemDef {
  id: string;
  name: string;
  text: string;
  icon?: string;
  price: number;
  target: ItemTargetKind;
  targetRange?: number;
  effects: CardEffect[];
}

export type SkillTrigger =
  | "pass-start"
  | "buy-discount"
  | "upgrade-discount"
  | "rent-discount"
  | "rent-bonus"
  | "negative-card-mitigation"
  | "hospital-reduce"
  | "jail-reduce"
  | "active";

export interface SkillDef {
  id: string;
  name: string;
  text: string;
  icon?: string;
  trigger: SkillTrigger;
  value?: number;
  cooldownRounds?: number;
  charges?: number;
  effects?: CardEffect[];
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  text: string;
  avatar: string;
  color: string;
  skills: SkillDef[];
}

export interface PlayerStats {
  rolls: number;
  doubles: number;
  steps: number;
  rentPaid: number;
  rentReceived: number;
  bought: number;
  upgraded: number;
  taxPaid: number;
  itemsUsed: number;
  cardsDrawn: number;
}

export interface ItemInstance {
  id: ItemInstanceId;
  defId: string;
}

export type PlayerStatus = "active" | "jailed" | "hospitalized" | "bankrupt";

export type BotDifficulty = "easy" | "normal" | "hard";

export interface Player {
  id: PlayerId;
  seat: number;
  name: string;
  characterId: CharacterId;
  tokenId: string;
  money: number;
  position: number;
  properties: TileId[];
  items: ItemInstance[];
  status: PlayerStatus;
  statusTurns: number;
  doublesStreak: number;
  rentShields: number;
  skipTurns: number;
  forcedDice: number | null;
  jailFreeCards: number;
  lotteryBoughtThisTurn: boolean;
  skillCooldowns: Record<string, number>;
  skillCharges: Record<string, number>;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  stats: PlayerStats;
}

export interface TileEffect {
  kind: "roadblock";
  ownerId: PlayerId;
}

export interface TileState {
  index: number;
  defId: string;
  ownerId: PlayerId | null;
  level: number;
  mortgaged: boolean;
  effects: TileEffect[];
}

export interface DebtShare {
  creditorId: PlayerId | null;
  amount: number;
  reason: MoneyReason;
}

export type PendingDecision =
  | {
      kind: "buy-property";
      playerId: PlayerId;
      tileIndex: number;
      price: number;
    }
  | {
      kind: "raise-funds";
      playerId: PlayerId;
      creditorId: PlayerId | null;
      amount: number;
      reason: MoneyReason;
      shares: DebtShare[];
    }
  | {
      kind: "item-target";
      playerId: PlayerId;
      itemId: ItemInstanceId;
      target: ItemTargetKind;
    }
  | {
      kind: "card-target";
      playerId: PlayerId;
      sourceId: string;
    }
  | {
      kind: "choose-dice";
      playerId: PlayerId;
    };

export type RaiseFundsDecision = Extract<PendingDecision, { kind: "raise-funds" }>;

export interface ItemTargetOption {
  kind: "player" | "tile";
  playerId?: PlayerId;
  tileIndex?: number;
  label: string;
}

export type MoneyReason =
  | "salary"
  | "rent"
  | "purchase"
  | "upgrade"
  | "tax"
  | "card"
  | "item"
  | "skill"
  | "lottery"
  | "jail-fine"
  | "mortgage"
  | "unmortgage"
  | "sell-building"
  | "share-wealth"
  | "bankruptcy"
  | "refund";

export type GameEvent =
  | { type: "game-started"; playerIds: PlayerId[]; mapId: MapId }
  | { type: "turn-started"; playerId: PlayerId; round: number }
  | {
      type: "dice-rolled";
      playerId: PlayerId;
      dice: [number, number];
      doubles: boolean;
    }
  | {
      type: "token-moved";
      playerId: PlayerId;
      from: number;
      to: number;
      path: number[];
      passedStart: boolean;
    }
  | {
      type: "money-changed";
      playerId: PlayerId;
      delta: number;
      reason: MoneyReason;
      balance: number;
    }
  | {
      type: "rent-paid";
      fromId: PlayerId;
      toId: PlayerId;
      amount: number;
      tileIndex: number;
    }
  | { type: "property-bought"; playerId: PlayerId; tileIndex: number; price: number }
  | {
      type: "property-upgraded";
      playerId: PlayerId;
      tileIndex: number;
      level: number;
      cost: number;
    }
  | { type: "property-mortgaged"; playerId: PlayerId; tileIndex: number; amount: number }
  | { type: "property-unmortgaged"; playerId: PlayerId; tileIndex: number; cost: number }
  | { type: "building-sold"; playerId: PlayerId; tileIndex: number; level: number; amount: number }
  | { type: "tax-paid"; playerId: PlayerId; amount: number; label: string }
  | { type: "card-drawn"; playerId: PlayerId; cardId: string; deck: DeckId }
  | { type: "card-played"; playerId: PlayerId; cardId: string; targetId?: PlayerId }
  | { type: "item-bought"; playerId: PlayerId; itemDefId: string; price: number }
  | { type: "item-gained"; playerId: PlayerId; itemDefId: string }
  | { type: "item-used"; playerId: PlayerId; itemDefId: string; targetId?: PlayerId; tileIndex?: number }
  | { type: "skill-used"; playerId: PlayerId; skillId: string }
  | { type: "roadblock-placed"; playerId: PlayerId; tileIndex: number }
  | { type: "roadblock-triggered"; playerId: PlayerId; tileIndex: number }
  | { type: "jailed"; playerId: PlayerId; turns: number }
  | { type: "hospitalized"; playerId: PlayerId; turns: number }
  | { type: "released"; playerId: PlayerId; from: "jail" | "hospital" }
  | { type: "lottery-result"; playerId: PlayerId; cost: number; prize: number }
  | { type: "share-wealth"; amounts: Array<{ playerId: PlayerId; amount: number }> }
  | { type: "player-bankrupt"; playerId: PlayerId; creditorId: PlayerId | null }
  | { type: "doubles-again"; playerId: PlayerId }
  | { type: "turn-ended"; playerId: PlayerId }
  | { type: "decision-requested"; decision: PendingDecision }
  | { type: "decision-resolved"; kind: PendingDecision["kind"]; playerId: PlayerId }
  | { type: "game-ended"; winnerId: PlayerId; standings: PlayerId[] }
  | { type: "log"; text: string; icon?: string };

export type TurnPhase =
  | "setup"
  | "await-roll"
  | "await-decision"
  | "action-window"
  | "finished";

export interface GameContent {
  map: MapDef;
  cards: Record<string, CardDef>;
  items: Record<string, ItemDef>;
  characters: Record<string, CharacterDef>;
  contentHash: string;
}

export interface GameSetup {
  mapId: MapId;
  players: Array<{
    name: string;
    characterId: CharacterId;
    tokenId: string;
    isBot: boolean;
    botDifficulty?: BotDifficulty;
  }>;
  seed: number;
  targetRounds: number;
  economy: EconomyConfig;
}

export type ResolutionTask =
  | { kind: "landing"; playerId: PlayerId; diceSum: number }
  | {
      kind: "effects";
      playerId: PlayerId;
      effects: CardEffect[];
      index: number;
      target: EffectTarget | null;
      sourceKind: "card" | "item" | "skill";
      sourceId: string;
    };

export interface GameState {
  version: number;
  mapId: MapId;
  contentHash: string;
  seq: number;
  rng: RngState;
  seed: number;
  itemSeq: number;
  round: number;
  turnSeat: number;
  phase: TurnPhase;
  lastRoll: [number, number] | null;
  players: Player[];
  tiles: TileState[];
  tileDefs: TileDef[];
  rollAgain: boolean;
  chanceDeck: string[];
  fateDeck: string[];
  chanceDiscard: string[];
  fateDiscard: string[];
  pending: PendingDecision | null;
  debtQueue: RaiseFundsDecision[];
  queue: ResolutionTask[];
  config: {
    targetRounds: number;
    economy: EconomyConfig;
  };
  winnerId: PlayerId | null;
  standings: PlayerId[];
  turnCount: number;
}

export type GameAction =
  | {
      type: "roll-dice";
      playerId: PlayerId;
      forcedDice?: [number, number];
    }
  | { type: "buy-property"; playerId: PlayerId }
  | { type: "decline-buy"; playerId: PlayerId }
  | { type: "upgrade-property"; playerId: PlayerId; tileIndex: number }
  | { type: "sell-building"; playerId: PlayerId; tileIndex: number }
  | { type: "mortgage-property"; playerId: PlayerId; tileIndex: number }
  | { type: "unmortgage-property"; playerId: PlayerId; tileIndex: number }
  | { type: "buy-item"; playerId: PlayerId; itemDefId: string }
  | { type: "use-item"; playerId: PlayerId; itemId: ItemInstanceId }
  | { type: "use-skill"; playerId: PlayerId; skillId: string }
  | { type: "buy-lottery"; playerId: PlayerId }
  | { type: "pay-jail-fine"; playerId: PlayerId }
  | { type: "resolve-target"; playerId: PlayerId; target: EffectTarget }
  | { type: "cancel-target"; playerId: PlayerId }
  | { type: "choose-dice"; playerId: PlayerId; value: number }
  | { type: "give-up"; playerId: PlayerId }
  | { type: "end-turn"; playerId: PlayerId }
  | { type: "raise-funds-done"; playerId: PlayerId }
  | { type: "declare-bankrupt"; playerId: PlayerId };

export interface ReduceResult {
  state: GameState;
  seq: number;
  events: GameEvent[];
}
