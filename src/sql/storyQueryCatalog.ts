/**
 * 故事专用查询目录。
 * 每条查询绑定固定输入表、输出列和叙事证据，避免剧情层自行拼接 SQL。
 */
export type StoryQueryId =
  | "f1-current-resident"
  | "f1-restore-contradiction"
  | "f2-seven-source-summary"
  | "f2-seven-source-pages"
  | "f3-unarmed-record-preserved"
  | "f3-room-relic-chain"
  | "f4-three-incident-fronts"
  | "f4-dependency-lineage"
  | "f5-stable-duty-order"
  | "f5-ties-preserved"
  | "f6-duplicate-candidates"
  | "f6-baseline-restored"
  | "f7-all-realms-present"
  | "f7-crystal-plan-candidates"
  | "f8-visible-snapshot"
  | "f8-deadlock-cycle";

export interface StoryQueryDefinition {
  /** 一条只读故事查询及其可展示的确定性结果。 */
  id: StoryQueryId;
  floor: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
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
  {
    id: "f3-unarmed-record-preserved",
    floor: 3,
    title: "右表缺失，左侧记录仍在",
    sql: "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 42 AND g.monster_id IS NULL;",
    expectedColumns: ["id"],
    expectedRowCount: 1,
    purpose: "证明没有装备明细不等于怪物记录不存在；缺失关系必须与主体缺失分开判断。",
  },
  {
    id: "f3-room-relic-chain",
    floor: 3,
    title: "墓室、记录与遗物的关系链",
    sql: "SELECT r.name AS room_name, m.id, g.power FROM rooms r INNER JOIN monsters m ON r.id = m.room_id INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 26;",
    expectedColumns: ["room_name", "id", "power"],
    expectedRowCount: 1,
    purpose: "用两条明确连接条件重建一条关系链，不依赖已经丢失的怪物名字。",
  },
  {
    id: "f4-three-incident-fronts",
    floor: 4,
    title: "火、冰、雷三处事故前线",
    sql: "SELECT sector, COUNT(*) AS total FROM rooms WHERE floor = 4 AND id BETWEEN 51 AND 53 GROUP BY sector ORDER BY sector;",
    expectedColumns: ["sector", "total"],
    expectedRowCount: 3,
    purpose: "把三处事故分别计数，先证明它们同时存在，再继续追查共同依赖。",
  },
  {
    id: "f4-dependency-lineage",
    floor: 4,
    title: "沿 master_id 追溯的三层依赖",
    sql: "WITH RECURSIVE lineage(id, master_id, depth) AS (SELECT id, master_id, 1 FROM monsters WHERE id = 34 UNION ALL SELECT m.id, m.master_id, l.depth + 1 FROM monsters m INNER JOIN lineage l ON m.id = l.master_id WHERE l.depth < 3) SELECT id, depth FROM lineage ORDER BY depth;",
    expectedColumns: ["id", "depth"],
    expectedRowCount: 3,
    purpose: "证明不同事故记录可以沿明确依赖追到同一核心，但不把相关性冒充已经完成的写操作。",
  },
  {
    id: "f5-stable-duty-order",
    floor: 5,
    title: "岗次没有吞掉任何人",
    sql: "SELECT r.sector, m.id, g.power, ROW_NUMBER() OVER (PARTITION BY r.sector ORDER BY g.power DESC, m.id) AS pos FROM monsters m INNER JOIN rooms r ON m.room_id = r.id INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 45 AND 48 ORDER BY r.sector, pos;",
    expectedColumns: ["sector", "id", "power", "pos"],
    expectedRowCount: 4,
    purpose: "证明岗次来自显式分区与稳定排序；四条守卫记录都仍然存在。",
  },
  {
    id: "f5-ties-preserved",
    floor: 5,
    title: "并列不是缺失",
    sql: "SELECT m.id, g.power, RANK() OVER (ORDER BY g.power DESC) AS rank_no, DENSE_RANK() OVER (ORDER BY g.power DESC) AS dense_no FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 46 AND 48 ORDER BY g.power DESC, m.id;",
    expectedColumns: ["id", "power", "rank_no", "dense_no"],
    expectedRowCount: 3,
    purpose: "让相同力量的记录并列出现，不再把相同名次误判为重复数据。",
  },
  {
    id: "f6-duplicate-candidates",
    floor: 6,
    title: "删除前先看清目标",
    sql: "SELECT id, item, status FROM repair_queue WHERE status = 'duplicate' ORDER BY id;",
    expectedColumns: ["id", "item", "status"],
    expectedRowCount: 2,
    purpose: "在执行删除前固定候选集合；只能处理指定 id，不能凭标签清空全部记录。",
  },
  {
    id: "f6-baseline-restored",
    floor: 6,
    title: "回滚后的原始工单",
    sql: "SELECT id, item, quantity, status FROM repair_queue ORDER BY id;",
    expectedColumns: ["id", "item", "quantity", "status"],
    expectedRowCount: 5,
    purpose: "确认训练中的写操作只发生在一次性沙箱，主档案仍保持五条基线记录。",
  },
  {
    id: "f7-all-realms-present",
    floor: 7,
    title: "没有被索引遮住的领域",
    sql: "SELECT realm, COUNT(*) AS total FROM index_records GROUP BY realm ORDER BY realm;",
    expectedColumns: ["realm", "total"],
    expectedRowCount: 3,
    purpose: "证明索引改变的是抵达记录的路径，而不是删去未被选中的领域。",
  },
  {
    id: "f7-crystal-plan-candidates",
    floor: 7,
    title: "水晶根道的前两条记录",
    sql: "SELECT code, score FROM index_records WHERE realm = 'crystal' ORDER BY score DESC LIMIT 2;",
    expectedColumns: ["code", "score"],
    expectedRowCount: 2,
    purpose: "把范围、排序和截断写成可复现的查询，计划树因此能够解释选择路径。",
  },
  {
    id: "f8-visible-snapshot",
    floor: 8,
    title: "事务 12 的可见版本",
    sql: "SELECT row_id, value FROM tx_versions WHERE created_tx <= 12 AND (expired_tx IS NULL OR expired_tx > 12) ORDER BY row_id;",
    expectedColumns: ["row_id", "value"],
    expectedRowCount: 3,
    purpose: "同一时刻只展示满足可见性规则的版本；旧记录并未因此从历史中消失。",
  },
  {
    id: "f8-deadlock-cycle",
    floor: 8,
    title: "双骑互锁的两条边",
    sql: "SELECT waiter_tx, blocker_tx, resource FROM lock_waits WHERE waiter_tx IN ('T1', 'T2') ORDER BY waiter_tx;",
    expectedColumns: ["waiter_tx", "blocker_tx", "resource"],
    expectedRowCount: 2,
    purpose: "把互相等待画成两条有方向的边，证明死锁来自一个闭合等待环。",
  },
] as const;

export function storyQuery(id: StoryQueryId): StoryQueryDefinition {
  // 未知 ID 属于内容开发错误，应在查询调用处立即暴露。
  const definition = STORY_QUERY_CATALOG.find((entry) => entry.id === id);
  if (!definition) throw new Error(`未知剧情查询：${id}`);
  return definition;
}
