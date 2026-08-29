/** 第八层终局 MIGRATE 七步标记的纯序列规则，不直接推进胜利状态。 */
import {
  NARRATIVE_ENDINGS,
  type NarrativeEndingStep,
} from "../../content/narrative/narrativeContent";

export type MigrationStepId = NarrativeEndingStep["id"];

const MIGRATION_ENDING = NARRATIVE_ENDINGS[0];
const MIGRATION_MARKER_PREFIX = "story:migrate:";

export const MIGRATION_STEPS: readonly NarrativeEndingStep[] =
  MIGRATION_ENDING.steps;

const MIGRATION_STEP_IDS = new Set<MigrationStepId>(
  MIGRATION_STEPS.map((step) => step.id),
);

export interface FinalMigrationProgress {
  completedStepIds: readonly MigrationStepId[];
  nextStep: NarrativeEndingStep | null;
  complete: boolean;
}

export function migrationStepMarkerId(stepId: MigrationStepId): string {
  return `${MIGRATION_MARKER_PREFIX}${stepId}`;
}

export function migrationStepIdFromMarker(
  markerId: string,
): MigrationStepId | null {
  if (!markerId.startsWith(MIGRATION_MARKER_PREFIX)) return null;
  const stepId = markerId.slice(MIGRATION_MARKER_PREFIX.length) as MigrationStepId;
  return MIGRATION_STEP_IDS.has(stepId) ? stepId : null;
}

export function migrationStepMarkerIds(): readonly string[] {
  return MIGRATION_STEPS.map((step) => migrationStepMarkerId(step.id));
}

/**
 * 从 Run 的终局标记中恢复严格的已完成前缀。
 *
 * 只有从第一步开始连续存在的标记才算进度；带空洞或未知步骤的存档会由
 * localProgress 的严格校验拒绝，运行时不会猜测或跳步。
 */
export function finalMigrationProgress(
  markerIds: readonly string[],
): FinalMigrationProgress {
  const markerSet = new Set(markerIds);
  const completedStepIds: MigrationStepId[] = [];
  for (const step of MIGRATION_STEPS) {
    if (!markerSet.has(migrationStepMarkerId(step.id))) break;
    completedStepIds.push(step.id);
  }
  const nextStep = MIGRATION_STEPS[completedStepIds.length] ?? null;
  return {
    completedStepIds,
    nextStep,
    complete: nextStep === null,
  };
}

/** 当前 Run 中的 MIGRATE 标记必须恰好构成七步序列的一个前缀。 */
export function migrationMarkersFormPrefix(markerIds: readonly string[]): boolean {
  const migrationMarkerIds = markerIds.filter((id) =>
    id.startsWith(MIGRATION_MARKER_PREFIX)
  );
  if (new Set(migrationMarkerIds).size !== migrationMarkerIds.length) return false;
  if (migrationMarkerIds.some((id) => migrationStepIdFromMarker(id) === null)) {
    return false;
  }
  const expectedPrefix = migrationStepMarkerIds().slice(
    0,
    migrationMarkerIds.length,
  );
  return migrationMarkerIds.every((id, index) => id === expectedPrefix[index]);
}
