import type { GameAction } from "@/game/core/types";
import type { ClientIntent } from "./protocol";

export function toIntent(action: GameAction): ClientIntent | null {
  switch (action.type) {
    case "roll-dice":
      return { type: "roll-dice" };
    case "buy-property":
      return { type: "buy-property" };
    case "decline-buy":
      return { type: "decline-buy" };
    case "upgrade-property":
      return { type: "upgrade-property", tileIndex: action.tileIndex };
    case "sell-building":
      return { type: "sell-building", tileIndex: action.tileIndex };
    case "mortgage-property":
      return { type: "mortgage-property", tileIndex: action.tileIndex };
    case "unmortgage-property":
      return { type: "unmortgage-property", tileIndex: action.tileIndex };
    case "buy-item":
      return { type: "buy-item", itemDefId: action.itemDefId };
    case "use-item":
      return { type: "use-item", itemId: action.itemId };
    case "use-skill":
      return { type: "use-skill", skillId: action.skillId };
    case "buy-lottery":
      return { type: "buy-lottery" };
    case "pay-jail-fine":
      return { type: "pay-jail-fine" };
    case "resolve-target":
      return {
        type: "resolve-target",
        target: {
          playerId: action.target.playerId,
          tileIndex: action.target.tileIndex,
        },
      };
    case "cancel-target":
      return { type: "cancel-target" };
    case "choose-dice":
      return { type: "choose-dice", value: action.value };
    case "raise-funds-done":
      return { type: "raise-funds-done" };
    case "declare-bankrupt":
      return { type: "declare-bankrupt" };
    case "give-up":
      return { type: "give-up" };
    case "end-turn":
      return { type: "end-turn" };
    default:
      return null;
  }
}
