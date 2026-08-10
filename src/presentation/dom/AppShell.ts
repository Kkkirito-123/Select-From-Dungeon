/**
 * 浏览器 DOM 外壳和交互协调器。
 * AppShell 负责模板挂载、按钮/键盘事件、SQL 终端、篝火/背包/复盘展示
 * 和场景间的消息转发；它只调用 GameSession 公开动作，不直接修改规则或
 * 存档，也不承担外部服务或模型输出生成。
 */
import { ArcadeAudio } from "../../infrastructure/audio/ArcadeAudio";
import {
  NARRATIVE_ENDINGS,
  NARRATIVE_FLOORS,
  type NarrativeBeat,
  type NarrativeEndingStep,
} from "../../content/narrative/narrativeContent";
import { finalMigrationStageNarrative } from "../../content/narrative/finalMigrationSequence";
import {
  floorMapBlueprint,
  floorTransitPresentation,
  regionPortalsEnabledForFloor,
} from "../../content/world/floorMapBlueprints";
import type { OnboardingMilestone } from "../../content/curriculum/onboarding";
import {
  INITIAL_MONSTERS,
  LESSONS,
  practiceStagesFor,
} from "../../content/curriculum/mvpLevel";
import {
  COMPLETE_RELATION_LINES,
  COMPLETE_SCHEMA_LINES,
  SQL_RELATIONS,
  SQL_TABLES,
  type SqlTableName,
} from "../../content/sql/sqlSchema";
import { GameSession, LEVEL_XP_THRESHOLDS } from "../../domain/session/GameSession";
import { narrativeFloorFor } from "../../domain/progression/narrative";
import {
  FloorStoryMomentQueue,
  floorStoryInspectMomentForLandmark,
  floorStoryMoments,
  floorStoryProgress,
  storyEvidenceIdFromMarker,
  type FloorStoryMoment,
  type FloorStoryPresentation,
} from "../../domain/progression/floorStory";
import {
  finalMigrationProgress,
} from "../../domain/progression/finalMigration";
import {
  monsterIdLabel,
  redactUndiscoveredMonsterIdentityText,
} from "../../domain/progression/monsterIdentity";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type {
  CampfireReview,
  ExperienceSettlement,
  PatrolMove,
  QueryResultDisclosure,
  SqlQueryResult,
  TurnResolution,
} from "../../contracts/game/results";
import { buildCampfireReview, campfireReviewInput } from "../../domain/learning/campfireReview";
import type {
  GroundItem,
  LootItem,
  Monster,
} from "../../domain/shared/types";
import type { FeedbackDirector, FeedbackNotice } from "../../infrastructure/feedback/FeedbackDirector";
import type { BattleScene } from "../phaser/BattleScene";
import { pickedItemsBetween } from "../phaser/snapshotFeedback";
import type { SqlEngine } from "../../infrastructure/sql/SqlEngine";
import type { OnboardingController, OnboardingSnapshot } from "./OnboardingController";
import { bindAppShellDom } from "./appShellDom";
import { appShellTemplate } from "./appShellTemplate";
import { DialogFocusManager } from "./focus/DialogFocusManager";
import { HudRenderer } from "./renderers/HudRenderer";
import { MinimapRenderer } from "./renderers/MinimapRenderer";
import { CombatRenderer } from "./renderers/CombatRenderer";
import type { AnswerReviewScope } from "./AnswerReviewView";
import { NarrativePanel } from "./panels/NarrativePanel";
import { ReviewPanel } from "./panels/ReviewPanel";
import { SchemaPanel } from "./panels/SchemaPanel";
import { TerminalPanel } from "./panels/TerminalPanel";
import { MonsterCodexView } from "./MonsterCodexView";
import {
  FloorTransitionCoordinator,
  floorTransitionPolicy,
} from "./FloorTransitionCoordinator";
import {
  parseSchemaLines,
  SqlAutocompleteController,
} from "./sqlAutocomplete";
import { SqlChordTracker } from "./SqlChordTracker";
import { CampfirePanel } from "./panels/CampfirePanel";
import { InventoryPanel } from "./panels/InventoryPanel";
import type { CampfireHook } from "../../application/hooks/campfire";
import type { ScribeAgentContent } from "../../contracts/agent/scribe";
import type { ScribeHook, ScribeHookState } from "../../application/hooks/scribe";
import { adminAnswerForInput, shouldAutofillAdminAnswer } from "./adminAnswer";
export { shapeOnlyQueryResultCopy } from "./panels/TerminalPanel";

function requiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少界面元素：${selector}`);
  return element;
}

function dispatchMove(dx: number, dy: number): void {
  window.dispatchEvent(new CustomEvent("dungeon:move", { detail: { dx, dy } }));
}

function dispatchInteract(): void {
  window.dispatchEvent(new CustomEvent("dungeon:interact"));
}

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

export class AppShell {
  private textarea!: HTMLTextAreaElement;
  private gateTextarea!: HTMLTextAreaElement;
  private queryStatus!: HTMLElement;
  private gateQueryStatus!: HTMLElement;
  private resultRoot!: HTMLElement;
  private planRoot!: HTMLElement;
  private hintsRoot!: HTMLElement;
  private terminal!: HTMLElement;
  private gateTerminal!: HTMLElement;
  private inspectionOverlay!: HTMLElement;
  private campfireMenu!: HTMLElement;
  private inventoryMenu!: HTMLElement;
  private lootMenu!: HTMLElement;
  private adminMenu!: HTMLElement;
  private answerReview!: ReviewPanel;
  private narrativeCodex!: NarrativePanel;
  private monsterCodex!: MonsterCodexView;
  private executeButton!: HTMLButtonElement;
  private gateExecuteButton!: HTMLButtonElement;
  private sqlButton!: HTMLButtonElement;
  private audioButton!: HTMLButtonElement;
  private combatAutocomplete!: SqlAutocompleteController;
  private gateAutocomplete!: SqlAutocompleteController;
  private lastStageId: GameSnapshot["lessonStageId"] | null = null;
  private lastMode: GameSnapshot["mode"] | null = null;
  private lastSnapshot!: GameSnapshot;
  private selectedSchemaTable: SqlTableName = "monsters";
  private busy = false;
  private readonly sqlChord = new SqlChordTracker();
  private readonly dialogFocus = new DialogFocusManager();
  private readonly hudRenderer: HudRenderer;
  private readonly minimapRenderer: MinimapRenderer;
  private readonly combatRenderer: CombatRenderer;
  private inventoryPanel!: InventoryPanel;
  private campfirePanel!: CampfirePanel;
  private readonly schemaPanel = new SchemaPanel();
  private terminalPanel!: TerminalPanel;
  private readonly listenerController = new AbortController();
  private unsubscribeSession: (() => void) | null = null;
  private unsubscribeFeedback: (() => void) | null = null;
  private unsubscribeOnboarding: (() => void) | null = null;
  private unsubscribeCampfireHook: (() => void) | null = null;
  private unsubscribeScribeHook: (() => void) | null = null;
  private releaseAudioGesture: (() => void) | null = null;
  private focusBeforeTerminal: HTMLElement | null = null;
  private focusBeforeInspection: HTMLElement | null = null;
  private toastTimer: number | null = null;
  private terminalFocusTimer: number | null = null;
  private pickupShownAtMove: number | null = null;
  private settlementShownAtMove: number | null = null;
  private settlementAutoCloseTimer: number | null = null;
  private narrativeBeatShownAtMove: number | null = null;
  private readonly narrativeMomentQueue = new FloorStoryMomentQueue();
  private narrativeMomentQueuePrimed = false;
  private narrativeBootstrapMode: "new" | "restored";
  private activeNarrativeMoment: FloorStoryMoment | null = null;
  private narrativeActionInFlight = false;
  private readonly floorTransitionCoordinator: FloorTransitionCoordinator;
  private defeatRespawnTimer: number | null = null;
  private regionTransitionTimer: number | null = null;
  private lastRegionTransferSequence = 0;
  private lastLocksSignature: string | null = null;
  private lastSchemaSignature: string | null = null;
  private lastHintsSignature: string | null = null;
  private lastMasterySignature: string | null = null;
  private lastRelicsSignature: string | null = null;
  private reviewContext: "manual" | "campfire" | "death" = "manual";
  private reviewScope: AnswerReviewScope = "all";
  private activeNotice: FeedbackNotice | null = null;
  private readonly noticeQueue: FeedbackNotice[] = [];
  private lastScribeNoticeKey: string | null = null;

  private readonly openTerminalHandler = (): void => this.openTerminal();
  private readonly inspectionHandler = (event: Event): void => {
    const detail = (event as CustomEvent<{
      message?: string;
      landmarkId?: string;
    }>).detail;
    const message = detail?.message;
    if (typeof message === "string" && message.trim() !== "") {
      const inspectionMessage = detail?.landmarkId?.startsWith("npc-scribe-f")
        ? this.scribeMessage(message)
        : message;
      if (typeof detail.landmarkId === "string") {
        const isScribe = detail.landmarkId.startsWith("npc-scribe-f");
        const scribeOutput = isScribe && this.scribeHook
          ? this.scribeHook.interact(
            this.lastSnapshot,
            detail.landmarkId,
            inspectionMessage,
          )
          : null;
        const inspectMoment = floorStoryInspectMomentForLandmark({
          floor: this.lastSnapshot.floor,
          mode: this.lastSnapshot.mode,
          completedLessons: this.lastSnapshot.completedLessons,
          defeatedMonsterIds: this.lastSnapshot.monsters
            .filter((monster) => monster.hp <= 0)
            .map((monster) => monster.id),
          openedGateIds: this.lastSnapshot.openedGateIds,
        }, detail.landmarkId);
        if (inspectMoment) {
          this.activeNarrativeMoment = inspectMoment;
          if (scribeOutput) {
            this.openScribeOverlay(
              scribeOutput,
              this.scribeHook?.getState().requestKey ?? null,
            );
          } else {
            this.openStoryMoment(inspectMoment, this.lastSnapshot, inspectionMessage);
          }
          return;
        }
        if (scribeOutput) {
          this.openScribeOverlay(
            scribeOutput,
            this.scribeHook?.getState().requestKey ?? null,
          );
          return;
        }
      }
      this.openInspection(inspectionMessage);
    }
  };
  private readonly keydownHandler = (event: KeyboardEvent): void => {
    if (this.isInspectionOpen()) {
      if (isInspectionPrimaryKey(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.inspectionOverlay.dataset.recordKind === "migration") {
          this.advanceFinalMigration();
        } else {
          this.closeInspection();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!inspectionEscapeCanClose(
          this.inspectionOverlay.dataset.recordKind,
          this.activeNarrativeMoment?.presentation,
        )) return;
        this.closeInspection(true, false);
        return;
      }
      if (event.key === "Tab") {
        this.trapDialogFocus(event, this.inspectionOverlay);
        return;
      }
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && this.isMonsterCodexOpen()) {
      event.preventDefault();
      this.monsterCodex.close();
      return;
    }
    if (event.key === "Escape" && this.isNarrativeCodexOpen()) {
      event.preventDefault();
      this.narrativeCodex.close();
      return;
    }
    if (event.key === "Escape" && this.isAdminMenuOpen()) {
      event.preventDefault();
      this.closeAdminMenu();
      return;
    }
    if (event.key === "Escape" && this.isReviewOpen()) {
      event.preventDefault();
      this.closeReview();
      return;
    }
    if (event.key === "Escape" && this.isLootMenuOpen()) {
      event.preventDefault();
      this.closeLootMenu();
      return;
    }
    if (event.key === "Escape" && this.isInventoryMenuOpen()) {
      event.preventDefault();
      this.closeInventoryMenu();
      return;
    }
    if (event.key === "Escape" && this.isCampfireMenuOpen()) {
      event.preventDefault();
      this.leaveCampfire();
      return;
    }
    if (event.key === "Escape" && this.isGateTerminalOpen()) {
      event.preventDefault();
      this.closeGateTerminal();
      return;
    }
    if (event.key === "Escape" && this.isTerminalOpen()) {
      event.preventDefault();
      this.closeTerminal();
      return;
    }
    if (event.key === "Escape" && this.session.cancelGuidanceEscort()) {
      event.preventDefault();
      return;
    }
    if (
      event.key === "Tab" &&
      (
        this.isReviewOpen() ||
        this.isMonsterCodexOpen() ||
        this.isNarrativeCodexOpen() ||
        this.isAdminMenuOpen() ||
        this.isLootMenuOpen() ||
        this.isInventoryMenuOpen() ||
        this.isCampfireMenuOpen() ||
        this.isVictoryPortalOpen() ||
        this.isTerminalOpen() ||
        this.isGateTerminalOpen()
      )
    ) {
      this.trapDialogFocus(
        event,
        this.isMonsterCodexOpen()
          ? this.monsterCodex.element
          : this.isNarrativeCodexOpen()
          ? this.narrativeCodex.element
          : this.isReviewOpen()
          ? this.answerReview.element
          : this.isAdminMenuOpen()
            ? this.adminMenu
          : this.isVictoryPortalOpen()
            ? requiredElement(this.root, "#floor-portal")
          : this.isLootMenuOpen()
            ? this.lootMenu
          : this.isInventoryMenuOpen()
            ? this.inventoryMenu
          : this.isCampfireMenuOpen()
            ? this.campfireMenu
          : this.isGateTerminalOpen() ? this.gateTerminal : this.terminal,
      );
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "Enter" &&
      this.isGateTerminalOpen()
    ) {
      event.preventDefault();
      void this.executeGateChallenge();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && this.isTerminalOpen()) {
      event.preventDefault();
      void this.executeQuery();
      return;
    }
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (
      event.code === "KeyB" &&
      activeTag !== "textarea" &&
      activeTag !== "input" &&
      activeTag !== "select" &&
      (this.lastSnapshot?.mode === "explore" || this.lastSnapshot?.mode === "campfire")
    ) {
      event.preventDefault();
      this.session.openInventory();
      return;
    }
    if (
      this.lastSnapshot?.mode === "combat" &&
      activeTag !== "textarea" &&
      activeTag !== "input" &&
      (event.code === "KeyQ" || event.code === "KeyS")
    ) {
      event.preventDefault();
      if (!canOpenCombatTerminal(this.lastSnapshot.mode, this.busy)) {
        this.sqlChord.reset();
        return;
      }
      if (this.sqlChord.keyDown(event.code)) this.openTerminal();
      return;
    }
    if (event.code === "KeyH" && activeTag !== "textarea" && activeTag !== "input") {
      event.preventDefault();
      this.requestHint();
    }
  };
  private readonly keyupHandler = (event: KeyboardEvent): void => {
    this.sqlChord.keyUp(event.code);
  };
  private readonly blurHandler = (): void => {
    this.sqlChord.reset();
  };
  private readonly milestoneHandler = (event: Event): void => {
    const milestone = (event as CustomEvent<{ type?: OnboardingMilestone }>).detail?.type;
    if (
      milestone === "player-step" ||
      milestone === "encounter-start" ||
      milestone === "item-pickup"
    ) {
      this.onboarding.advance(milestone);
    }
  };
  private readonly patrolHandler = (event: Event): void => {
    const moves = (event as CustomEvent<{ moves?: PatrolMove[] }>).detail?.moves;
    if (!Array.isArray(moves)) return;
    const markers = this.root.querySelectorAll<SVGRectElement>(
      "#castle-map .minimap-monster[data-monster-id]",
    );
    const currentSight = this.minimapRenderer.currentSight(this.lastSnapshot);
    moves.forEach((move) => {
      const marker = Array.from(markers).find(
        (entry) => entry.dataset.monsterId === String(move.monsterId),
      );
      if (!marker) return;
      marker.setAttribute("x", String(move.to.x + 0.12));
      marker.setAttribute("y", String(move.to.y + 0.12));
      marker.setAttribute(
        "visibility",
        currentSight.has(`${move.to.x}:${move.to.y}`)
          ? "visible"
          : "hidden",
      );
    });
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly session: GameSession,
    private readonly sql: SqlEngine,
    private readonly audio: ArcadeAudio,
    private readonly feedback: FeedbackDirector,
    private readonly onboarding: OnboardingController,
    private readonly getBattleScene: () => BattleScene | null,
    initialRunSource: "new" | "restored" = "new",
    private readonly campfireHook: CampfireHook | null = null,
    private readonly scribeHook: ScribeHook | null = null,
  ) {
    this.hudRenderer = new HudRenderer(root);
    this.minimapRenderer = new MinimapRenderer(root);
    this.combatRenderer = new CombatRenderer(root, this.hudRenderer);
    this.narrativeBootstrapMode = initialRunSource;
    this.floorTransitionCoordinator = new FloorTransitionCoordinator({
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (timerId) => window.clearTimeout(timerId),
    }, () => this.advanceFromFloorTransition());
  }

  mount(): void {
    const schemaFieldCount = SQL_TABLES.reduce(
      (total, table) => total + table.columns.length,
      0,
    );
    this.root.innerHTML = appShellTemplate({
      schemaTableCount: SQL_TABLES.length,
      schemaFieldCount,
    });

    const dom = bindAppShellDom(this.root);
    this.textarea = dom.textarea;
    this.gateTextarea = dom.gateTextarea;
    this.queryStatus = dom.queryStatus;
    this.gateQueryStatus = dom.gateQueryStatus;
    this.resultRoot = dom.resultRoot;
    this.planRoot = dom.planRoot;
    this.hintsRoot = dom.hintsRoot;
    this.terminal = dom.terminal;
    this.gateTerminal = dom.gateTerminal;
    this.inspectionOverlay = dom.inspectionOverlay;
    this.campfireMenu = dom.campfireMenu;
    this.inventoryMenu = dom.inventoryMenu;
    this.lootMenu = dom.lootMenu;
    this.adminMenu = dom.adminMenu;
    this.answerReview = new ReviewPanel(this.root);
    this.narrativeCodex = new NarrativePanel(this.root, {
      onClose: () => {
        this.root.classList.remove("narrative-active");
        this.syncAudioFocus();
      },
    });
    this.monsterCodex = new MonsterCodexView(this.root, {
      onClose: () => {
        this.root.classList.remove("monster-codex-active");
        this.syncAudioFocus();
      },
    });
    this.executeButton = dom.executeButton;
    this.gateExecuteButton = dom.gateExecuteButton;
    this.sqlButton = dom.sqlButton;
    this.audioButton = dom.audioButton;
    this.inventoryPanel = new InventoryPanel(this.root, {
      openInventory: () => this.session.openInventory(),
      closeInventory: () => this.session.closeInventory(),
      closeLootBundle: () => this.session.closeLootBundle(),
      takeAllLoot: (bundleId) => this.session.takeAllLoot(bundleId),
      equipInventoryItem: (itemId) => this.session.equipInventoryItem(itemId),
      discardInventoryItem: (itemId) => this.session.discardInventoryItem(itemId),
      useConsumable: (itemId) => this.session.useConsumable(
        itemId as Parameters<GameSession["useConsumable"]>[0],
      ),
      discardConsumable: (itemId) => this.session.discardConsumable(
        itemId as Parameters<GameSession["discardConsumable"]>[0],
      ),
      takeLootItem: (bundleId, dropId, action, replaceInstanceId) => (
        this.session.takeLootItem(bundleId, dropId, action, replaceInstanceId)
      ),
      showNotice: (notice) => this.showFeedbackNotice(notice),
      presentLoot: (items, effect) => this.presentLootAcquisition(items, effect),
      focusGame: () => requiredElement<HTMLElement>(this.root, "#game-root").focus({
        preventScroll: true,
      }),
    });
    this.campfirePanel = new CampfirePanel(
      this.root,
      {
        openInventory: () => this.session.openInventory(),
        openReview: () => this.openReview("floor", "campfire"),
        restAtCampfire: () => this.session.restAtCampfire(),
        leaveCampfire: () => this.session.leaveCampfire(),
        showNotice: (notice) => this.showFeedbackNotice(notice),
        focusGame: () => requiredElement<HTMLElement>(this.root, "#game-root").focus({
          preventScroll: true,
        }),
      },
      (snapshot) => this.campfireReview(snapshot),
    );
    this.terminalPanel = new TerminalPanel(this.root, {
      executeQuery: () => this.executeQuery(),
      executeGateChallenge: () => this.executeGateChallenge(),
      closeTerminal: () => this.closeTerminal(),
      closeGateTerminal: () => this.closeGateTerminal(),
      requestHint: () => this.requestHint(),
    });
    this.combatAutocomplete = new SqlAutocompleteController(
      this.textarea,
      requiredElement(this.root, "#sql-suggestions"),
      this.listenerController.signal,
    );
    this.gateAutocomplete = new SqlAutocompleteController(
      this.gateTextarea,
      requiredElement(this.root, "#gate-sql-suggestions"),
      this.listenerController.signal,
    );
    this.renderCompactSchema(requiredElement(this.root, "#terminal-schema-reference"));
    this.renderCompactSchema(requiredElement(this.root, "#gate-schema-reference"));
    this.renderSchemaCodex();

    const listenerOptions = { signal: this.listenerController.signal };
    this.terminalPanel.bind(listenerOptions);
    this.campfirePanel.bind(listenerOptions);
    this.inventoryPanel.bind(listenerOptions, () => this.lastSnapshot ?? this.session.snapshot());
    requiredElement(this.root, "#close-inspection").addEventListener(
      "click",
      () => this.inspectionOverlay.dataset.recordKind === "migration"
        ? this.advanceFinalMigration()
        : this.closeInspection(),
      listenerOptions,
    );
    requiredElement(this.root, "#retreat-combat").addEventListener(
      "click",
      () => this.retreatFromCombat(),
      listenerOptions,
    );
    requiredElement(this.root, "#open-review").addEventListener("click", () => this.openReview(), listenerOptions);
    requiredElement(this.root, "#open-narrative").addEventListener(
      "click",
      () => this.openNarrativeCodex(),
      listenerOptions,
    );
    requiredElement(this.root, "#open-monster-codex").addEventListener(
      "click",
      () => this.openMonsterCodex(),
      listenerOptions,
    );
    requiredElement(this.root, "#open-ending-codex").addEventListener(
      "click",
      () => this.openNarrativeCodex(),
      listenerOptions,
    );
    requiredElement(this.root, "#restart-after-victory").addEventListener(
      "click",
      () => {
        this.reset();
        requiredElement<HTMLElement>(this.root, "#game-root").focus({
          preventScroll: true,
        });
      },
      listenerOptions,
    );
    requiredElement(this.root, "#open-admin").addEventListener(
      "click",
      () => this.openAdminMenu(),
      listenerOptions,
    );
    requiredElement(this.root, "#close-admin").addEventListener(
      "click",
      () => this.closeAdminMenu(),
      listenerOptions,
    );
    requiredElement(this.root, "#admin-next-floor").addEventListener(
      "click",
      () => this.handleAdminNextFloor(),
      listenerOptions,
    );
    requiredElement(this.root, "#close-review").addEventListener("click", () => this.closeReview(), listenerOptions);
    requiredElement(this.root, "#interact").addEventListener(
      "click",
      () => this.isInspectionOpen()
        ? this.inspectionOverlay.dataset.recordKind === "migration"
          ? this.advanceFinalMigration()
          : this.closeInspection()
        : dispatchInteract(),
      listenerOptions,
    );
    this.sqlButton.addEventListener("click", () => this.openTerminal(), listenerOptions);
    requiredElement(this.root, "#reset-game").addEventListener("click", () => this.reset(), listenerOptions);
    requiredElement(this.root, "#skip-onboarding").addEventListener("click", () => this.onboarding.skip(), listenerOptions);
    requiredElement(this.root, "#replay-onboarding").addEventListener("click", () => this.onboarding.replay(), listenerOptions);
    requiredElement(this.root, "#replay-onboarding-control").addEventListener("click", () => this.onboarding.replay(), listenerOptions);
    requiredElement(this.root, "#schema-table-tabs").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-schema-table]");
      const tableName = button?.dataset.schemaTable as SqlTableName | undefined;
      if (!tableName || !SQL_TABLES.some((table) => table.name === tableName)) return;
      this.selectSchemaTable(tableName, true);
    }, listenerOptions);
    requiredElement(this.root, "#schema-table-tabs").addEventListener("keydown", (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-schema-table]");
      const tableName = button?.dataset.schemaTable as SqlTableName | undefined;
      if (!tableName) return;
      const currentIndex = SQL_TABLES.findIndex((table) => table.name === tableName);
      if (currentIndex < 0) return;
      let nextIndex = currentIndex;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % SQL_TABLES.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + SQL_TABLES.length) % SQL_TABLES.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = SQL_TABLES.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      this.selectSchemaTable(SQL_TABLES[nextIndex].name, true);
    }, listenerOptions);
    this.audioButton.addEventListener("click", () => void this.toggleAudio(), listenerOptions);
    requiredElement<HTMLInputElement>(this.root, "#audio-volume").addEventListener("input", (event) => {
      this.audio.setVolume(Number((event.currentTarget as HTMLInputElement).value));
    }, listenerOptions);

    this.root.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => {
      button.addEventListener("click", () => {
        const directions: Record<string, [number, number]> = {
          up: [0, -1],
          down: [0, 1],
          left: [-1, 0],
          right: [1, 0],
        };
        const direction = directions[button.dataset.move ?? ""];
        if (direction) dispatchMove(direction[0], direction[1]);
      }, listenerOptions);
    });

    this.releaseAudioGesture = this.audio.armFirstGesture(window);
    window.addEventListener("dungeon:open-terminal", this.openTerminalHandler, listenerOptions);
    window.addEventListener("dungeon:inspection", this.inspectionHandler, listenerOptions);
    window.addEventListener("dungeon:milestone", this.milestoneHandler, listenerOptions);
    window.addEventListener("dungeon:patrol", this.patrolHandler, listenerOptions);
    window.addEventListener("keydown", this.keydownHandler, {
      ...listenerOptions,
      capture: true,
    });
    window.addEventListener("keyup", this.keyupHandler, listenerOptions);
    window.addEventListener("blur", this.blurHandler, listenerOptions);
    this.unsubscribeFeedback = this.feedback.subscribe((_event, notice) => {
      if (notice) this.showFeedbackNotice(notice);
    });
    this.unsubscribeOnboarding = this.onboarding.subscribe((snapshot) => {
      this.renderOnboarding(snapshot);
    });
    this.unsubscribeCampfireHook = this.campfireHook?.subscribe(() => {
      if (this.lastSnapshot && this.isCampfireMenuOpen()) {
        this.renderCampfireMenu(this.lastSnapshot, false);
      }
    }) ?? null;
    this.unsubscribeScribeHook = this.scribeHook?.subscribe((state) => {
      this.renderScribeState(state);
    }) ?? null;
    this.unsubscribeSession = this.session.subscribe((snapshot) => this.render(snapshot));
  }

  destroy(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.unsubscribeFeedback?.();
    this.unsubscribeFeedback = null;
    this.unsubscribeOnboarding?.();
    this.unsubscribeOnboarding = null;
    this.unsubscribeCampfireHook?.();
    this.unsubscribeCampfireHook = null;
    this.unsubscribeScribeHook?.();
    this.unsubscribeScribeHook = null;
    this.releaseAudioGesture?.();
    this.releaseAudioGesture = null;
    this.listenerController.abort();
    this.narrativeCodex.destroy();
    this.monsterCodex.destroy();
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.activeNotice = null;
    this.noticeQueue.length = 0;
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = null;
    this.pickupShownAtMove = null;
    this.settlementShownAtMove = null;
    if (this.settlementAutoCloseTimer !== null) {
      window.clearTimeout(this.settlementAutoCloseTimer);
    }
    this.settlementAutoCloseTimer = null;
    this.narrativeBeatShownAtMove = null;
    this.activeNarrativeMoment = null;
    this.narrativeMomentQueue.clear();
    this.narrativeMomentQueuePrimed = false;
    this.floorTransitionCoordinator.destroy();
    if (this.defeatRespawnTimer !== null) window.clearTimeout(this.defeatRespawnTimer);
    this.defeatRespawnTimer = null;
    if (this.regionTransitionTimer !== null) window.clearTimeout(this.regionTransitionTimer);
    this.regionTransitionTimer = null;
    this.root.classList.remove(
      "terminal-active",
      "gate-terminal-active",
      "campfire-active",
      "inventory-active",
      "loot-active",
      "review-active",
      "admin-active",
      "narrative-active",
      "inspection-active",
      "monster-codex-active",
      "victory-active",
    );
    void this.audio.dispose();
  }

  private async executeQuery(): Promise<void> {
    if (this.busy) return;
    if (!this.textarea.value.trim()) {
      const message = this.lastSnapshot?.floor === 6
        ? "先写出本回合完整的沙箱 SQL；空输入不会消耗回合。"
        : this.lastSnapshot?.floor === 7
          ? "先写一条查询；系统会同时验证结果与真实 SQLite 执行计划。"
          : this.lastSnapshot?.floor === 8
            ? "先查询本回合给出的教学事故记录；空输入不会消耗回合。"
            : "先写一条完整的只读 SELECT / WITH 查询；空输入不会消耗回合。";
      this.queryStatus.textContent = message;
      this.queryStatus.dataset.kind = "warning";
      this.showFeedbackNotice({ message, tone: "info" });
      return;
    }

    let reopenAfterResolution = false;
    this.combatAutocomplete.hide();
    this.busy = true;
    this.syncAudioFocus();
    requiredElement(this.root, ".game-stage").classList.add("is-resolving");
    this.executeButton.disabled = true;
    this.sqlButton.disabled = true;
    try {
      let result: SqlQueryResult | null = null;
      let queryError: unknown = null;
      try {
        const identityPolicy = this.session.validateCombatQuery(this.textarea.value);
        if (!identityPolicy.ok) throw new Error(identityPolicy.message);
        result = this.sql.execute(
          this.textarea.value,
          this.lastSnapshot?.floor ?? 1,
          this.lastSnapshot?.lessonId,
        );
      } catch (error) {
        queryError = error;
      }

      let resolution: TurnResolution;
      if (result) {
        resolution = this.session.resolveQuery(result);
        if (resolution.hpUpdates.length > 0) this.sql.updateMonsterHp(resolution.hpUpdates);
        this.renderResult(result, resolution.resultDisclosure);
        this.queryStatus.textContent = resolution.message;
        this.queryStatus.dataset.kind = resolution.accepted ? "success" : "warning";
        this.showFeedbackNotice({
          message: resolution.message,
          tone: resolution.accepted ? "success" : "danger",
        });
      } else {
        const message = queryError instanceof Error ? queryError.message : "查询执行失败。";
        resolution = this.session.registerQueryError(message, this.textarea.value);
        this.queryStatus.textContent = resolution.message;
        this.queryStatus.dataset.kind = "error";
        this.showFeedbackNotice({ message: resolution.message, tone: "danger" });
      }

      if (resolution.accepted && resolution.lessonCompleted) {
        this.onboarding.advance("query-accepted");
      }
      this.closeTerminal(true);
      this.audio.setFocus("resolving");
      try {
        await this.getBattleScene()?.animateTurn(resolution);
      } catch (error) {
        console.error("战斗动画播放失败", error);
        const message = `${resolution.message}（动画未播放，但回合状态已结算。）`;
        this.queryStatus.textContent = message;
        this.queryStatus.dataset.kind = "error";
        this.showFeedbackNotice({ message, tone: "danger" });
        if (resolution.mode !== "combat") this.getBattleScene()?.abortEncounter();
      }
      if (resolution.experience) {
        if (resolution.events.some((event) => event.type === "identity-recovered")) {
          this.feedback.dispatch({
            type: "identity-recovered",
            monsterName: resolution.experience.monsterName,
            monsterId: resolution.experience.monsterId,
            xp: resolution.experience.gained,
          });
        }
        this.showCombatSettlement(resolution);
      }
      reopenAfterResolution = resolution.mode === "combat";
    } catch (error) {
      console.error("战斗回合结算失败", error);
      const message = "回合结算遇到内部错误，没有追加怪物反击。请重新打开终端再试。";
      this.queryStatus.textContent = message;
      this.queryStatus.dataset.kind = "error";
      this.showFeedbackNotice({ message, tone: "danger" });
      try {
        this.sql.reset(this.session.snapshot().monsters);
      } catch (recoveryError) {
        console.error("教学数据库恢复失败", recoveryError);
      }
      if (this.session.snapshot().mode !== "combat") {
        this.getBattleScene()?.abortEncounter();
      }
      this.closeTerminal(true);
    } finally {
      this.busy = false;
      requiredElement(this.root, ".game-stage").classList.remove("is-resolving");
      this.executeButton.disabled = false;
      this.sqlButton.disabled = this.lastSnapshot?.mode !== "combat";
      if (reopenAfterResolution) this.openTerminal();
      else this.syncAudioFocus();
    }
  }

  private async executeGateChallenge(): Promise<void> {
    if (this.busy || !this.isGateTerminalOpen()) return;
    if (!this.gateTextarea.value.trim()) {
      const message = "先写一条完整的只读 SELECT / WITH 查询；空输入不会触发机关反噬。";
      this.gateQueryStatus.textContent = message;
      this.gateQueryStatus.dataset.kind = "warning";
      this.showFeedbackNotice({ message, tone: "info" });
      return;
    }

    this.gateAutocomplete.hide();
    this.busy = true;
    this.syncAudioFocus();
    this.gateExecuteButton.disabled = true;
    requiredElement(this.root, ".game-stage").classList.add("is-resolving");
    try {
      this.feedback.dispatch({ type: "query-cast" });
      let result: SqlQueryResult | null = null;
      let queryError: unknown = null;
      try {
        const identityPolicy = this.session.validateGateChallengeQuery(
          this.gateTextarea.value,
        );
        if (!identityPolicy.ok) throw new Error(identityPolicy.message);
        result = this.sql.executeSelect(this.gateTextarea.value);
      } catch (error) {
        queryError = error;
      }

      const resolution = result
        ? this.session.resolveGateChallenge(result)
        : this.session.registerGateChallengeError(
            queryError instanceof Error ? queryError.message : "查询执行失败。",
          );
      if (result) {
        this.terminalPanel.renderResult(
          result,
          this.session.snapshot(),
          resolution.resultDisclosure,
          requiredElement(this.root, "#gate-query-result"),
          requiredElement(this.root, "#gate-query-plan"),
        );
      }
      this.gateQueryStatus.textContent = resolution.message;
      this.gateQueryStatus.dataset.kind = resolution.accepted ? "success" : "error";
      const receivedDamage = resolution.playerDamage + resolution.armorDamage;
      if (receivedDamage > 0) {
        this.feedback.dispatch({ type: "player-hurt", amount: receivedDamage });
      }
      if (!resolution.accepted && receivedDamage === 0) {
        this.showFeedbackNotice({ message: resolution.message, tone: "info" });
      }
    } catch (error) {
      console.error("机关查询结算失败", error);
      const message = "机关终端发生内部错误，本次没有扣除生命。请关闭后重新接入。";
      this.gateQueryStatus.textContent = message;
      this.gateQueryStatus.dataset.kind = "error";
      this.showFeedbackNotice({ message, tone: "danger" });
    } finally {
      this.busy = false;
      this.gateExecuteButton.disabled = false;
      requiredElement(this.root, ".game-stage").classList.remove("is-resolving");
      this.syncAudioFocus();
    }
  }

  private openNarrativeCodex(): void {
    if (
      this.busy ||
      this.isGateTerminalOpen() ||
      this.isTerminalOpen() ||
      this.isReviewOpen() ||
      this.isMonsterCodexOpen() ||
      this.isAdminMenuOpen() ||
      this.isInventoryMenuOpen() ||
      this.isLootMenuOpen()
    ) {
      this.showFeedbackNotice({
        message: "先结束当前界面，再打开失名录。",
        tone: "info",
      });
      return;
    }
    this.hideNarrativeBeatCard();
    this.root.classList.add("narrative-active");
    this.narrativeCodex.open();
    this.syncAudioFocus();
  }

  private isNarrativeCodexOpen(): boolean {
    return this.narrativeCodex?.isOpen() ?? false;
  }

  private openMonsterCodex(): void {
    if (
      this.busy ||
      this.isGateTerminalOpen() ||
      this.isTerminalOpen() ||
      this.isReviewOpen() ||
      this.isNarrativeCodexOpen() ||
      this.isAdminMenuOpen() ||
      this.isInventoryMenuOpen() ||
      this.isLootMenuOpen()
    ) {
      this.showFeedbackNotice({
        message: "先结束当前界面，再打开怪物图鉴。",
        tone: "info",
      });
      return;
    }
    this.hideNarrativeBeatCard();
    this.root.classList.add("monster-codex-active");
    this.monsterCodex.open();
    this.syncAudioFocus();
  }

  private isMonsterCodexOpen(): boolean {
    return this.monsterCodex?.isOpen() ?? false;
  }

  private syncAudioFocus(): void {
    if (this.busy) {
      this.audio.setFocus("resolving");
      return;
    }
    this.audio.setFocus(
      this.isTerminalOpen() ||
      this.isGateTerminalOpen() ||
      this.isReviewOpen() ||
      this.isMonsterCodexOpen() ||
      this.isNarrativeCodexOpen() ||
      this.isCampfireMenuOpen() ||
      this.isInspectionOpen()
        ? "thinking"
        : "world",
    );
  }

  private openReview(
    scope: AnswerReviewScope = "all",
    context: "manual" | "campfire" | "death" = "manual",
  ): void {
    if ((this.busy && context !== "death") || this.isGateTerminalOpen()) return;
    if (this.isNarrativeCodexOpen()) this.narrativeCodex.close();
    if (this.isMonsterCodexOpen()) this.monsterCodex.close();
    if (this.isTerminalOpen()) this.closeTerminal(false);
    if (!this.isReviewOpen()) {
      this.focusBeforeTerminal = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    this.reviewScope = scope;
    this.reviewContext = context;
    this.answerReview.render(this.lastSnapshot, scope);
    this.answerReview.setOpen(true);
    this.root.classList.add("review-active");
    this.answerReview.closeButton.focus({
      preventScroll: true,
    });
    this.syncAudioFocus();
  }

  private closeReview(): void {
    if (!this.isReviewOpen()) return;
    const context = this.reviewContext;
    this.reviewContext = "manual";
    this.reviewScope = "all";
    this.answerReview.setOpen(false);
    this.root.classList.remove("review-active");
    this.syncAudioFocus();
    const focusTarget = this.focusBeforeTerminal;
    this.focusBeforeTerminal = null;
    if (context === "death") {
      this.session.continueAfterDeathReview();
      requiredElement<HTMLElement>(this.root, "#game-root").focus();
      return;
    }
    if (context === "campfire" && this.lastSnapshot.mode === "campfire") {
      requiredElement<HTMLButtonElement>(this.root, "#review-at-campfire").focus();
      return;
    }
    if (focusTarget?.isConnected && !focusTarget.matches(":disabled")) {
      focusTarget.focus();
    } else {
      requiredElement<HTMLButtonElement>(this.root, "#open-review").focus();
    }
  }

  private isReviewOpen(): boolean {
    return this.answerReview?.isOpen() ?? false;
  }

  private openAdminMenu(): void {
    if (this.busy || this.isTerminalOpen() || this.isGateTerminalOpen()) return;
    if (!this.lastSnapshot.adminMode) {
      const resolution = this.session.enableAdminMode();
      if (!resolution.ok) {
        this.showFeedbackNotice({ message: resolution.message, tone: "info" });
        return;
      }
    }
    this.session.setAdminPanelOpen(true);
    this.renderAdminMenu(this.session.snapshot());
    this.adminMenu.hidden = false;
    this.adminMenu.inert = false;
    this.adminMenu.setAttribute("aria-hidden", "false");
    this.adminMenu.classList.add("is-open");
    this.root.classList.add("admin-active");
    requiredElement<HTMLButtonElement>(this.adminMenu, "#close-admin").focus({
      preventScroll: true,
    });
  }

  private closeAdminMenu(): void {
    if (!this.isAdminMenuOpen()) return;
    this.adminMenu.classList.remove("is-open");
    this.adminMenu.hidden = true;
    this.adminMenu.inert = true;
    this.adminMenu.setAttribute("aria-hidden", "true");
    this.root.classList.remove("admin-active");
    this.session.setAdminPanelOpen(false);
    requiredElement<HTMLButtonElement>(this.root, "#open-admin").focus({
      preventScroll: true,
    });
  }

  private isAdminMenuOpen(): boolean {
    return this.adminMenu?.classList.contains("is-open") ?? false;
  }

  private handleAdminNextFloor(): void {
    const resolution = this.session.adminNextFloor();
    if (!resolution.ok) {
      this.showFeedbackNotice({ message: resolution.message, tone: "info" });
      return;
    }
    const snapshot = this.session.snapshot();
    this.sql.reset(snapshot.monsters);
    this.getBattleScene()?.abortEncounter();
    this.clearQueryArtifacts();
    if (this.isInspectionOpen()) this.closeInspection(false, false);
    this.resetAdminNarrativePresentation();
    this.renderAdminMenu(snapshot);
  }

  private renderAdminMenu(snapshot: GameSnapshot): void {
    if (!this.adminMenu) return;
    const living = snapshot.monsters.filter((monster) => monster.hp > 0);
    const bosses = living.filter((monster) => monster.isBoss);
    requiredElement(this.adminMenu, "#admin-summary").textContent =
      `FLOOR ${snapshot.floor} · ${snapshot.mazeFloor.width}×${snapshot.mazeFloor.height} · 存活怪物 ${living.length} · 首领 ${bosses.length}`;
    const nextButton = requiredElement<HTMLButtonElement>(
      this.adminMenu,
      "#admin-next-floor",
    );
    nextButton.disabled = snapshot.floor >= 8;
    nextButton.textContent = snapshot.floor >= 8
      ? "已在第八层"
      : `进入第 ${snapshot.floor + 1} 层初始位置`;
  }

  private leaveCampfire(): void {
    this.campfirePanel.leave();
  }

  private retreatFromCombat(): void {
    if (this.busy) return;
    if (this.isTerminalOpen()) this.closeTerminal(false);
    const resolution = this.session.retreatFromCombat();
    if (!resolution.ok) {
      this.showFeedbackNotice({ message: resolution.message, tone: "info" });
      return;
    }
    this.getBattleScene()?.abortEncounter();
    this.showFeedbackNotice({ message: resolution.message, tone: "success" });
    requiredElement<HTMLElement>(this.root, "#game-root").focus({
      preventScroll: true,
    });
  }

  private closeInventoryMenu(): void {
    this.inventoryPanel.closeInventory();
  }

  private closeLootMenu(): void {
    this.inventoryPanel.closeLoot();
  }

  private isInventoryMenuOpen(): boolean {
    return this.inventoryPanel.isInventoryOpen();
  }

  private isLootMenuOpen(): boolean {
    return this.inventoryPanel.isLootOpen();
  }

  private renderInventoryMenu(snapshot: GameSnapshot, entered: boolean): void {
    this.inventoryPanel.renderInventory(snapshot, entered);
  }

  private renderLootMenu(snapshot: GameSnapshot, entered: boolean): void {
    this.inventoryPanel.renderLoot(snapshot, entered);
  }

  private renderCampfireMenu(snapshot: GameSnapshot, entered: boolean): void {
    this.campfirePanel.render(snapshot, entered);
  }

  private isCampfireMenuOpen(): boolean {
    return this.campfirePanel.isOpen();
  }

  private scribeMessage(authoredMessage: string): string {
    return redactSnapshotMonsterIdentity(authoredMessage, this.lastSnapshot);
  }

  private renderScribeState(state: ScribeHookState): void {
    if (!state.output || !state.requestKey) return;
    if (state.scene === "interaction") {
      if (
        this.isInspectionOpen() &&
        this.inspectionOverlay.dataset.recordKind === "scribe" &&
        this.inspectionOverlay.dataset.scribeRequestKey === state.requestKey
      ) {
        this.renderScribeOverlay(state.output);
      }
      return;
    }
    const noticeKey = `${state.requestKey}:${state.status}`;
    if (noticeKey === this.lastScribeNoticeKey) return;
    this.lastScribeNoticeKey = noticeKey;
    this.showScribeNotice(state.output, state.scene === "death-review");
  }

  private scribeBody(output: ScribeAgentContent): string {
    const facts = output.facts.length > 0
      ? `记录\n${output.facts.map((fact) => `· ${fact}`).join("\n")}`
      : "";
    return [output.message, facts, `下一步：${output.nextAction}`]
      .filter(Boolean)
      .join("\n\n");
  }

  private renderScribeOverlay(output: ScribeAgentContent): void {
    requiredElement(this.inspectionOverlay, "#inspection-kicker").textContent =
      "SCRIBE / 抄写员";
    requiredElement(this.inspectionOverlay, "#inspection-title").textContent =
      output.headline;
    requiredElement(this.inspectionOverlay, "#inspection-message").textContent =
      this.scribeBody(output);
  }

  private openScribeOverlay(
    output: ScribeAgentContent,
    requestKey: string | null,
  ): void {
    if (
      this.isInspectionOpen() &&
      this.inspectionOverlay.dataset.recordKind === "scribe"
    ) {
      this.renderScribeOverlay(output);
    } else {
      this.openRecordOverlay({
        kicker: "SCRIBE / 抄写员",
        title: output.headline,
        body: this.scribeBody(output),
        closeLabel: "E · 继续探索",
        kind: "scribe",
      });
    }
    if (requestKey) this.inspectionOverlay.dataset.scribeRequestKey = requestKey;
  }

  private showScribeNotice(
    output: ScribeAgentContent,
    isDeathReview: boolean,
  ): void {
    this.showFeedbackNotice({
      message: this.scribeBody(output),
      tone: isDeathReview ? "danger" : "info",
    });
  }

  private campfireReview(snapshot: GameSnapshot): CampfireReview {
    const localReview = buildCampfireReview(campfireReviewInput(snapshot));
    const agentReview = this.campfireHook?.outputFor(snapshot) ?? null;
    if (
      !localReview.available ||
      !agentReview
    ) {
      return localReview;
    }
    return {
      ...localReview,
      headline: agentReview.headline,
      facts: agentReview.facts,
      focusConcept: agentReview.focusConcept,
      nextAction: agentReview.nextAction,
      message: agentReview.message,
    };
  }

  private renderNarrativeProgress(snapshot: GameSnapshot): void {
    const progress = narrativeProgressForSnapshot(snapshot);
    if (this.narrativeMomentQueuePrimed) {
      this.narrativeMomentQueue.enqueue(progress.unlockedMoments);
    } else {
      if (this.narrativeBootstrapMode === "restored") {
        const migration = finalMigrationProgress(snapshot.openedGateIds);
        const resumableMigrationMoment = (
          snapshot.floor === 8 &&
          snapshot.mode === "victory" &&
          !migration.complete
        )
          ? progress.unlockedMoments.find(isFinalMigrationStoryMoment) ??
            floorStoryMoments(8).find(isFinalMigrationStoryMoment) ??
            null
          : null;
        this.narrativeMomentQueue.primeExisting(
          resumableMigrationMoment
            ? progress.unlockedMoments.filter(
                (moment) => moment.id !== resumableMigrationMoment.id,
              )
            : progress.unlockedMoments,
        );
        if (resumableMigrationMoment) {
          this.narrativeMomentQueue.enqueue([resumableMigrationMoment]);
        }
      } else {
        this.narrativeMomentQueue.enqueue(progress.unlockedMoments);
      }
      this.narrativeMomentQueuePrimed = true;
      this.narrativeBootstrapMode = "restored";
    }
    this.narrativeCodex.render({
      floor: snapshot.floor,
      discoveredMonsterIds: snapshot.profile.discoveredMonsterIds,
      seenBeatIds: progress.seenBeatIds,
      seenMomentIds: progress.seenMomentIds,
      discoveredEvidenceIds: progress.discoveredEvidenceIds,
      completedAscentIds: progress.completedAscentIds,
      completedMigrationStepIds: progress.completedMigrationStepIds,
    });
    requiredElement<HTMLButtonElement>(this.root, "#open-narrative").textContent =
      progress.storyMomentTotal > 0
        ? `▧ 剧情档案 ${progress.seenMomentIds.length}/${progress.storyMomentTotal}`
        : `▧ 剧情档案 ${progress.seenBeatIds.length}/5`;
    const latestBeat = progress.latestBeat ?? narrativeFloorFor(snapshot.floor).beats[0];
    const latestRecord = progress.latestMoment ?? latestBeat;
    requiredElement(this.root, "#story-thread-title").textContent =
      latestRecord
        ? redactSnapshotMonsterIdentity(latestRecord.title, snapshot)
        : "记录尚未恢复";
    requiredElement(this.root, "#story-thread-line").textContent =
      latestRecord?.lines[0]
        ? redactSnapshotMonsterIdentity(latestRecord.lines[0], snapshot)
        : "继续探索，寻找这一层留下的记录。";

    if (
      (snapshot.mode === "transition" || snapshot.mode === "victory") &&
      this.narrativeBeatShownAtMove !== null
    ) {
      this.hideNarrativeBeatCard();
    } else if (
      shouldDismissTransientCard(
        this.narrativeBeatShownAtMove,
        snapshot.totalMoves,
      )
    ) {
      this.hideNarrativeBeatCard();
    }

    if (this.narrativeBeatShownAtMove !== null) return;
    if (!this.canPresentNarrativeCard(snapshot)) return;

    let nextMoment = this.narrativeMomentQueue.peekNext();
    while (
      nextMoment?.presentation === "ambient" &&
      (snapshot.mode === "transition" || snapshot.mode === "victory")
    ) {
      this.executeStoryMomentActions(nextMoment, false);
      this.narrativeMomentQueue.ackPresented(nextMoment.id);
      nextMoment = this.narrativeMomentQueue.peekNext();
    }
    // 层末传送是自动流程。战斗结算期间可能一次性解锁多条剧情，
    // 其中的 blocking 节点不能把传送门永久卡在“已启动”状态；它们仍
    // 会写入剧情档案，当前层结束时只消费展示队列。已经打开的主框
    // （activeNarrativeMoment）仍然保留，避免打断玩家正在阅读的记录。
    if (snapshot.mode === "transition" && nextMoment) {
      while (nextMoment) {
        this.executeStoryMomentActions(nextMoment, false);
        this.narrativeMomentQueue.ackPresented(nextMoment.id);
        nextMoment = this.narrativeMomentQueue.peekNext();
      }
      return;
    }
    if (nextMoment) {
      if (!canPresentFinalMigrationStoryMoment(nextMoment, snapshot)) return;
      this.showNarrativeMomentCard(nextMoment, snapshot);
    }
  }

  private canPresentNarrativeCard(snapshot: GameSnapshot): boolean {
    const blockingOverlayOpen = (
      this.isTerminalOpen() ||
      this.isGateTerminalOpen() ||
      this.isCampfireMenuOpen() ||
      this.isInventoryMenuOpen() ||
      this.isLootMenuOpen() ||
      this.isReviewOpen() ||
      this.isNarrativeCodexOpen() ||
      this.isMonsterCodexOpen() ||
      this.isInspectionOpen() ||
      this.isAdminMenuOpen()
    );
    return canPresentQueuedNarrativeMoment(
      snapshot.mode,
      this.busy || this.narrativeActionInFlight,
      this.isCombatSettlementVisible(),
      blockingOverlayOpen,
    );
  }

  private showNarrativeMomentCard(
    moment: FloorStoryMoment,
    snapshot: GameSnapshot,
  ): void {
    if (narrativeMomentUsesRecordOverlay(moment.presentation)) {
      this.activeNarrativeMoment = moment;
      this.openStoryMoment(moment, snapshot);
      return;
    }
    this.executeStoryMomentActions(moment, false);
    this.narrativeMomentQueue.ackPresented(moment.id);
    const card = requiredElement<HTMLElement>(this.root, "#narrative-beat-card");
    requiredElement(card, "#narrative-beat-kind").textContent = moment.kicker;
    requiredElement(card, "#narrative-beat-title").textContent =
      redactSnapshotMonsterIdentity(moment.title, snapshot);
    const lines = requiredElement(card, "#narrative-beat-lines");
    lines.replaceChildren(...moment.lines.map((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = redactSnapshotMonsterIdentity(line, snapshot);
      return paragraph;
    }));
    this.narrativeBeatShownAtMove = snapshot.totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
  }

  private executeStoryMomentActions(
    moment: FloorStoryMoment,
    recordEvidence: boolean,
  ): void {
    const musicState = moment.actions.find(
      (action) => action.type === "music-state",
    );
    const worldEffect = moment.actions.find(
      (action) => action.type === "world-effect",
    );
    if (musicState?.type === "music-state") {
      this.root.dataset.storyMusicState = musicState.state;
      this.audio.setFocus("resolving");
      void this.audio.playSfx("stage-clear");
    }
    if (worldEffect?.type === "world-effect") {
      this.root.dataset.storyWorldEffect = worldEffect.effect;
    }
    if (recordEvidence) {
      moment.actions.forEach((action) => {
        if (action.type === "evidence") {
          this.session.recordStoryEvidence(action.evidenceId);
        }
      });
    }
    window.dispatchEvent(new CustomEvent("dungeon:story-actions", {
      detail: {
        momentId: moment.id,
        actions: moment.actions,
      },
    }));
  }

  private hideNarrativeBeatCard(): void {
    const card = this.root.querySelector<HTMLElement>("#narrative-beat-card");
    card?.classList.remove("is-visible");
    if (card) card.hidden = true;
    this.narrativeBeatShownAtMove = null;
  }

  private resetAdminNarrativePresentation(): void {
    this.hideNarrativeBeatCard();
    this.activeNarrativeMoment = null;
    this.narrativeActionInFlight = false;
    this.narrativeMomentQueue.clear();
    this.narrativeMomentQueuePrimed = false;
    this.narrativeBootstrapMode = "new";
  }

  private openInspection(message: string): void {
    const copy = inspectionDialogCopy(
      redactSnapshotMonsterIdentity(message, this.lastSnapshot),
    );
    this.openRecordOverlay({
      kicker: "FIELD NOTE / 现场记录",
      title: copy.title,
      body: copy.body,
      closeLabel: "E · 关闭记录",
      kind: "inspection",
    });
  }

  private openStoryMoment(
    moment: FloorStoryMoment,
    snapshot: GameSnapshot,
    inspectionMessage?: string,
  ): void {
    if (isFinalMigrationStoryMoment(moment)) {
      this.openFinalMigrationMoment(snapshot);
      return;
    }
    const recordBody = storyMomentRecordBody(moment);
    this.openRecordOverlay({
      kicker: moment.kicker,
      title: redactSnapshotMonsterIdentity(moment.title, snapshot),
      body: redactSnapshotMonsterIdentity(
        inspectionMessage
          ? `${recordBody}\n\n现场调查\n${inspectionMessage}`
          : recordBody,
        snapshot,
      ),
      closeLabel: "E · 继续探索",
      kind: "story",
    });
  }

  private openFinalMigrationMoment(snapshot: GameSnapshot): void {
    const copy = finalMigrationRecordCopy(snapshot.openedGateIds);
    if (!copy) return;
    this.openRecordOverlay({
      kicker: copy.kicker,
      title: copy.title,
      body: copy.body,
      closeLabel: copy.closeLabel,
      kind: "migration",
    });
  }

  private openRecordOverlay(copy: {
    kicker: string;
    title: string;
    body: string;
    closeLabel: string;
    kind: "inspection" | "story" | "migration" | "scribe";
  }): void {
    if (!this.isInspectionOpen()) {
      this.focusBeforeInspection = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    requiredElement(this.inspectionOverlay, "#inspection-kicker").textContent = copy.kicker;
    requiredElement(this.inspectionOverlay, "#inspection-title").textContent = copy.title;
    requiredElement(this.inspectionOverlay, "#inspection-message").textContent = copy.body;
    requiredElement<HTMLButtonElement>(
      this.inspectionOverlay,
      "#close-inspection",
    ).textContent = copy.closeLabel;
    this.inspectionOverlay.dataset.recordKind = copy.kind;
    if (copy.kind !== "scribe") delete this.inspectionOverlay.dataset.scribeRequestKey;
    this.hideNarrativeBeatCard();
    this.inspectionOverlay.hidden = false;
    this.inspectionOverlay.inert = false;
    this.inspectionOverlay.setAttribute("aria-hidden", "false");
    this.root.classList.add("inspection-active");
    requiredElement<HTMLButtonElement>(this.inspectionOverlay, "#close-inspection").focus({
      preventScroll: true,
    });
  }

  private closeInspection(
    returnFocus = true,
    confirmStory = true,
  ): void {
    if (!this.isInspectionOpen()) return;
    if (
      confirmStory &&
      this.inspectionOverlay.dataset.recordKind === "migration"
    ) {
      this.advanceFinalMigration();
      return;
    }
    const recordKind = this.inspectionOverlay.dataset.recordKind;
    const confirmedMoment = confirmStory &&
        (recordKind === "story" || (
          recordKind === "scribe" &&
          this.activeNarrativeMoment?.kind === "scribe"
        ))
      ? this.activeNarrativeMoment
      : null;
    this.inspectionOverlay.hidden = true;
    this.inspectionOverlay.inert = true;
    this.inspectionOverlay.setAttribute("aria-hidden", "true");
    delete this.inspectionOverlay.dataset.recordKind;
    delete this.inspectionOverlay.dataset.scribeRequestKey;
    this.activeNarrativeMoment = null;
    this.root.classList.remove("inspection-active");
    if (!returnFocus) {
      this.focusBeforeInspection = null;
    } else {
      const focusTarget = this.focusBeforeInspection;
      this.focusBeforeInspection = null;
      if (
        focusTarget?.isConnected &&
        !focusTarget.matches(":disabled") &&
        !this.inspectionOverlay.contains(focusTarget)
      ) {
        focusTarget.focus({ preventScroll: true });
      } else {
        requiredElement<HTMLElement>(this.root, "#game-root").focus({
          preventScroll: true,
        });
      }
    }
    if (confirmedMoment) {
      this.narrativeMomentQueue.ackPresented(confirmedMoment.id);
      this.narrativeActionInFlight = true;
      try {
        this.executeStoryMomentActions(confirmedMoment, true);
      } finally {
        this.narrativeActionInFlight = false;
      }
      queueMicrotask(() => {
        this.renderNarrativeProgress(this.lastSnapshot);
        this.renderFloorTransition(this.lastSnapshot);
      });
    }
  }

  private advanceFinalMigration(): void {
    if (
      !this.isInspectionOpen() ||
      this.inspectionOverlay.dataset.recordKind !== "migration" ||
      !this.activeNarrativeMoment ||
      !isFinalMigrationStoryMoment(this.activeNarrativeMoment)
    ) return;
    const before = finalMigrationProgress(this.lastSnapshot.openedGateIds);
    const step = before.nextStep;
    if (!step) return;
    if (!this.session.recordMigrationStep(step.id)) {
      const current = finalMigrationRecordCopy(this.session.snapshot().openedGateIds);
      if (current) {
        this.openRecordOverlay({
          kicker: current.kicker,
          title: current.title,
          body: current.body,
          closeLabel: current.closeLabel,
          kind: "migration",
        });
      }
      return;
    }

    const afterSnapshot = this.session.snapshot();
    const after = finalMigrationProgress(afterSnapshot.openedGateIds);
    if (!after.complete) {
      this.openFinalMigrationMoment(afterSnapshot);
      return;
    }

    const completedMoment = this.activeNarrativeMoment;
    this.narrativeMomentQueue.ackPresented(completedMoment.id);
    const finalAscent = this.narrativeMomentQueue.peekNext();
    if (finalAscent?.floor === 8 && finalAscent.kind === "ascent") {
      this.narrativeMomentQueue.ackPresented(finalAscent.id);
    }
    this.narrativeActionInFlight = true;
    try {
      this.executeStoryMomentActions(completedMoment, true);
    } finally {
      this.narrativeActionInFlight = false;
    }
    this.closeInspection(false, false);
    queueMicrotask(() => {
      this.renderNarrativeProgress(this.lastSnapshot);
      this.renderFloorTransition(this.lastSnapshot);
    });
  }

  private isInspectionOpen(): boolean {
    return !this.inspectionOverlay.hidden;
  }

  private openTerminal(): void {
    if (this.busy) return;
    if (!canOpenCombatTerminal(this.lastSnapshot?.mode, this.busy)) {
      if (this.lastSnapshot) {
        const message = "在迷宫中触碰怪物所在格后，SQL 终端才会解锁。";
        requiredElement(this.root, "#banner").textContent = message;
        this.showFeedbackNotice({ message, tone: "info" });
      }
      return;
    }
    if (!this.isTerminalOpen()) {
      this.focusBeforeTerminal = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    void this.audio.resume();
    this.audio.setFocus("thinking");
    this.terminal.classList.add("is-open");
    this.root.classList.add("terminal-active");
    this.terminal.inert = false;
    this.terminal.setAttribute("aria-hidden", "false");
    this.onboarding.advance("terminal-open");
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = window.setTimeout(() => {
      this.terminalFocusTimer = null;
      if (!this.busy && this.isTerminalOpen()) {
        this.textarea.focus({ preventScroll: true });
      }
    }, 60);
  }

  private closeTerminal(returnFocus = true): void {
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = null;
    this.combatAutocomplete.hide();
    this.terminal.classList.remove("is-open");
    if (!this.isGateTerminalOpen()) this.root.classList.remove("terminal-active");
    this.terminal.inert = true;
    this.terminal.setAttribute("aria-hidden", "true");
    this.syncAudioFocus();
    if (returnFocus) {
      this.textarea.blur();
      const focusTarget = this.focusBeforeTerminal;
      this.focusBeforeTerminal = null;
      if (
        focusTarget?.isConnected &&
        !focusTarget.matches(":disabled") &&
        !this.terminal.contains(focusTarget)
      ) {
        focusTarget.focus();
      } else {
        requiredElement<HTMLElement>(this.root, "#game-root").focus();
      }
    }
  }

  private isTerminalOpen(): boolean {
    return this.terminal.classList.contains("is-open");
  }

  private closeGateTerminal(): void {
    if (this.busy) return;
    this.session.cancelGateChallenge();
  }

  private openGateTerminal(): void {
    if (this.busy || !this.lastSnapshot?.activeGateChallenge) return;
    if (!this.isGateTerminalOpen()) {
      this.focusBeforeTerminal = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    void this.audio.resume();
    this.audio.setFocus("thinking");
    this.gateTerminal.classList.add("is-open");
    this.root.classList.add("terminal-active", "gate-terminal-active");
    this.gateTerminal.inert = false;
    this.gateTerminal.setAttribute("aria-hidden", "false");
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = window.setTimeout(() => {
      this.terminalFocusTimer = null;
      if (!this.busy && this.isGateTerminalOpen()) {
        this.gateTextarea.focus({ preventScroll: true });
      }
    }, 60);
  }

  private hideGateTerminal(returnFocus = true): void {
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = null;
    this.gateAutocomplete.hide();
    this.gateTerminal.classList.remove("is-open");
    this.root.classList.remove("gate-terminal-active");
    if (!this.isTerminalOpen()) this.root.classList.remove("terminal-active");
    this.gateTerminal.inert = true;
    this.gateTerminal.setAttribute("aria-hidden", "true");
    this.syncAudioFocus();
    if (!returnFocus) return;
    this.gateTextarea.blur();
    const focusTarget = this.focusBeforeTerminal;
    this.focusBeforeTerminal = null;
    if (
      focusTarget?.isConnected &&
      !focusTarget.matches(":disabled") &&
      !this.gateTerminal.contains(focusTarget)
    ) {
      focusTarget.focus();
    } else {
      requiredElement<HTMLElement>(this.root, "#game-root").focus();
    }
  }

  private isGateTerminalOpen(): boolean {
    return this.gateTerminal.classList.contains("is-open");
  }

  private trapDialogFocus(event: KeyboardEvent, dialog: HTMLElement): void {
    this.dialogFocus.trap(event, dialog);
  }

  private showFeedbackNotice(notice: FeedbackNotice): void {
    if (this.activeNotice) {
      if (
        this.activeNotice.message === notice.message ||
        this.noticeQueue.some((entry) => entry.message === notice.message)
      ) return;
      this.noticeQueue.push(notice);
      if (this.noticeQueue.length > 4) this.noticeQueue.shift();
      return;
    }
    const toast = requiredElement(this.root, "#feedback-toast");
    this.activeNotice = notice;
    toast.replaceChildren(document.createTextNode(notice.message));
    toast.dataset.tone = notice.tone;
    toast.classList.add("is-visible");
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      this.toastTimer = null;
      this.activeNotice = null;
      const next = this.noticeQueue.shift();
      if (next) this.showFeedbackNotice(next);
    }, 2_400);
  }

  private showPickupCard(item: GroundItem, effect: string, totalMoves: number): void {
    const card = requiredElement<HTMLElement>(this.root, "#pickup-card");
    const kindLabel: Record<GroundItem["kind"], string> = {
      weapon: "WEAPON / 已自动装备",
      relic: "RELIC / 本轮自动生效",
      heal: "RECOVERY / 已立即生效",
      event: "EVENT / 已立即结算",
      key: "KEY ITEM / 已记录",
    };
    requiredElement(card, "#pickup-kind").textContent = kindLabel[item.kind];
    requiredElement(card, "#pickup-name").textContent = item.name;
    requiredElement(card, "#pickup-description").textContent = item.description;
    requiredElement(card, "#pickup-effect").textContent = effect;
    this.pickupShownAtMove = totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
  }

  private presentLootAcquisition(items: readonly LootItem[], effect: string): void {
    if (items.length === 0) return;
    this.onboarding.advance("item-pickup");
    const single = items.length === 1 ? items[0] : null;
    const feedbackKind = single?.kind === "weapon"
      ? "weapon"
      : single?.kind === "consumable"
        ? "heal"
        : single?.rewardId === "floor-key"
          ? "key"
          : single?.kind === "armor"
            ? "relic"
            : "event";
    this.feedback.dispatch({
      type: "item-pickup",
      itemName: items.map((item) => item.name).join("、"),
      kind: feedbackKind,
      message: effect,
    });
    const card = requiredElement<HTMLElement>(this.root, "#pickup-card");
    const kindLabel = single
      ? single.kind === "weapon"
        ? "WEAPON / 已处理"
        : single.kind === "armor"
          ? "ARMOR / 已处理"
          : single.kind === "consumable"
            ? "RECOVERY / 已入栏"
            : single.rewardId === "floor-key"
              ? "KEY ITEM / 已记录"
              : "REWARD / 已领取"
      : `LOOT ×${items.length} / 已处理`;
    requiredElement(card, "#pickup-kind").textContent = kindLabel;
    requiredElement(card, "#pickup-name").textContent =
      items.map((item) => item.name).join("、");
    requiredElement(card, "#pickup-description").textContent =
      items.map((item) => `${item.name}：${item.description}`).join("；");
    requiredElement(card, "#pickup-effect").textContent = effect;
    this.pickupShownAtMove = this.lastSnapshot.totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
  }

  private showCombatSettlement(resolution: TurnResolution): void {
    if (!resolution.experience) return;
    this.hideNarrativeBeatCard();
    const card = requiredElement<HTMLElement>(this.root, "#combat-result-card");
    const recoveredIdentity = resolution.events.some(
      (event) => event.type === "identity-recovered",
    );
    const copy = combatSettlementCopy(
      resolution.experience,
      resolution.events.some((event) => event.type === "loot-drop"),
      resolution.events.find((event) => event.type === "auto-heal")?.itemName,
    );
    card.classList.toggle("is-new-identity", recoveredIdentity);
    requiredElement(card, "#combat-result-kicker").textContent = recoveredIdentity
      ? "NAME RECOVERED / 获得名字"
      : "IDENTITY CONFIRMED / 已识别记录";
    requiredElement(card, "#combat-result-id").textContent =
      monsterIdLabel(resolution.experience.monsterId);
    requiredElement(card, "#combat-result-name").textContent =
      resolution.experience.monsterName;
    requiredElement(card, "#combat-result-title").textContent = copy.title;
    requiredElement(card, "#combat-result-xp").textContent = copy.xp;
    requiredElement(card, "#combat-result-progress").textContent = copy.progress;
    requiredElement(card, "#combat-result-level").textContent = copy.levelUp;
    requiredElement(card, "#combat-result-reward").textContent = copy.reward;
    this.settlementShownAtMove = this.lastSnapshot.totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
    if (this.settlementAutoCloseTimer !== null) {
      window.clearTimeout(this.settlementAutoCloseTimer);
    }
    if (resolution.mode === "transition" || resolution.mode === "victory") {
      const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 900
        : 1_800;
      this.settlementAutoCloseTimer = window.setTimeout(() => {
        this.settlementAutoCloseTimer = null;
        this.hideCombatSettlement();
        this.renderNarrativeProgress(this.lastSnapshot);
        this.renderFloorTransition(this.lastSnapshot);
      }, delay);
    }
  }

  private hidePickupCard(): void {
    const card = this.root.querySelector<HTMLElement>("#pickup-card");
    if (!card) return;
    this.pickupShownAtMove = null;
    card.classList.remove("is-visible");
    card.hidden = true;
  }

  private hideCombatSettlement(): void {
    const card = this.root.querySelector<HTMLElement>("#combat-result-card");
    if (!card) return;
    if (this.settlementAutoCloseTimer !== null) {
      window.clearTimeout(this.settlementAutoCloseTimer);
      this.settlementAutoCloseTimer = null;
    }
    this.settlementShownAtMove = null;
    card.classList.remove("is-visible");
    card.hidden = true;
  }

  private isCombatSettlementVisible(): boolean {
    return this.root.querySelector<HTMLElement>("#combat-result-card")
      ?.classList.contains("is-visible") ?? false;
  }

  private dismissTransientCards(snapshot: GameSnapshot): void {
    if (shouldDismissTransientCard(this.pickupShownAtMove, snapshot.totalMoves)) {
      this.hidePickupCard();
    }
    if (shouldDismissTransientCard(this.settlementShownAtMove, snapshot.totalMoves)) {
      this.hideCombatSettlement();
    }
  }

  private requestHint(): void {
    if (this.busy) {
      this.showFeedbackNotice({ message: "当前回合正在结算，结束后再查看提示。", tone: "info" });
      return;
    }
    const message = this.session.requestHint();
    this.showFeedbackNotice({ message, tone: "info" });
  }

  private renderOnboarding(snapshot: OnboardingSnapshot): void {
    const card = requiredElement<HTMLElement>(this.root, "#onboarding-card");
    card.hidden = !snapshot.visible;
    if (!snapshot.visible) return;
    requiredElement(card, "#onboarding-step").textContent = `GUIDE / ${snapshot.step.id.toUpperCase()}`;
    requiredElement(card, "#onboarding-title").textContent = snapshot.step.title;
    requiredElement(card, "#onboarding-body").textContent = snapshot.step.body;
    requiredElement(card, "#onboarding-shortcut").textContent = snapshot.step.shortcut;
  }

  private renderProgress(
    progressSelector: string,
    barSelector: string,
    rawValue: number,
    rawMax: number,
    valueText: string,
  ): void {
    this.hudRenderer.renderProgress(
      progressSelector,
      barSelector,
      rawValue,
      rawMax,
      valueText,
    );
  }

  private reset(): void {
    if (this.lastSnapshot.adminMode) {
      const message = "管理员预览不会覆盖正式 Run。刷新页面后回到正式固定地图。";
      requiredElement(this.root, "#banner").textContent = message;
      this.showFeedbackNotice({ message, tone: "info" });
      return;
    }
    if (this.busy) {
      const message = "当前回合动画正在结算，结束后再开始新 Run。";
      requiredElement(this.root, "#banner").textContent = message;
      this.showFeedbackNotice({ message, tone: "info" });
      return;
    }
    this.closeTerminal(true);
    this.hidePickupCard();
    this.hideCombatSettlement();
    this.hideNarrativeBeatCard();
    this.activeNarrativeMoment = null;
    this.narrativeMomentQueue.clear();
    this.narrativeMomentQueuePrimed = false;
    this.narrativeBootstrapMode = "new";
    if (this.defeatRespawnTimer !== null) {
      window.clearTimeout(this.defeatRespawnTimer);
      this.defeatRespawnTimer = null;
    }
    const battleScene = this.getBattleScene();
    this.session.reset();
    this.sql.reset(this.session.snapshot().monsters);
    battleScene?.abortEncounter();
    this.clearQueryArtifacts();
    const message = "固定地图已重置；永久 SQL 图鉴没有被删除。";
    this.queryStatus.textContent = message;
    this.queryStatus.dataset.kind = "success";
    this.showFeedbackNotice({ message, tone: "success" });
    const resetSnapshot = this.session.snapshot();
    this.audio.setScene({
      floor: resetSnapshot.floor,
      region: 0,
      mode: "explore",
    });
  }

  private async toggleAudio(): Promise<void> {
    await this.audio.initialize();
    const muted = this.audio.toggleMuted();
    this.audioButton.textContent = muted ? "♪ 声音关闭" : "♪ 声音开启";
    this.audioButton.setAttribute("aria-pressed", String(muted));
  }

  private render(snapshot: GameSnapshot): void {
    const previousSnapshot = this.lastSnapshot;
    const floorChanged = Boolean(
      this.lastSnapshot && this.lastSnapshot.floor !== snapshot.floor,
    );
    if (floorChanged) {
      this.hideNarrativeBeatCard();
      this.activeNarrativeMoment = null;
      this.narrativeMomentQueue.clear();
      this.narrativeMomentQueuePrimed = false;
      this.narrativeBootstrapMode = "new";
    }
    if (
      snapshot.mode !== "explore" &&
      this.isInspectionOpen() &&
      this.inspectionOverlay.dataset.recordKind !== "story" &&
      this.inspectionOverlay.dataset.recordKind !== "migration"
    ) {
      this.closeInspection(false);
    }
    const pickedItems = this.lastSnapshot
      ? pickedItemsBetween(this.lastSnapshot, snapshot)
      : [];
    const guidedPickup = this.lastSnapshot
      ? this.guidedPickupBetween(this.lastSnapshot, snapshot)
      : null;
    const room = snapshot.roomGraph.nodes.find((node) => node.id === snapshot.currentRoomId);
    const roomLesson = room?.lessonId
      ? LESSONS.find((lesson) => lesson.id === room.lessonId)
      : undefined;
    const combatLesson = snapshot.mode === "combat"
      ? LESSONS.find((lesson) => lesson.id === snapshot.lessonId)
      : undefined;
    const roomLabel = combatLesson?.concept ?? roomLesson?.concept
      ?? (snapshot.mode === "reward" ? "REWARD" : room?.type === "entry" ? "MAZE" : "EXPLORE");
    const biomeName = snapshot.biomePlan.regions.find(
      (region) => region.kind === snapshot.currentBiome,
    )?.name ?? "未知生态";
    const biomeIndex = Math.max(
      0,
      snapshot.biomePlan.regions.findIndex(
        (region) => region.kind === snapshot.currentBiome,
      ),
    );
    const routeTransit = floorTransitPresentation(
      floorMapBlueprint(snapshot.floor).routeTransit,
    );
    const regionTransitLegend = requiredElement(this.root, "#map-region-transit");
    regionTransitLegend.hidden = !regionPortalsEnabledForFloor(snapshot.floor);
    regionTransitLegend.textContent = `◉ ${routeTransit.regionLabel ?? routeTransit.label}`;
    const target = snapshot.focusMonsterId === null
      ? undefined
      : snapshot.monsters.find((monster) => monster.id === snapshot.focusMonsterId);
    const stageChanged = snapshot.lessonStageId !== this.lastStageId;
    const enteredCombat = snapshot.mode === "combat" && this.lastMode !== "combat";
    const enteredChallenge = snapshot.mode === "challenge" && this.lastMode !== "challenge";
    const enteredCampfire = snapshot.mode === "campfire" && this.lastMode !== "campfire";
    const enteredInventory = snapshot.mode === "inventory" && this.lastMode !== "inventory";
    const enteredLoot = snapshot.mode === "loot" && this.lastMode !== "loot";
    const enteredDefeat = snapshot.mode === "defeat" && this.lastMode !== "defeat";
    const enteredDeathReview =
      snapshot.mode === "death-review" && this.lastMode !== "death-review";
    this.lastSnapshot = snapshot;
    if (enteredCombat) {
      this.hidePickupCard();
      this.hideCombatSettlement();
    } else {
      this.dismissTransientCards(snapshot);
    }

    requiredElement(this.root, "#floor-value").textContent =
      `${String(snapshot.floor).padStart(2, "0")} / 08`;
    const adminButton = requiredElement<HTMLButtonElement>(this.root, "#open-admin");
    adminButton.textContent = snapshot.adminMode ? "⌘ 管理员 · ON" : "⌘ 管理员";
    adminButton.classList.toggle("is-active", snapshot.adminMode);
    this.root.dataset.floor = String(snapshot.floor);
    this.root.dataset.biome = snapshot.currentBiome;
    this.textarea.placeholder = snapshot.floor === 6
      ? "在这里写出完整的 INSERT / UPDATE / DELETE 或事务脚本；每次执行都使用一次性沙箱。"
      : snapshot.floor === 7
        ? "写出业务 SELECT / WITH；系统自动读取真实 SQLite EXPLAIN QUERY PLAN。"
        : snapshot.floor === 8
          ? "查询固定教学事故表；字段可用 Ctrl + Space 完整补全。"
          : "在这里完整写出 SELECT / WITH 查询；支持 Ctrl + Space 补全。";
    requiredElement(this.root, "#hp-value").textContent = `${snapshot.player.hp} / ${snapshot.player.maxHp}`;
    this.renderProgress(
      "#player-hp-progress",
      "#hp-meter",
      snapshot.player.hp,
      snapshot.player.maxHp,
      `${snapshot.player.hp} / ${snapshot.player.maxHp}`,
    );
    requiredElement(this.root, "#heat-value").textContent = String(snapshot.player.heat);
    const heatUnlocked = snapshot.floor >= 7;
    requiredElement<HTMLElement>(this.root, "#heat-chip").hidden = !heatUnlocked;
    requiredElement<HTMLElement>(this.root, "#heat-progress").hidden = !heatUnlocked;
    this.renderProgress(
      "#heat-progress",
      "#heat-meter",
      snapshot.player.heat,
      100,
      `${snapshot.player.heat} / 100`,
    );
    requiredElement(this.root, "#weapon-name").textContent = snapshot.player.weapon.name;
    requiredElement(this.root, "#armor-name").textContent = snapshot.player.armor
      ? `${snapshot.player.armor.name} ${snapshot.player.armorHp}/${snapshot.player.armor.maxArmor}`
      : "无防具";
    const nextXp = LEVEL_XP_THRESHOLDS[snapshot.player.level];
    requiredElement(this.root, "#level-value").textContent = nextXp === undefined
      ? `LV.${snapshot.player.level} · ${snapshot.player.xp} XP · MAX`
      : `LV.${snapshot.player.level} · ${snapshot.player.xp} / ${nextXp} XP`;
    requiredElement(this.root, "#relic-count").textContent = String(snapshot.relics.length);
    requiredElement(this.root, "#lesson-concept").textContent =
      `${biomeName} / ${snapshot.currentRoomType.toUpperCase()} / ${roomLabel}`;
    requiredElement(this.root, "#mission-title").textContent = snapshot.missionTitle;
    requiredElement(this.root, "#mission-body").textContent = snapshot.missionBody;
    requiredElement(this.root, "#lesson-intro").textContent = snapshot.lessonIntro;
    requiredElement(this.root, "#banner").textContent = snapshot.banner;
    requiredElement(this.root, "#interaction-prompt").textContent = snapshot.interactionPrompt;
    requiredElement(this.root, "#query-counter").textContent = `查询 ${snapshot.queryCount} 次`;
    requiredElement(this.root, "#terminal-title").textContent = `${snapshot.lessonId.toUpperCase()} · 阶段 ${snapshot.lessonStageIndex + 1} · 回合 ${snapshot.combat?.round ?? 1}`;
    requiredElement(this.root, "#terminal-objective").textContent = snapshot.missionBody;
    this.renderTaskBrief(snapshot);
    this.renderFinalMigrationArgument(snapshot);
    requiredElement(this.root, "#victory-count").textContent = `通关 ${snapshot.profile.victories}`;
    requiredElement(this.root, ".game-stage").classList.toggle("is-combat", snapshot.mode === "combat");
    this.sqlButton.disabled = snapshot.mode !== "combat" || this.busy;
    const retreatButton = requiredElement<HTMLButtonElement>(this.root, "#retreat-combat");
    retreatButton.hidden = snapshot.mode !== "combat";
    retreatButton.disabled = snapshot.mode !== "combat" || this.busy;
    requiredElement<HTMLButtonElement>(this.root, "#open-inventory").disabled =
      snapshot.mode !== "explore" && snapshot.mode !== "campfire";
    requiredElement<HTMLButtonElement>(this.root, "#reset-game").disabled =
      snapshot.adminMode ||
      snapshot.mode === "transition" ||
      snapshot.mode === "defeat" ||
      snapshot.mode === "death-review";
    this.renderRegionTransition(snapshot);
    this.renderDefeatTransition(snapshot, enteredDefeat);
    this.renderCampfireMenu(snapshot, enteredCampfire);
    this.renderInventoryMenu(snapshot, enteredInventory);
    this.renderLootMenu(snapshot, enteredLoot);
    this.renderNarrativeProgress(snapshot);
    this.renderFloorTransition(snapshot);
    this.renderMonsterCodex(snapshot);

    this.renderTarget(target, snapshot);
    const locksSignature = snapshot.locks.join("\u0000");
    if (locksSignature !== this.lastLocksSignature) {
      this.lastLocksSignature = locksSignature;
      this.renderLocks(snapshot);
    }
    const schemaSignature = schemaRenderSignature(snapshot);
    if (schemaSignature !== this.lastSchemaSignature) {
      this.lastSchemaSignature = schemaSignature;
      this.renderSchema(snapshot);
    }
    const hintsSignature = snapshot.hints.join("\u0000");
    if (hintsSignature !== this.lastHintsSignature) {
      this.lastHintsSignature = hintsSignature;
      this.renderHints(snapshot.hints);
    }
    this.renderMazeMap(snapshot);
    const masterySignature = snapshot.profile.masteredLessons.join("\u0000");
    if (masterySignature !== this.lastMasterySignature) {
      this.lastMasterySignature = masterySignature;
      this.renderMastery(snapshot);
    }
    const relicsSignature = snapshot.relics
      .map((relic) => `${relic.id}:${relic.description}`)
      .join("\u0000");
    if (relicsSignature !== this.lastRelicsSignature) {
      this.lastRelicsSignature = relicsSignature;
      this.renderRelics(snapshot);
    }
    this.renderGateChallenge(snapshot, enteredChallenge);
    const latestPickup = pickedItems.at(-1) ?? guidedPickup;
    if (latestPickup) {
      this.showPickupCard(latestPickup, snapshot.banner, snapshot.totalMoves);
    }

    if (stageChanged || enteredCombat) {
      this.textarea.value = "";
      this.clearQueryArtifacts();
      this.queryStatus.textContent = enteredCombat
        ? snapshot.floor === 6
          ? "怪物行动已预告。请写出完整沙箱脚本；支持 INSERT、UPDATE、DELETE 与事务控制。"
          : snapshot.floor === 7
            ? "怪物行动已预告。写出查询后，结果与 SQLite 执行计划必须同时正确。"
            : snapshot.floor === 8
              ? "怪物行动已预告。请从本阶段事故记录中查询可验证证据。"
              : "怪物行动已预告。请完整写出本回合只读 SQL；第四层起允许从 WITH 开始。"
        : "目标已经变化，请重新写一条完整 SQL。";
      this.queryStatus.dataset.kind = "";
    }
    if (shouldAutofillAdminAnswer(previousSnapshot ?? null, snapshot)) {
      this.textarea.value = adminAnswerForInput(snapshot) ?? "";
      this.queryStatus.textContent = "管理员模式：当前题目的正确 SQL 已填入，可直接执行。";
      this.queryStatus.dataset.kind = "success";
    }
    if (snapshot.mode !== "combat" && this.isTerminalOpen()) this.closeTerminal(true);
    if (snapshot.mode !== "challenge" && this.isGateTerminalOpen()) {
      this.hideGateTerminal(true);
    }

    const musicMode = snapshot.mode === "combat"
      ? target?.isBoss ? "boss" : "combat"
      : "explore";
    this.audio.setScene({
      floor: snapshot.floor,
      region: biomeIndex,
      mode: musicMode,
    });
    this.syncAudioFocus();
    if (this.isAdminMenuOpen()) this.renderAdminMenu(snapshot);
    if (this.isReviewOpen()) this.answerReview.render(snapshot, this.reviewScope);
    if (enteredDeathReview || (snapshot.mode === "death-review" && !this.isReviewOpen())) {
      this.openReview("battle", "death");
    }

    this.lastStageId = snapshot.lessonStageId;
    this.lastMode = snapshot.mode;
  }

  private renderFinalMigrationArgument(snapshot: GameSnapshot): void {
    const root = requiredElement<HTMLElement>(
      this.root,
      "#final-migration-argument",
    );
    const copy = finalMigrationArgumentCopy(snapshot);
    root.hidden = copy === null;
    if (!copy) return;
    requiredElement(root, "#final-migration-argument-title").textContent =
      copy.argument;
    requiredElement(root, "#final-migration-argument-evidence").textContent =
      copy.evidence;
    requiredElement(root, "#final-migration-argument-conclusion").textContent =
      copy.conclusion;
  }

  private guidedPickupBetween(
    previous: GameSnapshot,
    next: GameSnapshot,
  ): GroundItem | null {
    if (previous.runSeed !== next.runSeed || previous.floor !== next.floor) return null;
    const shortcut = next.guidedMap.shortcuts.find((entry) => (
      !previous.keyItems.includes(entry.keyId) &&
      next.keyItems.includes(entry.keyId)
    ));
    if (shortcut) {
      return {
        id: shortcut.keyId,
        sourceRoomId: shortcut.keyRoomNodeId,
        ...shortcut.keyPosition,
        name: "捷径钥匙",
        description: `保证开启${shortcut.name}；不会占用背包，也不依赖随机掉落。`,
        kind: "key",
        collection: "interact",
        rewardId: null,
      };
    }
    const cache = next.guidedMap.deadEndCaches.find((entry) => (
      !previous.openedGateIds.includes(entry.id) &&
      next.openedGateIds.includes(entry.id)
    ));
    if (!cache) return null;
    return {
      id: cache.id,
      sourceRoomId: cache.sourceRoomId,
      x: cache.x,
      y: cache.y,
      name: "死路补给",
      description: "空死路已替换为可选收益；打开后本 Run 不会重复刷新。",
      kind: "event",
      collection: "interact",
      rewardId: cache.rewardId,
    };
  }

  private renderGateChallenge(snapshot: GameSnapshot, entered: boolean): void {
    const challenge = snapshot.activeGateChallenge;
    if (!challenge) return;
    this.gateAutocomplete.setSchemaLines([
      ...challenge.schema,
      ...COMPLETE_SCHEMA_LINES,
      ...COMPLETE_RELATION_LINES,
    ]);
    this.gateAutocomplete.setPreferredKeywords(
      challenge.hints.flatMap((hint) => (
        ["INNER JOIN", "LEFT JOIN", "JOIN", "ON", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT"]
          .filter((keyword) => hint.toLocaleUpperCase().includes(keyword))
      )),
    );
    requiredElement(this.root, "#gate-terminal-title").textContent = challenge.title;
    requiredElement(this.root, "#gate-terminal-objective").textContent = challenge.objective;

    const schemaRoot = requiredElement(this.root, "#gate-challenge-schema");
    schemaRoot.replaceChildren();
    challenge.schema.forEach((line) => {
      const code = document.createElement("code");
      code.textContent = line;
      schemaRoot.append(code);
    });

    const hintRoot = requiredElement(this.root, "#gate-challenge-hints");
    hintRoot.replaceChildren();
    challenge.hints.forEach((hint, index) => {
      const item = document.createElement("p");
      item.textContent = `提示 ${index + 1} · ${hint}`;
      hintRoot.append(item);
    });

    if (entered) {
      this.gateTextarea.value = "";
      this.gateQueryStatus.textContent = "空输入不触发反噬；语法或结果错误才扣除 1 点生命。";
      this.gateQueryStatus.dataset.kind = "";
      const resultRoot = requiredElement(this.root, "#gate-query-result");
      const planRoot = requiredElement(this.root, "#gate-query-plan");
      resultRoot.className = "table-wrap empty-state";
      resultRoot.textContent = "尚未执行机关查询。";
      planRoot.className = "plan-list empty-state";
      planRoot.textContent = "等待 EXPLAIN QUERY PLAN。";
    }
    this.openGateTerminal();
  }

  private renderFloorTransition(snapshot: GameSnapshot): void {
    const portal = requiredElement<HTMLElement>(this.root, "#floor-portal");
    const victoryWasVisible = !portal.hidden && portal.dataset.state === "victory";
    const victoryActions = requiredElement<HTMLElement>(
      portal,
      "#floor-victory-actions",
    );
    const finalVictoryReady = finalVictoryPortalReady(snapshot);
    const narrativePending = this.activeNarrativeMoment !== null ||
      this.narrativeMomentQueue.pendingIds.length > 0;
    const presentationBlocked = this.busy ||
      this.isCombatSettlementVisible() ||
      this.isLootMenuOpen() ||
      this.isInspectionOpen() ||
      narrativePending;
    const policy = floorTransitionPolicy({
      mode: snapshot.mode,
      floor: snapshot.floor,
      finalVictoryReady,
      presentationBlocked,
    });
    const {
      transitionVisible,
      victoryVisible,
      shouldScheduleAdvance,
    } = policy;
    portal.hidden = !transitionVisible && !victoryVisible;
    portal.inert = !transitionVisible && !victoryVisible;
    portal.setAttribute("aria-hidden", String(!transitionVisible && !victoryVisible));
    victoryActions.hidden = !victoryVisible;
    this.root.classList.toggle("victory-active", victoryVisible);
    if (transitionVisible) {
      portal.dataset.state = "transition";
      portal.removeAttribute("role");
      portal.removeAttribute("aria-modal");
      portal.removeAttribute("aria-labelledby");
      const ascent = narrativeFloorFor(snapshot.floor).ascent;
      const blueprint = floorMapBlueprint(snapshot.floor);
      const transit = floorTransitPresentation(blueprint.ascentTransit);
      const arrival = ascent?.arrival ?? `第 ${snapshot.floor + 1} 层`;
      portal.dataset.transit = blueprint.ascentTransit;
      requiredElement(portal, "#floor-ascent-facility").textContent =
        transit.label;
      requiredElement(portal, "#floor-ascent-destination").textContent =
        arrival;
      requiredElement(portal, "#floor-clear-title").textContent =
        `FLOOR ${String(snapshot.floor).padStart(2, "0")} CLEARED`;
      requiredElement(portal, "#floor-clear-copy").textContent =
        `CONGRATULATIONS!! · ${transit.action}${transit.label} · 前往${arrival}`;
      this.hidePickupCard();
    } else if (victoryVisible) {
      portal.dataset.state = "victory";
      portal.setAttribute("role", "dialog");
      portal.setAttribute("aria-modal", "true");
      portal.setAttribute("aria-labelledby", "floor-clear-title");
      portal.dataset.transit = "migrate";
      requiredElement(portal, "#floor-ascent-facility").textContent = "HISTORY";
      requiredElement(portal, "#floor-ascent-destination").textContent = "IDENTITY";
      requiredElement(portal, "#floor-clear-title").textContent = "DUNGEON CLEARED";
      requiredElement(portal, "#floor-clear-copy").textContent =
        NARRATIVE_ENDINGS[0].finalLine;
      this.hidePickupCard();
      if (!victoryWasVisible) {
        queueMicrotask(() => {
          if (!this.isVictoryPortalOpen()) return;
          requiredElement<HTMLButtonElement>(
            portal,
            "#open-ending-codex",
          ).focus({ preventScroll: true });
        });
      }
    } else {
      delete portal.dataset.state;
      portal.removeAttribute("role");
      portal.removeAttribute("aria-modal");
      portal.removeAttribute("aria-labelledby");
    }
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 650
      : 1_500;
    this.floorTransitionCoordinator.sync(shouldScheduleAdvance, delay);
  }

  private advanceFromFloorTransition(): void {
    const current = this.session.snapshot();
    if (current.mode !== "transition" || current.floor >= 8) return;
    this.hidePickupCard();
    this.hideCombatSettlement();
    this.hideNarrativeBeatCard();
    if (
      this.isInspectionOpen() &&
      this.inspectionOverlay.dataset.recordKind !== "migration"
    ) {
      this.closeInspection(false, false);
    }
    this.activeNarrativeMoment = null;
    this.narrativeMomentQueue.clear();
    if (!this.session.advanceFloor()) return;
    const nextSnapshot = this.session.snapshot();
    this.sql.reset(nextSnapshot.monsters);
    this.clearQueryArtifacts();
    this.audio.setScene({
      floor: nextSnapshot.floor,
      region: 0,
      mode: "explore",
    });
  }

  private isVictoryPortalOpen(): boolean {
    const portal = this.root.querySelector<HTMLElement>("#floor-portal");
    return Boolean(
      portal &&
      !portal.hidden &&
      portal.dataset.state === "victory",
    );
  }

  private renderRegionTransition(snapshot: GameSnapshot): void {
    const transfer = snapshot.regionTransfer;
    if (!transfer || transfer.sequence <= this.lastRegionTransferSequence) return;
    this.lastRegionTransferSequence = transfer.sequence;
    const overlay = requiredElement<HTMLElement>(this.root, "#region-transition");
    const blueprint = floorMapBlueprint(snapshot.floor);
    const transit = floorTransitPresentation(blueprint.routeTransit);
    overlay.dataset.transit = blueprint.routeTransit;
    requiredElement(overlay, "#region-transition-kind").textContent =
      `REGION TRANSIT / ${transit.label}`;
    requiredElement(overlay, "#region-transition-route").textContent =
      `${transfer.fromName} → ${transfer.toName}`;
    requiredElement(overlay, "#region-transition-copy").textContent =
      `${transit.action}${transit.label} · 生态音乐与地图色调正在切换…`;
    overlay.hidden = false;
    if (this.regionTransitionTimer !== null) {
      window.clearTimeout(this.regionTransitionTimer);
    }
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 350
      : 850;
    this.regionTransitionTimer = window.setTimeout(() => {
      overlay.hidden = true;
      this.regionTransitionTimer = null;
    }, delay);
  }

  private renderDefeatTransition(snapshot: GameSnapshot, entered: boolean): void {
    const overlay = requiredElement<HTMLElement>(this.root, "#run-state-overlay");
    const defeated = snapshot.mode === "defeat";
    overlay.hidden = !defeated;
    if (!defeated) {
      if (this.defeatRespawnTimer !== null) {
        window.clearTimeout(this.defeatRespawnTimer);
        this.defeatRespawnTimer = null;
      }
      return;
    }

    this.hidePickupCard();
    this.hideCombatSettlement();
    requiredElement(overlay, "p").textContent = snapshot.respawnCampfireId
      ? "正在返回最近休息的篝火…"
      : "尚未记录篝火，正在返回本层出生安全区…";
    if (entered && this.defeatRespawnTimer !== null) {
      window.clearTimeout(this.defeatRespawnTimer);
      this.defeatRespawnTimer = null;
    }
    if (this.defeatRespawnTimer !== null) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 500
      : 1_200;
    this.defeatRespawnTimer = window.setTimeout(() => {
      this.defeatRespawnTimer = null;
      if (this.session.snapshot().mode !== "defeat") return;
      this.getBattleScene()?.abortEncounter();
      this.session.respawnAfterDefeat();
    }, delay);
  }

  private renderTarget(target: Monster | undefined, snapshot: GameSnapshot): void {
    this.combatRenderer.renderTarget(target, snapshot);
  }

  private renderMonsterCodex(snapshot: GameSnapshot): void {
    this.monsterCodex.render({
      floor: snapshot.floor,
      discoveredMonsterIds: snapshot.profile.discoveredMonsterIds,
    });
    const total = new Set(INITIAL_MONSTERS.map((monster) => monster.id)).size;
    requiredElement<HTMLButtonElement>(
      this.root,
      "#open-monster-codex",
    ).textContent =
      `◆ 怪物图鉴 ${snapshot.profile.discoveredMonsterIds.length}/${total}`;
  }

  private renderLocks(snapshot: GameSnapshot): void {
    this.combatRenderer.renderLocks(snapshot);
  }

  private renderTaskBrief(snapshot: GameSnapshot): void {
    this.combatRenderer.renderTaskBrief(snapshot);
  }

  private renderSchema(snapshot: GameSnapshot): void {
    const lines = snapshot.schema;
    this.combatAutocomplete.setSchemaLines([
      ...lines,
      ...COMPLETE_SCHEMA_LINES,
      ...COMPLETE_RELATION_LINES,
    ]);
    this.combatAutocomplete.setPreferredKeywords(snapshot.locks);
    const root = requiredElement(this.root, "#schema-list");
    root.replaceChildren();
    const tables = parseSchemaLines(lines);
    const roles = schemaTaskTableRoles(snapshot);
    requiredElement(this.root, "#terminal-schema-table-count").textContent =
      `${tables.length} TABLES`;
    this.renderCompactSchema(
      requiredElement(this.root, "#terminal-schema-reference"),
      lines,
    );

    const primaryNote = document.createElement("p");
    primaryNote.className = "schema-task-note";
    const primaryTable = tables.find((table) => (
      roles.get(table.name.toLocaleLowerCase()) === "primary"
    ));
    const relatedTables = tables.filter((table) => (
      roles.get(table.name.toLocaleLowerCase()) === "related"
    ));
    primaryNote.textContent = tables.some((table) => table.name === "monsters")
      ? "怪物主表按 monsters.id 定位；monster_id 仅属于信号/装备明细表，可用于过滤明细行，也可关联 monsters.id。"
      : primaryTable
        ? `本题先读取 ${primaryTable.name}；${
          relatedTables.length > 0
            ? `需要关联 ${relatedTables.map((table) => table.name).join("、")}。`
            : "其余专用表仅作字段参考。"
        }`
        : "本题使用当前事故表字段；未参与查询的表仅作参考。";
    root.append(primaryNote);
    tables.forEach((table) => {
      const definition = SQL_TABLES.find((entry) => entry.name === table.name);
      const article = document.createElement("article");
      const roleName = roles.get(table.name.toLocaleLowerCase());
      const active = roleName !== undefined;
      article.className = active ? "schema-task-table is-active" : "schema-task-table";
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = table.name;
      const subtitle = document.createElement("span");
      subtitle.textContent = definition?.title ?? "数据表";
      const role = document.createElement("i");
      role.textContent = active
        ? roleName === "primary" ? "本题主表" : "本题关联表"
        : "字段参考";
      heading.append(title, subtitle, role);
      const fields = document.createElement("code");
      fields.textContent = table.columns.join(", ");
      article.append(heading, fields);
      root.append(article);
    });
  }

  private renderCompactSchema(
    root: HTMLElement,
    schemaLines: readonly string[] = COMPLETE_SCHEMA_LINES,
  ): void {
    this.schemaPanel.renderCompact(root, parseSchemaLines(schemaLines));
  }

  private renderSchemaCodex(): void {
    this.schemaPanel.renderCodex(
      {
        tabs: requiredElement(this.root, "#schema-table-tabs"),
        panel: requiredElement(this.root, "#schema-table-panel"),
        trace: requiredElement(this.root, "#schema-relation-trace"),
      },
      SQL_TABLES,
      SQL_RELATIONS,
      this.selectedSchemaTable,
    );
    return;
  }

  private selectSchemaTable(tableName: SqlTableName, focus: boolean): void {
    this.selectedSchemaTable = tableName;
    this.renderSchemaCodex();
    if (!focus) return;
    requiredElement<HTMLButtonElement>(
      this.root,
      `#schema-tab-${tableName}`,
    ).focus({ preventScroll: true });
  }

  private renderHints(hints: string[]): void {
    this.hintsRoot.replaceChildren();
    hints.forEach((hint, index) => {
      const item = document.createElement("p");
      item.textContent = `提示 ${index + 1} · ${hint}`;
      this.hintsRoot.append(item);
    });
  }

  private renderMazeMap(snapshot: GameSnapshot): void {
    this.minimapRenderer.render(snapshot);
  }

  private renderMastery(snapshot: GameSnapshot): void {
    const root = requiredElement(this.root, "#mastery-list");
    root.replaceChildren();
    LESSONS.forEach((lesson) => {
      const chip = document.createElement("span");
      const mastered = snapshot.profile.masteredLessons.includes(lesson.id);
      chip.className = mastered ? "is-mastered" : "";
      chip.textContent = `${mastered ? "✓" : "○"} ${lesson.concept}`;
      root.append(chip);
    });
  }

  private renderRelics(snapshot: GameSnapshot): void {
    const root = requiredElement(this.root, "#relic-list");
    root.replaceChildren();
    if (snapshot.relics.length === 0) {
      root.textContent = "本轮尚无遗物";
      return;
    }
    snapshot.relics.forEach((relic) => {
      const item = document.createElement("span");
      item.title = relic.description;
      item.textContent = relic.name;
      root.append(item);
    });
  }

  private renderResult(
    result: SqlQueryResult,
    disclosure: QueryResultDisclosure,
  ): void {
    this.terminalPanel.renderResult(
      result,
      this.session.snapshot(),
      disclosure,
      this.resultRoot,
      this.planRoot,
    );
  }

  private clearQueryArtifacts(): void {
    this.terminalPanel.clearQueryArtifacts();
  }
}
