import type { GameEvent, GameContent, GameState, PlayerId } from "../core/types";
import { asItemInstanceId } from "../core/ids";
import { findPlayer } from "./money";
import { teleportPlayer } from "./movement";
import { reducedTurns } from "../systems/skills";

export function sendToJail(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  turns?: number,
): void {
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    return;
  }
  const jailIndex = findTileIndex(state, "jail");
  const base = turns ?? state.config.economy.jailTurns;
  const finalTurns = reducedTurns(state, content, playerId, "jail-reduce", base);
  teleportPlayer(state, events, playerId, jailIndex);
  player.status = "jailed";
  player.statusTurns = finalTurns;
  player.doublesStreak = 0;
  events.push({ type: "jailed", playerId, turns: finalTurns });
  events.push({ type: "log", text: `${player.name} 被押入监狱`, icon: "🚔" });
}

export function hospitalize(
  state: GameState,
  events: GameEvent[],
  content: GameContent,
  playerId: PlayerId,
  turns?: number,
): void {
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    return;
  }
  const hospitalIndex = findTileIndex(state, "hospital");
  const base = turns ?? state.config.economy.hospitalTurns;
  const finalTurns = reducedTurns(
    state,
    content,
    playerId,
    "hospital-reduce",
    base,
  );
  teleportPlayer(state, events, playerId, hospitalIndex);
  player.status = "hospitalized";
  player.statusTurns = finalTurns;
  events.push({ type: "hospitalized", playerId, turns: finalTurns });
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

export function findTileIndex(state: GameState, kind: string, occurrence = 0): number {
  let seen = 0;
  for (let i = 0; i < state.tileDefs.length; i += 1) {
    if (state.tileDefs[i]?.kind === kind) {
      if (seen === occurrence) {
        return i;
      }
      seen += 1;
    }
  }
  return -1;
}

export function addItem(
  state: GameState,
  events: GameEvent[],
  playerId: PlayerId,
  itemDefId: string,
): void {
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    return;
  }
  state.itemSeq += 1;
  player.items.push({
    id: asItemInstanceId(`i${state.itemSeq}`),
    defId: itemDefId,
  });
  events.push({ type: "item-gained", playerId, itemDefId });
}

export function removeItem(
  state: GameState,
  playerId: PlayerId,
  itemInstanceId: string,
): void {
  const player = findPlayer(state, playerId);
  player.items = player.items.filter((item) => item.id !== itemInstanceId);
}
