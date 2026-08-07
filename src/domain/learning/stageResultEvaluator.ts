/**
 * 课程阶段结果的通用判定协调器。
 *
 * 本模块不保存任何课程答案，也不执行 SQL。它只负责按固定顺序处理课程
 * 锁、题库期望值、阶段语义匹配和失败文案；具体的 47 个阶段规则由判题
 * 门面通过回调提供，因此内容常量仍归课程内容模块所有。
 */
import type {
  AuthoredLessonStageId,
  LessonStageDefinition,
  QueryEvaluation,
  SqlQueryResult,
} from "../shared/types";

export interface StageResultEvaluationCallbacks {
  questionExpectationMatches: (
    stage: LessonStageDefinition,
    result: SqlQueryResult,
  ) => boolean;
  stageMatches: (
    stageId: AuthoredLessonStageId,
    result: SqlQueryResult,
  ) => boolean;
  wrongResultMessage: (
    stageId: AuthoredLessonStageId,
    result: SqlQueryResult,
  ) => string;
  missingConceptMessage: (locks: readonly string[]) => string;
  exactMessage: (locks: readonly string[]) => string;
  missingExpectationMessage: string;
  invalidExpectationMessage: string;
}

/**
 * 按课程判题协议生成阶段结果。
 *
 * 状态没有在这里修改；返回值由 `GameSession` 决定是否扣血、推进课程或
 * 写入答案记录。这样结果语义可以独立测试，也不会把游戏运行时引入学习层。
 */
export function evaluateStageResult(
  stage: LessonStageDefinition,
  result: SqlQueryResult,
  callbacks: StageResultEvaluationCallbacks,
): QueryEvaluation {
  const featureSet = new Set(result.features);
  const locksBroken = stage.requiredFeatures
    .map((feature, index) => ({ feature, label: stage.locks[index] }))
    .filter(({ feature }) => featureSet.has(feature))
    .map(({ label }) => label);
  const locksRemaining = stage.locks.filter((lock) => !locksBroken.includes(lock));

  if (locksRemaining.length > 0) {
    return {
      accepted: false,
      kind: "missing-concept",
      message: callbacks.missingConceptMessage(locksRemaining),
      locksBroken,
      locksRemaining,
      attackTargetIds: [],
    };
  }

  if (stage.questionExpectation) {
    if (!callbacks.questionExpectationMatches(stage, result)) {
      return {
        accepted: false,
        kind: "wrong-result",
        message: callbacks.invalidExpectationMessage,
        locksBroken,
        locksRemaining: [],
        attackTargetIds: [],
      };
    }
    return {
      accepted: true,
      kind: "exact",
      message: callbacks.exactMessage(stage.locks),
      locksBroken,
      locksRemaining: [],
      attackTargetIds: [...stage.attackTargetIds],
    };
  }

  const evaluationStageId = stage.evaluationStageId ?? (
    stage.id.startsWith("question:") ? null : stage.id as AuthoredLessonStageId
  );
  if (!evaluationStageId) {
    return {
      accepted: false,
      kind: "wrong-result",
      message: callbacks.missingExpectationMessage,
      locksBroken,
      locksRemaining: [],
      attackTargetIds: [],
    };
  }

  if (!callbacks.stageMatches(evaluationStageId, result)) {
    return {
      accepted: false,
      kind: "wrong-result",
      message: callbacks.wrongResultMessage(evaluationStageId, result),
      locksBroken,
      locksRemaining: [],
      attackTargetIds: [],
    };
  }

  return {
    accepted: true,
    kind: "exact",
    message: callbacks.exactMessage(stage.locks),
    locksBroken,
    locksRemaining: [],
    attackTargetIds: [...stage.attackTargetIds],
  };
}

/**
 * 比较题库固定期望值，不负责识别课程锁或生成玩家文案。
 */
export function matchesQuestionExpectation(
  stage: LessonStageDefinition,
  result: SqlQueryResult,
  isFlatBeginnerSelect: (sql: string) => boolean,
): boolean {
  const expectation = stage.questionExpectation;
  if (!expectation) return false;
  if (expectation.flatSelect && !isFlatBeginnerSelect(result.sql)) return false;
  if (
    result.columns.length !== expectation.columns.length ||
    result.columns.some((column, index) => (
      column.toLowerCase() !== expectation.columns[index]?.toLowerCase()
    ))
  ) return false;

  const encodedRow = (row: readonly unknown[]): string => JSON.stringify(row, (_key, value) => (
    value instanceof Uint8Array ? [...value] : value
  ));
  const actual = result.rows.map((row) => (
    encodedRow(result.columns.map((column) => row[column] ?? null))
  ));
  const expected = expectation.rows.map(encodedRow);
  if (!expectation.rowsOrdered) {
    actual.sort();
    expected.sort();
  }
  if (
    actual.length !== expected.length ||
    actual.some((row, index) => row !== expected[index])
  ) return false;

  const plan = result.plan.join(" ").toUpperCase();
  return expectation.planInclude.every((fragment) => (
    plan.includes(fragment.toUpperCase())
  )) && expectation.planExclude.every((fragment) => (
    !plan.includes(fragment.toUpperCase())
  ));
}
