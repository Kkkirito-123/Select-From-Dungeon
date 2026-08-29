/**
 * GameSession 战斗命令的纯结果辅助函数。
 *
 * SQL 判题、伤害结算和死亡状态仍由 GameSession 协调；这个模块只构造
 * 初始战斗状态与“不接受本回合”的统一结果。
 */
import { counterDamageForMonster } from "../combat/combatBalance";
import type { CombatState, LessonStageDefinition, Monster, PlayMode, TurnResolution } from "../shared/types";

/** 根据怪物和首题构造一份独立的初始战斗状态。 */
export function createCombatState(
  monster: Monster,
  stage: LessonStageDefinition,
): CombatState {
  return {
    targetId: monster.id,
    kind: monster.encounterType,
    round: 1,
    successStep: 0,
    intent: {
      name: monster.attackName,
      damage: counterDamageForMonster(monster),
      locks: [...stage.locks],
    },
  };
}

/** 创建一个不改变生命值和战斗状态的空回合结果。 */
export function emptyTurn(
  mode: PlayMode,
  message: string,
  queryTargetIds: number[],
): TurnResolution {
  return {
    accepted: false,
    resultDisclosure: "shape-only",
    message,
    queryTargetIds,
    attackTargetIds: [],
    hpUpdates: [],
    killedIds: [],
    playerDamage: 0,
    armorDamage: 0,
    heatAdded: 0,
    locksBroken: [],
    locksRemaining: [],
    events: [],
    mode,
    stageAdvanced: false,
    lessonCompleted: null,
    experience: null,
  };
}
