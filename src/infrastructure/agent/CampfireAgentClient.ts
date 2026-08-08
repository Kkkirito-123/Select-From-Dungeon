/**
 * 篝火 Agent 的浏览器 HTTP 适配器。
 *
 * 本模块只把 GameSnapshot 投影为当前楼层 SQL 证据，并校验远端返回；不访问存档、
 * 不发送参考 SQL、不保存远端结果，也不能修改 GameSession。未配置端点时由 main
 * 不创建客户端，游戏继续使用本地确定性复盘。
 */
import type {
  CampfireAgentAggregate,
  CampfireAgentAttempt,
  CampfireAgentOutput,
  CampfireAgentPort,
  CampfireAgentRequest,
} from "../../contracts/agent/campfireReview";
import type { GameSnapshot } from "../../contracts/game/snapshots";

const MAX_ATTEMPTS = 8;
const MAX_SQL_CHARS = 800;
const MAX_STAGE_OBJECTIVE_CHARS = 160;
const MAX_HEADLINE_CHARS = 80;
const MAX_FACT_CHARS = 120;
const MAX_FOCUS_CHARS = 80;
const MAX_NEXT_ACTION_CHARS = 180;
const MAX_MESSAGE_CHARS = 240;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const HTML_OR_TOOL_MARKER = /<[^>]*>|javascript:|tool_call|function_call|<script/iu;

type Fetcher = typeof fetch;
type Digest = (canonicalEvidence: string) => Promise<string>;

export interface CampfireAgentClientOptions {
  endpoint: string;
  fetcher?: Fetcher;
  digest?: Digest;
  requestId?: () => string;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(canonicalEvidence: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalEvidence),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function trimEvidence(value: string, maximum: number): string {
  return value.slice(0, maximum);
}

function currentFloorAttempts(snapshot: GameSnapshot) {
  return snapshot.floorReview
    .filter((attempt) => attempt.floor === snapshot.floor)
    .slice()
    .sort((left, right) => left.id - right.id);
}

function aggregateAttempts(snapshot: GameSnapshot): CampfireAgentAggregate {
  const attempts = currentFloorAttempts(snapshot);
  const correctCount = attempts.filter((attempt) => attempt.result === "correct").length;
  const errorCounts: CampfireAgentAggregate["errorCounts"] = {
    "missing-concept": 0,
    "wrong-result": 0,
    "syntax-error": 0,
  };
  let hintedAttempts = 0;
  let highestHintLevel = 0;
  attempts.forEach((attempt) => {
    if (attempt.result !== "correct") errorCounts[attempt.result] += 1;
    if (attempt.hintLevel > 0) hintedAttempts += 1;
    highestHintLevel = Math.max(highestHintLevel, attempt.hintLevel);
  });
  return {
    totalAttempts: attempts.length,
    correctCount,
    accuracy: attempts.length === 0 ? 0 : Math.round((correctCount / attempts.length) * 100),
    errorCounts,
    hintedAttempts,
    highestHintLevel,
  };
}

function projectAttempt(attempt: GameSnapshot["floorReview"][number]): CampfireAgentAttempt {
  return {
    attemptId: attempt.id,
    lessonId: attempt.lessonId,
    stageId: attempt.stageId,
    stageObjective: trimEvidence(attempt.stageObjective, MAX_STAGE_OBJECTIVE_CHARS),
    submittedSql: trimEvidence(attempt.sql, MAX_SQL_CHARS),
    result: attempt.result,
    outcome: attempt.outcome,
    hintLevel: Math.max(0, Math.min(4, attempt.hintLevel)),
  };
}

function evidencePayload(snapshot: GameSnapshot): Omit<CampfireAgentRequest, "protocolVersion" | "requestId" | "evidenceHash"> {
  const attempts = currentFloorAttempts(snapshot);
  return {
    floor: snapshot.floor,
    aggregate: aggregateAttempts(snapshot),
    attempts: attempts.slice(-MAX_ATTEMPTS).map(projectAttempt),
  };
}

function defaultRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `campfire-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function validPlainText(value: unknown, maximum: number): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !value.includes("\u0000") &&
    !HTML_OR_TOOL_MARKER.test(value);
}

function validOutput(value: unknown, request: CampfireAgentRequest): value is CampfireAgentOutput {
  if (!isRecord(value)) return false;
  const expectedKeys = [
    "schemaVersion",
    "requestId",
    "evidenceHash",
    "headline",
    "facts",
    "focusConcept",
    "nextAction",
    "message",
  ];
  if (Object.keys(value).sort().join("\u0000") !== expectedKeys.sort().join("\u0000")) return false;
  if (value.schemaVersion !== 1 || value.requestId !== request.requestId || value.evidenceHash !== request.evidenceHash) {
    return false;
  }
  if (!HASH_PATTERN.test(String(value.evidenceHash))) return false;
  if (!validPlainText(value.headline, MAX_HEADLINE_CHARS)) return false;
  if (!Array.isArray(value.facts) || value.facts.length > 3 || !value.facts.every((fact) => validPlainText(fact, MAX_FACT_CHARS))) {
    return false;
  }
  if (value.focusConcept !== null && !validPlainText(value.focusConcept, MAX_FOCUS_CHARS)) return false;
  return validPlainText(value.nextAction, MAX_NEXT_ACTION_CHARS) &&
    validPlainText(value.message, MAX_MESSAGE_CHARS);
}

export function campfireAgentEvidenceKey(snapshot: GameSnapshot): string {
  const attempts = currentFloorAttempts(snapshot).map((attempt) => ({
    id: attempt.id,
    stageId: attempt.stageId,
    stageObjective: attempt.stageObjective,
    sql: attempt.sql,
    result: attempt.result,
    outcome: attempt.outcome,
    hintLevel: attempt.hintLevel,
  }));
  return stableJson({ floor: snapshot.floor, attempts });
}

export class HttpCampfireAgentClient implements CampfireAgentPort {
  private readonly fetcher: Fetcher;
  private readonly digest: Digest;
  private readonly requestId: () => string;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, Promise<CampfireAgentOutput | null>>();

  constructor(private readonly options: CampfireAgentClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.digest = options.digest ?? sha256Hex;
    this.requestId = options.requestId ?? defaultRequestId;
    this.timeoutMs = options.timeoutMs ?? 3_000;
  }

  async review(snapshot: GameSnapshot): Promise<CampfireAgentOutput | null> {
    const projected = evidencePayload(snapshot);
    if (projected.attempts.length === 0) return null;
    const hash = await this.digest(stableJson(projected));
    const cached = this.cache.get(hash);
    if (cached) return cached;

    const request: CampfireAgentRequest = {
      protocolVersion: 1,
      requestId: this.requestId(),
      evidenceHash: hash,
      ...projected,
    };
    const pending = this.send(request);
    this.cache.set(hash, pending);
    return pending;
  }

  private async send(request: CampfireAgentRequest): Promise<CampfireAgentOutput | null> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.options.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      return validOutput(payload, request) ? payload : null;
    } catch {
      return null;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

export function createCampfireAgentClient(
  endpoint: string | undefined | null,
  timeoutMs = 3_000,
): HttpCampfireAgentClient | null {
  const normalized = endpoint?.trim();
  return normalized ? new HttpCampfireAgentClient({ endpoint: normalized, timeoutMs }) : null;
}
