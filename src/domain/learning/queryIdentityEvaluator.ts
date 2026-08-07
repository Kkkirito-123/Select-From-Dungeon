/**
 * 未揭示身份字段的判题结果边界。
 *
 * 这里不解析 SQL，也不访问 SQLite；SQL 文本扫描仍由调用方提供。模块只
 * 把身份防火墙的命中结果转换成稳定的课程失败结果，避免判题门面同时负责
 * 结果对象的组装和身份规则的扫描。
 */
import type {
  LessonStageDefinition,
  QueryEvaluation,
} from "../shared/types";

/**
 * 根据身份字段扫描结果创建当前回合的失败结果。
 *
 * @param stage 当前课程阶段，用于保留未破解的课程锁。
 * @param message 身份防火墙面向玩家的固定提示；为空表示没有触发拦截。
 * @returns 失败结果，或表示本次查询不属于身份拦截的 `null`。
 */
export function identityQueryEvaluation(
  stage: LessonStageDefinition,
  message: string | null,
): QueryEvaluation | null {
  if (!message) return null;
  return {
    accepted: false,
    kind: "wrong-result",
    message,
    locksBroken: [],
    locksRemaining: [...stage.locks],
    attackTargetIds: [],
  };
}

/**
 * 判断身份防火墙是否应该返回提示。
 *
 * 将检测函数的结果作为参数传入，使本模块不依赖 SQL 文本实现，也方便
 * 单元测试直接覆盖楼层范围、身份揭示和命中条件。
 */
export function identityQueryMessage(
  floor: number,
  identityRevealed: boolean,
  detected: boolean,
  message: string,
): string | null {
  if (floor < 1 || floor > 8 || identityRevealed || !detected) return null;
  return message;
}
