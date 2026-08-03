import { floorStoryProgress } from "../../src/domain/floorStory";
import { floorWorldStateFromSnapshot } from "../../src/domain/floorWorldState";
import { redactUndiscoveredMonsterIdentityText } from "../../src/domain/monsterIdentity";
import type { RunLessonId } from "../../src/domain/runGraph";
import type { GameSnapshot } from "../../src/domain/types";
import {
  AGENT_REQUEST_VERSION,
  MAX_AGENT_ATTEMPTS,
  type AgentPrepareRequest,
  type AgentStorySource,
} from "./contracts";

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function boundedText(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

function storySource(snapshot: GameSnapshot): AgentStorySource | null {
  const progress = floorStoryProgress({
    floor: snapshot.floor,
    mode: snapshot.mode,
    completedLessons: snapshot.completedLessons,
    defeatedMonsterIds: snapshot.monsters
      .filter((monster) => monster.hp <= 0)
      .map((monster) => monster.id),
    openedGateIds: snapshot.openedGateIds,
  });
  const moment = progress.unlocked.filter((entry) => entry.kind === "scribe").at(-1)
    ?? progress.latest;
  if (!moment) return null;
  const redact = (value: string): string => redactUndiscoveredMonsterIdentityText(
    value,
    snapshot.monsters,
    snapshot.profile.discoveredMonsterIds,
  );
  return {
    beatId: boundedText(moment.id, 120),
    title: boundedText(redact(moment.title), 120),
    lines: moment.lines.slice(0, 3).map((line) => boundedText(redact(line), 300)),
  };
}

function worldChanges(snapshot: GameSnapshot): readonly string[] {
  const current = floorWorldStateFromSnapshot(snapshot);
  const baseline = floorWorldStateFromSnapshot({
    floor: snapshot.floor,
    completedLessons: [],
    monsters: snapshot.monsters.map((monster) => ({ id: monster.id, hp: monster.maxHp })),
    openedGateIds: [],
    profile: { discoveredMonsterIds: [] },
    keyItems: [],
    visitedRoomIds: [],
    activeCampfireId: null,
  });
  if (!current || !baseline) return [];
  return Object.entries(current)
    .filter(([key, value]) => key !== "floor" && value !== baseline[key as keyof typeof baseline])
    .map(([key, value]) => boundedText(
      `${key}:${String(baseline[key as keyof typeof baseline])}→${String(value)}`,
      160,
    ))
    .slice(0, 16);
}

export function buildAgentPrepareRequest(snapshot: GameSnapshot): AgentPrepareRequest {
  const lessonFrequency = new Map<RunLessonId, number>();
  snapshot.floorReview.forEach((record) => {
    lessonFrequency.set(record.lessonId, (lessonFrequency.get(record.lessonId) ?? 0) + 1);
  });
  const selectedRecords = [...snapshot.floorReview]
    .sort((left, right) => {
      const score = (record: typeof left): number => (
        (record.result === "correct" ? 0 : 20) +
        (record.result === "syntax-error" ? 8 : 0) +
        record.hintLevel * 6 +
        Math.max(0, (lessonFrequency.get(record.lessonId) ?? 1) - 1) * 3 +
        record.id / 10_000
      );
      return score(right) - score(left) || right.id - left.id;
    })
    .slice(0, MAX_AGENT_ATTEMPTS)
    .sort((left, right) => left.id - right.id);
  const attempts = selectedRecords.map((record) => ({
    attemptId: record.id,
    lessonId: record.lessonId,
    stageId: boundedText(record.stageId, 100),
    objective: boundedText(record.stageObjective, 500),
    submittedSql: boundedText(record.sql, 4_000),
    referenceSql: boundedText(record.answerSql, 4_000),
    result: record.result,
    outcome: record.outcome,
    hintLevel: record.hintLevel,
  }));
  const evidence = {
    floor: snapshot.floor,
    attempts,
    completedLessons: snapshot.completedLessons.slice(0, 48),
    worldChanges: worldChanges(snapshot),
    relics: snapshot.relics.slice(0, 8).map((relic) => ({
      id: boundedText(relic.id, 80),
      name: boundedText(relic.name, 80),
      description: boundedText(relic.description, 300),
    })),
    story: storySource(snapshot),
  };
  return {
    requestVersion: AGENT_REQUEST_VERSION,
    runId: snapshot.runInstanceId,
    evidenceHash: `ev-${stableHash(JSON.stringify(evidence))}`,
    ...evidence,
  };
}

export function agentRequestKey(
  request: Pick<AgentPrepareRequest, "runId" | "floor" | "evidenceHash">,
): string {
  return `${request.runId}:${request.floor}:${request.evidenceHash}`;
}

export function hasMeaningfulAgentEvidence(request: AgentPrepareRequest): boolean {
  return request.attempts.length > 0 ||
    request.completedLessons.length > 0 ||
    request.worldChanges.length > 0 ||
    request.relics.length > 0;
}
