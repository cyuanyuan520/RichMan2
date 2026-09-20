import type {
  GameContent,
  GameState,
  PlayerId,
  SkillDef,
  SkillTrigger,
} from "../core/types";
import { findPlayer } from "../rules/money";

export function skillsOf(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
): SkillDef[] {
  const player = findPlayer(state, playerId);
  const character = content.characters[player.characterId];
  return character?.skills ?? [];
}

export function skillsWithTrigger(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
  trigger: SkillTrigger,
): SkillDef[] {
  return skillsOf(state, content, playerId).filter(
    (skill) => skill.trigger === trigger,
  );
}

export function skillValueSum(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
  trigger: SkillTrigger,
): number {
  return skillsWithTrigger(state, content, playerId, trigger).reduce(
    (total, skill) => total + (skill.value ?? 0),
    0,
  );
}

export function discountFactor(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
  trigger: "buy-discount" | "upgrade-discount",
): number {
  const rate = Math.min(
    0.9,
    skillValueSum(state, content, playerId, trigger),
  );
  return 1 - rate;
}

export function discountedPrice(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
  price: number,
  trigger: "buy-discount" | "upgrade-discount",
): number {
  return Math.max(0, Math.round(price * discountFactor(state, content, playerId, trigger)));
}

export function rentFactors(
  state: GameState,
  content: GameContent,
  ownerId: PlayerId,
  payerId: PlayerId,
): number {
  const bonus = skillValueSum(state, content, ownerId, "rent-bonus");
  const discount = Math.min(0.9, skillValueSum(state, content, payerId, "rent-discount"));
  return (1 + bonus) * (1 - discount);
}

export function mitigationFactor(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
): number {
  const skills = skillsWithTrigger(
    state,
    content,
    playerId,
    "negative-card-mitigation",
  );
  if (skills.length === 0) {
    return 1;
  }
  const factor = skills.reduce(
    (current, skill) => current * (skill.value ?? 1),
    1,
  );
  return Math.max(0, Math.min(1, factor));
}

export function reducedTurns(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
  trigger: "jail-reduce" | "hospital-reduce",
  turns: number,
): number {
  const reduction = skillValueSum(state, content, playerId, trigger);
  return Math.max(1, turns - reduction);
}

export function activeSkill(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
  skillId: string,
): SkillDef | null {
  const skill = skillsOf(state, content, playerId).find(
    (entry) => entry.id === skillId && entry.trigger === "active",
  );
  return skill ?? null;
}

export function canUseActiveSkill(
  state: GameState,
  content: GameContent,
  playerId: PlayerId,
  skillId: string,
): boolean {
  const skill = activeSkill(state, content, playerId, skillId);
  if (!skill) {
    return false;
  }
  const player = findPlayer(state, playerId);
  if (player.status === "bankrupt") {
    return false;
  }
  const charges = player.skillCharges[skillId];
  if (skill.charges !== undefined && (charges ?? 0) <= 0) {
    return false;
  }
  if ((player.skillCooldowns[skillId] ?? 0) > 0) {
    return false;
  }
  return true;
}
