import {
  floorExperience,
  type FloorEnvironmentRuleDefinition,
  type StoryAction,
  type StoryEventDefinition,
} from "../content/floorExperience";
import { narrativeFloorFor } from "./narrative";
import {
  storyQuery,
  type StoryQueryDefinition,
  type StoryQueryId,
} from "../sql/storyQueryCatalog";
import type { FloorNumber, RunLessonId } from "./runGraph";

export type FloorStoryMomentKind =
  | "entry"
  | "world-change"
  | "evidence"
  | "secret"
  | "scribe"
  | "boss"
  | "ascent";

export type FloorStoryPresentation = "blocking" | "ambient" | "inspect";

type StoryFloor = FloorNumber;

export type FloorStoryUnlock =
  | { type: "floor-entered" }
  | { type: "lesson-completed"; lessonId: RunLessonId }
  | { type: "monster-defeated"; monsterId: number }
  | { type: "shortcut-opened"; floor: StoryFloor }
  | { type: "gate-opened"; gateId: string }
  | { type: "floor-completed" };

export interface FloorStoryMoment {
  id: string;
  floor: StoryFloor;
  kind: FloorStoryMomentKind;
  presentation: FloorStoryPresentation;
  kicker: string;
  title: string;
  lines: readonly string[];
  archiveLine: string;
  actions: readonly StoryAction[];
  unlock: FloorStoryUnlock;
  sourceId: string;
  inspectLandmarkId: string | null;
  query: StoryQueryDefinition | null;
}

export interface FloorStoryState {
  floor: FloorNumber;
  mode: "transition" | "victory" | string;
  completedLessons: readonly RunLessonId[];
  defeatedMonsterIds: readonly number[];
  openedGateIds: readonly string[];
}

export interface FloorStoryProgress {
  unlocked: readonly FloorStoryMoment[];
  unlockedIds: readonly string[];
  latest: FloorStoryMoment | null;
  total: number;
}

interface LandmarkStoryEvidenceRoute {
  queryId: StoryQueryId;
  evidenceId?: string;
  lessonId?: RunLessonId;
  gateId?: string;
}

const LANDMARK_STORY_EVIDENCE: Readonly<
  Record<string, LandmarkStoryEvidenceRoute>
> = {
  "f1-water-wheel": {
    queryId: "f1-current-resident",
    evidenceId: "lost-name:f1:current-record",
  },
  "f1-sealed-vault": {
    queryId: "f1-restore-contradiction",
    gateId: "gate:floor-1-treasure",
  },
  "f2-ranked-beacons": {
    queryId: "f2-seven-source-pages",
    evidenceId: "lost-name:f2:identity-count",
  },
  "f2-wreck-ledger": {
    queryId: "f2-seven-source-summary",
    gateId: "gate:floor-2-treasure",
  },
  "f3-master-steles": {
    queryId: "f3-unarmed-record-preserved",
    lessonId: "f3-left",
  },
  "f3-relic-chain": {
    queryId: "f3-room-relic-chain",
    evidenceId: "lost-name:f3:relic-links",
    lessonId: "f3-chain",
  },
  "f4-source-core": {
    queryId: "f4-three-incident-fronts",
    evidenceId: "lost-name:f4:command-batch",
    lessonId: "f4-scalar",
  },
  "f4-dependency-spine": {
    queryId: "f4-dependency-lineage",
    lessonId: "f4-recursive",
  },
  "f5-muster-board": {
    queryId: "f5-stable-duty-order",
    evidenceId: "lost-name:f5:history-positions",
    lessonId: "f5-row-number",
  },
  "f5-rank-standards": {
    queryId: "f5-ties-preserved",
    lessonId: "f5-rank",
  },
  "f6-cleanup-sluice": {
    queryId: "f6-duplicate-candidates",
    lessonId: "f6-delete",
  },
  "f6-state-bridge": {
    queryId: "f6-baseline-restored",
    evidenceId: "lost-name:f6:undo-origin",
    lessonId: "f6-transaction",
  },
  "f7-index-road": {
    queryId: "f7-all-realms-present",
    evidenceId: "lost-name:f7:hidden-history",
    lessonId: "f7-composite",
  },
  "f7-plan-tree": {
    queryId: "f7-crystal-plan-candidates",
    lessonId: "f7-plan",
  },
  "f8-version-gallery": {
    queryId: "f8-visible-snapshot",
    evidenceId: "lost-name:f8:identity-set",
    lessonId: "f8-mvcc",
  },
  "f8-deadlock-gate": {
    queryId: "f8-deadlock-cycle",
    lessonId: "f8-lock",
  },
};

