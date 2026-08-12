/** 统一 Agent 网络边界：哈希、5 秒中止、端点优先级和严格响应校验。 */
import type {
  CampfireAgentContent,
  CampfireAgentOutput,
  CampfireAgentRequest,
} from "../../contracts/agent/campfireReview";
import type {
  AgentGatewayPort,
  AgentTokens,
  DirectorAgentRequest,
  DirectorAgentResponse,
  DirectorCallMeta,
  DirectorEvent,
  DirectorSource,
  DirectorView,
} from "../../contracts/agent/director";
import type {
  ScribeAgentContent,
  ScribeAgentOutput,
  ScribeAgentRequest,
} from "../../contracts/agent/scribe";
import {
  HASH_PATTERN,
  isRecord,
  requestId,
  sha256Hex,
  stableJson,
  validPlainText,
} from "./protocol";

export interface AgentGatewayOptions {
  directorEndpoint?: string | null;
  campfireEndpoint?: string | null;
  scribeEndpoint?: string | null;
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
  if (!isRecord(value) || !exactKeys(value, ["input", "output", "total"])) return false;
  return [value.input, value.output, value.total]
    .every((token) => token === null || validInt(token));
}

function validCall(value: unknown): value is DirectorCallMeta {
  if (!isRecord(value) || !exactKeys(value, ["agent", "mode", "status", "ms", "tokens"])) return false;
  return ["campfire", "scribe", "director"].includes(String(value.agent)) &&
    (value.mode === "model" || value.mode === "local") &&
    (value.status === "ready" || value.status === "fallback") &&
    validInt(value.ms) && validTokens(value.tokens);
}

function validContent(
  value: unknown,
  source: DirectorSource,
): value is CampfireAgentContent | ScribeAgentContent {
  if (!isRecord(value) || !exactKeys(value, CONTENT_KEYS[source])) return false;
  if (!validPlainText(value.headline, 80) || !Array.isArray(value.facts) || value.facts.length > 3) return false;
  if (!value.facts.every((fact) => validPlainText(fact, 120))) return false;
  if (!validPlainText(value.nextAction, 180) || !validPlainText(value.message, 240)) return false;
  return source === "campfire"
    ? value.focusConcept === null || validPlainText(value.focusConcept, 80)
    : value.safeHintId === null || validPlainText(value.safeHintId, 128);
}

function situationFor(content: CampfireAgentContent | ScribeAgentContent): string {
  return (content.facts[0] ? `${content.headline}：${content.facts[0]}` : content.headline).slice(0, 120);
}

function guidanceFor(content: CampfireAgentContent | ScribeAgentContent): string {
  return content.nextAction.slice(0, 240);
}

export function directorComposePayload(view: DirectorView): Record<string, unknown> {
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

export function directorCacheKey(view: DirectorView): string {
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

function validDirectorResponse(
  value: unknown,
  request: DirectorAgentRequest,
): value is DirectorAgentResponse {
  if (!isRecord(value) || !exactKeys(value, [
    "schemaVersion", "requestId", "composeHash", "floor", "event", "changedSource",
    "child", "director", "meta",
  ])) return false;
  if (
    value.schemaVersion !== 2 || value.requestId !== request.requestId ||
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
  if (!isRecord(value.director) || !exactKeys(value.director, ["status", "situation", "guidance"])) return false;
  if (
    (value.director.status !== "ready" && value.director.status !== "fallback") ||
    value.director.situation !== situationFor(value.child.content) ||
    !validPlainText(value.director.guidance, 240)
  ) return false;
  if (!isRecord(value.meta) || !exactKeys(value.meta, ["traceId", "ms", "calls"])) return false;
  if (
    (value.meta.traceId !== null && !/^[0-9a-f]{32}$/u.test(String(value.meta.traceId))) ||
    !validInt(value.meta.ms) || !Array.isArray(value.meta.calls) || value.meta.calls.length !== 2 ||
    !value.meta.calls.every(validCall) || value.meta.calls[0]?.agent !== request.changedSource ||
    value.meta.calls[1]?.agent !== "director"
  ) return false;
  return true;
}

function validLegacyOutput(
  value: unknown,
  source: DirectorSource,
  requestIdValue: string,
  evidenceHash: string,
): value is CampfireAgentOutput | ScribeAgentOutput {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "requestId", "evidenceHash", ...CONTENT_KEYS[source]])) return false;
  const content = Object.fromEntries(CONTENT_KEYS[source].map((key) => [key, value[key]]));
  return value.schemaVersion === 1 && value.requestId === requestIdValue &&
    value.evidenceHash === evidenceHash && validContent(content, source);
}

