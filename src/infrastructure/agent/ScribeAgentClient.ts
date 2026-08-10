/**
 * 抄写员 Agent 的浏览器 HTTP 适配器。
 *
 * 调用方只能传入已经投影的场景证据。这里负责证据哈希、请求 ID、超时、缓存
 * 和响应校验；响应只包含可展示文案，不会写回游戏状态。
 */
import type {
  ScribeAgentOutput,
  ScribeAgentPort,
  ScribeAgentRequest,
  ScribePrompt,
} from "../../contracts/agent/scribe";

const MAX_ID_CHARS = 128;
const MAX_TOPIC_CHARS = 120;
const MAX_MESSAGE_CHARS = 240;
const MAX_HEADLINE_CHARS = 80;
const MAX_FACT_CHARS = 120;
const MAX_NEXT_ACTION_CHARS = 180;
const MAX_HINT_ID_CHARS = 128;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const HTML_OR_TOOL_MARKER = /<[^>]*>|javascript:|tool_call|function_call|<script/iu;

type Fetcher = typeof fetch;
type Digest = (canonicalEvidence: string) => Promise<string>;

export interface ScribeAgentClientOptions {
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
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function defaultRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `scribe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function validPlainText(value: unknown, maximum: number): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !value.includes("\u0000") &&
    !HTML_OR_TOOL_MARKER.test(value);
}

function validOutput(
  value: unknown,
  request: ScribeAgentRequest,
): value is ScribeAgentOutput {
  if (!isRecord(value)) return false;
  const expectedKeys = [
    "schemaVersion",
    "requestId",
    "evidenceHash",
    "headline",
    "facts",
    "nextAction",
    "safeHintId",
    "message",
  ];
  if (Object.keys(value).sort().join("\u0000") !== expectedKeys.sort().join("\u0000")) {
    return false;
  }
  if (
    value.schemaVersion !== 1 ||
    value.requestId !== request.requestId ||
    value.evidenceHash !== request.evidenceHash ||
    !HASH_PATTERN.test(String(value.evidenceHash))
  ) {
    return false;
  }
  if (!validPlainText(value.headline, MAX_HEADLINE_CHARS)) return false;
  if (
    !Array.isArray(value.facts) ||
    value.facts.length > 3 ||
    !value.facts.every((fact) => validPlainText(fact, MAX_FACT_CHARS))
  ) {
    return false;
  }
  if (value.safeHintId !== null && !validPlainText(value.safeHintId, MAX_HINT_ID_CHARS)) {
    return false;
  }
  if (
    value.safeHintId !== (request.learning?.safeHintId ?? null) ||
    !validPlainText(value.nextAction, MAX_NEXT_ACTION_CHARS) ||
    !validPlainText(value.message, MAX_MESSAGE_CHARS)
  ) {
    return false;
  }
  return true;
}

function requestPayload(prompt: ScribePrompt): Omit<
  ScribeAgentRequest,
  "protocolVersion" | "requestId" | "evidenceHash"
> {
  return {
    floor: prompt.floor,
    scene: prompt.scene,
    scribeId: prompt.scribeId.slice(0, MAX_ID_CHARS),
    topic: prompt.topic.slice(0, MAX_TOPIC_CHARS),
    authoredMessage: prompt.authoredMessage.slice(0, MAX_MESSAGE_CHARS),
    learning: prompt.learning,
    navigation: prompt.navigation,
    death: prompt.death,
  };
}

export function scribeEvidenceKey(prompt: ScribePrompt): string {
  return stableJson(requestPayload(prompt));
}

export class HttpScribeAgentClient implements ScribeAgentPort {
  private readonly fetcher: Fetcher;
  private readonly digest: Digest;
  private readonly requestId: () => string;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, Promise<ScribeAgentOutput | null>>();

  constructor(private readonly options: ScribeAgentClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.digest = options.digest ?? sha256Hex;
    this.requestId = options.requestId ?? defaultRequestId;
    this.timeoutMs = options.timeoutMs ?? 3_000;
  }

  async respond(prompt: ScribePrompt): Promise<ScribeAgentOutput | null> {
    const projected = requestPayload(prompt);
    const hash = await this.digest(stableJson(projected));
    const cached = this.cache.get(hash);
    if (cached) return cached;

    const request: ScribeAgentRequest = {
      protocolVersion: 1,
      requestId: this.requestId(),
      evidenceHash: hash,
      ...projected,
    };
    const pending = this.send(request);
    this.cache.set(hash, pending);
    return pending;
  }

  private async send(request: ScribeAgentRequest): Promise<ScribeAgentOutput | null> {
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

export function createScribeAgentClient(
  endpoint: string | undefined | null,
  timeoutMs = 3_000,
): HttpScribeAgentClient | null {
  const normalized = endpoint?.trim();
  return normalized
    ? new HttpScribeAgentClient({ endpoint: normalized, timeoutMs })
    : null;
}
