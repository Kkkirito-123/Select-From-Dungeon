/**
 * 浏览器 Agent 的闭合输入/输出契约。
 * 解析器拒绝未知字段、越界文本、未知证据和未授权故事，保护游戏事实边界。
 */
import type { AnswerResult, BattleOutcome } from "../../src/domain/types";
import type { FloorNumber, RunLessonId } from "../../src/domain/runGraph";
import { AGENT_RUNTIME_CONFIG } from "../../src/config/runtimeConfig";

export const AGENT_OUTPUT_CACHE_KEY = "select-from-dungeon:agent-output:v2";
export const AGENT_REQUEST_VERSION = 2 as const;
export const AGENT_OUTPUT_VERSION = 2 as const;
export const MAX_AGENT_ATTEMPTS = AGENT_RUNTIME_CONFIG.maxEvidenceAttempts;

/** Hook 类型对应抄写员的开场、寻路、精英结算和楼层收尾时机。 */
export type AgentHookType = "floor-start" | "route-guidance" | "elite-defeated" | "floor-end";
export type AgentHookPhase = "opening" | "route" | "ending";

export interface AgentHookPayload {
  /** 一次语义触发的最小上下文；可选字段只在对应 Hook 中出现。 */
  type: AgentHookType;
  phase: AgentHookPhase;
  floor: FloorNumber;
  objectiveRoomId?: string | null;
  objectiveTitle?: string | null;
  level?: 0 | 1 | 2 | 3;
  direction?: "north" | "east" | "south" | "west" | null;
  distance?: number | null;
  monsterId?: number;
  mode?: "transition" | "victory";
}

export interface AgentNavigationEvidence {
  /** 只读导航投影，不包含玩家坐标或完整地图。 */
  objectiveRoomId: string | null;
  objectiveTitle: string | null;
  level: 0 | 1 | 2 | 3;
  direction: "north" | "east" | "south" | "west" | null;
  distance: number | null;
}

export interface AgentAttemptEvidence {
  /** 单条学习证据；只保留 SQL 特征，不保留 SQL 原文。 */
  attemptId: number;
  lessonId: RunLessonId;
  stageId: string;
  objective: string;
  sqlFeatures: readonly string[];
  result: AnswerResult;
  outcome: BattleOutcome;
  hintLevel: number;
}

export interface AgentRelicEvidence {
  id: string;
  name: string;
  description: string;
}

export interface AgentStorySource {
  beatId: string;
  title: string;
  lines: readonly string[];
}

export interface AgentPrepareRequest {
  /** 发给本地/远端 Agent 的完整但有界请求。 */
  requestVersion: typeof AGENT_REQUEST_VERSION;
  runId: string;
  floor: FloorNumber;
  evidenceHash: string;
  trigger: AgentHookPayload;
  navigation: AgentNavigationEvidence;
  campfireUnlocked: boolean;
  defeatedEliteIds: readonly number[];
  attempts: readonly AgentAttemptEvidence[];
  completedLessons: readonly RunLessonId[];
  worldChanges: readonly string[];
  relics: readonly AgentRelicEvidence[];
  story: AgentStorySource | null;
}

export interface CampfireOutput {
  /** 篝火始终可休息，但复盘在本层精英击败前不可用。 */
  available: boolean;
  headline: string;
  facts: readonly string[];
  focusConcept: string | null;
  nextAction: string;
}

export interface ScribeOutput {
  greeting: string;
  observation: string;
  guidance: string;
  relationshipLine: string | null;
  sourceBeatId: string | null;
  evidenceRefs: readonly string[];
}

export interface PreparedAgentOutput {
  /** 游戏可消费的最终输出；模型不能写入其他游戏状态。 */
  version: typeof AGENT_OUTPUT_VERSION;
  runId: string;
  floor: FloorNumber;
  evidenceHash: string;
  source: "local" | "deepseek" | "openzl";
  campfire: CampfireOutput;
  scribe: ScribeOutput;
}

export interface CachedAgentOutput extends PreparedAgentOutput {
  preparedAt: number;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  // 所有外部 JSON 先被限制为普通对象，排除数组和 null。
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  // 严格键集合阻止模型通过额外字段注入未定义行为。
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => key in value);
}

