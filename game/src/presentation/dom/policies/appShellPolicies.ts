import {
  NARRATIVE_ENDINGS,
  NARRATIVE_FLOORS,
  type NarrativeBeat,
  type NarrativeEndingStep,
} from "../../../content/narrative/narrativeContent";
import { finalMigrationStageNarrative } from "../../../content/narrative/finalMigrationSequence";
import { LESSONS, practiceStagesFor } from "../../../content/curriculum/mvpLevel";
import { LEVEL_XP_THRESHOLDS } from "../../../domain/session/GameSession";
import { narrativeFloorFor } from "../../../domain/progression/narrative";
import {
  floorStoryProgress,
  storyEvidenceIdFromMarker,
  type FloorStoryMoment,
  type FloorStoryPresentation,
} from "../../../domain/progression/floorStory";
import { finalMigrationProgress } from "../../../domain/progression/finalMigration";
import { redactUndiscoveredMonsterIdentityText } from "../../../domain/progression/monsterIdentity";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { ExperienceSettlement } from "../../../contracts/game/results";
import { parseSchemaLines } from "../sqlAutocomplete";

export function inspectionDialogCopy(message: string): {
  title: string;
  body: string;
} {
  const speaker = message.match(/^([^：]{1,12})：\s*(.+)$/s);
  if (speaker) {
    return { title: speaker[1], body: speaker[2] };
  }
  if (message.startsWith("档案水轮")) {
    return { title: "档案水轮", body: message };
  }
  if (message.startsWith("无名宿舍")) {
    return { title: "无名宿舍", body: message };
  }
  return { title: "现场调查", body: message };
}

export function redactSnapshotMonsterIdentity(
  value: string,
  snapshot: Pick<GameSnapshot, "monsters" | "profile">,
): string {
  return redactUndiscoveredMonsterIdentityText(
    value,
    snapshot.monsters,
    snapshot.profile.discoveredMonsterIds,
  );
}

export function canOpenCombatTerminal(
  mode: GameSnapshot["mode"] | null | undefined,
  busy: boolean,
): boolean {
  return mode === "combat" && !busy;
}

export function isInspectionPrimaryKey(
  event: Pick<KeyboardEvent, "code" | "key" | "repeat">,
): boolean {
  if (event.repeat) return false;
  return event.code === "KeyE" || event.key.toLowerCase() === "e" ||
    event.key === "Enter";
}

export function inspectionEscapeCanClose(
  recordKind: string | undefined,
  activePresentation: FloorStoryPresentation | null | undefined,
): boolean {
  return recordKind !== "migration" && activePresentation !== "blocking";
}

export function shouldDismissTransientCard(
  shownAtMove: number | null,
  currentTotalMoves: number,
): boolean {
  return shownAtMove !== null && currentTotalMoves - shownAtMove >= 3;
}

export function narrativeMomentUsesRecordOverlay(
  presentation: FloorStoryPresentation,
): boolean {
  return presentation === "blocking" || presentation === "inspect";
}

const FINAL_MIGRATION_STORY_SOURCE_ID = "f8-story-migrate";
const NARRATIVE_EVIDENCE_TITLES = new Map(
  NARRATIVE_FLOORS.flatMap((floor) =>
    floor.lostNameEvidence.map((evidence) => [evidence.id, evidence.title] as const)
  ),
);

export function isFinalMigrationStoryMoment(
  moment: Pick<FloorStoryMoment, "floor" | "sourceId">,
): boolean {
  return moment.floor === 8 && moment.sourceId === FINAL_MIGRATION_STORY_SOURCE_ID;
}

export function canPresentFinalMigrationStoryMoment(
  moment: Pick<FloorStoryMoment, "floor" | "sourceId">,
  snapshot: Pick<GameSnapshot, "floor" | "mode">,
): boolean {
  if (!isFinalMigrationStoryMoment(moment)) return true;
  return snapshot.floor === 8 && snapshot.mode === "victory";
}

export interface FinalMigrationRecordCopy {
  kicker: string;
  title: string;
  body: string;
  closeLabel: string;
  stepIndex: number;
  stepTotal: number;
}

