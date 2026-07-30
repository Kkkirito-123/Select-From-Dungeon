import { describe, expect, it } from "vitest";
import { NARRATIVE_ENDINGS } from "../src/content/narrativeContent";
import {
  finalMigrationProgress,
  migrationMarkersFormPrefix,
  migrationStepIdFromMarker,
  migrationStepMarkerId,
  migrationStepMarkerIds,
} from "../src/domain/finalMigration";

describe("MIGRATE 七步 Run 标记", () => {
  it("复用唯一结局的七步稳定 ID，并可无损往返 marker", () => {
    const stepIds = NARRATIVE_ENDINGS[0].steps.map((step) => step.id);
    expect(migrationStepMarkerIds()).toEqual(
      stepIds.map((stepId) => `story:migrate:${stepId}`),
    );
    stepIds.forEach((stepId) => {
      expect(migrationStepIdFromMarker(migrationStepMarkerId(stepId))).toBe(stepId);
    });
    expect(migrationStepIdFromMarker("story:migrate:unknown")).toBeNull();
    expect(migrationStepIdFromMarker("story:evidence:snapshot")).toBeNull();
  });

  it("只把从 snapshot 开始的连续前缀视为已完成进度", () => {
    const markers = migrationStepMarkerIds();
    expect(finalMigrationProgress([])).toMatchObject({
      completedStepIds: [],
      nextStep: { id: "snapshot" },
      complete: false,
    });
    expect(finalMigrationProgress(markers.slice(0, 3))).toMatchObject({
      completedStepIds: ["snapshot", "audit", "preserve-history"],
      nextStep: { id: "build-isolated" },
      complete: false,
    });
    expect(finalMigrationProgress(markers)).toMatchObject({
      completedStepIds: NARRATIVE_ENDINGS[0].steps.map((step) => step.id),
      nextStep: null,
      complete: true,
    });
  });

  it("拒绝跳步、未知步骤和重复 marker", () => {
    const markers = migrationStepMarkerIds();
    expect(migrationMarkersFormPrefix([])).toBe(true);
    expect(migrationMarkersFormPrefix(markers.slice(0, 4))).toBe(true);
    expect(migrationMarkersFormPrefix([markers[1]])).toBe(false);
    expect(migrationMarkersFormPrefix([markers[0], markers[2]])).toBe(false);
    expect(migrationMarkersFormPrefix([markers[1], markers[0]])).toBe(false);
    expect(migrationMarkersFormPrefix([markers[0], "story:migrate:unknown"]))
      .toBe(false);
    expect(migrationMarkersFormPrefix([markers[0], markers[0]])).toBe(false);
  });
});