function shortPlainText(
  value: unknown,
  maximum: number,
  nullable = false,
): string | null | undefined {
  // 输出只允许短单行纯文本，避免 Markdown、HTML 或脚本进入界面。
  if (nullable && value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximum ||
    /[\r\n<>`*_#[\]]/u.test(normalized)
  ) return undefined;
  return normalized;
}

function stringArray(
  value: unknown,
  maximumItems: number,
  itemMaximum: number,
): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const items = value.map((item) => shortPlainText(item, itemMaximum));
  return items.every((item): item is string => typeof item === "string")
    ? items
    : null;
}

function campfireOutput(value: unknown): CampfireOutput | null {
  // 篝火输出的事实字段由本地规则生成，模型不能改变其可用性。
  const data = objectValue(value);
  if (!data || !hasExactKeys(data, [
    "available",
    "headline",
    "facts",
    "focusConcept",
    "nextAction",
  ])) return null;
  if (typeof data.available !== "boolean") return null;
  const headline = shortPlainText(data.headline, 120);
  const facts = stringArray(data.facts, 3, 180);
  const focusConcept = shortPlainText(data.focusConcept, 100, true);
  const nextAction = shortPlainText(data.nextAction, 220);
  if (
    typeof headline !== "string" ||
    facts === null ||
    focusConcept === undefined ||
    typeof nextAction !== "string"
  ) return null;
  return { available: data.available, headline, facts, focusConcept, nextAction };
}

function scribeOutput(
  value: unknown,
  request?: AgentPrepareRequest,
): ScribeOutput | null {
  // 抄写员只能引用本次请求携带的证据和故事。
  const data = objectValue(value);
  if (!data || !hasExactKeys(data, [
    "greeting",
    "observation",
    "guidance",
    "relationshipLine",
    "sourceBeatId",
    "evidenceRefs",
  ])) return null;
  const greeting = shortPlainText(data.greeting, 80);
  const observation = shortPlainText(data.observation, 180);
  const guidance = shortPlainText(data.guidance, 180);
  const relationshipLine = shortPlainText(data.relationshipLine, 100, true);
  const sourceBeatId = shortPlainText(data.sourceBeatId, 120, true);
  const evidenceRefs = stringArray(data.evidenceRefs, 4, 40);
  if (
    typeof greeting !== "string" ||
    typeof observation !== "string" ||
    typeof guidance !== "string" ||
    relationshipLine === undefined ||
    sourceBeatId === undefined ||
    evidenceRefs === null
  ) return null;
  if (!evidenceRefs.every((reference) => /^attempt:\d+$/u.test(reference))) return null;
  if (request) {
    const allowedRefs = new Set(request.attempts.map(
      (attempt) => `attempt:${attempt.attemptId}`,
    ));
    if (!evidenceRefs.every((reference) => allowedRefs.has(reference))) return null;
    if (sourceBeatId !== null && sourceBeatId !== request.story?.beatId) return null;
  }
  return {
    greeting,
    observation,
    guidance,
    relationshipLine,
    sourceBeatId,
    evidenceRefs,
  };
}

export function parsePreparedAgentOutput(
  value: unknown,
  expected?: Pick<AgentPrepareRequest, "runId" | "floor" | "evidenceHash" | "attempts" | "story">,
): PreparedAgentOutput | null {
  // 远端响应必须同时满足版本、身份、字段和证据引用检查。
  const data = objectValue(value);
  if (!data || !hasExactKeys(data, [
    "version",
    "runId",
    "floor",
    "evidenceHash",
    "source",
    "campfire",
    "scribe",
  ]) || data.version !== AGENT_OUTPUT_VERSION) return null;
  const floor = typeof data.floor === "number" && Number.isInteger(data.floor)
    ? data.floor
    : null;
  if (
    typeof data.runId !== "string" ||
    floor === null ||
    typeof data.evidenceHash !== "string" ||
    (data.source !== "local" && data.source !== "deepseek" && data.source !== "openzl")
  ) return null;
  if (
    expected && (
      data.runId !== expected.runId ||
      floor !== expected.floor ||
      data.evidenceHash !== expected.evidenceHash
    )
  ) return null;
  const campfire = campfireOutput(data.campfire);
  const scribe = scribeOutput(
    data.scribe,
    expected as AgentPrepareRequest | undefined,
  );
  if (!campfire || !scribe) return null;
  if (floor < 1 || floor > 8) return null;
  return {
    version: AGENT_OUTPUT_VERSION,
    runId: data.runId,
    floor: floor as FloorNumber,
    evidenceHash: data.evidenceHash,
    source: data.source,
    campfire,
    scribe,
  };
}

export function parseCachedAgentOutput(value: unknown): CachedAgentOutput | null {
  // 缓存读取复用同一套输出守卫，避免存储成为绕过校验的入口。
  const data = objectValue(value);
  if (!data || !hasExactKeys(data, [
    "version",
    "runId",
    "floor",
    "evidenceHash",
    "source",
    "campfire",
    "scribe",
    "preparedAt",
  ]) || typeof data.preparedAt !== "number" || !Number.isFinite(data.preparedAt)) {
    return null;
  }
  const { preparedAt, ...preparedValue } = data;
  const prepared = parsePreparedAgentOutput(preparedValue);
  if (!prepared) return null;
  return { ...prepared, preparedAt };
}
