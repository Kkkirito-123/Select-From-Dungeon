import { describe, expect, it } from "vitest";
import {
  NARRATIVE_BEAT_KINDS,
  NARRATIVE_ENDINGS,
  NARRATIVE_FLOORS,
  type FloorNarrative,
  type NarrativeEnding,
} from "../src/content/narrative/narrativeContent";
import {
  buildScribeRecap,
  lostNameEvidenceForFloor,
  narrativeBeatsForEvent,
  validateNarrativeContent,
} from "../src/domain/progression/narrative";
import type { AnswerAttemptRecord } from "../src/domain/shared/types";

function mutableFloors(): FloorNarrative[] {
  return structuredClone(NARRATIVE_FLOORS) as FloorNarrative[];
}

function mutableEndings(): NarrativeEnding[] {
  return structuredClone(NARRATIVE_ENDINGS) as NarrativeEnding[];
}

const BASE_ATTEMPT: AnswerAttemptRecord = {
  id: 1,
  battleId: 1,
  floor: 1,
  monsterId: 1,
  monsterName: "史莱姆",
  lessonId: "select",
  stageId: "select-name",
  stageObjective: "读取名字",
  round: 1,
  sql: "SELECT secret_player_sql FROM secret_table",
  answerSql: "SELECT complete_reference_answer FROM secret_table;",
  result: "correct",
  outcome: "hit",
  feedback: "查询正确",
  hintLevel: 0,
};

function attempt(
  overrides: Partial<AnswerAttemptRecord>,
): AnswerAttemptRecord {
  return {
    ...BASE_ATTEMPT,
    ...overrides,
  };
}

describe("eight-floor narrative content", () => {
  it("八层、五拍、七段上升设施和唯一 MIGRATE 结局形成完整内容", () => {
    expect(validateNarrativeContent()).toEqual({
      valid: true,
      errors: [],
    });
    expect(NARRATIVE_FLOORS.map((floor) => floor.floor)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(NARRATIVE_FLOORS.every((floor) => (
      floor.beats.length === 5 &&
      NARRATIVE_BEAT_KINDS.every((kind) => (
        floor.beats.filter((entry) => entry.kind === kind).length === 1
      ))
    ))).toBe(true);
    expect(NARRATIVE_FLOORS.slice(0, 7).every((floor) => floor.ascent)).toBe(true);
    expect(NARRATIVE_FLOORS[7].ascent).toBeNull();
    expect(NARRATIVE_ENDINGS).toHaveLength(1);
    expect(NARRATIVE_ENDINGS[0]).toMatchObject({
      id: "MIGRATE",
      steps: [
        { id: "snapshot" },
        { id: "audit" },
        { id: "preserve-history" },
        { id: "build-isolated" },
        { id: "validate" },
        { id: "switch" },
        { id: "keep-rollback" },
      ],
    });
  });

  it("叙事触发只依赖语义事件、楼层和必修完成数", () => {
    const serialized = JSON.stringify(NARRATIVE_FLOORS);
    expect(serialized).not.toMatch(/monsterId|monsterIds|lessonId|lessonIds|stageId|courseId/);

    expect(narrativeBeatsForEvent({
      event: "floor-entered",
      floor: 1,
      completedRequiredCount: 0,
    }).map((entry) => entry.kind)).toEqual(["floor-entry"]);

    expect(narrativeBeatsForEvent({
      event: "required-progress",
      floor: 1,
      completedRequiredCount: 2,
    })).toEqual([]);

    const midpoint = narrativeBeatsForEvent({
      event: "required-progress",
      floor: 1,
      completedRequiredCount: 3,
    });
    expect(midpoint.map((entry) => entry.kind)).toEqual(["midpoint-evidence"]);
    expect(narrativeBeatsForEvent({
      event: "required-progress",
      floor: 1,
      completedRequiredCount: 5,
    }, new Set([midpoint[0].id]))).toEqual([]);

    expect(narrativeBeatsForEvent({
      event: "boss-encountered",
      floor: 1,
      completedRequiredCount: 3,
    })).toEqual([]);
    expect(narrativeBeatsForEvent({
      event: "boss-encountered",
      floor: 1,
      completedRequiredCount: 4,
    }).map((entry) => entry.kind)).toEqual(["boss"]);

    expect(narrativeBeatsForEvent({
      event: "floor-completed",
      floor: 8,
      completedRequiredCount: 7,
    })).toEqual([
      expect.objectContaining({
        kind: "floor-end",
        endingId: "MIGRATE",
      }),
    ]);
  });

  it("失名录明确区分未查询、已查为 NULL 和实际值", () => {
    const unknown = lostNameEvidenceForFloor(3);
    expect(unknown.every((entry) => (
      entry.state === "unknown" &&
      entry.displayValue === "???" &&
      entry.finding === null
    ))).toBe(true);

    const currentOwner = NARRATIVE_FLOORS[2].lostNameEvidence.find(
      (entry) => entry.resolvedValue === null,
    );
    expect(currentOwner).toBeDefined();
    expect(lostNameEvidenceForFloor(3, [currentOwner!.id])).toContainEqual(
      expect.objectContaining({
        id: currentOwner!.id,
        state: "null",
        displayValue: "NULL",
        finding: expect.stringContaining("不是尚未查询"),
      }),
    );

    const currentRecord = NARRATIVE_FLOORS[0].lostNameEvidence[0];
    expect(lostNameEvidenceForFloor(1, [currentRecord.id])).toContainEqual(
      expect.objectContaining({
        id: currentRecord.id,
        state: "value",
        displayValue: "0 ROWS",
      }),
    );
  });

  it("内容校验会拒绝缺拍、错误事件、课程耦合、失联证据和非唯一结局", () => {
    const missingBeat = mutableFloors();
    missingBeat[0].beats = missingBeat[0].beats.slice(1);
    expect(validateNarrativeContent(missingBeat).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("恰好包含五个叙事拍"),
        expect.stringContaining("floor-entry"),
      ]),
    );

    const wrongEvent = mutableFloors();
    wrongEvent[1].beats[1].trigger.event = "boss-encountered";
    expect(validateNarrativeContent(wrongEvent).errors).toContain(
      "叙事拍 narrative:f2:midpoint-evidence 没有使用 required-progress 语义事件。",
    );

    const coupled = mutableFloors() as unknown as Array<
      FloorNarrative & { lessonId?: string }
    >;
    coupled[2].lessonId = "f3-inner";
    expect(validateNarrativeContent(coupled).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("不得绑定怪物、课程或阶段标识"),
        expect.stringContaining("lessonId"),
      ]),
    );

    const unreferencedEvidence = mutableFloors();
    unreferencedEvidence[3].beats.forEach((entry) => {
      entry.evidenceIds = [];
    });
    expect(validateNarrativeContent(unreferencedEvidence).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("没有被任何固定叙事拍解锁"),
      ]),
    );

    const duplicateEnding = mutableEndings();
    duplicateEnding.push(structuredClone(duplicateEnding[0]));
    expect(validateNarrativeContent(NARRATIVE_FLOORS, duplicateEnding).errors).toContain(
      "主线必须只有一个 MIGRATE 结局。",
    );
  });
});