const STORY_EVIDENCE_MARKER_PREFIX = "story:evidence:";

export function floorStoryEvidenceIdForLandmark(
  landmarkId: string,
): string | null {
  return LANDMARK_STORY_EVIDENCE[landmarkId]?.evidenceId ?? null;
}

export function storyEvidenceMarkerId(evidenceId: string): string {
  return `${STORY_EVIDENCE_MARKER_PREFIX}${evidenceId}`;
}

export function storyEvidenceIdFromMarker(markerId: string): string | null {
  if (!markerId.startsWith(STORY_EVIDENCE_MARKER_PREFIX)) return null;
  const evidenceId = markerId.slice(STORY_EVIDENCE_MARKER_PREFIX.length);
  return evidenceId.length > 0 ? evidenceId : null;
}

export function storyEvidenceMarkerIdsForFloor(
  floor: FloorNumber,
): readonly string[] {
  return narrativeFloorFor(floor).lostNameEvidence.map((evidence) =>
    storyEvidenceMarkerId(evidence.id)
  );
}

export function floorStoryEvidenceQueryForLandmark(
  landmarkId: string,
  completedLessons: ReadonlySet<RunLessonId>,
  openedGateIds: ReadonlySet<string>,
): StoryQueryDefinition | null {
  const route = LANDMARK_STORY_EVIDENCE[landmarkId];
  if (!route) return null;
  if (route.lessonId && !completedLessons.has(route.lessonId)) return null;
  if (route.gateId && !openedGateIds.has(route.gateId)) return null;
  return storyQuery(route.queryId);
}

/**
 * 面向 UI 的剧情片段先进先出队列，由同步 Run 更新负责解锁。
 *
 * 片段进入队列时即被记录，但只有调用方真正开始展示时才会移除。这样可以
 * 防止战斗结算层误消费剧情卡，也能在一次更新解锁多个片段时保持设计顺序，
 * 例如同一时刻解锁楼层 Boss 结算和登层结论。
 */
export class FloorStoryMomentQueue {
  private readonly recordedIds = new Set<string>();
  private readonly pending: FloorStoryMoment[] = [];

  primeExisting(moments: readonly FloorStoryMoment[]): void {
    moments.forEach((moment) => this.recordedIds.add(moment.id));
  }

  /**
   * @deprecated 恢复已有 Run 时请使用 primeExisting。展示调用方迁移期间，
   * 暂时保留该兼容别名。
   */
  prime(moments: readonly FloorStoryMoment[]): void {
    this.primeExisting(moments);
  }

  enqueue(moments: readonly FloorStoryMoment[]): void {
    moments.forEach((moment) => {
      if (this.recordedIds.has(moment.id)) return;
      this.recordedIds.add(moment.id);
      if (moment.presentation === "inspect") return;
      this.pending.push(moment);
    });
  }

  peekNext(): FloorStoryMoment | null {
    return this.pending[0] ?? null;
  }

  ackPresented(momentId?: string): FloorStoryMoment | null {
    const next = this.peekNext();
    if (!next || (momentId !== undefined && next.id !== momentId)) return null;
    return this.pending.shift() ?? null;
  }

  /**
   * @deprecated 请先调用 peekNext，并在展示真正开始后调用 ackPresented，
   * 避免 UI 暂时被阻挡时丢失剧情片段。
   */
  takeNext(): FloorStoryMoment | null {
    const next = this.peekNext();
    if (!next) return null;
    return this.ackPresented(next.id);
  }

  get pendingIds(): readonly string[] {
    return this.pending.map((moment) => moment.id);
  }

  clear(): void {
    this.recordedIds.clear();
    this.pending.length = 0;
  }
}

