import type { CampfireAgentContent } from "../../contracts/agent/campfireReview";
import type { AgentResponse, AgentRoleStatus } from "../../contracts/agent/main";
import type { ScribeAgentContent } from "../../contracts/agent/scribe";

export type AgentCacheKind = "campfire" | "scribe" | "main";

interface Entry<T> {
  value: T;
  status: AgentRoleStatus;
  savedAt: number;
}

type Values = {
  campfire: CampfireAgentContent;
  scribe: ScribeAgentContent;
  main: AgentResponse;
};

const READY_TTL_MS = 10 * 60 * 1_000;
const LOCAL_TTL_MS = 30 * 1_000;
const MAX_ENTRIES = 32;

/**
 * 页面生命周期内的三类 Agent 结果缓存。
 * ready 代表远程校验通过的结果，可以保留更久；local 代表本地回退文案，
 * 只短暂缓存，避免配置变化后长时间显示旧内容。
 */
export class AgentCache {
  private readonly maps = {
    campfire: new Map<string, Entry<CampfireAgentContent>>(),
    scribe: new Map<string, Entry<ScribeAgentContent>>(),
    main: new Map<string, Entry<AgentResponse>>(),
  };

  constructor(private readonly now: () => number = () => Date.now()) {}

  get<K extends AgentCacheKind>(kind: K, key: string): Values[K] | null {
    const map = this.maps[kind] as Map<string, Entry<Values[K]>>;
    const entry = map.get(key);
    if (!entry) return null;
    // 缓存过期时立即删除，后续调用不会重复看到已失效结果。
    const ttl = entry.status === "ready" ? READY_TTL_MS : LOCAL_TTL_MS;
    if (this.now() - entry.savedAt > ttl) {
      map.delete(key);
      return null;
    }
    return entry.value;
  }

  set<K extends AgentCacheKind>(
    kind: K,
    key: string,
    value: Values[K],
    status: AgentRoleStatus,
  ): void {
    const map = this.maps[kind] as Map<string, Entry<Values[K]>>;
    map.set(key, { value, status, savedAt: this.now() });
    // 超过上限时淘汰最早写入项，避免单页长时间运行导致内存无界增长。
    while (map.size > MAX_ENTRIES) {
      const oldest = [...map.entries()].reduce((left, right) => (
        left[1].savedAt <= right[1].savedAt ? left : right
      ));
      map.delete(oldest[0]);
    }
  }

  size(kind: AgentCacheKind): number {
    return this.maps[kind].size;
  }

  clear(): void {
    Object.values(this.maps).forEach((map) => map.clear());
  }
}
