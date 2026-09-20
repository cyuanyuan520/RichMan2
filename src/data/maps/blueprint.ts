import type {
  GroupDef,
  MapDef,
  MapTheme,
  TileCoord,
  TileDef,
  TileKind,
} from "@/game/core/types";
import { asMapId } from "@/game/core/ids";

export const BOARD_SIZE = 40;

interface SlotPlan {
  kind: TileKind;
  groupIndex?: number;
  variant?: number;
}

export const SLOT_PLAN: SlotPlan[] = [
  { kind: "start" },
  { kind: "property", groupIndex: 0, variant: 0 },
  { kind: "chance" },
  { kind: "property", groupIndex: 0, variant: 1 },
  { kind: "tax" },
  { kind: "transport" },
  { kind: "property", groupIndex: 1, variant: 0 },
  { kind: "shop" },
  { kind: "property", groupIndex: 1, variant: 1 },
  { kind: "property", groupIndex: 1, variant: 2 },
  { kind: "jail" },
  { kind: "property", groupIndex: 2, variant: 0 },
  { kind: "utility", variant: 0 },
  { kind: "property", groupIndex: 2, variant: 1 },
  { kind: "property", groupIndex: 2, variant: 2 },
  { kind: "transport" },
  { kind: "property", groupIndex: 3, variant: 0 },
  { kind: "fate" },
  { kind: "property", groupIndex: 3, variant: 1 },
  { kind: "property", groupIndex: 3, variant: 2 },
  { kind: "hospital" },
  { kind: "property", groupIndex: 4, variant: 0 },
  { kind: "lottery" },
  { kind: "property", groupIndex: 4, variant: 1 },
  { kind: "property", groupIndex: 4, variant: 2 },
  { kind: "transport" },
  { kind: "property", groupIndex: 5, variant: 0 },
  { kind: "property", groupIndex: 5, variant: 1 },
  { kind: "utility", variant: 1 },
  { kind: "property", groupIndex: 5, variant: 2 },
  { kind: "goto-jail" },
  { kind: "property", groupIndex: 6, variant: 0 },
  { kind: "property", groupIndex: 6, variant: 1 },
  { kind: "chance" },
  { kind: "property", groupIndex: 6, variant: 2 },
  { kind: "transport" },
  { kind: "fate" },
  { kind: "property", groupIndex: 7, variant: 0 },
  { kind: "tax" },
  { kind: "property", groupIndex: 7, variant: 1 },
];

export const GROUP_PRICE_SPECS: readonly (readonly number[])[] = [
  [600, 650],
  [800, 850, 900],
  [1000, 1050, 1100],
  [1200, 1250, 1300],
  [1400, 1450, 1500],
  [1600, 1650, 1700],
  [1800, 1900, 2000],
  [2400, 2600],
];

export const TRANSPORT_PRICE = 1500;
export const UTILITY_PRICE = 1200;

const RENT_FACTORS = [0.1, 0.25, 0.5, 0.8, 1.2];
const UPGRADE_FACTORS = [0.5, 0.6, 0.8, 1.0];

const round10 = (value: number) => Math.round(value / 10) * 10;

export function rentTable(price: number): number[] {
  return RENT_FACTORS.map((factor) => round10(price * factor));
}

export function upgradeCostTable(price: number): number[] {
  return UPGRADE_FACTORS.map((factor) => round10(price * factor));
}

export interface MapNames {
  properties: string[];
  transport: [string, string, string, string];
  utility: [string, string];
  corners: { start: string; jail: string; hospital: string; gotoJail: string };
  chance: string;
  fate: string;
  shop: string;
  lottery: string;
  tax: [string, string];
}

export interface MapBlueprintInput {
  id: string;
  name: string;
  description: string;
  layout: "ring" | "path";
  tags: string[];
  theme: MapTheme;
  groups: GroupDef[];
  names: MapNames;
  coords?: TileCoord[];
  tileDescs?: Record<number, string>;
}

const TRANSPORT_ICONS = ["🚄", "✈️", "🚢", "⛵"];
const UTILITY_ICONS = ["⚡", "💧"];

