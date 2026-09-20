import { z } from "zod";
import type {
  CardDef,
  CardEffect,
  CharacterDef,
  EconomyConfig,
  GroupDef,
  ItemDef,
  MapDef,
  MapTheme,
  TileCoord,
  TileDef,
} from "@/game/core/types";

const TileCoordSchema: z.ZodType<TileCoord> = z.object({
  x: z.number().min(-20).max(120),
  y: z.number().min(-20).max(120),
});

const TileKindSchema = z.enum([
  "start",
  "property",
  "transport",
  "utility",
  "chance",
  "fate",
  "tax",
  "jail",
  "hospital",
  "goto-jail",
  "shop",
  "lottery",
]);

export const TileDefSchema: z.ZodType<TileDef> = z.object({
  id: z.string().min(1),
  kind: TileKindSchema,
  name: z.string().min(1),
  subtitle: z.string().optional(),
  group: z.string().optional(),
  price: z.number().int().positive().optional(),
  rents: z.array(z.number().int().min(0)).optional(),
  upgradeCosts: z.array(z.number().int().positive()).optional(),
  tax: z
    .union([
      z.object({ kind: z.literal("percent-cash"), rate: z.number().min(0).max(1) }),
      z.object({ kind: z.literal("flat"), amount: z.number().int().positive() }),
    ])
    .optional(),
  icon: z.string().optional(),
  coord: TileCoordSchema.optional(),
  desc: z.string().optional(),
});

export const GroupDefSchema: z.ZodType<GroupDef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  tier: z.number().int().min(1).max(8),
});

export const MapThemeSchema: z.ZodType<MapTheme> = z.object({
  backgroundImage: z.string().min(1),
  backgroundSize: z.enum(["cover", "contain"]),
  boardArea: z.object({
    top: z.number(),
    left: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  accent: z.string().min(1),
  accentSoft: z.string().min(1),
  boardBg: z.string().min(1),
  boardBorder: z.string().min(1),
  panelBg: z.string().min(1),
  panelText: z.string().min(1),
});

export const MapDefSchema: z.ZodType<MapDef> = z.object({
  id: z.string().min(1) as unknown as z.ZodType<MapDef["id"]>,
  name: z.string().min(1),
  description: z.string().min(1),
  layout: z.enum(["ring", "path"]),
  tags: z.array(z.string()),
  theme: MapThemeSchema,
  groups: z.array(GroupDefSchema),
  tiles: z.array(TileDefSchema),
});

export const EconomyConfigSchema: z.ZodType<EconomyConfig> = z.object({
  startingMoney: z.number().int().positive(),
  goSalary: z.number().int().positive(),
  startLandingBonus: z.number().int().min(0),
  jailFine: z.number().int().positive(),
  jailTurns: z.number().int().min(1),
  hospitalTurns: z.number().int().min(1),
  hospitalFee: z.number().int().min(0),
  maxBuildingLevel: z.number().int().min(1).max(5),
  groupMonopolyRentBonus: z.number().min(1),
  transportRents: z.array(z.number().int().min(0)).min(2),
  utilityMultipliers: z.array(z.number().min(1)).min(2),
  mortgageRefundRate: z.number().min(0).max(1),
  mortgageInterest: z.number().min(0),
  lotteryTicketPrice: z.number().int().positive(),
  lotteryPrizes: z.array(z.number().int().min(0)),
  shopDiscountRate: z.number().min(0).max(1),
  taxRefundRate: z.number().min(0),
});

export const MoveDestinationSchema = z.enum([
  "start",
  "jail",
  "hospital",
  "shop",
  "lottery",
  "nearest-transport",
  "random-property",
]);

export const CardEffectSchema: z.ZodType<CardEffect> = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("money"), amount: z.number().int() }),
    z.object({ kind: z.literal("money-percent"), rate: z.number() }),
    z.object({ kind: z.literal("collect-from-each"), amount: z.number().int().positive() }),
    z.object({ kind: z.literal("pay-each"), amount: z.number().int().positive() }),
    z.object({ kind: z.literal("move-to"), destination: MoveDestinationSchema }),
    z.object({ kind: z.literal("move-steps"), steps: z.number().int() }),
    z.object({ kind: z.literal("jail"), turns: z.number().int().min(1) }),
    z.object({ kind: z.literal("hospital"), turns: z.number().int().min(1) }),
    z.object({ kind: z.literal("get-out-of-jail") }),
    z.object({ kind: z.literal("gain-item"), itemDefId: z.string().min(1) }),
    z.object({ kind: z.literal("collect-per-building"), amountPerLevel: z.number().int().positive() }),
    z.object({ kind: z.literal("pay-per-building"), amountPerLevel: z.number().int().positive() }),
    z.object({ kind: z.literal("swap-position") }),
    z.object({ kind: z.literal("teleport") }),
    z.object({ kind: z.literal("free-rent-turns"), turns: z.number().int().min(1) }),
    z.object({ kind: z.literal("choose-dice") }),
    z.object({ kind: z.literal("place-roadblock") }),
    z.object({ kind: z.literal("rent-shield") }),
    z.object({ kind: z.literal("demolish"), levels: z.number().int().min(1).optional() }),
    z.object({ kind: z.literal("skip-turn") }),
    z.object({ kind: z.literal("audit"), rate: z.number().min(0).max(1) }),
    z.object({ kind: z.literal("force-buy"), multiplier: z.number().min(1) }),
    z.object({ kind: z.literal("share-wealth") }),
  ] as const,
) as z.ZodType<CardEffect>;

export const CardDefSchema: z.ZodType<CardDef> = z.object({
  id: z.string().min(1),
  deck: z.enum(["chance", "fate"]),
  title: z.string().min(1),
  text: z.string().min(1),
  icon: z.string().optional(),
  effects: z.array(CardEffectSchema).min(1),
  weight: z.number().positive().optional(),
});

export const ItemDefSchema: z.ZodType<ItemDef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  text: z.string().min(1),
  icon: z.string().optional(),
  price: z.number().int().positive(),
  target: z.enum(["none", "self", "opponent", "tile", "opponent-property"]),
  effects: z.array(CardEffectSchema).min(1),
  combatOnly: z.boolean().optional(),
});

const SkillDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  text: z.string().min(1),
  icon: z.string().optional(),
  trigger: z.enum([
    "game-start",
    "pass-start",
    "turn-start",
    "buy-discount",
    "upgrade-discount",
    "rent-discount",
    "rent-bonus",
    "negative-card-mitigation",
    "hospital-reduce",
    "jail-reduce",
    "active",
  ]),
  value: z.number().optional(),
  cooldownRounds: z.number().int().min(1).optional(),
  charges: z.number().int().min(1).optional(),
  effects: z.array(CardEffectSchema).optional(),
});

export const CharacterDefSchema: z.ZodType<CharacterDef> = z.object({
  id: z.string().min(1) as unknown as z.ZodType<CharacterDef["id"]>,
  name: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  avatar: z.string().min(1),
  color: z.string().min(1),
  skills: z.array(SkillDefSchema).min(1),
});

export const PlayerSetupSchema = z.object({
  name: z.string().min(1).max(12),
  characterId: z.string().min(1),
  tokenId: z.string().min(1),
  isBot: z.boolean(),
  botDifficulty: z.enum(["easy", "normal", "hard"]).optional(),
});

export const GameSetupSchema = z.object({
  mapId: z.string().min(1),
  players: z.array(PlayerSetupSchema).min(2).max(4),
  seed: z.number().int(),
  targetRounds: z.number().int().min(0),
  economy: EconomyConfigSchema,
});
