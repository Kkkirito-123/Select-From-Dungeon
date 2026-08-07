/**
 * 叙事进度的只读查询。
 * 将课程/楼层进度转换成固定叙事提示，不推进 GameSession，也不负责 DOM
 * 展示；固定文本仍由 content 层提供。
 */
import { lessonById } from "../../content/curriculum/mvpLevel";
import {
  NARRATIVE_BEAT_KINDS,
  NARRATIVE_ENDINGS,
  NARRATIVE_FLOORS,
  type FloorNarrative,
  type LostNameEvidence,
  type NarrativeBeat,
  type NarrativeBeatKind,
  type NarrativeEnding,
  type NarrativeEventKind,
} from "../../content/narrative/narrativeContent";
import type {
  AnswerAttemptRecord,
  AnswerResult,
} from "../shared/types";
import type { FloorNumber } from "./runGraph";

export interface NarrativeProgressEvent {
  event: NarrativeEventKind;
  floor: FloorNumber;
  completedRequiredCount: number;
}

export interface NarrativeContentValidation {
  valid: boolean;
  errors: string[];
}

export type LostNameEvidenceState = "unknown" | "null" | "value";

export interface LostNameEvidenceView {
  id: string;
  floor: FloorNumber;
  title: string;
  channel: LostNameEvidence["channel"];
  fieldLabel: string;
  state: LostNameEvidenceState;
  displayValue: string;
  finding: string | null;
}

type IncorrectAnswerResult = Exclude<AnswerResult, "correct">;

export interface ScribeCommonError {
  result: IncorrectAnswerResult;
  label: string;
  count: number;
  guidance: string;
}

export interface ScribeUnmasteredConcept {
  concept: string;
  attempts: number;
  errors: number;
  latestResult: IncorrectAnswerResult;
  summary: string;
}

export interface ScribeRecap {
  totalAttempts: number;
  correctAttempts: number;
  accuracyPercent: number;
  hintUsage: {
    attempts: number;
    ratePercent: number;
    highestLevel: number;
  };
  commonErrors: ScribeCommonError[];
  unmasteredConcepts: ScribeUnmasteredConcept[];
  summary: string;
}

const EXPECTED_BEAT_EVENT: Readonly<Record<NarrativeBeatKind, NarrativeEventKind>> = {
  "floor-entry": "floor-entered",
  "midpoint-evidence": "required-progress",
  campfire: "campfire-rested",
  boss: "boss-encountered",
  "floor-end": "floor-completed",
};

const LINE_BUDGET: Readonly<Record<NarrativeBeatKind, number>> = {
  "floor-entry": 3,
  "midpoint-evidence": 3,
  campfire: 2,
  boss: 4,
  "floor-end": 5,
};

const ERROR_ORDER: readonly IncorrectAnswerResult[] = [
  "missing-concept",
  "wrong-result",
  "syntax-error",
];

const ERROR_COPY: Readonly<Record<IncorrectAnswerResult, {
  label: string;
  guidance: string;
}>> = {
  "missing-concept": {
    label: "缺少核心语句",
    guidance: "先确认题目要求的核心概念，再补齐最小必要结构。",
  },
  "wrong-result": {
    label: "结果不匹配",
    guidance: "先核对筛选范围、连接关系和返回行，不要急着增加语句。",
  },
  "syntax-error": {
    label: "语法或字段错误",
    guidance: "先检查关键字、标点、表名和字段名，再重新执行。",
  },
};

const EXPECTED_ENDING_STEPS: readonly NarrativeEnding["steps"][number]["id"][] = [
  "snapshot",
  "audit",
  "preserve-history",
  "build-isolated",
  "validate",
  "switch",
  "keep-rollback",
];

const PROHIBITED_CONTENT_KEYS = new Set([
  "monsterId",
  "monsterIds",
  "lessonId",
  "lessonIds",
  "stageId",
  "courseId",
]);

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
}

