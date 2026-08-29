/** 战斗经验结算及其玩家可见文案；不负责快照或奖励掉落。 */
import type { ExperienceSettlement, Monster, PlayerState } from "../../shared/types";
import {
  applyExperienceSettlement,
  experienceForRank,
  levelForXp,
  maxHpForLevel,
} from "../sessionProgression";

/** Apply one monster's deterministic XP settlement to the supplied player slice. */
export function awardExperience(
  monster: Monster,
  player: PlayerState,
): ExperienceSettlement {
  return applyExperienceSettlement(monster, player, {
    experienceForRank,
    levelForXp,
    maxHpForLevel,
  });
}

/** Describe the settlement without depending on GameSession or UI objects. */
export function describeExperience(experience: ExperienceSettlement): string {
  const maxHpGained = experience.currentMaxHp - experience.previousMaxHp;
  if (experience.currentLevel > experience.previousLevel) {
    return maxHpGained > 0
      ? `获得 ${experience.gained} XP，升至 LV.${experience.currentLevel}，生命上限 +${maxHpGained}。`
      : `获得 ${experience.gained} XP，升至 LV.${experience.currentLevel}。生命上限暂不变化。`;
  }
  return `获得 ${experience.gained} XP（${experience.currentXp} XP / LV.${experience.currentLevel}）。`;
}
