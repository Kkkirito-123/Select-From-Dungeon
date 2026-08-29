/**
 * SQL 课程判题聚合门面。
 *
 * 本模块只负责选择课程阶段、组合身份规则和结果语义模块。
 * SQL 执行由 SqlEngine 负责，游戏状态变化由 GameSession 负责。
 */
import type {
  LessonId,
  LessonStageDefinition,
  QueryEvaluation,
  SqlQueryResult,
} from "../shared/types";
import {
  evaluateStageResult,
  matchesQuestionExpectation,
} from "./stageResultEvaluator";
import {
  authoredWrongResultMessage,
  matchesAuthoredStage,
} from "./lessonResultEvaluator";
import { isFlatBeginnerSelect, stageFor } from "./lessonLocks";
export { detectQueryFeatures } from "./queryFeatureDetector";
export {
  evaluateUnrevealedIdentityQuery,
  unrevealedIdentityQueryMessage,
} from "./queryIdentityRules";

export function evaluateLesson(
  lessonId: LessonId,
  stageIndex: number,
  result: SqlQueryResult,
): QueryEvaluation {
  const stage = stageFor(lessonId, stageIndex);
  return evaluateStage(stage, result);
}
/**
 * 组合课程锁、题库期望值和固定阶段语义。
 * 这里不保存课程规则；规则分别由 lessonLocks 与 lessonResultEvaluator 提供。
 */
export function evaluateStage(
  stage: LessonStageDefinition,
  result: SqlQueryResult,
): QueryEvaluation {
  return evaluateStageResult(stage, result, {
    questionExpectationMatches: (currentStage, currentResult) => (
      matchesQuestionExpectation(currentStage, currentResult, isFlatBeginnerSelect)
    ),
    stageMatches: matchesAuthoredStage,
    wrongResultMessage: authoredWrongResultMessage,
    missingConceptMessage: (locks) => (
      `结果可能接近，但还没有使用本回合核心：${locks.join(" + ")}。`
    ),
    exactMessage: (locks) => `查询正确，${locks.join(" + ")} 锁全部破除。`,
    missingExpectationMessage: "练习题缺少可验证的基础题契约，已停止本回合结算。",
    invalidExpectationMessage: "查询结构已接近，但结果列、行值、顺序或计划证据与本题目标不一致。",
  });
}