function findProhibitedKeys(value: unknown, path = "content"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findProhibitedKeys(entry, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, entry]) => {
    const currentPath = `${path}.${key}`;
    return [
      ...(PROHIBITED_CONTENT_KEYS.has(key) ? [currentPath] : []),
      ...findProhibitedKeys(entry, currentPath),
    ];
  });
}

function validateFloorNarrative(
  floor: FloorNarrative,
  allBeatIds: string[],
  allEvidenceIds: string[],
  errors: string[],
): void {
  if (!Number.isInteger(floor.requiredCount) || floor.requiredCount < 1) {
    errors.push(`第 ${floor.floor} 层必修总数必须是正整数。`);
  }
  if (!hasText(floor.regionName)) {
    errors.push(`第 ${floor.floor} 层缺少地区名称。`);
  }
  if (floor.beats.length !== NARRATIVE_BEAT_KINDS.length) {
    errors.push(`第 ${floor.floor} 层必须恰好包含五个叙事拍。`);
  }

  NARRATIVE_BEAT_KINDS.forEach((kind) => {
    const matches = floor.beats.filter((entry) => entry.kind === kind);
    if (matches.length !== 1) {
      errors.push(`第 ${floor.floor} 层必须恰好包含一个 ${kind} 叙事拍。`);
    }
  });

  const evidenceById = new Map(
    floor.lostNameEvidence.map((entry) => [entry.id, entry]),
  );
  const referencedEvidence = new Set<string>();

  floor.beats.forEach((entry) => {
    allBeatIds.push(entry.id);
    if (entry.floor !== floor.floor || entry.trigger.floor !== floor.floor) {
      errors.push(`叙事拍 ${entry.id} 的楼层与所属内容不一致。`);
    }
    if (entry.trigger.event !== EXPECTED_BEAT_EVENT[entry.kind]) {
      errors.push(`叙事拍 ${entry.id} 没有使用 ${EXPECTED_BEAT_EVENT[entry.kind]} 语义事件。`);
    }
    if (
      !Number.isInteger(entry.trigger.completedRequiredCount) ||
      entry.trigger.completedRequiredCount < 0 ||
      entry.trigger.completedRequiredCount > floor.requiredCount
    ) {
      errors.push(`叙事拍 ${entry.id} 的必修完成数无效。`);
    }
    if (!hasText(entry.title) || entry.lines.length === 0) {
      errors.push(`叙事拍 ${entry.id} 缺少玩家可见文本。`);
    }
    if (
      entry.lines.length > LINE_BUDGET[entry.kind] ||
      entry.lines.some((line) => !hasText(line))
    ) {
      errors.push(`叙事拍 ${entry.id} 超出文本预算或包含空行。`);
    }
    entry.evidenceIds.forEach((evidenceId) => {
      referencedEvidence.add(evidenceId);
      if (!evidenceById.has(evidenceId)) {
        errors.push(`叙事拍 ${entry.id} 引用了未知失名录证据 ${evidenceId}。`);
      }
    });
  });

  const entryBeat = floor.beats.find((entry) => entry.kind === "floor-entry");
  const midpointBeat = floor.beats.find((entry) => entry.kind === "midpoint-evidence");
  const campfireBeat = floor.beats.find((entry) => entry.kind === "campfire");
  const bossBeat = floor.beats.find((entry) => entry.kind === "boss");
  const floorEndBeat = floor.beats.find((entry) => entry.kind === "floor-end");

  if (entryBeat && entryBeat.trigger.completedRequiredCount !== 0) {
    errors.push(`第 ${floor.floor} 层入层叙事必须在 0 个必修完成时可触发。`);
  }
  if (
    midpointBeat &&
    (
      midpointBeat.trigger.completedRequiredCount <= 0 ||
      midpointBeat.trigger.completedRequiredCount >= floor.requiredCount
    )
  ) {
    errors.push(`第 ${floor.floor} 层中段证据必须位于必修进度中段。`);
  }
  if (
    midpointBeat &&
    campfireBeat &&
    campfireBeat.trigger.completedRequiredCount < midpointBeat.trigger.completedRequiredCount
  ) {
    errors.push(`第 ${floor.floor} 层篝火复盘不能早于中段证据。`);
  }
  if (
    bossBeat &&
    bossBeat.trigger.completedRequiredCount !== floor.requiredCount - 1
  ) {
    errors.push(`第 ${floor.floor} 层 Boss 叙事必须等前置必修完成后、层主开战时触发。`);
  }
  if (
    floorEndBeat &&
    floorEndBeat.trigger.completedRequiredCount !== floor.requiredCount
  ) {
    errors.push(`第 ${floor.floor} 层层末叙事必须等全部必修完成。`);
  }

  if (floor.lostNameEvidence.length !== 2) {
    errors.push(`第 ${floor.floor} 层必须提供两条固定失名录证据。`);
  }
  if (new Set(floor.lostNameEvidence.map((entry) => entry.channel)).size < 2) {
    errors.push(`第 ${floor.floor} 层两条失名录证据必须来自不同渠道。`);
  }

  floor.lostNameEvidence.forEach((entry) => {
    allEvidenceIds.push(entry.id);
    if (entry.floor !== floor.floor) {
      errors.push(`失名录证据 ${entry.id} 的楼层与所属内容不一致。`);
    }
    if (
      !hasText(entry.title) ||
      !hasText(entry.fieldLabel) ||
      !hasText(entry.finding) ||
      (typeof entry.resolvedValue === "string" && !hasText(entry.resolvedValue))
    ) {
      errors.push(`失名录证据 ${entry.id} 缺少完整内容。`);
    }
    if (!referencedEvidence.has(entry.id)) {
      errors.push(`失名录证据 ${entry.id} 没有被任何固定叙事拍解锁。`);
    }
  });

  if (floor.floor < 8) {
    const expectedToFloor = (floor.floor + 1) as FloorNumber;
    if (
      !floor.ascent ||
      floor.ascent.fromFloor !== floor.floor ||
      floor.ascent.toFloor !== expectedToFloor ||
      !hasText(floor.ascent.name) ||
      !hasText(floor.ascent.arrival) ||
      !hasText(floor.ascent.transitionLine)
    ) {
      errors.push(`第 ${floor.floor} 层缺少通往第 ${expectedToFloor} 层的实体上升设施。`);
    }
  } else if (floor.ascent !== null) {
    errors.push("第八层不得再提供通往不存在楼层的上升设施。");
  }
}

