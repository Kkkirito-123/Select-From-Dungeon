import type { CampfireAgentContent } from "../../contracts/agent/campfireReview";
import type { DirectorAgentResponse, DirectorRoleStatus } from "../../contracts/agent/director";
import type { ScribeAgentContent } from "../../contracts/agent/scribe";

export type AgentCacheKind = "campfire" | "scribe" | "main";

interface Entry<T> {
  value: T;
  status: DirectorRoleStatus;
  savedAt: number;
}

type Values = {
  campfire: CampfireAgentContent;
  scribe: ScribeAgentContent;
  main: DirectorAgentResponse;
};

const READY_TTL_MS = 10 * 60 * 1_000;
const LOCAL_TTL_MS = 30 * 1_000;
const MAX_ENTRIES = 32;

export class AgentCache {
  private readonly maps = {
    campfire: new Map<string, Entry<CampfireAgentContent>>(),
    scribe: new Map<string, Entry<ScribeAgentContent>>(),
    main: new Map<string, Entry<DirectorAgentResponse>>(),
  };

  constructor(private readonly now: () => number = () => Date.now()) {}

  get<K extends AgentCacheKind>(kind: K, key: string): Values[K] | null {
    const map = this.maps[kind] as Map<string, Entry<Values[K]>>;
    const entry = map.get(key);
    if (!entry) return null;
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
    status: DirectorRoleStatus,
  ): void {
    const map = this.maps[kind] as Map<string, Entry<Values[K]>>;
    map.set(key, { value, status, savedAt: this.now() });
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
