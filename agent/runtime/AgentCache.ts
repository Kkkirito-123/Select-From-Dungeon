/**
 * 浏览器端 Agent 输出缓存。
 * 缓存只保存已通过契约校验的文本，并用 Run、楼层和证据 Hash 隔离不同上下文。
 */
import type { StorageLike } from "../../src/storage/localProgress";
import { AGENT_RUNTIME_CONFIG } from "../../src/config/runtimeConfig";
import {
  AGENT_OUTPUT_CACHE_KEY,
  AGENT_OUTPUT_VERSION,
  parseCachedAgentOutput,
  type CachedAgentOutput,
  type PreparedAgentOutput,
} from "./contracts";

const MAX_CACHE_ENTRIES = AGENT_RUNTIME_CONFIG.maxOutputCacheEntries;

interface AgentCachePayload {
  /** 版本变化时丢弃旧结构，避免旧输出污染新协议。 */
  version: typeof AGENT_OUTPUT_VERSION;
  entries: CachedAgentOutput[];
}

function cacheIdentity(
  value: Pick<PreparedAgentOutput, "runId" | "floor" | "evidenceHash">,
): string {
  // 同一证据只能复用同一份输出，避免重复请求模型或串用其他楼层内容。
  return `${value.runId}:${value.floor}:${value.evidenceHash}`;
}

export class AgentCache {
  /** 提供容错的读写封装；存储异常不能影响探索和战斗。 */
  constructor(
    private readonly storage: StorageLike,
    private readonly key = AGENT_OUTPUT_CACHE_KEY,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(
    target: Pick<PreparedAgentOutput, "runId" | "floor" | "evidenceHash">,
  ): PreparedAgentOutput | null {
    // preparedAt 只用于淘汰顺序，不暴露给游戏消费方。
    const identity = cacheIdentity(target);
    const entry = this.read().find((candidate) => cacheIdentity(candidate) === identity);
    if (!entry) return null;
    const { preparedAt: _preparedAt, ...prepared } = entry;
    return prepared;
  }

  put(output: PreparedAgentOutput): void {
    // 新输出覆盖同身份旧值，并按最近使用时间限制缓存大小。
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
    // 任意损坏、版本不匹配或不符合闭合协议的数据都按空缓存处理。
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