export function finalMigrationRecordCopy(
  markerIds: readonly string[],
): FinalMigrationRecordCopy | null {
  const ending = NARRATIVE_ENDINGS[0];
  const progress = finalMigrationProgress(markerIds);
  if (!progress.nextStep) return null;
  const stepIndex = progress.completedStepIds.length;
  const stepTotal = ending.steps.length;
  return {
    kicker: `MIGRATE / STEP ${String(stepIndex + 1).padStart(2, "0")} OF ${String(stepTotal).padStart(2, "0")}`,
    title: `${stepIndex + 1} / ${stepTotal} · ${progress.nextStep.title}`,
    body: [
      ending.summary,
      "",
      progress.nextStep.description,
      "",
      `当前进度 · ${stepIndex} / ${stepTotal} 步已写入本地 Run。`,
    ].join("\n"),
    closeLabel: stepIndex + 1 === stepTotal
      ? "E · 执行最后一步"
      : `E · 执行并进入 ${stepIndex + 2} / ${stepTotal}`,
    stepIndex,
    stepTotal,
  };
}

export interface FinalMigrationArgumentCopy {
  argument: string;
  evidence: string;
  conclusion: string;
}

export function finalMigrationArgumentCopy(
  snapshot: {
    lessonId: GameSnapshot["lessonId"];
    lessonStageId: GameSnapshot["lessonStageId"];
    combat: { targetId: number } | null;
  },
): FinalMigrationArgumentCopy | null {
  const narrative = (
    snapshot.lessonId === "f8-security" &&
    snapshot.combat?.targetId === 84
  )
    ? finalMigrationStageNarrative(snapshot.lessonStageId)
    : null;
  if (!narrative) return null;
  const evidenceTitles = narrative.evidenceIds.map((evidenceId) =>
    NARRATIVE_EVIDENCE_TITLES.get(evidenceId) ?? evidenceId
  );
  return {
    argument: `ID #084：${narrative.archivistArgument}`,
    evidence: `调用证据：${evidenceTitles.join("、")}`,
    conclusion: `玩家结论：${narrative.playerConclusion}`,
  };
}

export function finalVictoryPortalReady(
  snapshot: {
    floor: GameSnapshot["floor"];
    mode: GameSnapshot["mode"];
    openedGateIds: readonly string[];
  },
): boolean {
  if (snapshot.mode !== "victory") return false;
  return snapshot.floor !== 8 ||
    finalMigrationProgress(snapshot.openedGateIds).complete;
}

export function storyMomentRecordBody(moment: FloorStoryMoment): string {
  if (!moment.query) return moment.lines.join("\n");
  const fields = moment.query.expectedColumns.length > 0
    ? moment.query.expectedColumns.join(" · ")
    : "无返回字段";
  return [
    ...moment.lines,
    "",
    `SQL 证据 · ${moment.query.title}`,
    moment.query.sql,
    `真实结果 · ${moment.query.expectedRowCount} 行 · ${fields}`,
    moment.query.purpose,
  ].join("\n");
}

export function canPresentQueuedNarrativeMoment(
  mode: GameSnapshot["mode"] | undefined,
  busy: boolean,
  combatSettlementVisible: boolean,
  blockingOverlayOpen: boolean,
): boolean {
  if (busy || combatSettlementVisible || blockingOverlayOpen) return false;
  return mode === "explore" || mode === "transition" || mode === "victory";
}

export type SchemaTaskRole = "primary" | "related";

export function schemaRenderSignature(
  snapshot: Pick<
    GameSnapshot,
    | "focusMonsterId"
    | "lessonIntro"
    | "lessonStageId"
    | "locks"
    | "missionBody"
    | "schema"
  > & Partial<Pick<GameSnapshot, "taskBrief">>,
): string {
  return [
    String(snapshot.focusMonsterId ?? ""),
    snapshot.lessonStageId,
    snapshot.lessonIntro,
    snapshot.missionBody,
    JSON.stringify(snapshot.taskBrief),
    snapshot.locks.join("\u0000"),
    snapshot.schema.join("\u0000"),
  ].join("\u0001");
}

