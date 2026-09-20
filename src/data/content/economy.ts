import type { EconomyConfig } from "@/game/core/types";

export const defaultEconomy: EconomyConfig = {
  startingMoney: 20000,
  goSalary: 2000,
  startLandingBonus: 1000,
  jailFine: 1500,
  jailTurns: 2,
  hospitalTurns: 2,
  maxBuildingLevel: 4,
  groupMonopolyRentBonus: 1.5,
  transportRents: [250, 500, 1000, 2000],
  utilityMultipliers: [4, 10],
  mortgageRefundRate: 0.5,
  mortgageInterest: 0.1,
  sellRefundRate: 0.5,
  lotteryTicketPrice: 1000,
  lotteryPrizes: [0, 0, 2500, 15000],
};