describe("buildScribeRecap", () => {
  it("汇总正确率、提示、常见错误和最近仍未掌握的概念", () => {
    const recap = buildScribeRecap([
      BASE_ATTEMPT,
      attempt({
        id: 2,
        lessonId: "where",
        stageId: "where-target",
        result: "wrong-result",
        outcome: "countered",
        hintLevel: 2,
      }),
      attempt({
        id: 5,
        lessonId: "where",
        stageId: "where-target",
        result: "correct",
        outcome: "hit",
        hintLevel: 1,
      }),
      attempt({
        id: 3,
        lessonId: "is-null",
        stageId: "null-target",
        result: "syntax-error",
        outcome: "countered",
        hintLevel: 1,
      }),
      attempt({
        id: 4,
        lessonId: "group-by",
        stageId: "group-signals",
        result: "missing-concept",
        outcome: "defeat",
        hintLevel: 0,
      }),
    ]);

    expect(recap).toMatchObject({
      totalAttempts: 5,
      correctAttempts: 2,
      accuracyPercent: 40,
      hintUsage: {
        attempts: 3,
        ratePercent: 60,
        highestLevel: 2,
      },
      commonErrors: [
        { result: "missing-concept", count: 1 },
        { result: "wrong-result", count: 1 },
        { result: "syntax-error", count: 1 },
      ],
    });
    expect(recap.unmasteredConcepts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        concept: "IS NULL",
        latestResult: "syntax-error",
      }),
      expect.objectContaining({
        concept: "COUNT / GROUP BY",
        latestResult: "missing-concept",
      }),
    ]));
    expect(recap.unmasteredConcepts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ concept: "WHERE / AND" }),
    ]));
    expect(recap.summary).toContain("2/5 次正确");
    expect(recap.summary).toContain("3 次使用提示");
  });

  it("不回传提交 SQL、参考答案、反馈或怪物身份", () => {
    const recap = buildScribeRecap([
      attempt({
        result: "wrong-result",
        outcome: "defeat",
        feedback: "请改成 SELECT leaked_feedback_answer",
      }),
    ]);
    const serialized = JSON.stringify(recap);

    expect(serialized).not.toContain(BASE_ATTEMPT.sql);
    expect(serialized).not.toContain(BASE_ATTEMPT.answerSql);
    expect(serialized).not.toContain("leaked_feedback_answer");
    expect(serialized).not.toContain(BASE_ATTEMPT.monsterName);
    expect(serialized).not.toMatch(/"sql"|"answerSql"|"feedback"|"monsterId"|"monsterName"/);
  });

  it("空记录给出短提示且所有统计归零", () => {
    expect(buildScribeRecap([])).toEqual({
      totalAttempts: 0,
      correctAttempts: 0,
      accuracyPercent: 0,
      hintUsage: {
        attempts: 0,
        ratePercent: 0,
        highestLevel: 0,
      },
      commonErrors: [],
      unmasteredConcepts: [],
      summary: "本层还没有可复盘的作答。先记录一次尝试，再回来休息。",
    });
  });
});