export function schemaTaskTableRoles(
  snapshot: Pick<
    GameSnapshot,
    "focusMonsterId" | "lessonIntro" | "lessonStageId" | "missionBody" | "schema"
  > & Partial<Pick<GameSnapshot, "taskBrief">>,
): ReadonlyMap<string, SchemaTaskRole> {
  if (snapshot.taskBrief?.primaryTable) {
    const roles = new Map<string, SchemaTaskRole>();
    roles.set(snapshot.taskBrief.primaryTable.toLocaleLowerCase(), "primary");
    snapshot.taskBrief.relatedTables.forEach((table) => {
      roles.set(table.toLocaleLowerCase(), "related");
    });
    return roles;
  }
  const authoredStage = LESSONS
    .flatMap((lesson) => lesson.stages)
    .find((stage) => stage.id === snapshot.lessonStageId);
  const encounterStage = snapshot.focusMonsterId === null
    ? undefined
    : practiceStagesFor(snapshot.focusMonsterId)
      .find((stage) => stage.id === snapshot.lessonStageId);
  const answerSql = encounterStage?.answerSql ?? authoredStage?.answerSql ?? "";
  const availableTables = new Set(
    parseSchemaLines(snapshot.schema).map((table) => table.name.toLocaleLowerCase()),
  );
  const references: Array<{
    table: string;
    depth: number;
    index: number;
  }> = [];
  const tableNames = [...availableTables]
    .map((table) => table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (tableNames !== "") {
    const pattern = new RegExp(
      `\\b(?:FROM|JOIN|UPDATE|INTO)\\s+(${tableNames})\\b`,
      "gi",
    );
    for (const match of answerSql.matchAll(pattern)) {
      const index = match.index ?? 0;
      let depth = 0;
      for (let cursor = 0; cursor < index; cursor += 1) {
        if (answerSql[cursor] === "(") depth += 1;
        if (answerSql[cursor] === ")") depth = Math.max(0, depth - 1);
      }
      references.push({
        table: match[1].toLocaleLowerCase(),
        depth,
        index,
      });
    }
  }
  if (references.length === 0) {
    const fallback = `${snapshot.missionBody} ${snapshot.lessonIntro}`.toLocaleLowerCase();
    [...availableTables].forEach((table, index) => {
      if (fallback.includes(table)) {
        references.push({ table, depth: 0, index });
      }
    });
  }
  if (references.length === 0 && availableTables.size === 1) {
    references.push({
      table: [...availableTables][0],
      depth: 0,
      index: 0,
    });
  }
  const shallowestDepth = Math.min(...references.map((reference) => reference.depth));
  const primary = references
    .filter((reference) => reference.depth === shallowestDepth)
    .sort((left, right) => left.index - right.index)[0]?.table;
  const roles = new Map<string, SchemaTaskRole>();
  references.forEach(({ table }) => {
    if (!availableTables.has(table)) return;
    roles.set(table, table === primary ? "primary" : "related");
  });
  return roles;
}

export interface CombatSettlementCopy {
  title: string;
  xp: string;
  progress: string;
  levelUp: string;
  reward: string;
}

export interface NarrativeRuntimeProgress {
  seenBeatIds: readonly string[];
  seenMomentIds: readonly string[];
  unlockedMoments: readonly FloorStoryMoment[];
  discoveredEvidenceIds: readonly string[];
  completedAscentIds: readonly string[];
  completedMigrationStepIds: readonly NarrativeEndingStep["id"][];
  latestBeat: NarrativeBeat | null;
  latestMoment: FloorStoryMoment | null;
  storyMomentTotal: number;
}

export function narrativeProgressForSnapshot(
  snapshot: Pick<
    GameSnapshot,
    | "completedLessons"
    | "completedRoomIds"
    | "floor"
    | "focusMonsterId"
    | "mode"
    | "monsters"
    | "openedGateIds"
    | "respawnCampfireId"
    | "roomGraph"
  >,
): NarrativeRuntimeProgress {
  const floor = narrativeFloorFor(snapshot.floor);
  const requiredLessonIds = snapshot.roomGraph.nodes
    .filter((node) => node.required && node.lessonId)
    .map((node) => node.lessonId!);
  const completedRequiredCount = requiredLessonIds
    .filter((lessonId) => snapshot.completedLessons.includes(lessonId))
    .length;
  const focusMonster = snapshot.focusMonsterId === null
    ? null
    : snapshot.monsters.find((monster) => monster.id === snapshot.focusMonsterId) ?? null;
  const floorBossLessonId = snapshot.roomGraph.nodes.find(
    (node) => node.id === snapshot.roomGraph.bossId,
  )?.lessonId;
  const bossReached = (
    snapshot.mode === "combat" &&
    focusMonster?.isBoss === true &&
    focusMonster.rank === "boss" &&
    focusMonster.lessonId === floorBossLessonId
  ) || snapshot.completedRoomIds.includes(snapshot.roomGraph.bossId);
  const floorCompleted = snapshot.mode === "transition" || snapshot.mode === "victory";
  const story = floorStoryProgress({
    floor: snapshot.floor,
    mode: snapshot.mode,
    completedLessons: snapshot.completedLessons,
    defeatedMonsterIds: snapshot.monsters
      .filter((monster) => monster.hp <= 0)
      .map((monster) => monster.id),
    openedGateIds: snapshot.openedGateIds,
  });

  const seenBeats = floor.beats.filter((beat) => {
    if (beat.kind === "floor-entry") return true;
    if (completedRequiredCount < beat.trigger.completedRequiredCount) return false;
    if (beat.kind === "midpoint-evidence") return true;
    if (beat.kind === "campfire") return snapshot.respawnCampfireId !== null;
    if (beat.kind === "boss") return bossReached;
    return floorCompleted;
  });
  const completedAscentIds = NARRATIVE_FLOORS.flatMap((entry) => {
    if (!entry.ascent) return [];
    if (
      entry.floor < snapshot.floor ||
      (entry.floor === snapshot.floor && floorCompleted)
    ) return [entry.ascent.id];
    return [];
  });
  const completedMigrationStepIds = snapshot.floor === 8
    ? finalMigrationProgress(snapshot.openedGateIds).completedStepIds
    : [];
  const explicitlyDiscoveredEvidenceIds = snapshot.openedGateIds
    .map(storyEvidenceIdFromMarker)
    .filter((id): id is string => id !== null);
  const hiddenAreaEvidenceIds = story.unlocked.flatMap((moment) => (
    moment.unlock.type === "gate-opened" &&
    snapshot.openedGateIds.includes(moment.unlock.gateId)
      ? moment.actions.flatMap((action) => (
          action.type === "evidence" ? [action.evidenceId] : []
        ))
      : []
  ));

  return {
    seenBeatIds: seenBeats.map((beat) => beat.id),
    seenMomentIds: story.unlockedIds,
    unlockedMoments: story.unlocked,
    discoveredEvidenceIds: [...new Set([
      ...explicitlyDiscoveredEvidenceIds,
      ...hiddenAreaEvidenceIds,
    ])],
    completedAscentIds,
    completedMigrationStepIds,
    latestBeat: seenBeats.at(-1) ?? null,
    latestMoment: story.latest,
    storyMomentTotal: story.total,
  };
}

export function combatSettlementCopy(
  experience: ExperienceSettlement,
  lootDropped: boolean,
  recoveryName?: string,
): CombatSettlementCopy {
  const nextXp = LEVEL_XP_THRESHOLDS[experience.currentLevel];
  const progress = nextXp === undefined
    ? `LV.${experience.currentLevel} · ${experience.previousXp} → ${experience.currentXp} XP · MAX`
    : `LV.${experience.currentLevel} · ${experience.previousXp} → ${experience.currentXp} / ${nextXp} XP`;
  const levelUp = experience.currentLevel > experience.previousLevel
    ? `LEVEL UP · LV.${experience.previousLevel} → LV.${experience.currentLevel} · 生命上限 ${experience.previousMaxHp} → ${experience.currentMaxHp}`
    : "距离下一等级又近了一步";
  return {
    title: `击败 ${experience.monsterName}`,
    xp: `+${experience.gained} XP`,
    progress,
    levelUp,
    reward: recoveryName
      ? `${recoveryName} 已自动使用 · 不占背包${
        lootDropped ? "；另有战利品包留在战场" : ""
      }`
      : lootDropped
        ? "战利品包已留在战场 · 靠近后按 E 打开"
        : "本次没有物品掉落 · 经验已正常结算",
  };
}