export class AgentGateway implements AgentGatewayPort {
  private readonly directorEndpoint: string | null;
  private readonly campfireEndpoint: string | null;
  private readonly scribeEndpoint: string | null;
  private readonly fetcher: typeof fetch;
  private readonly digest: (value: string) => Promise<string>;
  private readonly makeRequestId: () => string;
  private readonly timeoutMs: number;

  constructor(options: AgentGatewayOptions = {}) {
    this.directorEndpoint = options.directorEndpoint?.trim() || null;
    this.campfireEndpoint = options.campfireEndpoint?.trim() || null;
    this.scribeEndpoint = options.scribeEndpoint?.trim() || null;
    this.fetcher = options.fetcher ?? fetch;
    this.digest = options.digest ?? sha256Hex;
    this.makeRequestId = options.requestId ?? (() => requestId("agent"));
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  evidenceHash(value: unknown): Promise<string> {
    return this.digest(stableJson(value));
  }

  canRequest(source: DirectorSource, event: DirectorEvent): boolean {
    if (this.directorEndpoint) return true;
    if (source === "campfire") return this.campfireEndpoint !== null;
    return event !== "navigation" && this.scribeEndpoint !== null;
  }

  async run(view: DirectorView, signal?: AbortSignal): Promise<DirectorAgentResponse | null> {
    const composeHash = await this.evidenceHash(directorComposePayload(view));
    const request: DirectorAgentRequest = {
      protocolVersion: 1,
      requestId: this.makeRequestId(),
      composeHash,
      ...view,
    };
    if (this.directorEndpoint) {
      const payload = await this.post(this.directorEndpoint, request, signal);
      return validDirectorResponse(payload, request) ? payload : null;
    }
    if (view.changedSource === "campfire" && this.campfireEndpoint) {
      return this.sendLegacy(this.campfireEndpoint, request, signal);
    }
    if (view.changedSource === "scribe" && view.event !== "navigation" && this.scribeEndpoint) {
      return this.sendLegacy(this.scribeEndpoint, request, signal);
    }
    return null;
  }

  private async sendLegacy(
    endpoint: string,
    request: DirectorAgentRequest,
    signal?: AbortSignal,
  ): Promise<DirectorAgentResponse | null> {
    const started = performance.now();
    const source = request.changedSource;
    const childId = `${request.requestId}:${source}`;
    const childRequest = {
      protocolVersion: 1,
      requestId: childId,
      evidenceHash: request.changed.evidenceHash,
      ...request.changed.evidence,
    } as CampfireAgentRequest | ScribeAgentRequest;
    const payload = await this.post(endpoint, childRequest, signal);
    if (!validLegacyOutput(payload, source, childId, request.changed.evidenceHash)) return null;
    const record = payload as unknown as Record<string, unknown>;
    const content = Object.fromEntries(
      CONTENT_KEYS[source].map((key) => [key, record[key]]),
    ) as unknown as CampfireAgentContent | ScribeAgentContent;
    const ms = Math.max(0, Math.round(performance.now() - started));
    return {
      schemaVersion: 2,
      requestId: request.requestId,
      composeHash: request.composeHash,
      floor: request.floor,
      event: request.event,
      changedSource: source,
      child: { source, evidenceHash: request.changed.evidenceHash, status: "ready", content },
      director: { status: "fallback", situation: situationFor(content), guidance: guidanceFor(content) },
      meta: {
        traceId: null,
        ms,
        calls: [
          { agent: source, mode: "model", status: "ready", ms, tokens: { input: null, output: null, total: null } },
          { agent: "director", mode: "local", status: "fallback", ms: 0, tokens: { input: 0, output: 0, total: 0 } },
        ],
      },
    };
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

export { guidanceFor, situationFor };