const KIND_ICONS: Partial<Record<TileKind, string>> = {
  start: "🚩",
  jail: "🔒",
  hospital: "🏥",
  "goto-jail": "🚔",
  chance: "❓",
  fate: "🎴",
  shop: "🛒",
  lottery: "🎰",
  tax: "💰",
};

const KIND_DESCS: Partial<Record<TileKind, string>> = {
  start: "途经领取薪水，停留有额外奖励。",
  jail: "暂停行动，可缴纳罚金提前出狱。",
  hospital: "住院静养，暂停行动。",
  "goto-jail": "直接押入监狱。",
  chance: "抽一张机遇卡，福祸由天。",
  fate: "抽一张命运卡，人生无常。",
  shop: "购买道具，交易与博弈的利器。",
  lottery: "买一张彩票，博一个惊喜。",
  tax: "按规定缴纳费用。",
  transport: "拥有越多，过路费越高。",
  utility: "过路费随骰子点数水涨船高。",
};

export function assembleMap(input: MapBlueprintInput): MapDef {
  if (input.groups.length !== 8) {
    throw new Error(`Map ${input.id} must define 8 groups`);
  }
  if (input.names.properties.length !== 22) {
    throw new Error(`Map ${input.id} must define 22 property names`);
  }

  let propertyCursor = 0;
  let transportCursor = 0;
  let utilityCursor = 0;
  let taxCursor = 0;

  const tiles: TileDef[] = SLOT_PLAN.map((slot, index) => {
    const base: TileDef = {
      id: `${input.id}-t${index}`,
      kind: slot.kind,
      name: "",
      icon: KIND_ICONS[slot.kind],
    };
    if (input.coords?.[index]) {
      base.coord = input.coords[index];
    }
    const desc = input.tileDescs?.[index] ?? KIND_DESCS[slot.kind];
    if (desc) {
      base.desc = desc;
    }

    switch (slot.kind) {
      case "property": {
        const name = input.names.properties[propertyCursor];
        propertyCursor += 1;
        const group = input.groups[slot.groupIndex as number];
        const price =
          GROUP_PRICE_SPECS[slot.groupIndex as number]?.[slot.variant as number];
        if (!name || !group || price === undefined) {
          throw new Error(`Map ${input.id} property slot ${index} invalid`);
        }
        base.name = name;
        base.group = group.id;
        base.price = price;
        base.rents = rentTable(price);
        base.upgradeCosts = upgradeCostTable(price);
        base.subtitle = group.name;
        return base;
      }
      case "transport": {
        base.name = input.names.transport[transportCursor] as string;
        base.icon = TRANSPORT_ICONS[transportCursor];
        base.price = TRANSPORT_PRICE;
        base.subtitle = "交通枢纽";
        transportCursor += 1;
        return base;
      }
      case "utility": {
        base.name = input.names.utility[utilityCursor] as string;
        base.icon = UTILITY_ICONS[utilityCursor];
        base.price = UTILITY_PRICE;
        base.subtitle = "公共事业";
        utilityCursor += 1;
        return base;
      }
      case "start":
        base.name = input.names.corners.start;
        return base;
      case "jail":
        base.name = input.names.corners.jail;
        return base;
      case "hospital":
        base.name = input.names.corners.hospital;
        return base;
      case "goto-jail":
        base.name = input.names.corners.gotoJail;
        return base;
      case "chance":
        base.name = input.names.chance;
        return base;
      case "fate":
        base.name = input.names.fate;
        return base;
      case "shop":
        base.name = input.names.shop;
        return base;
      case "lottery":
        base.name = input.names.lottery;
        return base;
      case "tax": {
        base.name = input.names.tax[taxCursor] as string;
        base.tax =
          taxCursor === 0
            ? { kind: "percent-cash", rate: 0.1 }
            : { kind: "flat", amount: 1500 };
        taxCursor += 1;
        return base;
      }
      default:
        return base;
    }
  });

  return {
    id: asMapId(input.id),
    name: input.name,
    description: input.description,
    layout: input.layout,
    tags: input.tags,
    theme: input.theme,
    groups: input.groups,
    tiles,
  };
}
