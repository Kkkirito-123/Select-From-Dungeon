/** 唯一 Agent 网络边界：稳定哈希、五秒中止和严格响应校验。 */
import type { CampfireAgentContent } from "../../contracts/agent/campfireReview";
import type {
  AgentCallMeta,
  AgentGatewayPort,
  AgentRequest,
  AgentResponse,
  AgentSource,
  AgentTokens,
  AgentView,
} from "../../contracts/agent/main";
import type { ScribeAgentContent } from "../../contracts/agent/scribe";
import {
  HASH_PATTERN,
  isRecord,
  requestId,
  sha256Hex,
  stableJson,
  validPlainText,
} from "./protocol";

export interface AgentGatewayOptions {
  endpoint?: string | null;
  fetcher?: typeof fetch;
  digest?: (value: string) => Promise<string>;
  requestId?: () => string;
  timeoutMs?: number;
}

const CONTENT_KEYS = {
  campfire: ["headline", "facts", "focusConcept", "nextAction", "message"],
  scribe: ["headline", "facts", "nextAction", "safeHintId", "message"],
} as const;

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function validInt(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function validTokens(value: unknown): value is AgentTokens {
  return isRecord(value) && exactKeys(value, ["input", "output", "total"]) &&
    [value.input, value.output, value.total].every((token) => token === null || validInt(token));
}

function validCall(value: unknown): value is AgentCallMeta {
  return isRecord(value) && exactKeys(value, ["agent", "mode", "status", "ms", "tokens"]) &&
    ["campfire", "scribe", "main"].includes(String(value.agent)) &&
    (value.mode === "model" || value.mode === "local") &&
    (value.status === "ready" || value.status === "fallback") &&
    validInt(value.ms) && validTokens(value.tokens);
}

function validContent(
  value: unknown,
  source: AgentSource,
): value is CampfireAgentContent | ScribeAgentContent {
  if (!isRecord(value) || !exactKeys(value, CONTENT_KEYS[source])) return false;
  if (!validPlainText(value.headline, 80) || !Array.isArray(value.facts) || value.facts.length > 3) return false;
  if (!value.facts.every((fact) => validPlainText(fact, 120))) return false;
  if (!validPlainText(value.nextAction, 180) || !validPlainText(value.message, 240)) return false;
  return source === "campfire"
    ? value.focusConcept === null || validPlainText(value.focusConcept, 80)
    : value.safeHintId === null || validPlainText(value.safeHintId, 128);
}

export function guidanceFor(content: CampfireAgentContent | ScribeAgentContent): string {
  return content.nextAction.slice(0, 240);
}

export function agentComposePayload(view: AgentView): Record<string, unknown> {
  return {
    floor: view.floor,
    event: view.event,
    changedSource: view.changedSource,
    changedEvidenceHash: view.changed.evidenceHash,
    campfireEvidenceHash: view.changedSource === "campfire"
      ? view.changed.evidenceHash
      : view.context.campfire?.evidenceHash ?? null,
    scribeEvidenceHash: view.changedSource === "scribe"
      ? view.changed.evidenceHash
      : view.context.scribe?.evidenceHash ?? null,
  };
}

export function agentCacheKey(view: AgentView): string {
  return [
    view.floor,
    view.event,
    view.changedSource === "campfire"
      ? view.changed.evidenceHash
      : view.context.campfire?.evidenceHash ?? "--",
    view.changedSource === "scribe"
      ? view.changed.evidenceHash
      : view.context.scribe?.evidenceHash ?? "--",
  ].join(":");
}

function validResponse(value: unknown, request: AgentRequest): value is AgentResponse {
  if (!isRecord(value) || !exactKeys(value, [
    "schemaVersion", "requestId", "composeHash", "floor", "event", "changedSource",
    "child", "main", "meta",
  ])) return false;
  if (
    value.schemaVersion !== 1 || value.requestId !== request.requestId ||
    value.composeHash !== request.composeHash || value.floor !== request.floor ||
    value.event !== request.event || value.changedSource !== request.changedSource ||
    !HASH_PATTERN.test(String(value.composeHash))
  ) return false;
  if (!isRecord(value.child) || !exactKeys(value.child, ["source", "evidenceHash", "status", "content"])) return false;
  if (
    value.child.source !== request.changedSource ||
    value.child.evidenceHash !== request.changed.evidenceHash ||
    !HASH_PATTERN.test(String(value.child.evidenceHash)) ||
    (value.child.status !== "ready" && value.child.status !== "fallback") ||
    !validContent(value.child.content, request.changedSource)
  ) return false;
  if (!isRecord(value.main) || !exactKeys(value.main, ["status", "guidance"])) return false;
  if (
    (value.main.status !== "ready" && value.main.status !== "fallback") ||
    !validPlainText(value.main.guidance, 240)
  ) return false;
  if (!isRecord(value.meta) || !exactKeys(value.meta, ["traceId", "ms", "calls"])) return false;
  return (value.meta.traceId === null || /^[0-9a-f]{32}$/u.test(String(value.meta.traceId))) &&
    validInt(value.meta.ms) && Array.isArray(value.meta.calls) && value.meta.calls.length === 2 &&
    value.meta.calls.every(validCall) && value.meta.calls[0]?.agent === request.changedSource &&
    value.meta.calls[1]?.agent === "main";
}

export class AgentGateway implements AgentGatewayPort {
  private readonly endpoint: string | null;
  private readonly fetcher: typeof fetch;
  private readonly digest: (value: string) => Promise<string>;
  private readonly makeRequestId: () => string;
  private readonly timeoutMs: number;

  constructor(options: AgentGatewayOptions = {}) {
    this.endpoint = options.endpoint?.trim() || null;
    this.fetcher = options.fetcher ?? fetch;
    this.digest = options.digest ?? sha256Hex;
    this.makeRequestId = options.requestId ?? (() => requestId("agent"));
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  evidenceHash(value: unknown): Promise<string> {
    return this.digest(stableJson(value));
  }

  canRequest(): boolean {
    return this.endpoint !== null;
  }

  async run(view: AgentView, signal?: AbortSignal): Promise<AgentResponse | null> {
    if (!this.endpoint) return null;
    const request: AgentRequest = {
      protocolVersion: 1,
      requestId: this.makeRequestId(),
      composeHash: await this.evidenceHash(agentComposePayload(view)),
      ...view,
    };
    const payload = await this.post(this.endpoint, request, signal);
    return validResponse(payload, request) ? payload : null;
  }

  private async post(endpoint: string, body: object, external?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    if (external?.aborted) controller.abort();
    external?.addEventListener("abort", abort, { once: true });
    const timeout = globalThis.setTimeout(abort, this.timeoutMs);
    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    } finally {
      globalThis.clearTimeout(timeout);
      external?.removeEventListener("abort", abort);
    }
  }
}
