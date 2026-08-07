import { describe, expect, it } from "vitest";
import {
  FINAL_HISTORY_PAGES,
  FINAL_MIGRATION_STAGE_IDS,
  FINAL_MIGRATION_STAGE_NARRATIVES,
  finalMigrationStageNarrative,
  validateFinalMigrationSequence,
} from "../src/content/narrative/finalMigrationSequence";

describe("档案王五阶段与七层史证", () => {
  it("以稳定课程阶段顺序覆盖全部七个 MIGRATE 步骤", () => {
    expect(validateFinalMigrationSequence()).toEqual([]);
    expect(FINAL_MIGRATION_STAGE_NARRATIVES.map((entry) => entry.stageId))
      .toEqual(FINAL_MIGRATION_STAGE_IDS);
    expect(FINAL_MIGRATION_STAGE_NARRATIVES.flatMap(
      (entry) => entry.migrationStepIds,
    )).toEqual([
      "snapshot",
      "audit",
      "preserve-history",
      "build-isolated",
      "validate",
      "switch",
      "keep-rollback",
    ]);
  });

  it("第一至第七层各保留一页 canonical 史证", () => {
    expect(FINAL_HISTORY_PAGES.map((page) => page.floor)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(new Set(FINAL_HISTORY_PAGES.map((page) => page.evidenceId)).size)
      .toBe(7);
  });

  it("每次终局攻击都能说明档案王论点、玩家结论与调用证据", () => {
    FINAL_MIGRATION_STAGE_IDS.forEach((stageId) => {
      const stage = finalMigrationStageNarrative(stageId);
      expect(stage?.archivistArgument.length).toBeGreaterThan(0);
      expect(stage?.playerConclusion.length).toBeGreaterThan(0);
      expect(stage?.evidenceIds.length).toBeGreaterThan(0);
    });
    expect(finalMigrationStageNarrative("not-a-stage")).toBeNull();
  });
});
