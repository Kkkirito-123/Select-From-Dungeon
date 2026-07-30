import { ArcadeAudio } from "../audio/ArcadeAudio";
import {
  NARRATIVE_ENDINGS,
  NARRATIVE_FLOORS,
  type NarrativeBeat,
  type NarrativeEndingStep,
} from "../content/narrativeContent";
import {
  floorMapBlueprint,
  floorTransitPresentation,
  regionPortalsEnabledForFloor,
} from "../content/floorMapBlueprints";
import {
  floorExperience,
  hasFloorExperience,
} from "../content/floorExperience";
import { floorLabyrinth } from "../content/floorLabyrinth";
import { floorCurrentSightCellKeys } from "../domain/floorLabyrinth";
import type { OnboardingMilestone } from "../content/onboarding";
import {
  INITIAL_MONSTERS,
  LESSONS,
  practiceStagesFor,
} from "../content/mvpLevel";
import {
  COMPLETE_RELATION_LINES,
  COMPLETE_SCHEMA_LINES,
  SQL_RELATIONS,
  SQL_TABLES,
  sqlTable,
  type SqlTableName,
} from "../content/sqlSchema";
import { GameSession, LEVEL_XP_THRESHOLDS } from "../domain/GameSession";
import {
  buildScribeRecap,
  narrativeFloorFor,
} from "../domain/narrative";
import {
  FloorStoryMomentQueue,
  floorStoryInspectMomentForLandmark,
  floorStoryProgress,
  storyEvidenceIdFromMarker,
  type FloorStoryMoment,
  type FloorStoryPresentation,
} from "../domain/floorStory";
import {
  monsterIdLabel,
  monsterIdentityPresentation,
  monsterIntentName,
  redactUndiscoveredMonsterIdentityText,
} from "../domain/monsterIdentity";
import { redactUndiscoveredQueryIdentities } from "../domain/queryDisclosure";
import type { FloorNumber } from "../domain/runGraph";
import type {
  ExperienceSettlement,
  GameSnapshot,
  GroundItem,
  LootItem,
  Monster,
  PatrolMove,
  QueryResultDisclosure,
  SqlQueryResult,
  TurnResolution,
} from "../domain/types";
import type { FeedbackDirector, FeedbackNotice } from "../feedback/FeedbackDirector";
import type { BattleScene } from "../game/BattleScene";
import { pickedItemsBetween } from "../game/snapshotFeedback";
import { createRunSeed } from "../storage/localProgress";
import type { SqlEngine } from "../sql/SqlEngine";
import type { OnboardingController, OnboardingSnapshot } from "./OnboardingController";
import {
  AnswerReviewView,
  type AnswerReviewScope,
} from "./AnswerReviewView";
import { NarrativeCodexView } from "./NarrativeCodexView";
import { MonsterCodexView } from "./MonsterCodexView";
import {
  parseSchemaLines,
  SqlAutocompleteController,
} from "./sqlAutocomplete";
import { SqlChordTracker } from "./SqlChordTracker";

const SVG_NS = "http://www.w3.org/2000/svg";

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

export function shapeOnlyQueryResultCopy(result: SqlQueryResult): {
  title: string;
  detail: string;
} {
  return {
    title: `查询已执行 · 结果值与行数已封存 · ${result.columns.length} 个字段`,
    detail: result.columns.length > 0
      ? `字段：${result.columns.join(", ")}。本次答案未通过，结果值与行数已封存。`
      : "本次答案未通过，结果值与行数已封存。",
  };
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
  >,
): string {
  return [
    String(snapshot.focusMonsterId ?? ""),
    snapshot.lessonStageId,
    snapshot.lessonIntro,
    snapshot.missionBody,
    snapshot.locks.join("\u0000"),
    snapshot.schema.join("\u0000"),
  ].join("\u0001");
}

