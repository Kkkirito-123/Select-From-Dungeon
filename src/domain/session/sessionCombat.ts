/**
 * GameSession 战斗命令的纯结果辅助函数。
 *
 * SQL 判题、伤害结算和死亡状态仍由 GameSession 协调；这个模块只负责
 * 构造“不接受本回合”的统一结果，避免表现层猜测缺省字段。
 */
import type { PlayMode, TurnResolution } from "../shared/types";

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
