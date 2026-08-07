/**
 * GameSession 的经验与升级计算。
 *
 * 这里只接收玩家经验字段、击败的怪物和计算函数，不读取其他会话状态，
 * 也不触发快照通知。GameSession 在命令完成后统一提交通知和存档。
 */
import type { ExperienceSettlement, Monster } from "../shared/types";

/** 经验达到这些阈值时依次进入下一个等级。顺序属于存档兼容规则。 */
export const LEVEL_XP_THRESHOLDS = [0, 2, 4, 6, 8, 14, 22, 32, 44, 58, 74, 92, 112] as const;

const XP_BY_RANK: Readonly<Record<Monster["rank"], number>> = {
  normal: 1,
  elite: 3,
  boss: 5,
};

export function experienceForRank(rank: Monster["rank"]): number {
  return XP_BY_RANK[rank];
}

export function levelForXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  return LEVEL_XP_THRESHOLDS.reduce(
    (level, threshold, index) => safeXp >= threshold ? index + 1 : level,
    1,
  );
}

export function maxHpForLevel(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 2);
}

export interface ExperienceState {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
}

export interface ExperienceRules {
  experienceForRank: (rank: Monster["rank"]) => number;
  levelForXp: (xp: number) => number;
  maxHpForLevel: (level: number) => number;
}

/** 应用一次击杀经验，并返回可供 UI 展示的前后差异。 */
export function applyExperienceSettlement(
  monster: Monster,
  player: ExperienceState,
  rules: ExperienceRules,
): ExperienceSettlement {
  const gained = rules.experienceForRank(monster.rank);
  const previousXp = player.xp;
  const previousLevel = player.level;
  const previousMaxHp = player.maxHp;
  player.xp += gained;
  player.level = rules.levelForXp(player.xp);
  const maxHpGained = Math.max(
    0,
    rules.maxHpForLevel(player.level) - rules.maxHpForLevel(previousLevel),
  );
  if (maxHpGained > 0) {
    player.maxHp += maxHpGained;
    player.hp = Math.min(player.maxHp, player.hp + maxHpGained);
  }
  return {
    monsterId: monster.id,
    monsterName: monster.name,
    gained,
    previousXp,
    currentXp: player.xp,
    previousLevel,
    currentLevel: player.level,
    previousMaxHp,
    currentMaxHp: player.maxHp,
  };
}