export function schemaTaskTableRoles(
  snapshot: Pick<
    GameSnapshot,
    "focusMonsterId" | "lessonIntro" | "lessonStageId" | "missionBody" | "schema"
  >,
): ReadonlyMap<string, SchemaTaskRole> {
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
  const completedMigrationStepIds = (
    snapshot.floor === 8 &&
    snapshot.mode === "victory"
  )
    ? NARRATIVE_ENDINGS[0].steps.map((step) => step.id)
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
  private answerReview!: AnswerReviewView;
  private narrativeCodex!: NarrativeCodexView;
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
  private readonly listenerController = new AbortController();
  private unsubscribeSession: (() => void) | null = null;
  private unsubscribeFeedback: (() => void) | null = null;
  private unsubscribeOnboarding: (() => void) | null = null;
  private releaseAudioGesture: (() => void) | null = null;
  private focusBeforeTerminal: HTMLElement | null = null;
  private focusBeforeInspection: HTMLElement | null = null;
  private pendingLabyrinthMove: { x: number; y: number } | null = null;
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
  private floorTransitionTimer: number | null = null;
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

  private readonly openTerminalHandler = (): void => this.openTerminal();
  private readonly inspectionHandler = (event: Event): void => {
    const detail = (event as CustomEvent<{
      message?: string;
      landmarkId?: string;
    }>).detail;
    const message = detail?.message;
    if (typeof message === "string" && message.trim() !== "") {
      if (typeof detail.landmarkId === "string") {
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
          this.openStoryMoment(inspectMoment, this.lastSnapshot, message);
          return;
        }
      }
      this.openInspection(message);
    }
  };
  private readonly labyrinthEntryHandler = (event: Event): void => {
    const detail = (event as CustomEvent<{
      dx?: number;
      dy?: number;
      message?: string;
    }>).detail;
    if (
      typeof detail?.dx !== "number" ||
      typeof detail.dy !== "number"
    ) return;
    this.pendingLabyrinthMove = { x: detail.dx, y: detail.dy };
    const contract = floorLabyrinth(this.lastSnapshot.floor);
    this.openRecordOverlay({
      kicker: "THRESHOLD / 安全区边界",
      title: `是否进入${contract.mazeName}？`,
      body: detail.message ?? "迷宫内视野降低，怪物和伤害机关会开始活动。",
      closeLabel: "ESC · 暂不进入",
      kind: "labyrinth",
    });
  };
  private readonly keydownHandler = (event: KeyboardEvent): void => {
    if (this.isInspectionOpen()) {
      if (isInspectionPrimaryKey(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.inspectionOverlay.dataset.recordKind === "labyrinth") {
          this.confirmLabyrinthEntry();
        } else {
          this.closeInspection();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (this.activeNarrativeMoment?.presentation === "blocking") return;
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
    const currentSight = this.minimapCurrentSight(this.lastSnapshot);
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
  ) {
    this.narrativeBootstrapMode = initialRunSource;
  }

  mount(): void {
    const schemaFieldCount = SQL_TABLES.reduce(
      (total, table) => total + table.columns.length,
      0,
    );
    this.root.innerHTML = `
      <div class="page-frame">
        <header class="masthead">
          <div class="title-lockup">
            <p class="eyebrow">CASTLE RUN / SQL ROGUELITE</p>
            <h1><span>SQL</span> 魔王城</h1>
            <p class="title-sub">SELECT * FROM DUNGEON</p>
          </div>
          <div class="run-console">
            <div><span>FLOOR</span><strong id="floor-value">01 / 08</strong></div>
            <div><span>SEED</span><strong id="seed-value">—</strong></div>
            <button id="open-admin" type="button" class="admin-toggle">⌘ 管理员</button>
            <button id="open-monster-codex" type="button" class="monster-codex-toggle">◆ 怪物图鉴 0/0</button>
            <button id="open-narrative" type="button" class="narrative-toggle">▧ 剧情档案 1/5</button>
            <button id="open-review" type="button" class="review-toggle">▤ 答题复盘</button>
            <button id="audio-toggle" type="button" class="audio-toggle" aria-pressed="false">♪ 声音开启</button>
            <label class="volume-control"><span>音量</span><input id="audio-volume" type="range" min="0" max="1" step="0.05" value="0.55"></label>
          </div>
        </header>

        <main class="game-layout">
          <section class="dungeon-panel" aria-label="SQL 魔王城房间">
            <div class="hud-strip">
              <div><span class="hud-label">生命</span><strong id="hp-value">2 / 2</strong></div>
              <div id="player-hp-progress" class="meter" role="progressbar" aria-label="玩家生命值" aria-valuemin="0" aria-valuenow="2" aria-valuemax="2"><span id="hp-meter"></span></div>
              <div class="level-chip"><span class="hud-label">等级</span><strong id="level-value">LV.1 · 0 / 2 XP</strong></div>
              <div id="heat-chip" hidden><span class="hud-label">查询负载</span><strong id="heat-value">0</strong></div>
              <div id="heat-progress" class="meter heat" role="progressbar" aria-label="SQLite 教学查询负载" aria-valuemin="0" aria-valuenow="0" aria-valuemax="100" hidden><span id="heat-meter"></span></div>
              <div class="weapon-chip"><span class="hud-label">武器</span><strong id="weapon-name">数据之刃</strong></div>
              <div class="armor-chip"><span class="hud-label">防具</span><strong id="armor-name">无防具</strong></div>
              <div class="relic-chip"><span class="hud-label">遗物</span><strong id="relic-count">0</strong></div>
            </div>

            <div class="game-stage">
              <div id="game-root" class="game-root" tabindex="-1"></div>

              <section id="inspection-overlay" class="inspection-overlay" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="inspection-title" inert hidden>
                <article class="inspection-overlay__frame">
                  <span id="inspection-kicker">FIELD NOTE / 现场记录</span>
                  <h2 id="inspection-title">现场调查</h2>
                  <p id="inspection-message"></p>
                  <div class="inspection-overlay__actions">
                    <button id="confirm-labyrinth-entry" type="button" hidden>E · 进入迷宫</button>
                    <button id="close-inspection" type="button">E · 关闭记录</button>
                  </div>
                </article>
              </section>

              <aside id="narrative-beat-card" class="narrative-beat-card" role="status" aria-live="polite" aria-atomic="true" hidden>
                <span id="narrative-beat-kind">LOST NAME / 入层</span>
                <strong id="narrative-beat-title">没有名字的人</strong>
                <div id="narrative-beat-lines"></div>
                <small>移动 3 步后收起 · 可在失名录重读</small>
              </aside>

              <article class="target-card" aria-label="当前怪物">
                <div class="target-card__kicker">ENCOUNTER / 当前记录</div>
                <strong id="target-name">等待进入课程房</strong>
                <div class="target-card__meta">
                  <span id="target-id">ID —</span>
                  <span id="target-species">类型 —</span>
                </div>
                <div class="target-card__hp-row">
                  <div id="target-hp-progress" class="target-card__hp" role="progressbar" aria-label="怪物生命值" aria-valuemin="0" aria-valuenow="0" aria-valuemax="1"><span id="target-hp-bar"></span></div>
                  <span id="target-hp-value">— / —</span>
                </div>
                <div class="target-card__intent">
                  <span>错误反击</span>
                  <b id="target-intent">等待遭遇</b>
                </div>
              </article>
              <button id="retreat-combat" type="button" class="retreat-action" hidden>
                ESCAPE / 撤退到复活点
              </button>

              <aside id="pickup-card" class="pickup-card" role="status" aria-live="polite" aria-atomic="true" hidden>
                <span id="pickup-kind">LOOT / 自动生效</span>
                <strong id="pickup-name">获得道具</strong>
                <p id="pickup-description"></p>
                <small id="pickup-effect"></small>
              </aside>

              <aside id="combat-result-card" class="combat-result-card" role="status" aria-live="assertive" aria-atomic="true" hidden>
                <span id="combat-result-kicker">VICTORY / 战斗结算</span>
                <div class="combat-result-card__identity">
                  <code id="combat-result-id">ID #---</code>
                  <i aria-hidden="true">→</i>
                  <b id="combat-result-name">名字未确认</b>
                </div>
                <strong id="combat-result-title">击败怪物</strong>
                <div class="combat-result-card__xp">
                  <b id="combat-result-xp">+0 XP</b>
                  <code id="combat-result-progress">LV.1 · 0 / 2 XP</code>
                </div>
                <p id="combat-result-level"></p>
                <small id="combat-result-reward"></small>
              </aside>

              <section id="campfire-menu" class="campfire-menu" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="campfire-menu-title" inert hidden>
                <div class="campfire-menu__pixel-fire" aria-hidden="true">
                  <i></i><i></i><i></i>
                </div>
                <span>CAMPFIRE / SAFE ZONE</span>
                <h2 id="campfire-menu-title">篝火</h2>
                <p id="campfire-menu-status">选择接下来的行动。</p>
                <blockquote class="scribe-recap">
                  <strong>复盘页 · 抄写员留存</strong>
                  <p id="scribe-recap">这里保存抄写员此前整理的本层事实，不代表她就在篝火旁。</p>
                </blockquote>
                <div class="campfire-menu__actions">
                  <button id="rest-at-campfire" type="button" class="primary-action">在此休息</button>
                  <button id="review-at-campfire" type="button" class="quiet-action">答案复盘</button>
                  <button id="open-campfire-inventory" type="button" class="quiet-action">打开背包</button>
                </div>
                <button id="leave-campfire" type="button" class="campfire-menu__leave">ESC · 返回探索</button>
              </section>

              <section id="inventory-menu" class="loadout-menu" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="inventory-menu-title" inert hidden>
                <header class="loadout-menu__header">
                  <div><span>LOADOUT / 本轮构筑</span><h2 id="inventory-menu-title">装备背包</h2></div>
                  <button id="close-inventory" type="button" class="icon-action">ESC ×</button>
                </header>
                <div id="equipped-summary" class="equipped-summary"></div>
                <div class="loadout-menu__section">
                  <div class="card-heading"><span>装备背包</span><span id="equipment-capacity">0 / 12</span></div>
                  <div id="equipment-inventory" class="inventory-grid"></div>
                </div>
                <div class="loadout-menu__section">
                  <div class="card-heading"><span>恢复品</span><span id="consumable-capacity">0 / 3</span></div>
                  <div id="consumable-inventory" class="inventory-grid inventory-grid--consumables"></div>
                </div>
                <div class="loadout-menu__section">
                  <div class="card-heading"><span>关键物品</span><span>不占背包</span></div>
                  <div id="key-inventory" class="key-inventory"></div>
                </div>
                <p class="loadout-menu__note">战斗中不能换装。丢弃的普通物品会留在脚下，本层结束后消失。</p>
              </section>

              <section id="loot-menu" class="loadout-menu loot-menu" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="loot-menu-title" inert hidden>
                <header class="loadout-menu__header">
                  <div><span>LOOT BUNDLE / 独立掉落判定</span><h2 id="loot-menu-title">战利品包</h2></div>
                  <button id="close-loot" type="button" class="icon-action">ESC ×</button>
                </header>
                <p id="loot-menu-status" class="loadout-menu__note">选择收入背包或立即装备；未处理物品会保留在地图。</p>
                <div id="loot-items" class="loot-grid"></div>
                <button id="take-all-loot" type="button" class="primary-action loot-menu__take-all">尽量全部收入背包</button>
              </section>

              <section id="floor-portal" class="floor-portal" aria-live="assertive" aria-hidden="true" hidden>
                <div class="floor-portal__ring floor-portal__ring--outer"></div>
                <div class="floor-portal__ring floor-portal__ring--inner"></div>
                <div class="floor-portal__tables" aria-hidden="true">
                  <span id="floor-ascent-facility">上升设施</span>
                  <i>↑</i>
                  <span id="floor-ascent-destination">下一层</span>
                </div>
                <strong id="floor-clear-title">FLOOR 01 CLEARED</strong>
                <p id="floor-clear-copy">CONGRATULATIONS!!</p>
                <div id="floor-victory-actions" class="floor-portal__actions" hidden>
                  <button id="open-ending-codex" type="button">查看 MIGRATE 终章</button>
                  <button id="restart-after-victory" type="button">开始新 Run</button>
                </div>
              </section>

              <section id="run-state-overlay" class="run-state-overlay" aria-live="assertive" hidden>
                <span>DEFEAT / CHECKPOINT</span>
                <strong>YOU DIED</strong>
                <p>正在返回最近休息的篝火…</p>
              </section>

              <section id="region-transition" class="region-transition" aria-live="polite" hidden>
                <span id="region-transition-kind">REGION TRANSIT</span>
                <strong id="region-transition-route">区域切换</strong>
                <p id="region-transition-copy">生态音乐与地图色调正在切换…</p>
              </section>

              <div id="interaction-prompt" class="interaction-prompt">用 WASD 探索迷宫</div>

              <section id="combat-terminal" class="combat-terminal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="terminal-title" inert>
                <div class="terminal-topline">
                  <div>
                    <span class="terminal-prompt">QUERY CAST / 完整语句</span>
                    <strong id="terminal-title">SQL 攻击终端</strong>
                  </div>
                  <button id="close-terminal" type="button" class="icon-action" aria-label="关闭终端">ESC ×</button>
                </div>

                <div class="terminal-grid">
                  <section class="terminal-brief">
                    <div class="card-heading"><span>本回合任务</span><span id="query-counter">查询 0 次</span></div>
                    <p id="terminal-objective"></p>
                    <div id="lock-list" class="lock-list"></div>
                    <div id="schema-list" class="schema-list"></div>
                    <details class="terminal-schema-reference">
                      <summary>完整字段速查 <span id="terminal-schema-table-count">${SQL_TABLES.length} TABLES</span></summary>
                      <div id="terminal-schema-reference" class="schema-reference-grid"></div>
                    </details>
                  </section>

                  <section class="terminal-editor">
                    <label class="sr-only" for="sql-editor">输入完整 SQL</label>
                    <div class="sql-editor-shell">
                      <textarea id="sql-editor" spellcheck="false" autocomplete="off" placeholder="在这里完整写出 SELECT ...；高级层可使用 WITH ...;"></textarea>
                      <div class="sql-assist-rail" aria-hidden="true">
                        <span>PLAN ASSIST / 查询提示</span>
                        <span data-assist-count>CTRL SPACE</span>
                      </div>
                      <div id="sql-suggestions" class="sql-suggestions" role="listbox" aria-label="SQL 输入建议" hidden></div>
                    </div>
                    <div class="action-row">
                      <button id="execute-query" type="button" class="primary-action">执行 SQL 攻击 <kbd>Ctrl ↵</kbd></button>
                      <button id="request-hint" type="button" class="quiet-action">下一条提示 <kbd>H</kbd></button>
                    </div>
                    <p id="query-status" class="query-status">空输入不消耗回合；错误查询才会触发反击。</p>
                    <div id="hint-list" class="hint-list"></div>
                  </section>
                </div>

                <details class="terminal-evidence">
                  <summary>查看真实结果与 SQLite 查询路径</summary>
                  <div class="evidence-grid">
                    <div id="query-result" class="table-wrap empty-state">尚未执行本回合查询。</div>
                    <div id="query-plan" class="plan-list empty-state">等待 EXPLAIN QUERY PLAN。</div>
                  </div>
                </details>
              </section>

              <section id="gate-terminal" class="combat-terminal gate-terminal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="gate-terminal-title" inert>
                <div class="terminal-topline gate-terminal__topline">
                  <div>
                    <span class="terminal-prompt">OPTIONAL BREACH / 越级机关</span>
                    <strong id="gate-terminal-title">高难 SQL 机关</strong>
                  </div>
                  <button id="close-gate-terminal" type="button" class="icon-action" aria-label="退出 SQL 密文解读">ESC 安全退出</button>
                </div>

                <div class="terminal-grid gate-terminal__grid">
                  <section class="terminal-brief gate-terminal__brief">
                    <div class="breach-risk"><span>RISK</span><strong>错误查询造成 1 点伤害 · 护甲优先</strong></div>
                    <p id="gate-terminal-objective"></p>
                    <div id="gate-challenge-schema" class="schema-list"></div>
                    <details class="terminal-schema-reference terminal-schema-reference--gate">
                      <summary>完整字段速查 <span>${SQL_TABLES.length} TABLES</span></summary>
                      <div id="gate-schema-reference" class="schema-reference-grid"></div>
                    </details>
                    <details class="breach-hints">
                      <summary>分级破解提示 / 不直接给答案</summary>
                      <div id="gate-challenge-hints" class="hint-list"></div>
                    </details>
                    <p class="breach-note">成功只打开这一扇物理门；不会获得课程掌握、XP 或战利品。</p>
                  </section>

                  <section class="terminal-editor gate-terminal__editor">
                    <label class="sr-only" for="gate-sql-editor">输入 SQL 密文查询</label>
                    <div class="sql-editor-shell sql-editor-shell--gate">
                      <textarea id="gate-sql-editor" spellcheck="false" autocomplete="off" placeholder="写出完整查询计划，破解结果集校验…"></textarea>
                      <div class="sql-assist-rail" aria-hidden="true">
                        <span>BREACH ASSIST / 机关提示</span>
                        <span data-assist-count>CTRL SPACE</span>
                      </div>
                      <div id="gate-sql-suggestions" class="sql-suggestions" role="listbox" aria-label="机关 SQL 输入建议" hidden></div>
                    </div>
                    <div class="action-row">
                      <button id="execute-gate-query" type="button" class="primary-action breach-action">执行越级校验 <kbd>Ctrl ↵</kbd></button>
                      <button id="cancel-gate-query" type="button" class="quiet-action">断开连接，不扣血</button>
                    </div>
                    <p id="gate-query-status" class="query-status">空输入不触发反噬；语法或结果错误才扣除 1 点生命。</p>
                  </section>
                </div>

                <details class="terminal-evidence">
                  <summary>查看机关返回值与 SQLite 查询路径</summary>
                  <div class="evidence-grid">
                    <div id="gate-query-result" class="table-wrap empty-state">尚未执行机关查询。</div>
                    <div id="gate-query-plan" class="plan-list empty-state">等待 EXPLAIN QUERY PLAN。</div>
                  </div>
                </details>
              </section>
            </div>

            <div class="touch-controls" aria-label="游戏控制">
              <div class="dpad">
                <button type="button" data-move="up" aria-label="向上">▲</button>
                <button type="button" data-move="left" aria-label="向左">◀</button>
                <button type="button" data-move="down" aria-label="向下">▼</button>
                <button type="button" data-move="right" aria-label="向右">▶</button>
              </div>
              <button id="interact" type="button" class="touch-action interact-action">E<br><span>调查交互物</span></button>
              <button id="open-inventory" type="button" class="touch-action inventory-action">B<br><span>背包 / 换装</span></button>
              <button id="open-sql" type="button" class="touch-action sql-action">Q+S<br><span>SQL 战斗</span></button>
            </div>
          </section>

          <aside class="castle-rail" aria-label="魔王城迷宫、引导与任务">
            <section id="onboarding-card" class="onboarding-card" hidden>
              <div class="onboarding-card__topline">
                <span id="onboarding-step">GUIDE</span>
                <kbd id="onboarding-shortcut">WASD</kbd>
              </div>
              <h2 id="onboarding-title">先走一步</h2>
              <p id="onboarding-body"></p>
              <div class="onboarding-card__actions">
                <button id="skip-onboarding" type="button">跳过引导</button>
                <button id="replay-onboarding" type="button">重新教学</button>
              </div>
            </section>

            <section class="mission-card">
              <div class="mission-kicker" id="lesson-concept">当前房间</div>
              <h2 id="mission-title">载入魔王城…</h2>
              <div class="story-thread" aria-label="当前剧情线索">
                <span>STORY / 当前线索</span>
                <strong id="story-thread-title">没有名字的人</strong>
                <p id="story-thread-line">先活下来，再从查询结果里找回自己。</p>
              </div>
              <p id="mission-body"></p>
              <p id="lesson-intro" class="lesson-intro"></p>
              <p id="banner" class="banner"></p>
            </section>

            <section class="castle-map-card" aria-label="魔王城发现式迷宫地图">
              <div class="card-heading"><span>迷宫勘测</span><span id="map-explored">探索后显形</span></div>
              <div id="castle-map" class="castle-map"></div>
              <div class="map-legend"><span class="legend-player">◆ 玩家</span><span class="legend-route">◇ 路标</span><span class="legend-campfire">♨ 篝火</span><span id="map-region-transit" class="legend-portal">◉ 区域交通</span><span class="legend-shortcut">▣ 捷径</span><span class="legend-gate">▮ 门</span><span class="legend-monster">■ 怪物</span><span class="legend-item">◆ 道具</span></div>
            </section>

            <section class="mastery-card">
              <div class="card-heading"><span>永久 SQL 图鉴</span><span id="victory-count">通关 0</span></div>
              <div id="mastery-list" class="mastery-list"></div>
              <div id="relic-list" class="relic-list">本轮尚无遗物</div>
            </section>

            <section class="schema-codex-card" aria-labelledby="schema-codex-title">
              <div class="card-heading">
                <span id="schema-codex-title">SCHEMA CODEX / 字段图鉴</span>
                <span>${SQL_TABLES.length} TABLES · ${schemaFieldCount} FIELDS</span>
              </div>
              <p class="schema-codex-intro">完整字段、类型、空值与关系。切换表查看，不会改变当前任务。</p>
              <div id="schema-table-tabs" class="schema-table-tabs" role="tablist" aria-label="选择数据表"></div>
              <div id="schema-table-panel" class="schema-table-panel" role="tabpanel"></div>
              <div id="schema-relation-trace" class="schema-relation-trace"></div>
              <p class="schema-codex-note">REF 表示教学 JOIN 关系；SQLite 当前未声明 FOREIGN KEY 约束。</p>
            </section>

            <section class="control-card">
              <div class="card-heading"><span>行动规则</span><span>无倒计时</span></div>
              <p><kbd>WASD</kbd> 探索迷宫　触碰怪物所在格进入对战　随机遭遇可能掉落低概率物品</p>
              <p><kbd>E</kbd> 打开补给与战利品、使用钥匙捷径，或调查祭坛、篝火和高难 SQL 机关。</p>
              <p><kbd>B</kbd> 在探索或篝火处打开背包；战斗中不能换装。</p>
              <p><kbd>Q + S</kbd> 打开终端　<kbd>Ctrl + Enter</kbd> 执行完整 SQL</p>
              <p>死亡后返回最近休息的篝火；未记录篝火时返回本层出生安全区，局内进度保留。</p>
              <button id="replay-onboarding-control" type="button" class="guide-replay">↺ 重新教学</button>
            </section>

            <button id="reset-game" type="button" class="reset-action">生成新迷宫 / 开始新 Run</button>
          </aside>
        </main>

        <section id="answer-review" class="answer-review" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="answer-review-title" inert>
          <div class="answer-review__panel">
            <header class="answer-review__header">
              <div>
                <span>LOCAL REVIEW / 本地记录</span>
                <h2 id="answer-review-title">答题复盘</h2>
                <p id="answer-review-description">只保存在本地：记录提交的 SQL 回合，不记录移动或按键，也不会上传。</p>
              </div>
              <button id="close-review" type="button" class="icon-action" aria-label="关闭答题复盘">ESC ×</button>
            </header>
            <div class="answer-review__columns">
              <section class="answer-review__section" data-review-section="battle" aria-labelledby="battle-review-title">
                <div class="card-heading">
                  <span id="battle-review-title">最近一场战斗</span>
                  <span id="battle-review-summary">0 次作答</span>
                </div>
                <div id="battle-review-list" class="answer-review__list"></div>
              </section>
              <section class="answer-review__section" data-review-section="floor" aria-labelledby="floor-review-title">
                <div class="card-heading">
                  <span id="floor-review-title">当前楼层</span>
                  <span id="floor-review-summary">0 次作答</span>
                </div>
                <div id="floor-review-list" class="answer-review__list"></div>
              </section>
            </div>
          </div>
        </section>

        <section id="admin-menu" class="admin-menu" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="admin-menu-title" inert hidden>
          <div class="admin-menu__panel">
            <header class="admin-menu__header">
              <div>
                <span>DEBUG OVERVIEW / 只读存档边界</span>
                <h2 id="admin-menu-title">管理员全局视图</h2>
                <p>可预览 1–8 层全图、怪物与三个生态区。预览状态不写入正式 Run；刷新页面恢复最后存档。</p>
              </div>
              <button id="close-admin" type="button" class="icon-action">ESC ×</button>
            </header>
            <div id="admin-summary" class="admin-summary"></div>
            <div id="admin-floor-list" class="admin-floor-list" aria-label="选择预览楼层"></div>
            <section class="admin-preset-section" aria-labelledby="admin-preset-title">
              <div class="card-heading">
                <span id="admin-preset-title">世界状态预设</span>
                <span>F1–F8 剧情切片</span>
              </div>
              <p>直接检查入层、隐藏区、SQL 密文门与通关后的地图变化；只影响本次管理员预览。</p>
              <div id="admin-preset-list" class="admin-preset-list"></div>
            </section>
            <div id="admin-region-list" class="admin-region-list"></div>
            <p class="admin-menu__warning">管理员模式只用于 Debug，包含未击败怪物真名、Boss 与剧情状态剧透。关闭面板仍保持全图可见；刷新页面才退出预览并恢复正式进度。</p>
          </div>
        </section>

        <footer class="page-footer">
          <span>真实执行：SQLite WASM</span>
          <span>地图：48×36 八层手工轮廓 + Seeded 支路</span>
          <span>音乐：公共领域古典主题电子改编 · 无外部录音</span>
          <span>奖励：课程宝箱固定 · 随机恢复品低概率</span>
        </footer>

        <div id="feedback-toast" class="feedback-toast" role="status" aria-live="polite" aria-atomic="true"></div>
      </div>
    `;

    this.textarea = requiredElement(this.root, "#sql-editor");
    this.gateTextarea = requiredElement(this.root, "#gate-sql-editor");
    this.queryStatus = requiredElement(this.root, "#query-status");
    this.gateQueryStatus = requiredElement(this.root, "#gate-query-status");
    this.resultRoot = requiredElement(this.root, "#query-result");
    this.planRoot = requiredElement(this.root, "#query-plan");
    this.hintsRoot = requiredElement(this.root, "#hint-list");
    this.terminal = requiredElement(this.root, "#combat-terminal");
    this.gateTerminal = requiredElement(this.root, "#gate-terminal");
    this.inspectionOverlay = requiredElement(this.root, "#inspection-overlay");
    this.campfireMenu = requiredElement(this.root, "#campfire-menu");
    this.inventoryMenu = requiredElement(this.root, "#inventory-menu");
    this.lootMenu = requiredElement(this.root, "#loot-menu");
    this.adminMenu = requiredElement(this.root, "#admin-menu");
    this.answerReview = new AnswerReviewView(this.root);
    this.narrativeCodex = new NarrativeCodexView(this.root, {
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
    this.executeButton = requiredElement(this.root, "#execute-query");
    this.gateExecuteButton = requiredElement(this.root, "#execute-gate-query");
    this.sqlButton = requiredElement(this.root, "#open-sql");
    this.audioButton = requiredElement(this.root, "#audio-toggle");
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
    this.executeButton.addEventListener("click", () => void this.executeQuery(), listenerOptions);
    this.gateExecuteButton.addEventListener(
      "click",
      () => void this.executeGateChallenge(),
      listenerOptions,
    );
    requiredElement(this.root, "#close-terminal").addEventListener("click", () => this.closeTerminal(), listenerOptions);
    requiredElement(this.root, "#close-gate-terminal").addEventListener(
      "click",
      () => this.closeGateTerminal(),
      listenerOptions,
    );
    requiredElement(this.root, "#close-inspection").addEventListener(
      "click",
      () => this.closeInspection(),
      listenerOptions,
    );
    requiredElement(this.root, "#confirm-labyrinth-entry").addEventListener(
      "click",
      () => this.confirmLabyrinthEntry(),
      listenerOptions,
    );
    requiredElement(this.root, "#cancel-gate-query").addEventListener(
      "click",
      () => this.closeGateTerminal(),
      listenerOptions,
    );
    requiredElement(this.root, "#request-hint").addEventListener("click", () => this.requestHint(), listenerOptions);
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
    requiredElement(this.root, "#admin-floor-list").addEventListener(
      "click",
      (event) => this.handleAdminFloorAction(event),
      listenerOptions,
    );
    requiredElement(this.root, "#admin-region-list").addEventListener(
      "click",
      (event) => this.handleAdminRegionAction(event),
      listenerOptions,
    );
    requiredElement(this.root, "#admin-preset-list").addEventListener(
      "click",
      (event) => this.handleAdminPresetAction(event),
      listenerOptions,
    );
    requiredElement(this.root, "#close-review").addEventListener("click", () => this.closeReview(), listenerOptions);
    requiredElement(this.root, "#rest-at-campfire").addEventListener(
      "click",
      () => this.restAtCampfire(),
      listenerOptions,
    );
    requiredElement(this.root, "#review-at-campfire").addEventListener(
      "click",
      () => this.openReview("floor", "campfire"),
      listenerOptions,
    );
    requiredElement(this.root, "#leave-campfire").addEventListener(
      "click",
      () => this.leaveCampfire(),
      listenerOptions,
    );
    requiredElement(this.root, "#open-campfire-inventory").addEventListener(
      "click",
      () => this.session.openInventory(),
      listenerOptions,
    );
    requiredElement(this.root, "#open-inventory").addEventListener(
      "click",
      () => this.session.openInventory(),
      listenerOptions,
    );
    requiredElement(this.root, "#close-inventory").addEventListener(
      "click",
      () => this.closeInventoryMenu(),
      listenerOptions,
    );
    requiredElement(this.root, "#close-loot").addEventListener(
      "click",
      () => this.closeLootMenu(),
      listenerOptions,
    );
    requiredElement(this.root, "#take-all-loot").addEventListener(
      "click",
      () => {
        const bundleId = this.lastSnapshot.activeLootBundleId;
        if (!bundleId) return;
        const before = this.lastSnapshot.lootBundles
          .find((bundle) => bundle.id === bundleId)
          ?.items ?? [];
        const resolution = this.session.takeAllLoot(bundleId);
        const remaining = new Set(resolution.remainingItemIds);
        const acquired = before.filter((item) => !remaining.has(item.dropId));
        if (resolution.ok) {
          this.presentLootAcquisition(acquired, resolution.message);
        } else {
          this.showFeedbackNotice({
            message: resolution.message,
            tone: "info",
          });
        }
      },
      listenerOptions,
    );
    requiredElement(this.root, "#equipment-inventory").addEventListener(
      "click",
      (event) => this.handleInventoryAction(event),
      listenerOptions,
    );
    requiredElement(this.root, "#consumable-inventory").addEventListener(
      "click",
      (event) => this.handleInventoryAction(event),
      listenerOptions,
    );
    requiredElement(this.root, "#loot-items").addEventListener(
      "click",
      (event) => this.handleLootAction(event),
      listenerOptions,
    );
    requiredElement(this.root, "#interact").addEventListener(
      "click",
      () => this.isInspectionOpen() ? this.closeInspection() : dispatchInteract(),
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
    window.addEventListener(
      "dungeon:labyrinth-entry",
      this.labyrinthEntryHandler,
      listenerOptions,
    );
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
    this.unsubscribeSession = this.session.subscribe((snapshot) => this.render(snapshot));
  }

  destroy(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.unsubscribeFeedback?.();
    this.unsubscribeFeedback = null;
    this.unsubscribeOnboarding?.();
    this.unsubscribeOnboarding = null;
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
    if (this.floorTransitionTimer !== null) window.clearTimeout(this.floorTransitionTimer);
    this.floorTransitionTimer = null;
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
        this.renderResultInto(
          result,
          requiredElement(this.root, "#gate-query-result"),
          requiredElement(this.root, "#gate-query-plan"),
          resolution.resultDisclosure,
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

  private handleAdminFloorAction(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-admin-floor]",
    );
    const value = Number(button?.dataset.adminFloor);
    if (!Number.isInteger(value) || value < 1 || value > 8) return;
    const resolution = this.session.adminLoadFloor(value as FloorNumber);
    if (!resolution.ok) {
      this.showFeedbackNotice({ message: resolution.message, tone: "info" });
      return;
    }
    const snapshot = this.session.snapshot();
    this.sql.reset(snapshot.monsters);
    this.getBattleScene()?.abortEncounter();
    this.clearQueryArtifacts();
    this.resetAdminNarrativePresentation();
    this.renderAdminMenu(snapshot);
  }

  private handleAdminRegionAction(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-admin-region]",
    );
    const regionId = button?.dataset.adminRegion;
    if (!regionId) return;
    const resolution = this.session.adminTravelToRegion(regionId);
    this.showFeedbackNotice({
      message: resolution.message,
      tone: resolution.ok ? "success" : "info",
    });
  }

  private handleAdminPresetAction(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-admin-preset]",
    );
    const presetId = button?.dataset.adminPreset;
    if (!presetId) return;
    const resolution = this.session.adminApplyPreset(presetId);
    const snapshot = this.session.snapshot();
    this.showFeedbackNotice({
      message: redactSnapshotMonsterIdentity(resolution.message, snapshot),
      tone: resolution.ok ? "success" : "info",
    });
    if (!resolution.ok) return;
    this.sql.reset(snapshot.monsters);
    this.getBattleScene()?.abortEncounter();
    this.clearQueryArtifacts();
    this.resetAdminNarrativePresentation();
    this.renderAdminMenu(snapshot);
  }

  private renderAdminMenu(snapshot: GameSnapshot): void {
    if (!this.adminMenu) return;
    const living = snapshot.monsters.filter((monster) => monster.hp > 0);
    const bosses = living.filter((monster) => monster.isBoss);
    const regionPortalCount = regionPortalsEnabledForFloor(snapshot.floor)
      ? snapshot.biomePlan.portals.length
      : 0;
    requiredElement(this.adminMenu, "#admin-summary").textContent =
      `FLOOR ${snapshot.floor} · ${snapshot.mazeFloor.width}×${snapshot.mazeFloor.height} · 存活怪物 ${living.length} · 首领 ${bosses.length} · 区域交通 ${regionPortalCount}`;
    const floors = requiredElement(this.adminMenu, "#admin-floor-list");
    floors.replaceChildren();
    for (let floor = 1; floor <= 8; floor += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.adminFloor = String(floor);
      button.className = floor === snapshot.floor ? "is-active" : "";
      button.textContent = `F${String(floor).padStart(2, "0")}`;
      floors.append(button);
    }
    const presets = requiredElement(this.adminMenu, "#admin-preset-list");
    presets.replaceChildren();
    if (hasFloorExperience(snapshot.floor)) {
      for (const preset of floorExperience(snapshot.floor).adminPresets) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.adminPreset = preset.id;
        button.textContent = redactSnapshotMonsterIdentity(preset.label, snapshot);
        presets.append(button);
      }
    } else {
      const unavailable = document.createElement("p");
      unavailable.textContent = "本轮世界状态预设目前覆盖完成精修的第一至四层。";
      presets.append(unavailable);
    }
    const regions = requiredElement(this.adminMenu, "#admin-region-list");
    regions.replaceChildren();
    snapshot.biomePlan.regions.forEach((region, index) => {
      const article = document.createElement("article");
      const boss = region.areaBossId === null
        ? null
        : snapshot.monsters.find((monster) => monster.id === region.areaBossId);
      const heading = document.createElement("strong");
      heading.textContent = `${index + 1}. ${region.name}`;
      const detail = document.createElement("p");
      detail.textContent = boss
        ? `区域首领：${
            monsterIdentityPresentation(
              boss,
              snapshot.profile.discoveredMonsterIds,
            ).worldLabel
          } · ${boss.hp}/${boss.maxHp} HP`
        : "区域首领：无 · 课程探索区";
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.adminRegion = region.id;
      button.textContent = "定位到该区域";
      article.append(heading, detail, button);
      regions.append(article);
    });
  }

  private restAtCampfire(): void {
    const resolution = this.session.restAtCampfire();
    this.showFeedbackNotice({
      message: resolution.message,
      tone: resolution.ok ? "success" : "info",
    });
    if (resolution.ok) {
      requiredElement<HTMLElement>(this.root, "#game-root").focus({
        preventScroll: true,
      });
    }
  }

  private leaveCampfire(): void {
    if (!this.session.leaveCampfire()) return;
    requiredElement<HTMLElement>(this.root, "#game-root").focus({
      preventScroll: true,
    });
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
    if (!this.session.closeInventory()) return;
    if (this.session.snapshot().mode === "explore") {
      requiredElement<HTMLElement>(this.root, "#game-root").focus({ preventScroll: true });
    }
  }

  private closeLootMenu(): void {
    if (!this.session.closeLootBundle()) return;
    requiredElement<HTMLElement>(this.root, "#game-root").focus({ preventScroll: true });
  }

  private isInventoryMenuOpen(): boolean {
    return this.inventoryMenu?.classList.contains("is-open") ?? false;
  }

  private isLootMenuOpen(): boolean {
    return this.lootMenu?.classList.contains("is-open") ?? false;
  }

  private handleInventoryAction(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-inventory-action]",
    );
    if (!button) return;
    const action = button.dataset.inventoryAction;
    const itemId = button.dataset.itemId;
    if (!itemId) return;
    const equipment = this.lastSnapshot.equipmentInventory.find(
      (item) => item.instanceId === itemId,
    );
    const consumable = this.lastSnapshot.consumables.find(
      (stack) => stack.item.id === itemId,
    );
    const resolution = action === "equip" && equipment
      ? this.session.equipInventoryItem(equipment.instanceId)
      : action === "discard-equipment" && equipment
        ? this.session.discardInventoryItem(equipment.instanceId)
        : action === "use" && consumable
          ? this.session.useConsumable(consumable.item.id)
          : action === "discard-consumable" && consumable
            ? this.session.discardConsumable(consumable.item.id)
            : null;
    if (!resolution) return;
    this.showFeedbackNotice({
      message: resolution.message,
      tone: resolution.ok ? "success" : "info",
    });
  }

  private handleLootAction(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-loot-action]");
    if (!button) return;
    const bundleId = this.lastSnapshot.activeLootBundleId;
    const dropId = button.dataset.dropId;
    const action = button.dataset.lootAction;
    if (
      !bundleId ||
      !dropId ||
      (action !== "store" && action !== "equip" && action !== "claim")
    ) return;
    const card = button.closest<HTMLElement>("[data-loot-card]");
    const replaceInstanceId = card
      ?.querySelector<HTMLSelectElement>("[data-loot-replacement]")
      ?.value || undefined;
    const item = this.lastSnapshot.lootBundles
      .find((bundle) => bundle.id === bundleId)
      ?.items.find((entry) => entry.dropId === dropId);
    const resolution = this.session.takeLootItem(
      bundleId,
      dropId,
      action,
      replaceInstanceId,
    );
    if (resolution.ok && item) {
      this.presentLootAcquisition([item], resolution.message);
    } else {
      this.showFeedbackNotice({
        message: resolution.message,
        tone: "info",
      });
    }
  }

  private renderInventoryMenu(snapshot: GameSnapshot, entered: boolean): void {
    const open = snapshot.mode === "inventory";
    this.inventoryMenu.hidden = !open;
    this.inventoryMenu.inert = !open;
    this.inventoryMenu.setAttribute("aria-hidden", String(!open));
    this.inventoryMenu.classList.toggle("is-open", open);
    this.root.classList.toggle("inventory-active", open);
    if (!open) return;

    requiredElement(this.inventoryMenu, "#equipment-capacity").textContent =
      `${snapshot.equipmentInventory.length} / 12`;
    requiredElement(this.inventoryMenu, "#consumable-capacity").textContent =
      `${snapshot.consumables.length} / 3`;

    const equippedRoot = requiredElement(this.inventoryMenu, "#equipped-summary");
    equippedRoot.replaceChildren();
    const equippedEntries = [
      {
        slot: "武器",
        name: snapshot.player.weapon.name,
        detail: `伤害 ${snapshot.player.weapon.damage}`,
      },
      {
        slot: "防具",
        name: snapshot.player.armor?.name ?? "未装备",
        detail: snapshot.player.armor
          ? `护甲 ${snapshot.player.armorHp}/${snapshot.player.armor.maxArmor}`
          : "先获得防具，再用护甲承受错误反击",
      },
    ];
    equippedEntries.forEach((entry) => {
      const article = document.createElement("article");
      const slot = document.createElement("span");
      slot.textContent = entry.slot;
      const name = document.createElement("strong");
      name.textContent = entry.name;
      const detail = document.createElement("small");
      detail.textContent = entry.detail;
      article.append(slot, name, detail);
      equippedRoot.append(article);
    });

    const equipmentRoot = requiredElement(this.inventoryMenu, "#equipment-inventory");
    equipmentRoot.replaceChildren();
    if (snapshot.equipmentInventory.length === 0) {
      const empty = document.createElement("p");
      empty.className = "inventory-empty";
      empty.textContent = "装备背包为空。怪物掉落会以一个战利品包出现在地图上。";
      equipmentRoot.append(empty);
    }
    snapshot.equipmentInventory.forEach((item) => {
      const article = document.createElement("article");
      article.className = "inventory-item";
      const title = document.createElement("strong");
      title.textContent = item.weapon?.name ?? item.armor?.name ?? "未知装备";
      const description = document.createElement("p");
      description.textContent = item.weapon?.description ?? item.armor?.description ?? "";
      const stats = document.createElement("code");
      stats.textContent = item.weapon
        ? `武器 · 伤害 ${item.weapon.damage}`
        : `防具 · 护甲 ${item.armorHp ?? 0}/${item.armor?.maxArmor ?? 0}`;
      const actions = document.createElement("div");
      actions.className = "inventory-item__actions";
      const equip = document.createElement("button");
      equip.type = "button";
      equip.dataset.inventoryAction = "equip";
      equip.dataset.itemId = item.instanceId;
      equip.textContent = "装备";
      const discard = document.createElement("button");
      discard.type = "button";
      discard.dataset.inventoryAction = "discard-equipment";
      discard.dataset.itemId = item.instanceId;
      discard.textContent = item.protected ? "课程装备 · 受保护" : "丢到脚下";
      discard.disabled = item.protected;
      actions.append(equip, discard);
      article.append(title, description, stats, actions);
      equipmentRoot.append(article);
    });

    const consumableRoot = requiredElement(this.inventoryMenu, "#consumable-inventory");
    consumableRoot.replaceChildren();
    if (snapshot.consumables.length === 0) {
      const empty = document.createElement("p");
      empty.className = "inventory-empty";
      empty.textContent = "恢复品栏为空（3 格，每格最多堆叠 5 个）。";
      consumableRoot.append(empty);
    }
    snapshot.consumables.forEach((stack) => {
      const article = document.createElement("article");
      article.className = "inventory-item";
      const title = document.createElement("strong");
      title.textContent = `${stack.item.name} × ${stack.quantity}`;
      const description = document.createElement("p");
      description.textContent = stack.item.description;
      const actions = document.createElement("div");
      actions.className = "inventory-item__actions";
      const use = document.createElement("button");
      use.type = "button";
      use.dataset.inventoryAction = "use";
      use.dataset.itemId = stack.item.id;
      use.textContent = "使用";
      const discard = document.createElement("button");
      discard.type = "button";
      discard.dataset.inventoryAction = "discard-consumable";
      discard.dataset.itemId = stack.item.id;
      discard.textContent = "丢 1 个";
      actions.append(use, discard);
      article.append(title, description, actions);
      consumableRoot.append(article);
    });

    const keyRoot = requiredElement(this.inventoryMenu, "#key-inventory");
    keyRoot.replaceChildren();
    if (snapshot.keyItems.length === 0) {
      keyRoot.textContent = "尚未获得本层钥匙。捷径钥匙位于中后段，楼层钥匙由层主掉落。";
    } else {
      snapshot.keyItems.forEach((keyId) => {
        const chip = document.createElement("span");
        chip.textContent = keyId.startsWith("shortcut-key:")
          ? `捷径钥匙 · 第 ${snapshot.floor} 层`
          : keyId.startsWith("floor-")
            ? `楼层钥匙 · ${keyId.match(/\d+/)?.[0] ?? snapshot.floor}`
            : keyId;
        keyRoot.append(chip);
      });
    }

    if (entered) {
      requiredElement<HTMLButtonElement>(this.inventoryMenu, "#close-inventory")
        .focus({ preventScroll: true });
    }
  }

  private renderLootMenu(snapshot: GameSnapshot, entered: boolean): void {
    const bundle = snapshot.activeLootBundleId
      ? snapshot.lootBundles.find((entry) => entry.id === snapshot.activeLootBundleId)
      : null;
    const open = snapshot.mode === "loot" && Boolean(bundle);
    this.lootMenu.hidden = !open;
    this.lootMenu.inert = !open;
    this.lootMenu.setAttribute("aria-hidden", String(!open));
    this.lootMenu.classList.toggle("is-open", open);
    this.root.classList.toggle("loot-active", open);
    if (!open || !bundle) return;

    requiredElement(this.lootMenu, "#loot-menu-title").textContent =
      `战利品包 · ${bundle.items.length} 件`;
    requiredElement(this.lootMenu, "#loot-menu-status").textContent =
      `装备 ${snapshot.equipmentInventory.length}/12 · 恢复品 ${snapshot.consumables.length}/3。每件掉落独立判定，同一战斗不重复。`;
    const root = requiredElement(this.lootMenu, "#loot-items");
    root.replaceChildren();
    const replaceable = snapshot.equipmentInventory.filter((item) => !item.protected);
    bundle.items.forEach((item) => {
      const article = document.createElement("article");
      article.className = `loot-item loot-item--${item.kind}`;
      article.dataset.lootCard = item.dropId;
      const header = document.createElement("div");
      const kind = document.createElement("span");
      kind.textContent = item.guaranteed
        ? "固定奖励"
        : `${Math.round(item.probability * 10_000) / 100}% 独立掉落`;
      const title = document.createElement("strong");
      title.textContent = item.name;
      header.append(kind, title);
      const description = document.createElement("p");
      description.textContent = item.description;
      article.append(header, description);

      if (
        (item.kind === "weapon" || item.kind === "armor") &&
        snapshot.equipmentInventory.length >= 12
      ) {
        const label = document.createElement("label");
        label.textContent = "背包已满，选择留在战利品包中的装备：";
        const select = document.createElement("select");
        select.dataset.lootReplacement = item.dropId;
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = replaceable.length > 0 ? "请选择普通装备" : "没有可替换的普通装备";
        select.append(placeholder);
        replaceable.forEach((entry) => {
          const option = document.createElement("option");
          option.value = entry.instanceId;
          option.textContent = entry.weapon?.name ?? entry.armor?.name ?? entry.instanceId;
          select.append(option);
        });
        label.append(select);
        article.append(label);
      }

      const actions = document.createElement("div");
      actions.className = "inventory-item__actions";
      if (item.kind === "weapon" || item.kind === "armor") {
        const store = document.createElement("button");
        store.type = "button";
        store.dataset.lootAction = "store";
        store.dataset.dropId = item.dropId;
        store.textContent = "收入背包";
        const equip = document.createElement("button");
        equip.type = "button";
        equip.dataset.lootAction = "equip";
        equip.dataset.dropId = item.dropId;
        equip.textContent = "立即装备";
        actions.append(store, equip);
      } else {
        const claim = document.createElement("button");
        claim.type = "button";
        claim.dataset.lootAction = "claim";
        claim.dataset.dropId = item.dropId;
        claim.textContent = item.rewardId === "floor-key" ? "领取钥匙" : "领取";
        actions.append(claim);
      }
      article.append(actions);
      root.append(article);
    });
    if (entered) {
      root.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    }
  }

  private renderCampfireMenu(snapshot: GameSnapshot, entered: boolean): void {
    const open = snapshot.mode === "campfire" && snapshot.activeCampfireId !== null;
    this.campfireMenu.hidden = !open;
    this.campfireMenu.inert = !open;
    this.campfireMenu.setAttribute("aria-hidden", String(!open));
    this.campfireMenu.classList.toggle("is-open", open);
    this.root.classList.toggle("campfire-active", open);
    if (!open) return;

    const campfire = snapshot.campfires.find(
      (entry) => entry.id === snapshot.activeCampfireId,
    );
    const phaseName = campfire?.phase === "front"
      ? "前段篝火"
      : campfire?.phase === "middle"
        ? "中段篝火"
        : "后段篝火";
    requiredElement(this.campfireMenu, "#campfire-menu-title").textContent = phaseName;
    requiredElement(this.campfireMenu, "#campfire-menu-status").textContent =
      `生命 ${snapshot.player.hp}/${snapshot.player.maxHp} · 护甲 ${snapshot.player.armorHp}/${snapshot.player.armor?.maxArmor ?? 0}。休息会全部恢复，并把这里设为复活点；篝火只负责恢复、复活与打开复盘页。`;
    const recap = buildScribeRecap(snapshot.floorReview);
    const campfireBeat = narrativeFloorFor(snapshot.floor).beats.find(
      (beat) => beat.kind === "campfire",
    );
    requiredElement(this.campfireMenu, "#scribe-recap").textContent =
      `${campfireBeat?.lines[0] ?? "抄写员此前留下了本层事实。"} ${recap.summary}`;
    if (entered && !this.isReviewOpen()) {
      requiredElement<HTMLButtonElement>(
        this.campfireMenu,
        "#rest-at-campfire",
      ).focus({ preventScroll: true });
    }
  }

  private isCampfireMenuOpen(): boolean {
    return this.campfireMenu?.classList.contains("is-open") ?? false;
  }

  private renderNarrativeProgress(snapshot: GameSnapshot): void {
    const progress = narrativeProgressForSnapshot(snapshot);
    if (this.narrativeMomentQueuePrimed) {
      this.narrativeMomentQueue.enqueue(progress.unlockedMoments);
    } else {
      if (this.narrativeBootstrapMode === "restored") {
        this.narrativeMomentQueue.primeExisting(progress.unlockedMoments);
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
    if (nextMoment) {
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

  private openRecordOverlay(copy: {
    kicker: string;
    title: string;
    body: string;
    closeLabel: string;
    kind: "inspection" | "story" | "labyrinth";
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
    const confirmButton = requiredElement<HTMLButtonElement>(
      this.inspectionOverlay,
      "#confirm-labyrinth-entry",
    );
    confirmButton.hidden = copy.kind !== "labyrinth";
    this.inspectionOverlay.dataset.recordKind = copy.kind;
    this.hideNarrativeBeatCard();
    this.inspectionOverlay.hidden = false;
    this.inspectionOverlay.inert = false;
    this.inspectionOverlay.setAttribute("aria-hidden", "false");
    this.root.classList.add("inspection-active");
    (copy.kind === "labyrinth"
      ? confirmButton
      : requiredElement<HTMLButtonElement>(this.inspectionOverlay, "#close-inspection")
    ).focus({
      preventScroll: true,
    });
  }

  private confirmLabyrinthEntry(): void {
    const direction = this.pendingLabyrinthMove;
    if (!direction) return;
    if (!this.session.confirmLabyrinthEntry()) {
      this.closeInspection();
      return;
    }
    this.pendingLabyrinthMove = null;
    this.closeInspection(false);
    const resolution = this.session.attemptPlayerMove(direction.x, direction.y);
    if (resolution.ok && resolution.moved) {
      this.feedback.dispatch({ type: "player-step" });
      window.dispatchEvent(new CustomEvent("dungeon:milestone", {
        detail: { type: "player-step" },
      }));
    } else if (!resolution.ok) {
      this.showFeedbackNotice({
        message: resolution.message,
        tone: "info",
      });
    }
    requiredElement<HTMLElement>(this.root, "#game-root").focus({
      preventScroll: true,
    });
  }

  private closeInspection(
    returnFocus = true,
    confirmStory = true,
  ): void {
    if (!this.isInspectionOpen()) return;
    const confirmedMoment = confirmStory &&
        this.inspectionOverlay.dataset.recordKind === "story"
      ? this.activeNarrativeMoment
      : null;
    this.inspectionOverlay.hidden = true;
    this.inspectionOverlay.inert = true;
    this.inspectionOverlay.setAttribute("aria-hidden", "true");
    delete this.inspectionOverlay.dataset.recordKind;
    this.pendingLabyrinthMove = null;
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
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.closest("[inert]") && !element.hasAttribute("hidden"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
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
    const max = Math.max(1, rawMax);
    const value = Math.min(max, Math.max(0, rawValue));
    const progress = requiredElement<HTMLElement>(this.root, progressSelector);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuenow", String(value));
    progress.setAttribute("aria-valuemax", String(max));
    progress.setAttribute("aria-valuetext", valueText);
    requiredElement<HTMLElement>(this.root, barSelector).style.width = `${(value / max) * 100}%`;
  }

  private reset(): void {
    if (this.lastSnapshot.adminMode) {
      const message = "管理员预览不会覆盖正式 Run。刷新页面后再生成新迷宫。";
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
    this.session.reset(createRunSeed());
    this.sql.reset(this.session.snapshot().monsters);
    battleScene?.abortEncounter();
    this.clearQueryArtifacts();
    const message = "新迷宫已生成；永久 SQL 图鉴没有被删除。";
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
      this.inspectionOverlay.dataset.recordKind !== "story"
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

    requiredElement(this.root, "#seed-value").textContent = snapshot.runSeed;
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
    const transitioning = snapshot.mode === "transition" && snapshot.floor < 8;
    const dungeonCleared = snapshot.mode === "victory";
    const narrativePending = this.activeNarrativeMoment !== null ||
      this.narrativeMomentQueue.pendingIds.length > 0;
    const presentationBlocked = this.busy ||
      this.isCombatSettlementVisible() ||
      this.isLootMenuOpen() ||
      this.isInspectionOpen() ||
      narrativePending;
    const transitionVisible = transitioning && !presentationBlocked;
    const victoryVisible = dungeonCleared && !presentationBlocked;
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
        "CONGRATULATIONS!! · MIGRATE 验证完成，等待最终切换";
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
    if (!transitionVisible) {
      if (this.floorTransitionTimer !== null) {
        window.clearTimeout(this.floorTransitionTimer);
        this.floorTransitionTimer = null;
      }
      return;
    }
    if (this.floorTransitionTimer !== null) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 650
      : 1_500;
    this.floorTransitionTimer = window.setTimeout(() => {
      this.floorTransitionTimer = null;
      const current = this.session.snapshot();
      if (current.mode !== "transition" || current.floor >= 8) return;
      if (!this.session.advanceFloor()) return;
      const nextSnapshot = this.session.snapshot();
      this.sql.reset(nextSnapshot.monsters);
      this.clearQueryArtifacts();
      this.audio.setScene({
        floor: nextSnapshot.floor,
        region: 0,
        mode: "explore",
      });
    }, delay);
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
    const identity = target
      ? monsterIdentityPresentation(
        target,
        snapshot.profile.discoveredMonsterIds,
      )
      : null;
    const intentName = target
      ? monsterIntentName(target, snapshot.profile.discoveredMonsterIds)
      : null;
    requiredElement(this.root, "#target-name").textContent =
      identity?.nameLabel ?? "当前房间没有怪物";
    requiredElement(this.root, "#target-id").textContent =
      identity?.idLabel ?? "ID —";
    requiredElement(this.root, "#target-species").textContent =
      identity?.speciesLabel ?? snapshot.currentRoomTitle;
    this.renderProgress(
      "#target-hp-progress",
      "#target-hp-bar",
      target?.hp ?? 0,
      target?.maxHp ?? 1,
      target ? `${target.hp} / ${target.maxHp}` : "当前没有怪物",
    );
    requiredElement(this.root, "#target-hp-value").textContent = target
      ? `${target.hp} / ${target.maxHp}`
      : "— / —";
    requiredElement(this.root, "#target-intent").textContent = snapshot.combat
      ? `${intentName ?? "攻击正在蓄力"} · 最高 ${snapshot.combat.intent.damage} 伤害`
      : target?.hp === 0
        ? "记录已清除"
        : target
          ? `${intentName} · 最高 ${target.damage} 伤害`
          : snapshot.claimableReward?.name ?? "探索 / 领取";
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
    const root = requiredElement(this.root, "#lock-list");
    root.replaceChildren();
    snapshot.locks.forEach((lock) => {
      const chip = document.createElement("span");
      chip.textContent = lock;
      root.append(chip);
    });
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
    root.replaceChildren();
    parseSchemaLines(schemaLines).forEach((table) => {
      const article = document.createElement("article");
      const title = document.createElement("strong");
      title.textContent = table.name;
      const fields = document.createElement("code");
      fields.textContent = table.columns.join(", ");
      article.append(title, fields);
      root.append(article);
    });
  }

  private renderSchemaCodex(): void {
    const selectedTable = sqlTable(this.selectedSchemaTable);
    const tabs = requiredElement(this.root, "#schema-table-tabs");
    const panel = requiredElement(this.root, "#schema-table-panel");
    const trace = requiredElement(this.root, "#schema-relation-trace");
    tabs.replaceChildren();
    panel.replaceChildren();
    trace.replaceChildren();

    SQL_TABLES.forEach((table) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `schema-tab-${table.name}`;
      button.dataset.schemaTable = table.name;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(table.name === selectedTable.name));
      button.setAttribute("aria-controls", "schema-table-panel");
      button.tabIndex = table.name === selectedTable.name ? 0 : -1;
      button.textContent = table.name;
      tabs.append(button);
    });

    panel.setAttribute("aria-labelledby", `schema-tab-${selectedTable.name}`);
    const heading = document.createElement("div");
    heading.className = "schema-table-heading";
    const title = document.createElement("strong");
    title.textContent = selectedTable.name;
    const subtitle = document.createElement("span");
    subtitle.textContent = selectedTable.title;
    heading.append(title, subtitle);
    const description = document.createElement("p");
    description.textContent = selectedTable.description;
    const columnList = document.createElement("div");
    columnList.className = "schema-column-list";

    selectedTable.columns.forEach((column) => {
      const relation = SQL_RELATIONS.find((entry) => (
        entry.fromTable === selectedTable.name && entry.fromColumn === column.name
      ));
      const row = document.createElement("div");
      row.className = "schema-column-row";
      const name = document.createElement("code");
      name.textContent = column.name;
      const type = document.createElement("span");
      type.className = "schema-column-type";
      type.textContent = column.type;
      const badges = document.createElement("span");
      badges.className = "schema-column-badges";
      if (column.primaryKey) badges.append(this.schemaBadge("PK", "primary"));
      if (relation) badges.append(this.schemaBadge("REF", "reference"));
      badges.append(this.schemaBadge(column.nullable ? "NULL" : "NOT NULL", "nullability"));
      const detail = document.createElement("small");
      detail.textContent = relation
        ? `${column.description} → ${relation.toTable}.${relation.toColumn}`
        : column.description;
      row.append(name, type, badges, detail);
      columnList.append(row);
    });

    panel.append(heading, description, columnList);

    const relationTitle = document.createElement("strong");
    relationTitle.textContent = "RELATION TRACE / 关系追踪";
    trace.append(relationTitle);
    const relations = SQL_RELATIONS.filter((relation) => (
      relation.fromTable === selectedTable.name || relation.toTable === selectedTable.name
    ));
    relations.forEach((relation) => {
      const line = document.createElement("code");
      line.textContent = `${relation.fromTable}.${relation.fromColumn} → ${
        relation.toTable
      }.${relation.toColumn} · ${relation.description}`;
      trace.append(line);
    });
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

  private schemaBadge(
    label: string,
    kind: "primary" | "reference" | "nullability",
  ): HTMLElement {
    const badge = document.createElement("i");
    badge.dataset.kind = kind;
    badge.textContent = label;
    return badge;
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
    const root = requiredElement(this.root, "#castle-map");
    root.replaceChildren();
    const floor = snapshot.mazeFloor;
    const discovered = new Set(snapshot.discoveredCells);
    const currentSight = this.minimapCurrentSight(snapshot);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${floor.width} ${floor.height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("focusable", "false");
    svg.setAttribute(
      "aria-label",
      `${snapshot.mazeFloor.width} × ${snapshot.mazeFloor.height} 迷宫小地图，已探索 ${discovered.size} 格；未知区域隐藏。`,
    );
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = "发现式迷宫小地图：移动探索后才会显示地面、门、怪物和道具。";
    svg.append(title);

    const floorCommands: string[] = [];
    discovered.forEach((cell) => {
      const [x, y] = cell.split(":").map(Number);
      if (
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        floor.tiles[y]?.[x] === "."
      ) {
        floorCommands.push(`M${x} ${y}h1v1h-1z`);
      }
    });
    if (floorCommands.length > 0) {
      const paths = document.createElementNS(SVG_NS, "path");
      paths.classList.add("minimap-floor");
      paths.setAttribute("d", floorCommands.join(""));
      svg.append(paths);
    }
    const revealedMarkers = snapshot.guidedMap.routeMarkers.filter(
      (marker) => discovered.has(`${marker.x}:${marker.y}`),
    ).length;
    requiredElement(this.root, "#map-explored").textContent =
      `${floorCommands.length} 格 · ${revealedMarkers} 信标`;

    floor.gates.forEach((gate) => {
      if (!discovered.has(`${gate.x}:${gate.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-gate");
      const locked = !snapshot.availableRoomIds.includes(gate.roomNodeId);
      marker.classList.add(locked ? "is-locked" : "is-open");
      marker.setAttribute("x", String(gate.x + 0.15));
      marker.setAttribute("y", String(gate.y + 0.05));
      marker.setAttribute("width", "0.7");
      marker.setAttribute("height", "0.9");
      svg.append(marker);
    });

    snapshot.guidedMap.routeMarkers.forEach((routeMarker) => {
      if (!discovered.has(`${routeMarker.x}:${routeMarker.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "circle");
      marker.classList.add("minimap-route", `is-${routeMarker.phase}`);
      marker.setAttribute("cx", String(routeMarker.x + 0.5));
      marker.setAttribute("cy", String(routeMarker.y + 0.5));
      marker.setAttribute("r", "0.26");
      svg.append(marker);
    });
    snapshot.guidedMap.shortcuts.forEach((shortcut) => {
      const open = snapshot.openedGateIds.includes(shortcut.id);
      [shortcut.entry, shortcut.exit].forEach((position) => {
        if (!discovered.has(`${position.x}:${position.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "rect");
        marker.classList.add("minimap-shortcut", open ? "is-open" : "is-locked");
        marker.setAttribute("x", String(position.x + 0.14));
        marker.setAttribute("y", String(position.y + 0.14));
        marker.setAttribute("width", "0.72");
        marker.setAttribute("height", "0.72");
        svg.append(marker);
      });
    });
    const regionPortals = regionPortalsEnabledForFloor(snapshot.floor)
      ? snapshot.biomePlan.portals
      : [];
    regionPortals.forEach((portal) => {
      [portal.entry, portal.exit].forEach((position) => {
        if (!discovered.has(`${position.x}:${position.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "circle");
        marker.classList.add("minimap-region-portal");
        marker.setAttribute("cx", String(position.x + 0.5));
        marker.setAttribute("cy", String(position.y + 0.5));
        marker.setAttribute("r", "0.42");
        svg.append(marker);
      });
    });

    snapshot.campfires.forEach((campfire) => {
      if (!discovered.has(`${campfire.x}:${campfire.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "circle");
      marker.classList.add("minimap-campfire");
      if (snapshot.respawnCampfireId === campfire.id) {
        marker.classList.add("is-checkpoint");
      }
      marker.setAttribute("cx", String(campfire.x + 0.5));
      marker.setAttribute("cy", String(campfire.y + 0.5));
      marker.setAttribute("r", "0.48");
      svg.append(marker);
    });

    snapshot.worldActors.forEach((actor) => {
      const monster = snapshot.monsters.find((entry) => entry.id === actor.monsterId);
      if (!monster || monster.hp <= 0) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-monster");
      if (monster.isBoss) marker.classList.add("is-boss");
      marker.dataset.monsterId = String(monster.id);
      marker.setAttribute("x", String(actor.x + 0.12));
      marker.setAttribute("y", String(actor.y + 0.12));
      marker.setAttribute("width", "0.76");
      marker.setAttribute("height", "0.76");
      marker.setAttribute(
        "visibility",
        currentSight.has(`${actor.x}:${actor.y}`) ? "visible" : "hidden",
      );
      svg.append(marker);
    });

    snapshot.groundItems.forEach((item) => {
      if (!discovered.has(`${item.x}:${item.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-item", `is-${item.kind}`);
      marker.setAttribute("x", String(item.x + 0.22));
      marker.setAttribute("y", String(item.y + 0.22));
      marker.setAttribute("width", "0.56");
      marker.setAttribute("height", "0.56");
      marker.setAttribute("transform", `rotate(45 ${item.x + 0.5} ${item.y + 0.5})`);
      svg.append(marker);
    });
    snapshot.guidedMap.shortcuts
      .filter((shortcut) => !snapshot.keyItems.includes(shortcut.keyId))
      .forEach((shortcut) => {
        if (!discovered.has(`${shortcut.keyPosition.x}:${shortcut.keyPosition.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "rect");
        marker.classList.add("minimap-item", "is-key");
        marker.setAttribute("x", String(shortcut.keyPosition.x + 0.22));
        marker.setAttribute("y", String(shortcut.keyPosition.y + 0.22));
        marker.setAttribute("width", "0.56");
        marker.setAttribute("height", "0.56");
        marker.setAttribute(
          "transform",
          `rotate(45 ${shortcut.keyPosition.x + 0.5} ${shortcut.keyPosition.y + 0.5})`,
        );
        svg.append(marker);
      });
    snapshot.guidedMap.deadEndCaches
      .filter((cache) => !snapshot.openedGateIds.includes(cache.id))
      .forEach((cache) => {
        if (!discovered.has(`${cache.x}:${cache.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "rect");
        marker.classList.add("minimap-item", "is-guided-cache");
        marker.setAttribute("x", String(cache.x + 0.18));
        marker.setAttribute("y", String(cache.y + 0.22));
        marker.setAttribute("width", "0.64");
        marker.setAttribute("height", "0.56");
        svg.append(marker);
      });
    snapshot.lootBundles.forEach((bundle) => {
      if (!discovered.has(`${bundle.x}:${bundle.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-item", "is-loot-bundle");
      marker.setAttribute("x", String(bundle.x + 0.15));
      marker.setAttribute("y", String(bundle.y + 0.2));
      marker.setAttribute("width", "0.7");
      marker.setAttribute("height", "0.6");
      svg.append(marker);
    });

    const player = document.createElementNS(SVG_NS, "circle");
    player.classList.add("minimap-player");
    player.setAttribute("cx", String(snapshot.player.x + 0.5));
    player.setAttribute("cy", String(snapshot.player.y + 0.5));
    player.setAttribute("r", "0.62");
    svg.append(player);
    root.append(svg);
  }

  private minimapCurrentSight(snapshot: GameSnapshot): Set<string> {
    return snapshot.adminMode
      ? new Set(snapshot.discoveredCells)
      : floorCurrentSightCellKeys(
          snapshot.floor,
          snapshot.mazeFloor,
          snapshot.campfires,
          snapshot.player,
        );
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
    this.renderResultInto(result, this.resultRoot, this.planRoot, disclosure);
  }

  private renderResultInto(
    result: SqlQueryResult,
    resultRoot: HTMLElement,
    planRoot: HTMLElement,
    disclosure: QueryResultDisclosure = "shape-only",
  ): void {
    const snapshot = this.session.snapshot();
    const visibleResult = disclosure === "shape-only"
      ? result
      : redactUndiscoveredQueryIdentities(
          result,
          snapshot.monsters,
          snapshot.profile.discoveredMonsterIds,
        );
    resultRoot.replaceChildren();
    resultRoot.className = "table-wrap";
    if (disclosure === "shape-only") {
      resultRoot.classList.add("result-shape");
      const copy = shapeOnlyQueryResultCopy(result);
      const title = document.createElement("strong");
      title.textContent = copy.title;
      const detail = document.createElement("p");
      detail.textContent = copy.detail;
      resultRoot.append(title, detail);
    } else if (visibleResult.rows.length === 0) {
      resultRoot.classList.add("empty-state");
      resultRoot.textContent = "查询返回 0 行。";
    } else {
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      visibleResult.columns.forEach((column) => {
        const cell = document.createElement("th");
        cell.textContent = column;
        headRow.append(cell);
      });
      head.append(headRow);
      table.append(head);
      const body = document.createElement("tbody");
      visibleResult.rows.forEach((row) => {
        const rowElement = document.createElement("tr");
        visibleResult.columns.forEach((column) => {
          const cell = document.createElement("td");
          const value = row[column];
          cell.textContent = value === null ? "NULL" : String(value ?? "");
          rowElement.append(cell);
        });
        body.append(rowElement);
      });
      table.append(body);
      resultRoot.append(table);
    }

    planRoot.replaceChildren();
    planRoot.className = "plan-list";
    visibleResult.plan.forEach((detail, index) => {
      const line = document.createElement("div");
      line.className = "plan-line";
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const text = document.createElement("code");
      text.textContent = detail;
      line.append(number, text);
      planRoot.append(line);
    });
    if (visibleResult.plan.length === 0) {
      planRoot.classList.add("empty-state");
      planRoot.textContent = "SQLite 未返回查询计划。";
    }
  }

  private clearQueryArtifacts(): void {
    this.resultRoot.className = "table-wrap empty-state";
    this.resultRoot.textContent = "尚未执行本回合查询。";
    this.planRoot.className = "plan-list empty-state";
    this.planRoot.textContent = "等待 EXPLAIN QUERY PLAN。";
  }
}
