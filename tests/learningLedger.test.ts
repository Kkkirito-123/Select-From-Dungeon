import { describe, expect, it } from "vitest";
import {
  buildLearningAttempt,
  nextLearningAggregate,
} from "../src/storage/learningLedger";
import type { AnswerAttemptRecord } from "../src/domain/types";

const record: AnswerAttemptRecord = {
  id: 7,
  battleId: 3,
  floor: 2,
  monsterId: 15,
  monsterName: "ID #015",
  lessonId: "order-by",
  stageId: "practice-order",
  stageObjective: "取最高信号",
  round: 1,
  sql: "SELECT channel FROM monster_signals ORDER BY charge DESC LIMIT 1;",
  answerSql: "SELECT channel FROM monster_signals ORDER BY charge DESC LIMIT 1;",
  result: "correct",
  outcome: "victory",
  feedback: "查询正确",
  hintLevel: 1,
  questionId: "question-bank-v1:f2:current:t01:v1",
};

describe("learning ledger projection", () => {
  it("builds a stable id without placing movement or key presses in the record", () => {
    const attempt = buildLearningAttempt({
      runInstanceId: "run-learning-test",
      questionBankVersion: "question-bank-v1",
      monsters: [{
        floor: 2,
        id: 15,
        lessonId: "order-by",
        roomId: 31,
        name: "水胶怪",
        species: "practice",
        kind: "sort-drake",
        x: 1,
        y: 1,
        hp: 1,
        maxHp: 1,
        armor: 0,
        damage: 1,
        attackName: "冲撞",
        status: "idle",
        weakness: null,
        masterId: null,
        isBoss: false,
        rank: "normal",
        encounterType: "ambush",
      }],
      relics: [{
        id: "schema-eye",
        name: "Schema 之眼",
        description: "自动显示一级提示",
        heatReduction: 0,
      }],
    }, record, 1234);
    expect(attempt.attemptId).toBe("run-learning-test:7");
    expect(attempt.encounterKind).toBe("ambush");
    expect(attempt.firstAttempt).toBe(true);
    expect(attempt.hintSourceCounts).toEqual({ manual: 0, schemaEye: 1, agent: 0 });
    expect(attempt).not.toHaveProperty("movement");
    expect(attempt).not.toHaveProperty("keyPress");
  });

  it("updates permanent lesson and question aggregates deterministically", () => {
    const attempt = buildLearningAttempt({
      runInstanceId: "run-learning-test",
      questionBankVersion: "question-bank-v1",
      monsters: [],
      relics: [],
    }, { ...record, hintLevel: 0 }, 1234);
    const first = nextLearningAggregate("order-by", attempt);
    const second = nextLearningAggregate("order-by", {
      ...attempt,
      attemptId: "run-learning-test:8",
      localSequence: 8,
      result: "syntax-error",
      outcome: "countered",
      firstAttempt: false,
      recordedAt: 2345,
    }, first);
    expect(second).toMatchObject({
      attempts: 2,
      correct: 1,
      firstTryCorrect: 1,
      syntaxErrors: 1,
      lastSeenSequence: 8,
    });
  });
});