type CanonicalStorySource =
  | { type: "event"; id: string }
  | { type: "rule"; id: string }
  | { type: "floor-end" };

interface FloorStoryRoute {
  source: CanonicalStorySource;
  kind: FloorStoryMomentKind;
  presentation: FloorStoryPresentation;
  inspectLandmarkId?: string;
  queryId?: StoryQueryId;
}

const FLOOR_STORY_ROUTES: Readonly<Record<StoryFloor, readonly FloorStoryRoute[]>> = {
  1: [
    {
      source: { type: "event", id: "f1-story-fire-remembers" },
      kind: "entry",
      presentation: "blocking",
      queryId: "f1-current-resident",
    },
    {
      source: { type: "rule", id: "f1-wheel-turning" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f1-water-low" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f1-beds-revealed" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f1-story-sealed-vault" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f1-sealed-vault",
    },
    {
      source: { type: "event", id: "f1-story-shortcut-return" },
      kind: "scribe",
      presentation: "inspect",
      inspectLandmarkId: "npc-scribe-f1",
    },
    {
      source: { type: "rule", id: "f1-receipts-grouped" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f1-restore-contradiction",
    },
    {
      source: { type: "event", id: "f1-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f1-story-first-page" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  2: [
    {
      source: { type: "event", id: "f2-story-seven-wet-pages" },
      kind: "entry",
      presentation: "blocking",
      queryId: "f2-seven-source-pages",
    },
    {
      source: { type: "rule", id: "f2-beacons-ranked" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f2-channels-distinct" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f2-story-wreck-ledger" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f2-wreck-ledger",
    },
    {
      source: { type: "rule", id: "f2-root-linked" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f2-missing-gear" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f2-story-frog-court" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f2-story-low-tide" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f2-story-seven-reflections" },
      kind: "scribe",
      presentation: "inspect",
      inspectLandmarkId: "npc-scribe-f2",
    },
    {
      source: { type: "event", id: "f2-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f2-story-seven-pages" },
      kind: "boss",
      presentation: "blocking",
      queryId: "f2-seven-source-summary",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  3: [
    {
      source: { type: "event", id: "f3-story-no-owner" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f3-bone-linked" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f3-unarmed-kept" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f3-unarmed-record-preserved",
    },
    {
      source: { type: "rule", id: "f3-steles-aliased" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f3-story-reliquary" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f3-reliquary",
    },
    {
      source: { type: "rule", id: "f3-relic-chain" },
      kind: "world-change",
      presentation: "ambient",
      queryId: "f3-room-relic-chain",
    },
    {
      source: { type: "event", id: "f3-story-grave-lord" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f3-witnesses-united" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f3-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f3-story-audit-complete" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  4: [
    {
      source: { type: "event", id: "f4-story-one-command" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f4-source-identified" },
      kind: "world-change",
      presentation: "ambient",
      queryId: "f4-three-incident-fronts",
    },
    {
      source: { type: "rule", id: "f4-frost-selected" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f4-existence-proved" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f4-story-forge-lord" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f4-story-ember-echo" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f4-echo-gate",
    },
    {
      source: { type: "rule", id: "f4-correlations-linked" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f4-cte-named" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f4-recursive-traced" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f4-dependency-lineage",
    },
    {
      source: { type: "event", id: "f4-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f4-story-open-transaction" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  5: [
    {
      source: { type: "event", id: "f5-story-ordered-people" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f5-partitions-visible" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f5-positions-numbered" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f5-stable-duty-order",
    },
    {
      source: { type: "rule", id: "f5-ties-visible" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f5-ties-preserved",
    },
    {
      source: { type: "rule", id: "f5-patrol-linked" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f5-story-barracks-open" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f5-story-silent-roster" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f5-silent-roster",
    },
    {
      source: { type: "event", id: "f5-story-silence-is-order" },
      kind: "scribe",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f5-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f5-story-clock-reordered" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  6: [
    {
      source: { type: "event", id: "f6-story-change-can-return" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f6-row-inserted" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f6-row-updated" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f6-duplicate-targeted" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f6-duplicate-candidates",
    },
    {
      source: { type: "rule", id: "f6-constraint-protected" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f6-story-crystal-cavern-open" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f6-story-rookery" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f6-uncommitted-rookery",
    },
    {
      source: { type: "rule", id: "f6-transaction-rolled-back" },
      kind: "world-change",
      presentation: "ambient",
      queryId: "f6-baseline-restored",
    },
    {
      source: { type: "event", id: "f6-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f6-savepoint-validated" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f6-story-safe-change" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  7: [
    {
      source: { type: "event", id: "f7-story-unreached" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f7-point-search-lit" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f7-composite-lit" },
      kind: "world-change",
      presentation: "ambient",
      queryId: "f7-all-realms-present",
    },
    {
      source: { type: "rule", id: "f7-covering-reflection" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f7-range-root-open" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f7-story-root-cloister-open" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f7-story-blind-garden" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f7-blind-garden",
    },
    {
      source: { type: "rule", id: "f7-plan-explained" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f7-crystal-plan-candidates",
    },
    {
      source: { type: "event", id: "f7-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f7-story-paths-compared" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  8: [
    {
      source: { type: "event", id: "f8-story-unfinished-kingdom" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f8-snapshot-visible" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f8-visible-snapshot",
    },
    {
      source: { type: "rule", id: "f8-cycle-exposed" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f8-deadlock-cycle",
    },
    {
      source: { type: "rule", id: "f8-isolation-wing" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f8-model-wing" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f8-replica-wing" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f8-shard-ready" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f8-story-void-court-open" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f8-story-zero-row-chapel" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f8-zero-row-chapel",
    },
    {
      source: { type: "event", id: "f8-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f8-story-migrate" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "ambient",
    },
  ],
};

const AREA_BOSS_STORY_MONSTER_IDS: Readonly<
  Record<StoryFloor, number | null>
> = {
  1: null,
  2: 22,
  3: 33,
  4: 44,
  5: 55,
  6: 66,
  7: 77,
  8: 89,
};

function parseCanonicalTrigger(trigger: string): FloorStoryUnlock {
  if (trigger === "floor-entered") return { type: "floor-entered" };
  const lesson = trigger.match(/^lesson:(.+):completed$/)?.[1];
  if (lesson) {
    return {
      type: "lesson-completed",
      lessonId: lesson as RunLessonId,
    };
  }
  const monster = trigger.match(/^monster:(\d+):defeated$/)?.[1];
  if (monster) {
    return { type: "monster-defeated", monsterId: Number(monster) };
  }
  const shortcutFloor = trigger.match(
    /^gate:shortcut:f?([1-8])(?::[^:]+)?:opened$/,
  )?.[1];
  if (shortcutFloor) {
    return {
      type: "shortcut-opened",
      floor: Number(shortcutFloor) as StoryFloor,
    };
  }
  const gateId = trigger.match(/^(gate:.+):opened$/)?.[1];
  if (gateId) return { type: "gate-opened", gateId };
  throw new Error(`不支持的剧情触发条件：${trigger}`);
}

function eventLines(event: StoryEventDefinition): readonly string[] {
  const dialogue = event.actions.flatMap((action) => (
    action.type === "dialogue" ? action.lines : []
  ));
  if (dialogue.length > 0) return dialogue.slice(0, 2);
  const banner = event.actions.find((action) => action.type === "banner");
  return banner?.type === "banner" ? [banner.text] : [event.title];
}

function momentFromEvent(
  floor: StoryFloor,
  event: StoryEventDefinition,
  route: FloorStoryRoute,
): FloorStoryMoment {
  const query = route.queryId ? storyQuery(route.queryId) : null;
  const lines = [...eventLines(event)];
  if (query && lines.length < 2) lines.push(query.purpose);
  return {
    id: `story:${event.id}`,
    floor,
    kind: route.kind,
    presentation: route.presentation,
    kicker: `${route.kind === "entry" ? "DISCOVERY" : "STORY"} / ${event.title}`,
    title: event.title,
    lines: lines.slice(0, 2),
    archiveLine: query?.purpose ?? lines.join(" "),
    actions: [...event.actions],
    unlock: parseCanonicalTrigger(event.trigger),
    sourceId: event.id,
    inspectLandmarkId: route.inspectLandmarkId ?? null,
    query,
  };
}

function ruleLessonId(
  rule: FloorEnvironmentRuleDefinition,
): RunLessonId | null {
  const lesson = rule.when.match(/^(.+):(?:not-)?completed$/)?.[1];
  return lesson ? lesson as RunLessonId : null;
}

function momentFromRule(
  floor: StoryFloor,
  rule: FloorEnvironmentRuleDefinition,
  route: FloorStoryRoute,
): FloorStoryMoment {
  const query = route.queryId ? storyQuery(route.queryId) : null;
  const lessonId = ruleLessonId(rule);
  if (!lessonId) {
    throw new Error(`环境规则 ${rule.id} 缺少课程完成触发条件。`);
  }
  return {
    id: `story:${rule.id}`,
    floor,
    kind: route.kind,
    presentation: route.presentation,
    kicker: `WORLD CHANGE / ${lessonId.toUpperCase()}`,
    title: rule.visibleResult,
    lines: [
      `查询结算：${lessonId.toUpperCase()}。`,
      ...(query ? [query.purpose] : []),
    ].slice(0, 2),
    archiveLine: query?.purpose ?? rule.visibleResult,
    actions: [],
    unlock: { type: "lesson-completed", lessonId },
    sourceId: rule.id,
    inspectLandmarkId: route.inspectLandmarkId ?? null,
    query,
  };
}

function momentFromFloorEnd(
  floor: StoryFloor,
  route: FloorStoryRoute,
): FloorStoryMoment {
  const beat = narrativeFloorFor(floor).beats.find(
    (entry) => entry.kind === "floor-end",
  );
  if (!beat) throw new Error(`第 ${floor} 层缺少层末叙事拍。`);
  return {
    id: `story:${beat.id}`,
    floor,
    kind: route.kind,
    presentation: route.presentation,
    kicker: "ASCENT / 本层结论",
    title: beat.title,
    lines: beat.lines.slice(0, 2),
    archiveLine: beat.lines.join(" "),
    actions: [],
    unlock: { type: "floor-completed" },
    sourceId: beat.id,
    inspectLandmarkId: route.inspectLandmarkId ?? null,
    query: null,
  };
}

export function floorStoryMoments(
  floor: FloorNumber,
): readonly FloorStoryMoment[] {
  if (floor < 1 || floor > 8) return [];
  const storyFloor = floor as StoryFloor;
  const experience = floorExperience(storyFloor);
  return FLOOR_STORY_ROUTES[storyFloor].map((route) => {
    const source = route.source;
    if (source.type === "floor-end") {
      return momentFromFloorEnd(storyFloor, route);
    }
    if (source.type === "event") {
      const event = experience.storyEvents.find(
        (entry) => entry.id === source.id,
      );
      if (!event) throw new Error(`第 ${floor} 层缺少剧情事件 ${source.id}。`);
      return momentFromEvent(storyFloor, event, route);
    }
    const rule = experience.environmentRules.find(
      (entry) => entry.id === source.id,
    );
    if (!rule) throw new Error(`第 ${floor} 层缺少环境规则 ${source.id}。`);
    return momentFromRule(storyFloor, rule, route);
  });
}

function shortcutOpened(
  floor: StoryFloor,
  openedGateIds: readonly string[],
): boolean {
  return openedGateIds.some((id) => (
    id === `shortcut:f${floor}` ||
    id === `shortcut:${floor}` ||
    id.startsWith(`shortcut:${floor}:`) ||
    id.includes(`:${floor}:shortcut`) ||
    id.includes(`floor-${floor}`) && id.includes("shortcut")
  ));
}

function isUnlocked(
  moment: FloorStoryMoment,
  state: FloorStoryState,
): boolean {
  switch (moment.unlock.type) {
    case "floor-entered":
      return true;
    case "lesson-completed":
      return state.completedLessons.includes(moment.unlock.lessonId);
    case "monster-defeated":
      return state.defeatedMonsterIds.includes(moment.unlock.monsterId);
    case "shortcut-opened":
      return shortcutOpened(moment.unlock.floor, state.openedGateIds);
    case "gate-opened":
      return state.openedGateIds.includes(moment.unlock.gateId);
    case "floor-completed":
      return state.mode === "transition" || state.mode === "victory";
  }
}

export function floorStoryProgress(
  state: FloorStoryState,
): FloorStoryProgress {
  const moments = floorStoryMoments(state.floor);
  const unlocked = moments.filter((moment) => isUnlocked(moment, state));
  return {
    unlocked,
    unlockedIds: unlocked.map((moment) => moment.id),
    latest: unlocked.at(-1) ?? null,
    total: moments.length,
  };
}

/**
 * 将一次真实的 E 地标调查解析为已经满足解锁条件的 inspect 剧情。
 * inspect 节点不会进入自动队列；它们只能通过显式绑定的地标或 NPC
 * 主动读取，并允许玩家之后重复查看。
 */
export function floorStoryInspectMomentForLandmark(
  state: FloorStoryState,
  landmarkId: string,
): FloorStoryMoment | null {
  return floorStoryProgress(state).unlocked.find((moment) => (
    moment.presentation === "inspect" &&
    moment.inspectLandmarkId === landmarkId
  )) ?? null;
}

export function validateFloorStoryContent(
  moments: readonly FloorStoryMoment[] = [
    ...floorStoryMoments(1),
    ...floorStoryMoments(2),
    ...floorStoryMoments(3),
    ...floorStoryMoments(4),
    ...floorStoryMoments(5),
    ...floorStoryMoments(6),
    ...floorStoryMoments(7),
    ...floorStoryMoments(8),
  ],
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const canonicalEvidenceIds = new Set(
    ([1, 2, 3, 4, 5, 6, 7, 8] as const).flatMap((floor) =>
      narrativeFloorFor(floor).lostNameEvidence.map((evidence) => evidence.id)
    ),
  );
  const mappedEvidenceIds = new Set<string>();
  const sourcedEvidenceIds = new Set<string>();

  Object.entries(LANDMARK_STORY_EVIDENCE).forEach(([landmarkId, route]) => {
    if (!route.evidenceId) return;
    if (!canonicalEvidenceIds.has(route.evidenceId)) {
      errors.push(
        `剧情地标 ${landmarkId} 引用了不存在的失名证据 ${route.evidenceId}。`,
      );
    }
    if (mappedEvidenceIds.has(route.evidenceId)) {
      errors.push(`失名证据 ${route.evidenceId} 被多个查询地标重复绑定。`);
    }
    mappedEvidenceIds.add(route.evidenceId);
    sourcedEvidenceIds.add(route.evidenceId);
    const landmarkFloor = landmarkId.match(/^f([1-8])-/)?.[1];
    const evidenceFloor = route.evidenceId.match(/^lost-name:f([1-8]):/)?.[1];
    if (landmarkFloor !== evidenceFloor) {
      errors.push(
        `剧情地标 ${landmarkId} 与失名证据 ${route.evidenceId} 不在同一层。`,
      );
    }
  });

  ([1, 2, 3, 4, 5, 6, 7, 8] as const).forEach((floor) => {
    const floorMoments = moments.filter((entry) => entry.floor === floor);
    const blockingLimit = floor === 1 ? 3 : 4;
    const blockingCount = floorMoments.filter(
      (entry) => entry.presentation === "blocking",
    ).length;
    if (floorMoments.length < 8) {
      errors.push(`第 ${floor} 层至少需要八个可见现场剧情节点。`);
    }
    if (floorMoments[0]?.unlock.type !== "floor-entered") {
      errors.push(`第 ${floor} 层第一个现场剧情节点必须在入层时解锁。`);
    }
    if (floorMoments.at(-1)?.unlock.type !== "floor-completed") {
      errors.push(`第 ${floor} 层最后一个现场剧情节点必须在层完成时解锁。`);
    }
    if (floorMoments[0]?.presentation !== "blocking") {
      errors.push(`第 ${floor} 层入层剧情必须使用阻断主框。`);
    }
    const expectedFloorEndPresentation = floor === 8 ? "ambient" : "blocking";
    if (floorMoments.at(-1)?.presentation !== expectedFloorEndPresentation) {
      errors.push(
        `第 ${floor} 层离层剧情必须使用 ${expectedFloorEndPresentation} 展示。`,
      );
    }
    if (
      floor === 8 &&
      floorMoments.filter((entry) => entry.presentation === "blocking")
        .at(-1)?.sourceId !== "f8-story-migrate"
    ) {
      errors.push("第 8 层最后一个阻断剧情必须是 f8-story-migrate。");
    }
    if (blockingCount > blockingLimit) {
      errors.push(
        `第 ${floor} 层自动阻断剧情 ${blockingCount} 次，超过 ${blockingLimit} 次上限。`,
      );
    }
    const areaBossId = AREA_BOSS_STORY_MONSTER_IDS[floor];
    if (areaBossId !== null) {
      const areaBossMoments = floorMoments.filter((entry) => (
        entry.unlock.type === "monster-defeated" &&
        entry.unlock.monsterId === areaBossId
      ));
      if (areaBossMoments.length !== 1) {
        errors.push(
          `第 ${floor} 层区域首领 ID #${String(areaBossId).padStart(3, "0")} 必须且只能解锁一个现场剧情节点。`,
        );
      } else if (
        areaBossMoments[0]?.kind !== "boss" ||
        areaBossMoments[0]?.presentation !== "blocking"
      ) {
        errors.push(
          `第 ${floor} 层区域首领 ID #${String(areaBossId).padStart(3, "0")} 必须使用阻断 Boss 剧情。`,
        );
      }
    }
    const queryEvidenceCount = [...mappedEvidenceIds].filter((evidenceId) =>
      evidenceId.startsWith(`lost-name:f${floor}:`)
    ).length;
    if (queryEvidenceCount !== 1) {
      errors.push(
        `第 ${floor} 层必须且只能有一份由 Story Query 地标恢复的失名证据。`,
      );
    }
  });

  moments.forEach((moment) => {
    if (ids.has(moment.id)) errors.push(`现场剧情节点 ID 重复：${moment.id}。`);
    ids.add(moment.id);
    if (
      moment.lines.length === 0 ||
      moment.lines.length > 2 ||
      [moment.kicker, moment.title, moment.archiveLine, ...moment.lines]
        .some((entry) => entry.trim().length === 0)
    ) {
      errors.push(`现场剧情节点 ${moment.id} 缺少文本或超出两行预算。`);
    }
    if (
      moment.presentation === "inspect" &&
      ["floor-entered", "lesson-completed", "monster-defeated", "floor-completed"]
        .includes(moment.unlock.type)
    ) {
      errors.push(`主动调查节点 ${moment.id} 不得由自动进度事实直接展示。`);
    }
    if (moment.presentation === "inspect") {
      const experience = floorExperience(moment.floor);
      const inspectTargetExists = moment.inspectLandmarkId !== null && (
        experience.landmarks.some((entry) => entry.id === moment.inspectLandmarkId) ||
        experience.npcPlacements.some((entry) => entry.id === moment.inspectLandmarkId)
      );
      if (!inspectTargetExists) {
        errors.push(`主动调查节点 ${moment.id} 缺少可按 E 读取的地标绑定。`);
      }
    } else if (moment.inspectLandmarkId !== null) {
      errors.push(`非主动调查节点 ${moment.id} 不得绑定调查地标。`);
    }
    moment.actions.forEach((action) => {
      if (action.type !== "evidence") return;
      sourcedEvidenceIds.add(action.evidenceId);
      if (!canonicalEvidenceIds.has(action.evidenceId)) {
        errors.push(
          `现场剧情节点 ${moment.id} 引用了不存在的失名证据 ${action.evidenceId}。`,
        );
      }
      if (!action.evidenceId.startsWith(`lost-name:f${moment.floor}:`)) {
        errors.push(
          `现场剧情节点 ${moment.id} 的证据 ${action.evidenceId} 不属于本层。`,
        );
      }
    });
  });

  canonicalEvidenceIds.forEach((evidenceId) => {
    if (!sourcedEvidenceIds.has(evidenceId)) {
      errors.push(`失名证据 ${evidenceId} 没有 Story Query、隐藏门或 Boss 来源。`);
    }
  });

  return errors;
}
