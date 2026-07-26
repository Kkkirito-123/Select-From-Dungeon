import {
  floorExperience,
  type FloorEnvironmentRuleDefinition,
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
  | "scribe"
  | "boss"
  | "ascent";

export type FloorStoryUnlock =
  | { type: "floor-entered" }
  | { type: "lesson-completed"; lessonId: RunLessonId }
  | { type: "monster-defeated"; monsterId: number }
  | { type: "shortcut-opened"; floor: 1 | 2 }
  | { type: "floor-completed" };

export interface FloorStoryMoment {
  id: string;
  floor: 1 | 2;
  kind: FloorStoryMomentKind;
  kicker: string;
  title: string;
  lines: readonly string[];
  archiveLine: string;
  unlock: FloorStoryUnlock;
  sourceId: string;
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

/**
 * UI-facing FIFO for story moments unlocked by synchronous Run updates.
 *
 * A moment is recorded when it enters the queue, but is removed only when the
 * caller can actually present it. This keeps combat settlement overlays from
 * consuming a story card and preserves authored order when one update unlocks
 * multiple moments (for example, a floor Boss and the ascent conclusion).
 */
export class FloorStoryMomentQueue {
  private readonly recordedIds = new Set<string>();
  private readonly pending: FloorStoryMoment[] = [];

  prime(moments: readonly FloorStoryMoment[]): void {
    const unseen = moments.filter((moment) => !this.recordedIds.has(moment.id));
    unseen.forEach((moment) => this.recordedIds.add(moment.id));
    const latest = unseen.at(-1);
    if (latest) this.pending.push(latest);
  }

  enqueue(moments: readonly FloorStoryMoment[]): void {
    moments.forEach((moment) => {
      if (this.recordedIds.has(moment.id)) return;
      this.recordedIds.add(moment.id);
      this.pending.push(moment);
    });
  }

  takeNext(): FloorStoryMoment | null {
    return this.pending.shift() ?? null;
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
  queryId?: StoryQueryId;
}

const FLOOR_STORY_ROUTES: Readonly<Record<1 | 2, readonly FloorStoryRoute[]>> = {
  1: [
    {
      source: { type: "event", id: "f1-story-fire-remembers" },
      kind: "entry",
      queryId: "f1-current-resident",
    },
    {
      source: { type: "rule", id: "f1-wheel-turning" },
      kind: "world-change",
    },
    {
      source: { type: "rule", id: "f1-water-low" },
      kind: "world-change",
    },
    {
      source: { type: "rule", id: "f1-beds-revealed" },
      kind: "evidence",
    },
    {
      source: { type: "event", id: "f1-story-shortcut-return" },
      kind: "scribe",
    },
    {
      source: { type: "rule", id: "f1-receipts-grouped" },
      kind: "evidence",
      queryId: "f1-restore-contradiction",
    },
    {
      source: { type: "event", id: "f1-story-first-page" },
      kind: "boss",
    },
    { source: { type: "floor-end" }, kind: "ascent" },
  ],
  2: [
    {
      source: { type: "event", id: "f2-story-seven-wet-pages" },
      kind: "entry",
      queryId: "f2-seven-source-pages",
    },
    {
      source: { type: "rule", id: "f2-beacons-ranked" },
      kind: "world-change",
    },
    {
      source: { type: "rule", id: "f2-channels-distinct" },
      kind: "evidence",
    },
    {
      source: { type: "rule", id: "f2-root-linked" },
      kind: "world-change",
    },
    {
      source: { type: "rule", id: "f2-missing-gear" },
      kind: "evidence",
    },
    {
      source: { type: "event", id: "f2-story-low-tide" },
      kind: "world-change",
    },
    {
      source: { type: "event", id: "f2-story-seven-reflections" },
      kind: "scribe",
    },
    {
      source: { type: "event", id: "f2-story-seven-pages" },
      kind: "boss",
      queryId: "f2-seven-source-summary",
    },
    { source: { type: "floor-end" }, kind: "ascent" },
  ],
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
    /^gate:shortcut:f?([12])(?::[^:]+)?:opened$/,
  )?.[1];
  if (shortcutFloor) {
    return {
      type: "shortcut-opened",
      floor: Number(shortcutFloor) as 1 | 2,
    };
  }
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
  floor: 1 | 2,
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
    kicker: `${route.kind === "entry" ? "DISCOVERY" : "STORY"} / ${event.title}`,
    title: event.title,
    lines: lines.slice(0, 2),
    archiveLine: query?.purpose ?? lines.join(" "),
    unlock: parseCanonicalTrigger(event.trigger),
    sourceId: event.id,
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
  floor: 1 | 2,
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
    kicker: `WORLD CHANGE / ${lessonId.toUpperCase()}`,
    title: rule.visibleResult,
    lines: [
      `查询结算：${lessonId.toUpperCase()}。`,
      ...(query ? [query.purpose] : []),
    ].slice(0, 2),
    archiveLine: query?.purpose ?? rule.visibleResult,
    unlock: { type: "lesson-completed", lessonId },
    sourceId: rule.id,
    query,
  };
}

function momentFromFloorEnd(
  floor: 1 | 2,
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
    kicker: "ASCENT / 本层结论",
    title: beat.title,
    lines: beat.lines,
    archiveLine: beat.lines.join(" "),
    unlock: { type: "floor-completed" },
    sourceId: beat.id,
    query: null,
  };
}

export function floorStoryMoments(
  floor: FloorNumber,
): readonly FloorStoryMoment[] {
  if (floor !== 1 && floor !== 2) return [];
  const experience = floorExperience(floor);
  return FLOOR_STORY_ROUTES[floor].map((route) => {
    const source = route.source;
    if (source.type === "floor-end") {
      return momentFromFloorEnd(floor, route);
    }
    if (source.type === "event") {
      const event = experience.storyEvents.find(
        (entry) => entry.id === source.id,
      );
      if (!event) throw new Error(`第 ${floor} 层缺少剧情事件 ${source.id}。`);
      return momentFromEvent(floor, event, route);
    }
    const rule = experience.environmentRules.find(
      (entry) => entry.id === source.id,
    );
    if (!rule) throw new Error(`第 ${floor} 层缺少环境规则 ${source.id}。`);
    return momentFromRule(floor, rule, route);
  });
}

function shortcutOpened(
  floor: 1 | 2,
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

export function validateFloorStoryContent(
  moments: readonly FloorStoryMoment[] = [
    ...floorStoryMoments(1),
    ...floorStoryMoments(2),
  ],
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  ([1, 2] as const).forEach((floor) => {
    const floorMoments = moments.filter((entry) => entry.floor === floor);
    if (floorMoments.length < 8) {
      errors.push(`第 ${floor} 层至少需要八个可见现场剧情节点。`);
    }
    if (floorMoments[0]?.unlock.type !== "floor-entered") {
      errors.push(`第 ${floor} 层第一个现场剧情节点必须在入层时解锁。`);
    }
    if (floorMoments.at(-1)?.unlock.type !== "floor-completed") {
      errors.push(`第 ${floor} 层最后一个现场剧情节点必须在层完成时解锁。`);
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
  });

  return errors;
}
