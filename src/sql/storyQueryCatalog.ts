export type StoryQueryId =
  | "f1-current-resident"
  | "f1-restore-contradiction"
  | "f2-seven-source-summary"
  | "f2-seven-source-pages";

export interface StoryQueryDefinition {
  id: StoryQueryId;
  floor: 1 | 2;
  title: string;
  sql: string;
  expectedColumns: readonly string[];
  expectedRowCount: number;
  purpose: string;
}

export const STORY_QUERY_CATALOG: readonly StoryQueryDefinition[] = [
  {
    id: "f1-current-resident",
    floor: 1,
    title: "当前居民查询",
    sql: "SELECT id FROM residents WHERE restore_trace = 'CURRENT';",
    expectedColumns: [],
    expectedRowCount: 0,
    purpose: "确认当前居民表中没有一行能够单独代表玩家。",
  },
  {
    id: "f1-restore-contradiction",
    floor: 1,
    title: "旧恢复轨迹计数",
    sql: "SELECT restore_trace, COUNT(*) AS total FROM residents GROUP BY restore_trace ORDER BY restore_trace;",
    expectedColumns: ["restore_trace", "total"],
    expectedRowCount: 1,
    purpose: "证明旧记录共享恢复轨迹，但不能由此断言它们是同一人。",
  },
  {
    id: "f2-seven-source-summary",
    floor: 2,
    title: "七个来源区域",
    sql: "SELECT sector, COUNT(*) AS total FROM identity_sources WHERE restore_trace = 'TRACE-7F' GROUP BY sector ORDER BY sector;",
    expectedColumns: ["sector", "total"],
    expectedRowCount: 5,
    purpose: "确认同一恢复轨迹来自多个地点，不能按轨迹覆盖成一页。",
  },
  {
    id: "f2-seven-source-pages",
    floor: 2,
    title: "七页并列记录",
    sql: "SELECT alias_name, source_kind, sector FROM identity_sources WHERE restore_trace = 'TRACE-7F' ORDER BY id;",
    expectedColumns: ["alias_name", "source_kind", "sector"],
    expectedRowCount: 7,
    purpose: "把七个短名分别连接回来源，不把任何一个标为玩家真名。",
  },
] as const;

export function storyQuery(id: StoryQueryId): StoryQueryDefinition {
  const definition = STORY_QUERY_CATALOG.find((entry) => entry.id === id);
  if (!definition) throw new Error(`未知剧情查询：${id}`);
  return definition;
}
