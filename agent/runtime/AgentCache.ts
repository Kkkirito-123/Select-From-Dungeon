import type { StorageLike } from "../../src/storage/localProgress";
import {
  AGENT_OUTPUT_CACHE_KEY,
  AGENT_OUTPUT_VERSION,
  parseCachedAgentOutput,
  type CachedAgentOutput,
  type PreparedAgentOutput,
} from "./contracts";

const MAX_CACHE_ENTRIES = 16;

interface AgentCachePayload {
  version: typeof AGENT_OUTPUT_VERSION;
  entries: CachedAgentOutput[];
}

function cacheIdentity(
  value: Pick<PreparedAgentOutput, "runId" | "floor" | "evidenceHash">,
): string {
  return `${value.runId}:${value.floor}:${value.evidenceHash}`;
}

export class AgentCache {
  constructor(
    private readonly storage: StorageLike,
    private readonly key = AGENT_OUTPUT_CACHE_KEY,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(
    target: Pick<PreparedAgentOutput, "runId" | "floor" | "evidenceHash">,
  ): PreparedAgentOutput | null {
    const identity = cacheIdentity(target);
    const entry = this.read().find((candidate) => cacheIdentity(candidate) === identity);
    if (!entry) return null;
    const { preparedAt: _preparedAt, ...prepared } = entry;
    return prepared;
  }

  put(output: PreparedAgentOutput): void {
    const identity = cacheIdentity(output);
    const next: CachedAgentOutput = { ...output, preparedAt: this.now() };
    const entries = this.read().filter((entry) => cacheIdentity(entry) !== identity);
    entries.push(next);
    entries.sort((left, right) => right.preparedAt - left.preparedAt);
    const payload: AgentCachePayload = {
      version: AGENT_OUTPUT_VERSION,
      entries: entries.slice(0, MAX_CACHE_ENTRIES),
    };
    try {
      this.storage.setItem(this.key, JSON.stringify(payload));
    } catch {
      // Cache failure must never interrupt gameplay.
    }
  }

  private read(): CachedAgentOutput[] {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const value = JSON.parse(raw) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
      const payload = value as Partial<AgentCachePayload>;
      if (payload.version !== AGENT_OUTPUT_VERSION || !Array.isArray(payload.entries)) return [];
      return payload.entries
        .map(parseCachedAgentOutput)
        .filter((entry): entry is CachedAgentOutput => entry !== null)
        .slice(0, MAX_CACHE_ENTRIES);
    } catch {
      return [];
    }
  }
}
