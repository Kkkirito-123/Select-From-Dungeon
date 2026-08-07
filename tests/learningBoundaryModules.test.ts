import { describe, expect, it } from "vitest";
import { stageFor } from "../src/domain/learning/lessonLocks";
import {
  identityQueryEvaluation,
  identityQueryMessage,
} from "../src/domain/learning/queryIdentityEvaluator";
import {
  authoredWrongResultMessage,
  matchesAuthoredStage,
} from "../src/domain/learning/lessonResultEvaluator";
import { detectQueryFeatures } from "../src/domain/learning/queryFeatureDetector";
import type { SqlQueryResult } from "../src/domain/shared/types";

function resultFor(sql: string): SqlQueryResult {
  return {
    sql,
    columns: ["id", "status"],
    rows: [{ id: 1, status: "idle" }],
    targetIds: [1],
    plan: [],
    baseHeat: 2,
    features: detectQueryFeatures(sql),
  };
}

describe("learning domain responsibility boundaries", () => {
  it("keeps identity firewall detection separate from result assembly", () => {
    const stage = stageFor("select", 0);
    const message = "身份字段仍被封存。";
    expect(identityQueryMessage(1, false, true, message)).toBe(message);
    expect(identityQueryMessage(0, false, true, message)).toBeNull();
    expect(identityQueryEvaluation(stage, message)).toMatchObject({
      accepted: false,
      locksRemaining: stage.locks,
    });
  });

  it("matches authored rows in the result module without executing SQL", () => {
    const result = resultFor("SELECT id, status FROM monsters WHERE id = 1");
    expect(matchesAuthoredStage("select-name", result)).toBe(true);
    expect(authoredWrongResultMessage("select-name", result)).toContain("结果");
  });
});
