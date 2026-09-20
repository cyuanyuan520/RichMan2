import type { EconomyConfig, TileDef } from "@/game/core/types";
import { formatMoney } from "@/lib/format";

export function rentCellsFor(
  def: TileDef,
  economy: EconomyConfig,
): Array<[string, string]> {
  if (def.kind === "transport") {
    return economy.transportRents.map((rent, index) => [
      `持有 ${index + 1} 处`,
      formatMoney(rent),
    ]);
  }
  if (def.kind === "utility") {
    return economy.utilityMultipliers.map((multiplier, index) => [
      `持有 ${index + 1} 处`,
      `点数 ×${multiplier}`,
    ]);
  }
  if (def.kind !== "property") {
    return [];
  }
  return [
    ["基础租金", formatMoney(def.rents?.[0] ?? 0)],
    ["满级租金", formatMoney(def.rents?.[def.rents.length - 1] ?? 0)],
  ];
}
