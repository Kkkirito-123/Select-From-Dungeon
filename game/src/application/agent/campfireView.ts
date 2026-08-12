/** 生成篝火 Agent 所需的当前楼层字段。 */
import type {
  CampfireAgentAggregate,
  CampfireAgentAttempt,
  CampfireView,
} from "../../contracts/agent/campfireReview";
import type { GameSnapshot } from "../../contracts/game/snapshots";

const MAX_ATTEMPTS = 8;
const MAX_SQL_CHARS = 800;
const MAX_STAGE_CHARS = 160;

function currentAttempts(snapshot: GameSnapshot) {
  return snapshot.floorReview
    .filter((attempt) => attempt.floor === snapshot.floor)
    .slice()
    .sort((left, right) => left.id - right.id);
}

function buildStats(attempts: readonly GameSnapshot["floorReview"][number][]): CampfireAgentAggregate {
  const correct = attempts.filter((attempt) => attempt.result === "correct").length;
  const errors: CampfireAgentAggregate["errorCounts"] = {
    "missing-concept": 0,
    "wrong-result": 0,
    "syntax-error": 0,
  };
  let hinted = 0;
  let maxHint = 0;
  attempts.forEach((attempt) => {
    if (attempt.result !== "correct") errors[attempt.result] += 1;
    if (attempt.hintLevel > 0) hinted += 1;
    maxHint = Math.max(maxHint, attempt.hintLevel);
  });
  return {
    totalAttempts: attempts.length,
    correctCount: correct,
    accuracy: attempts.length === 0 ? 0 : Math.round((correct / attempts.length) * 100),
    errorCounts: errors,
    hintedAttempts: hinted,
    highestHintLevel: maxHint,
  };
}

function viewAttempt(attempt: GameSnapshot["floorReview"][number]): CampfireAgentAttempt {
  return {
    attemptId: attempt.id,
    lessonId: attempt.lessonId,
    stageId: attempt.stageId,
    stageObjective: attempt.stageObjective.slice(0, MAX_STAGE_CHARS),
    submittedSql: attempt.sql.slice(0, MAX_SQL_CHARS),
    result: attempt.result,
    outcome: attempt.outcome,
    hintLevel: Math.max(0, Math.min(4, attempt.hintLevel)),
  };
}

export function campfireView(snapshot: GameSnapshot): CampfireView {
  const attempts = currentAttempts(snapshot);
  return {
    floor: snapshot.floor,
    aggregate: buildStats(attempts),
    attempts: attempts.slice(-MAX_ATTEMPTS).map(viewAttempt),
  };
}