/**
 * 校验叙事内容本身，不读取会话、地图、怪物或课程定义。
 */
export function validateNarrativeContent(
  floors: readonly FloorNarrative[] = NARRATIVE_FLOORS,
  endings: readonly NarrativeEnding[] = NARRATIVE_ENDINGS,
): NarrativeContentValidation {
  const errors: string[] = [];
  const floorNumbers = floors.map((floor) => floor.floor);
  const expectedFloors: readonly FloorNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

  if (
    floorNumbers.length !== expectedFloors.length ||
    expectedFloors.some((floor) => !floorNumbers.includes(floor))
  ) {
    errors.push("叙事内容必须完整覆盖且只覆盖八个主线楼层。");
  }
  duplicateValues(floorNumbers.map(String)).forEach((floor) => {
    errors.push(`叙事楼层重复：${floor}。`);
  });

  const allBeatIds: string[] = [];
  const allEvidenceIds: string[] = [];
  floors.forEach((floor) => {
    validateFloorNarrative(floor, allBeatIds, allEvidenceIds, errors);
  });

  duplicateValues(allBeatIds).forEach((id) => {
    errors.push(`叙事拍 ID 重复：${id}。`);
  });
  duplicateValues(allEvidenceIds).forEach((id) => {
    errors.push(`失名录证据 ID 重复：${id}。`);
  });

  const nullEvidenceCount = floors.flatMap((floor) => floor.lostNameEvidence)
    .filter((entry) => entry.resolvedValue === null).length;
  const valueEvidenceCount = floors.flatMap((floor) => floor.lostNameEvidence)
    .filter((entry) => typeof entry.resolvedValue === "string").length;
  if (nullEvidenceCount === 0 || valueEvidenceCount === 0) {
    errors.push("失名录内容必须同时覆盖已查为 NULL 与已查得实际值。");
  }

  if (endings.length !== 1 || endings[0]?.id !== "MIGRATE") {
    errors.push("主线必须只有一个 MIGRATE 结局。");
  }
  const ending = endings[0];
  if (ending) {
    if (
      !hasText(ending.title) ||
      !hasText(ending.summary) ||
      !hasText(ending.finalLine)
    ) {
      errors.push("MIGRATE 结局缺少玩家可见内容。");
    }
    const stepIds = ending.steps.map((step) => step.id);
    if (
      stepIds.length !== EXPECTED_ENDING_STEPS.length ||
      EXPECTED_ENDING_STEPS.some((id, index) => stepIds[index] !== id) ||
      ending.steps.some((step) => !hasText(step.title) || !hasText(step.description))
    ) {
      errors.push("MIGRATE 必须完整表达七步安全迁移。");
    }
  }

  const endingBeats = floors.flatMap((floor) => floor.beats)
    .filter((entry) => entry.endingId !== undefined);
  if (
    endingBeats.length !== 1 ||
    endingBeats[0]?.floor !== 8 ||
    endingBeats[0]?.kind !== "floor-end" ||
    endingBeats[0]?.endingId !== "MIGRATE"
  ) {
    errors.push("只有第八层层末叙事可以进入 MIGRATE 结局。");
  }

  findProhibitedKeys({ floors, endings }).forEach((path) => {
    errors.push(`叙事内容不得绑定怪物、课程或阶段标识：${path}。`);
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function narrativeFloorFor(floor: FloorNumber): FloorNarrative {
  const content = NARRATIVE_FLOORS.find((entry) => entry.floor === floor);
  if (!content) throw new Error(`未知叙事楼层：${floor}`);
  return content;
}

/**
 * 语义事件可以重复发送；seenBeatIds 保证调用方只消费尚未展示的固定叙事拍。
 */
export function narrativeBeatsForEvent(
  progressEvent: NarrativeProgressEvent,
  seenBeatIds: ReadonlySet<string> | readonly string[] = [],
): readonly NarrativeBeat[] {
  const seen = seenBeatIds instanceof Set
    ? seenBeatIds
    : new Set(seenBeatIds);
  return narrativeFloorFor(progressEvent.floor).beats.filter((entry) => (
    entry.trigger.event === progressEvent.event &&
    progressEvent.completedRequiredCount >= entry.trigger.completedRequiredCount &&
    !seen.has(entry.id)
  ));
}

export function lostNameEvidenceForFloor(
  floor: FloorNumber,
  discoveredEvidenceIds: ReadonlySet<string> | readonly string[] = [],
): readonly LostNameEvidenceView[] {
  const discovered = discoveredEvidenceIds instanceof Set
    ? discoveredEvidenceIds
    : new Set(discoveredEvidenceIds);
  return narrativeFloorFor(floor).lostNameEvidence.map((entry) => {
    const isDiscovered = discovered.has(entry.id);
    const state: LostNameEvidenceState = !isDiscovered
      ? "unknown"
      : entry.resolvedValue === null
        ? "null"
        : "value";
    return {
      id: entry.id,
      floor: entry.floor,
      title: entry.title,
      channel: entry.channel,
      fieldLabel: entry.fieldLabel,
      state,
      displayValue: state === "unknown"
        ? "???"
        : state === "null"
          ? "NULL"
          : entry.resolvedValue as string,
      finding: isDiscovered ? entry.finding : null,
    };
  });
}

/**
 * 抄写员只总结本地作答证据。返回值不会包含提交 SQL、参考 SQL、怪物或完整答案。
 */
export function buildScribeRecap(
  records: readonly AnswerAttemptRecord[],
): ScribeRecap {
  const totalAttempts = records.length;
  const correctAttempts = records.filter((record) => record.result === "correct").length;
  const hintedRecords = records.filter((record) => record.hintLevel > 0);
  const accuracyPercent = totalAttempts === 0
    ? 0
    : Math.round((correctAttempts / totalAttempts) * 100);
  const hintRatePercent = totalAttempts === 0
    ? 0
    : Math.round((hintedRecords.length / totalAttempts) * 100);

  const errorCounts = new Map<IncorrectAnswerResult, number>(
    ERROR_ORDER.map((result) => [result, 0]),
  );
  records.forEach((record) => {
    if (record.result !== "correct") {
      errorCounts.set(record.result, (errorCounts.get(record.result) ?? 0) + 1);
    }
  });
  const commonErrors = ERROR_ORDER
    .map((result) => ({
      result,
      label: ERROR_COPY[result].label,
      count: errorCounts.get(result) ?? 0,
      guidance: ERROR_COPY[result].guidance,
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => (
      right.count - left.count ||
      ERROR_ORDER.indexOf(left.result) - ERROR_ORDER.indexOf(right.result)
    ));

  interface ConceptProgress {
    concept: string;
    attempts: number;
    errors: number;
    latestResult: AnswerResult;
    latestRecordId: number;
    latestInputIndex: number;
  }

  const concepts = new Map<string, ConceptProgress>();
  records.forEach((record, inputIndex) => {
    const concept = lessonById(record.lessonId).concept;
    const current = concepts.get(concept);
    const isLater = !current ||
      record.id > current.latestRecordId ||
      (record.id === current.latestRecordId && inputIndex > current.latestInputIndex);
    concepts.set(concept, {
      concept,
      attempts: (current?.attempts ?? 0) + 1,
      errors: (current?.errors ?? 0) + (record.result === "correct" ? 0 : 1),
      latestResult: isLater ? record.result : current.latestResult,
      latestRecordId: isLater ? record.id : current.latestRecordId,
      latestInputIndex: isLater ? inputIndex : current.latestInputIndex,
    });
  });

  const unmasteredConcepts = [...concepts.values()]
    .filter((entry): entry is ConceptProgress & {
      latestResult: IncorrectAnswerResult;
    } => entry.latestResult !== "correct")
    .sort((left, right) => (
      right.errors - left.errors ||
      left.concept.localeCompare(right.concept, "zh-CN")
    ))
    .map((entry) => ({
      concept: entry.concept,
      attempts: entry.attempts,
      errors: entry.errors,
      latestResult: entry.latestResult,
      summary: `${entry.concept}：${ERROR_COPY[entry.latestResult].guidance}`,
    }));

  let summary: string;
  if (totalAttempts === 0) {
    summary = "本层还没有可复盘的作答。先记录一次尝试，再回来休息。";
  } else {
    const errorCopy = commonErrors[0]
      ? `最常见的是${commonErrors[0].label}。`
      : "最近的概念都已答对。";
    const conceptCopy = unmasteredConcepts.length > 0
      ? `先复习${unmasteredConcepts.slice(0, 3).map((entry) => entry.concept).join("、")}。`
      : "可以继续向本层深处前进。";
    summary = `本层 ${correctAttempts}/${totalAttempts} 次正确，正确率 ${accuracyPercent}%；${
      hintedRecords.length
    } 次使用提示。${errorCopy}${conceptCopy}`;
  }

  return {
    totalAttempts,
    correctAttempts,
    accuracyPercent,
    hintUsage: {
      attempts: hintedRecords.length,
      ratePercent: hintRatePercent,
      highestLevel: hintedRecords.reduce(
        (highest, record) => Math.max(highest, record.hintLevel),
        0,
      ),
    },
    commonErrors,
    unmasteredConcepts,
    summary,
  };
}
