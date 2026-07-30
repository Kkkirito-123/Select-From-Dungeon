import { biomeEncounterFor } from "../content/biomeContent";
import type { LessonStageDefinition, Monster } from "./types";
import type { FloorNumber } from "./runGraph";

export type EncounterDamageRole =
  | "normal"
  | "elite"
  | "area-boss"
  | "floor-boss";

export function encounterDamageRoleFor(monster: Monster): EncounterDamageRole {
  const biomeEncounter = biomeEncounterFor(monster.id);
  if (biomeEncounter?.role === "area-boss") return "area-boss";
  if (monster.rank === "boss") return "floor-boss";
  if (biomeEncounter?.role === "mini-elite" || monster.rank === "elite") {
    return "elite";
  }
  return "normal";
}

export function counterDamageForEncounter(
  floor: FloorNumber,
  role: EncounterDamageRole,
): 1 | 2 | 3 {
  if (floor <= 2) return 1;
  if (floor <= 4) return role === "normal" || role === "elite" ? 1 : 2;
  if (floor <= 6) return role === "normal" ? 1 : 2;
  return role === "floor-boss" ? 3 : 2;
}

export function counterDamageForMonster(monster: Monster): 1 | 2 | 3 {
  return counterDamageForEncounter(monster.floor, encounterDamageRoleFor(monster));
}

export function stageCountForEncounter(
  monster: Monster,
  authoredStageCount: number,
): number {
  const biomeEncounter = biomeEncounterFor(monster.id);
  if (biomeEncounter?.role === "area-boss") return 2;
  if (biomeEncounter?.role === "mini-elite") return 2;
  if (monster.rank === "boss") {
    if (monster.floor <= 2) return 2;
    if (monster.floor <= 4) return 3;
    if (monster.floor <= 7) return 4;
    return 5;
  }
  if (monster.rank === "elite") return Math.max(2, authoredStageCount);
  return Math.min(2, Math.max(1, authoredStageCount));
}

function retargetStage(
  stage: LessonStageDefinition,
  monsterId: number,
): LessonStageDefinition {
  return {
    ...stage,
    hints: [...stage.hints],
    locks: [...stage.locks],
    requiredFeatures: [...stage.requiredFeatures],
    attackTargetIds: [monsterId],
  };
}

/**
 * Keeps authored stages authoritative and only fills missing elite/boss stages
 * with already introduced review questions. Stable stage IDs are preserved so
 * old answer history remains readable without a save-version migration.
 */
export function stagesForEncounter(
  monster: Monster,
  authoredStages: readonly LessonStageDefinition[],
  reviewStages: readonly LessonStageDefinition[] = [],
): LessonStageDefinition[] {
  if (authoredStages.length === 0) return [];
  const requiredCount = stageCountForEncounter(monster, authoredStages.length);
  const result = authoredStages
    .slice(0, requiredCount)
    .map((stage) => retargetStage(stage, monster.id));
  const authoredIds = new Set(authoredStages.map((stage) => stage.id));
  const supplements = [...reviewStages]
    .reverse()
    .filter((stage) => !authoredIds.has(stage.id));

  let supplementIndex = 0;
  while (result.length < requiredCount) {
    const source = supplements[supplementIndex]
      ?? authoredStages[result.length % authoredStages.length];
    result.push(retargetStage(source, monster.id));
    supplementIndex += 1;
  }
  return result;
}
