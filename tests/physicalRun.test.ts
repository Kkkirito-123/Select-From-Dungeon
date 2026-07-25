import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/GameSession";
import { detectQueryFeatures } from "../src/domain/lessonEvaluator";
import { isMazeWalkable } from "../src/domain/mazeGenerator";
import { isSavedRun } from "../src/storage/localProgress";
import type {
  GroundItem,
  LessonId,
  Position,
  SqlQueryResult,
} from "../src/domain/types";

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

function key(position: Position): string {
  return `${position.x}:${position.y}`;
}

function teachingResult(
  sql: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  targetIds: number[] = [],
  plan: string[] = ["SEARCH physical run fixture"],
): SqlQueryResult {
  return {
    sql,
    columns,
    rows,
    targetIds,
    plan,
    baseHeat: 3,
    features: detectQueryFeatures(sql),
  };
}

const SANDBOX_ROWS = [
  { id: 1, item: "ore", quantity: 2, status: "ready" },
  { id: 2, item: "scale", quantity: 1, status: "damaged" },
  { id: 3, item: "fang", quantity: 1, status: "duplicate" },
  { id: 4, item: "fang", quantity: 1, status: "duplicate" },
  { id: 5, item: "core", quantity: 1, status: "ready" },
];

function sandboxResult(
  sql: string,
  rows: Array<Record<string, unknown>>,
): SqlQueryResult {
  return teachingResult(sql, ["id", "item", "quantity", "status"], rows);
}

const LESSON_QUERIES: Partial<Record<LessonId, SqlQueryResult[]>> = {
  select: [
    teachingResult(
      "SELECT name FROM monsters WHERE id = 1",
      ["name"],
      [{ name: "史莱姆" }],
    ),
    teachingResult(
      "SELECT weakness FROM monsters WHERE id = 1",
      ["weakness"],
      [{ weakness: "slash" }],
    ),
  ],
  where: [
    teachingResult(
      "SELECT id FROM monsters WHERE room_id = 2 AND status = 'escaped'",
      ["id"],
      [{ id: 2 }],
      [2],
    ),
    teachingResult(
      "SELECT weakness FROM monsters WHERE name = '水胶怪' AND status = 'escaped'",
      ["weakness"],
      [{ weakness: "focus" }],
    ),
  ],
  "is-null": [
    teachingResult(
      "SELECT id FROM monsters WHERE room_id = 3 AND master_id IS NULL",
      ["id"],
      [{ id: 3 }],
      [3],
    ),
    teachingResult(
      "SELECT name FROM monsters WHERE master_id IS NULL AND status = 'cursed'",
      ["name"],
      [{ name: "毒胶怪" }],
    ),
  ],
  "group-by": [
    teachingResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 4 GROUP BY channel",
      ["channel", "total"],
      [
        { channel: "echo", total: 3 },
        { channel: "noise", total: 1 },
      ],
    ),
  ],
  having: [
    teachingResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 2",
      ["channel", "total"],
      [
        { channel: "echo", total: 3 },
        { channel: "ward", total: 2 },
      ],
    ),
    teachingResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 3",
      ["channel", "total"],
      [{ channel: "echo", total: 3 }],
    ),
  ],
  "order-by": [
    teachingResult(
      "SELECT channel FROM monster_signals WHERE monster_id = 10 ORDER BY charge DESC LIMIT 1",
      ["channel"],
      [{ channel: "surge" }],
    ),
    teachingResult(
      "SELECT channel, charge FROM monster_signals WHERE monster_id = 10 ORDER BY charge DESC LIMIT 2",
      ["channel", "charge"],
      [
        { channel: "surge", charge: 13 },
        { channel: "arc", charge: 11 },
      ],
    ),
  ],
  distinct: [
    teachingResult(
      "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 11 ORDER BY channel",
      ["channel"],
      [{ channel: "echo" }, { channel: "mirror" }],
    ),
  ],
  "inner-join": [
    teachingResult(
      "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 12",
      ["name", "room_name"],
      [{ name: "树妖", room_name: "古树桥" }],
    ),
    teachingResult(
      "SELECT m.name, r.sector FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 12",
      ["name", "sector"],
      [{ name: "树妖", sector: "forest-bridge" }],
    ),
  ],
  "left-join": [
    teachingResult(
      "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 24 AND g.monster_id IS NULL",
      ["id"],
      [{ id: 13 }],
      [13],
    ),
  ],
  "join-boss": [
    teachingResult(
      "SELECT r.sector, COUNT(*) AS total FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE r.floor = 2 GROUP BY r.sector HAVING COUNT(*) >= 2 ORDER BY total DESC",
      ["sector", "total"],
      [
        { sector: "ambush", total: 4 },
        { sector: "storm", total: 2 },
      ],
    ),
    teachingResult(
      "SELECT m.name, g.power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 14 ORDER BY g.power DESC LIMIT 1",
      ["name", "power"],
      [{ name: "丛林王", power: 21 }],
    ),
  ],
  "f3-inner": [teachingResult(
    "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 23",
    ["name", "room_name"],
    [{ name: "骷髅", room_name: "骨桥前庭" }],
  )],
  "f3-left": [teachingResult(
    "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 42 AND g.monster_id IS NULL",
    ["id"],
    [{ id: 24 }],
    [24],
  )],
  "f3-self": [teachingResult(
    "SELECT child.name AS child_name, master.name AS master_name FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 25",
    ["child_name", "master_name"],
    [{ child_name: "幽灵", master_name: "死灵王" }],
  )],
  "f3-chain": [teachingResult(
    "SELECT r.name AS room_name, m.name, g.power FROM rooms r INNER JOIN monsters m ON r.id = m.room_id INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 26",
    ["room_name", "name", "power"],
    [{ room_name: "骑士墓", name: "铠骷髅", power: 18 }],
  )],
  "f3-union": [teachingResult(
    "SELECT id, name FROM monsters WHERE room_id = 41 UNION SELECT id, name FROM monsters WHERE room_id = 43 ORDER BY id",
    ["id", "name"],
    [{ id: 23, name: "骷髅" }, { id: 25, name: "幽灵" }],
  )],
  "f3-audit": [
    teachingResult(
      "SELECT r.sector, COUNT(*) AS total FROM rooms r INNER JOIN monsters m ON r.id = m.room_id WHERE r.floor = 3 AND m.room_id BETWEEN 41 AND 46 GROUP BY r.sector HAVING COUNT(*) >= 2 ORDER BY r.sector",
      ["sector", "total"],
      [
        { sector: "crypt", total: 2 },
        { sector: "grave", total: 2 },
        { sector: "throne", total: 2 },
      ],
    ),
    teachingResult(
      "SELECT m.name, g.power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id BETWEEN 41 AND 46 ORDER BY g.power DESC LIMIT 1",
      ["name", "power"],
      [{ name: "死灵王", power: 24 }],
    ),
  ],
  "f4-scalar": [teachingResult(
    "SELECT name FROM monsters WHERE id = (SELECT MIN(id) FROM monsters WHERE room_id = 51)",
    ["name"],
    [{ name: "火灵" }],
  )],
  "f4-in": [teachingResult(
    "SELECT name FROM monsters WHERE room_id IN (SELECT id FROM rooms WHERE floor = 4 AND sector = 'frost') ORDER BY name",
    ["name"],
    [{ name: "冰灵" }],
  )],
  "f4-exists": [teachingResult(
    "SELECT m.name FROM monsters m WHERE m.id = 36 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id)",
    ["name"],
    [{ name: "雷灵" }],
  )],
  "f4-correlated": [teachingResult(
    "SELECT m.name FROM monsters m WHERE m.id = 37 AND (SELECT MAX(g.power) FROM monster_gear g WHERE g.monster_id = m.id) >= 18",
    ["name"],
    [{ name: "石巨人" }],
  )],
  "f4-cte": [teachingResult(
    "WITH armored AS (SELECT monster_id FROM monster_gear WHERE power >= 20) SELECT m.name FROM monsters m INNER JOIN armored a ON m.id = a.monster_id WHERE m.id = 38",
    ["name"],
    [{ name: "炎王" }],
  )],
  "f4-recursive": [
    teachingResult(
      "WITH RECURSIVE room_ids(id) AS (SELECT 51 UNION ALL SELECT id + 1 FROM room_ids WHERE id < 53) SELECT r.name AS room_name FROM rooms r INNER JOIN room_ids x ON r.id = x.id ORDER BY r.id",
      ["room_name"],
      [{ room_name: "火室" }, { room_name: "冰库" }, { room_name: "雷池" }],
    ),
    teachingResult(
      "WITH RECURSIVE lineage(id, name, master_id, depth) AS (SELECT id, name, master_id, 1 FROM monsters WHERE id = 34 UNION ALL SELECT m.id, m.name, m.master_id, l.depth + 1 FROM monsters m INNER JOIN lineage l ON m.id = l.master_id WHERE l.depth < 3) SELECT name, depth FROM lineage ORDER BY depth",
      ["name", "depth"],
      [
        { name: "火灵", depth: 1 },
        { name: "石巨人", depth: 2 },
        { name: "元素王", depth: 3 },
      ],
    ),
  ],
  "f5-over": [teachingResult(
    "SELECT name, COUNT(*) OVER (PARTITION BY master_id) AS guard_total FROM monsters WHERE id BETWEEN 45 AND 47 ORDER BY id",
    ["name", "guard_total"],
    [
      { name: "哥布林", guard_total: 3 },
      { name: "兽人", guard_total: 3 },
      { name: "骑士", guard_total: 3 },
    ],
  )],
  "f5-row-number": [teachingResult(
    "SELECT m.name, r.sector, ROW_NUMBER() OVER (PARTITION BY r.sector ORDER BY g.power DESC, m.id) AS pos FROM monsters m INNER JOIN rooms r ON m.room_id = r.id INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 45 AND 48 ORDER BY r.sector, pos",
    ["name", "sector", "pos"],
    [
      { name: "铁骑", sector: "arena", pos: 1 },
      { name: "骑士", sector: "arena", pos: 2 },
      { name: "兽人", sector: "outer", pos: 1 },
      { name: "哥布林", sector: "outer", pos: 2 },
    ],
  )],
  "f5-rank": [teachingResult(
    "SELECT m.name, g.power, RANK() OVER (ORDER BY g.power DESC) AS rank_no, DENSE_RANK() OVER (ORDER BY g.power DESC) AS dense_no FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 46 AND 48 ORDER BY g.power DESC, m.id",
    ["name", "power", "rank_no", "dense_no"],
    [
      { name: "铁骑", power: 22, rank_no: 1, dense_no: 1 },
      { name: "兽人", power: 20, rank_no: 2, dense_no: 2 },
      { name: "骑士", power: 20, rank_no: 2, dense_no: 2 },
    ],
  )],
  "f5-lag-lead": [teachingResult(
    "SELECT m.name, g.power, LAG(g.power) OVER (ORDER BY m.id) AS prev_power, LEAD(g.power) OVER (ORDER BY m.id) AS next_power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 45 AND 49 ORDER BY m.id",
    ["name", "power", "prev_power", "next_power"],
    [
      { name: "哥布林", power: 18, prev_power: null, next_power: 20 },
      { name: "兽人", power: 20, prev_power: 18, next_power: 20 },
      { name: "骑士", power: 20, prev_power: 20, next_power: 22 },
      { name: "铁骑", power: 22, prev_power: 20, next_power: 24 },
      { name: "巨魔", power: 24, prev_power: 22, next_power: null },
    ],
  )],
  "f5-frame": [teachingResult(
    "SELECT m.name, SUM(g.power) OVER (ORDER BY m.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 45 AND 49 ORDER BY m.id",
    ["name", "running_power"],
    [
      { name: "哥布林", running_power: 18 },
      { name: "兽人", running_power: 38 },
      { name: "骑士", running_power: 58 },
      { name: "铁骑", running_power: 80 },
      { name: "巨魔", running_power: 104 },
    ],
  )],
  "f5-top-n": [
    teachingResult(
      "WITH ranked AS (SELECT r.sector, m.name, g.power, ROW_NUMBER() OVER (PARTITION BY r.sector ORDER BY g.power DESC, m.id) AS rn FROM monsters m INNER JOIN rooms r ON m.room_id = r.id INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 45 AND 50) SELECT sector, name, power FROM ranked WHERE rn = 1 ORDER BY sector",
      ["sector", "name", "power"],
      [
        { sector: "arena", name: "铁骑", power: 22 },
        { sector: "core", name: "城主", power: 28 },
        { sector: "outer", name: "兽人", power: 20 },
        { sector: "wall", name: "巨魔", power: 24 },
      ],
    ),
    teachingResult(
      "WITH ranked AS (SELECT r.sector, m.name, ROW_NUMBER() OVER (PARTITION BY r.sector ORDER BY g.power DESC, m.id) AS rn FROM monsters m INNER JOIN rooms r ON m.room_id = r.id INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 45 AND 48) SELECT sector, name, rn FROM ranked WHERE rn <= 2 ORDER BY sector, rn",
      ["sector", "name", "rn"],
      [
        { sector: "arena", name: "铁骑", rn: 1 },
        { sector: "arena", name: "骑士", rn: 2 },
        { sector: "outer", name: "兽人", rn: 1 },
        { sector: "outer", name: "哥布林", rn: 2 },
      ],
    ),
  ],
  "f6-insert": [sandboxResult(
    "INSERT INTO repair_queue(id, item, quantity, status) VALUES (6, 'claw', 2, 'ready')",
    [...SANDBOX_ROWS, { id: 6, item: "claw", quantity: 2, status: "ready" }],
  )],
  "f6-update": [sandboxResult(
    "UPDATE repair_queue SET status = 'fixed' WHERE id = 2",
    SANDBOX_ROWS.map((row) => row.id === 2 ? { ...row, status: "fixed" } : row),
  )],
  "f6-delete": [sandboxResult(
    "DELETE FROM repair_queue WHERE id = 4 AND status = 'duplicate'",
    SANDBOX_ROWS.filter((row) => row.id !== 4),
  )],
  "f6-constraint": [sandboxResult(
    "INSERT OR IGNORE INTO repair_queue(id, item, quantity, status) VALUES (6, 'bad', -1, 'ready')",
    SANDBOX_ROWS,
  )],
  "f6-transaction": [sandboxResult(
    "BEGIN; UPDATE repair_queue SET quantity = 9 WHERE id = 1; ROLLBACK",
    SANDBOX_ROWS,
  )],
  "f6-savepoint": [
    sandboxResult(
      "BEGIN; UPDATE repair_queue SET status = 'fixed' WHERE id = 2; SAVEPOINT clean; DELETE FROM repair_queue WHERE id = 3; ROLLBACK TO clean; COMMIT",
      SANDBOX_ROWS.map((row) => row.id === 2 ? { ...row, status: "fixed" } : row),
    ),
    sandboxResult(
      "BEGIN; SAVEPOINT repair; UPDATE repair_queue SET status = 'fixed' WHERE id = 2; DELETE FROM repair_queue WHERE id = 4; RELEASE repair; COMMIT",
      SANDBOX_ROWS
        .filter((row) => row.id !== 4)
        .map((row) => row.id === 2 ? { ...row, status: "fixed" } : row),
    ),
  ],
  "f7-btree": [teachingResult(
    "SELECT code, score FROM index_records WHERE id = 3",
    ["code", "score"],
    [{ code: "CRY-103", score: 72 }],
    [],
    ["SEARCH index_records USING INTEGER PRIMARY KEY (rowid=?)"],
  )],
  "f7-composite": [teachingResult(
    "SELECT code, score FROM index_records WHERE realm = 'crystal' AND score >= 80 ORDER BY score DESC",
    ["code", "score"],
    [
      { code: "CRY-106", score: 95 },
      { code: "CRY-104", score: 88 },
      { code: "CRY-102", score: 84 },
      { code: "CRY-107", score: 82 },
    ],
    [],
    ["SEARCH index_records USING INDEX idx_index_records_realm_score"],
  )],
  "f7-covering": [teachingResult(
    "SELECT category, code FROM index_records WHERE category = 'guard' ORDER BY code",
    ["category", "code"],
    [
      { category: "guard", code: "CRY-101" },
      { category: "guard", code: "CRY-102" },
      { category: "guard", code: "CRY-104" },
      { category: "guard", code: "EMB-201" },
      { category: "guard", code: "VOI-301" },
    ],
    [],
    ["SEARCH index_records USING COVERING INDEX idx_index_records_category_code"],
  )],
  "f7-invalid": [teachingResult(
    "SELECT code FROM index_records WHERE code >= 'CRY-105' AND code < 'CRY-108' ORDER BY code",
    ["code"],
    [{ code: "CRY-105" }, { code: "CRY-106" }, { code: "CRY-107" }],
    [],
    ["SEARCH index_records USING COVERING INDEX idx_index_records_code"],
  )],
  "f7-plan": [teachingResult(
    "SELECT realm, MAX(score) AS peak FROM index_records WHERE realm = 'ember' GROUP BY realm",
    ["realm", "peak"],
    [{ realm: "ember", peak: 92 }],
    [],
    ["SEARCH index_records USING COVERING INDEX idx_index_records_realm_score"],
  )],
  "f7-optimize": [
    teachingResult(
      "SELECT code, score FROM index_records WHERE realm = 'crystal' AND score >= 80 ORDER BY score DESC LIMIT 2",
      ["code", "score"],
      [{ code: "CRY-106", score: 95 }, { code: "CRY-104", score: 88 }],
      [],
      ["SEARCH index_records USING INDEX idx_index_records_realm_score"],
    ),
    teachingResult(
      "SELECT code FROM index_records WHERE category = 'boss' ORDER BY code",
      ["code"],
      [{ code: "CRY-106" }, { code: "CRY-107" }, { code: "EMB-203" }, { code: "VOI-302" }],
      [],
      ["SEARCH index_records USING COVERING INDEX idx_index_records_category_code"],
    ),
  ],
  "f8-mvcc": [teachingResult(
    "SELECT row_id, value FROM tx_versions WHERE created_tx <= 12 AND (expired_tx IS NULL OR expired_tx > 12) ORDER BY row_id",
    ["row_id", "value"],
    [{ row_id: 1, value: "crystal" }, { row_id: 2, value: "locked" }, { row_id: 3, value: "safe" }],
  )],
  "f8-lock": [teachingResult(
    "SELECT a.waiter_tx, a.blocker_tx FROM lock_waits a INNER JOIN lock_waits b ON a.waiter_tx = b.blocker_tx AND a.blocker_tx = b.waiter_tx WHERE a.waiter_tx < a.blocker_tx",
    ["waiter_tx", "blocker_tx"],
    [{ waiter_tx: "T1", blocker_tx: "T2" }],
  )],
  "f8-isolation": [teachingResult(
    "SELECT phenomenon, prevented_by FROM isolation_cases WHERE second_count > first_count ORDER BY id",
    ["phenomenon", "prevented_by"],
    [{ phenomenon: "phantom_read", prevented_by: "SERIALIZABLE" }],
  )],
  "f8-modeling": [teachingResult(
    "SELECT model FROM schema_choices WHERE has_primary_key = 1 AND has_unique_email = 1 AND duplicate_groups = 0 ORDER BY score DESC LIMIT 1",
    ["model"],
    [{ model: "normalized" }],
  )],
  "f8-replication": [teachingResult(
    "SELECT node, lag_ms FROM replica_status WHERE role = 'replica' AND healthy = 1 ORDER BY lag_ms LIMIT 1",
    ["node", "lag_ms"],
    [{ node: "replica-b", lag_ms: 18 }],
  )],
  "f8-sharding": [teachingResult(
    "SELECT shard_id, COUNT(*) AS total FROM shard_routes WHERE route_ok = 1 GROUP BY shard_id HAVING COUNT(*) >= 2 ORDER BY shard_id",
    ["shard_id", "total"],
    [{ shard_id: 0, total: 2 }, { shard_id: 2, total: 3 }],
  )],
  "f8-security": [
    teachingResult(
      "SELECT value FROM tx_versions WHERE row_id = 2 AND created_tx <= 12 AND (expired_tx IS NULL OR expired_tx > 12)",
      ["value"],
      [{ value: "locked" }],
    ),
    teachingResult(
      "SELECT waiter_tx, resource FROM lock_waits WHERE blocker_tx = 'T2' ORDER BY waiter_tx",
      ["waiter_tx", "resource"],
      [{ waiter_tx: "T1", resource: "account:7" }, { waiter_tx: "T3", resource: "log:2" }],
    ),
    teachingResult(
      "SELECT prevented_by FROM isolation_cases WHERE phenomenon = 'phantom_read'",
      ["prevented_by"],
      [{ prevented_by: "SERIALIZABLE" }],
    ),
    teachingResult(
      "SELECT node, lag_ms FROM replica_status WHERE role = 'replica' AND healthy = 0 ORDER BY lag_ms DESC",
      ["node", "lag_ms"],
      [{ node: "replica-a", lag_ms: 120 }],
    ),
    teachingResult(
      "SELECT method FROM security_cases WHERE parameterized = 1 AND least_privilege = 1 AND allowed = 1 ORDER BY id",
      ["method"],
      [{ method: "prepared-select" }],
    ),
  ],
};

const AMBUSH_QUERIES: Record<number, SqlQueryResult[]> = {
  6: [teachingResult(
    "SELECT name FROM monsters WHERE id = 6",
    ["name"],
    [{ name: "软泥怪" }],
  )],
  7: [teachingResult(
    "SELECT id FROM monsters WHERE room_id = 12 AND status = 'wet'",
    ["id"],
    [{ id: 7 }],
    [7],
  )],
  8: [teachingResult(
    "SELECT name FROM monsters WHERE master_id IS NULL AND status = 'toxic'",
    ["name"],
    [{ name: "毒胶怪" }],
  )],
  9: [
    teachingResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 9 GROUP BY channel",
    ["channel", "total"],
    [
      { channel: "echo", total: 2 },
      { channel: "noise", total: 2 },
    ],
    ),
    teachingResult(
      "SELECT name FROM monsters WHERE id = 9",
      ["name"],
      [{ name: "铁胶怪" }],
    ),
  ],
  15: [teachingResult(
    "SELECT channel FROM monster_signals WHERE monster_id = 15 ORDER BY charge DESC LIMIT 1",
    ["channel"],
    [{ channel: "surge" }],
  )],
  16: [teachingResult(
    "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 16 ORDER BY channel",
    ["channel"],
    [{ channel: "echo" }, { channel: "mirror" }],
  )],
  17: [teachingResult(
    "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 17",
    ["name", "room_name"],
    [{ name: "青蛙", room_name: "泥沼石径" }],
  )],
  18: [
    teachingResult(
      "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 34 AND g.monster_id IS NULL",
      ["id"],
      [{ id: 18 }],
      [18],
    ),
    teachingResult(
      "SELECT name FROM monsters WHERE id = 18 AND status = 'toxic'",
      ["name"],
      [{ name: "毒蛙" }],
    ),
  ],
  19: [teachingResult(
    "SELECT name, hp FROM monsters WHERE id = 19 ORDER BY hp DESC LIMIT 1",
    ["name", "hp"],
    [{ name: "猎犬", hp: 13 }],
  )],
  20: [
    teachingResult(
      "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 20",
      ["name", "room_name"],
      [{ name: "树妖", room_name: "树妖林地" }],
    ),
    teachingResult(
      "SELECT m.name, r.sector FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 20 ORDER BY r.sector LIMIT 1",
      ["name", "sector"],
      [{ name: "树妖", sector: "forest-treant" }],
    ),
  ],
  29: [teachingResult(
    "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 29",
    ["name", "room_name"],
    [{ name: "碎骨", room_name: "遗骨荒地" }],
  )],
  30: [teachingResult(
    "SELECT m.name FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 30 AND g.monster_id IS NULL",
    ["name"],
    [{ name: "腐尸" }],
  )],
  31: [
    teachingResult(
      "SELECT child.name, master.name AS master_name FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 31",
      ["name", "master_name"],
      [{ name: "鬼火", master_name: "墓主" }],
    ),
    teachingResult(
      "SELECT name FROM monsters WHERE id = 31 AND status = 'haunting'",
      ["name"],
      [{ name: "鬼火" }],
    ),
  ],
  32: [teachingResult(
    "SELECT child.name, master.name AS master_name FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 32",
    ["name", "master_name"],
    [{ name: "游魂", master_name: "墓主" }],
  )],
  40: [teachingResult(
    "SELECT name FROM monsters WHERE id = (SELECT MIN(id) FROM monsters WHERE room_id = 57)",
    ["name"],
    [{ name: "火苗" }],
  )],
  41: [teachingResult(
    "SELECT name FROM monsters WHERE room_id IN (SELECT id FROM rooms WHERE sector = 'frost-vault') ORDER BY name",
    ["name"],
    [{ name: "冰晶" }],
  )],
  42: [
    teachingResult(
      "SELECT m.name FROM monsters m WHERE m.id = 42 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id)",
      ["name"],
      [{ name: "雷兽" }],
    ),
    teachingResult(
      "SELECT name FROM monsters WHERE id = 42 AND status = 'charged'",
      ["name"],
      [{ name: "雷兽" }],
    ),
  ],
  43: [teachingResult(
    "SELECT m.name FROM monsters m WHERE m.id = 43 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id)",
    ["name"],
    [{ name: "电球" }],
  )],
  51: [teachingResult(
    "SELECT name, COUNT(*) OVER (PARTITION BY master_id) AS guard_total FROM monsters WHERE id BETWEEN 51 AND 52 ORDER BY id",
    ["name", "guard_total"],
    [{ name: "小妖", guard_total: 2 }, { name: "战兽", guard_total: 2 }],
  )],
  52: [teachingResult(
    "SELECT m.name, ROW_NUMBER() OVER (ORDER BY g.power DESC, m.id) AS pos FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 52 ORDER BY pos",
    ["name", "pos"],
    [{ name: "战兽", pos: 1 }, { name: "小妖", pos: 2 }],
  )],
  53: [teachingResult(
    "SELECT m.name, g.power, RANK() OVER (ORDER BY g.power DESC) AS rank_no FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 52 AND 53 ORDER BY g.power DESC, m.id",
    ["name", "power", "rank_no"],
    [
      { name: "铁卫", power: 24, rank_no: 1 },
      { name: "战兽", power: 20, rank_no: 2 },
    ],
  )],
  54: [teachingResult(
    "SELECT m.name, SUM(g.power) OVER (ORDER BY m.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 54 ORDER BY m.id",
    ["name", "running_power"],
    [
      { name: "小妖", running_power: 18 },
      { name: "战兽", running_power: 38 },
      { name: "铁卫", running_power: 62 },
      { name: "巨魔", running_power: 84 },
    ],
  )],
  62: [sandboxResult(
    "INSERT INTO repair_queue(id, item, quantity, status) VALUES (7, 'ember', 1, 'ready')",
    [...SANDBOX_ROWS, { id: 7, item: "ember", quantity: 1, status: "ready" }],
  )],
  63: [sandboxResult(
    "UPDATE repair_queue SET quantity = 3 WHERE id = 1",
    SANDBOX_ROWS.map((row) => row.id === 1 ? { ...row, quantity: 3 } : row),
  )],
  64: [sandboxResult(
    "BEGIN; UPDATE repair_queue SET quantity = 8 WHERE id = 1; ROLLBACK",
    SANDBOX_ROWS,
  )],
  65: [sandboxResult(
    "INSERT OR IGNORE INTO repair_queue(id, item, quantity, status) VALUES (7, 'bad', -2, 'ready')",
    SANDBOX_ROWS,
  )],
  73: [teachingResult(
    "SELECT code FROM index_records WHERE id = 1",
    ["code"],
    [{ code: "CRY-101" }],
  )],
  74: [teachingResult(
    "SELECT code, score FROM index_records WHERE realm = 'crystal' AND score >= 88 ORDER BY score DESC",
    ["code", "score"],
    [{ code: "CRY-106", score: 95 }, { code: "CRY-104", score: 88 }],
    [],
    ["SEARCH idx_index_records_realm_score"],
  )],
  75: [teachingResult(
    "SELECT category, code FROM index_records WHERE category = 'charm' ORDER BY code",
    ["category", "code"],
    [{ category: "charm", code: "CRY-105" }, { category: "charm", code: "EMB-202" }],
    [],
    ["SEARCH USING COVERING INDEX idx_index_records_category_code"],
  )],
  76: [teachingResult(
    "SELECT code FROM index_records WHERE code >= 'CRY-101' AND code < 'CRY-103' ORDER BY code",
    ["code"],
    [{ code: "CRY-101" }, { code: "CRY-102" }],
    [],
    ["SEARCH idx_index_records_code"],
  )],
  85: [teachingResult(
    "SELECT value FROM tx_versions WHERE row_id = 3 AND created_tx <= 12 AND (expired_tx IS NULL OR expired_tx > 12)",
    ["value"],
    [{ value: "safe" }],
  )],
  86: [teachingResult(
    "SELECT blocker_tx, resource FROM lock_waits WHERE waiter_tx = 'T3'",
    ["blocker_tx", "resource"],
    [{ blocker_tx: "T2", resource: "log:2" }],
  )],
  87: [teachingResult(
    "SELECT first_count, second_count FROM isolation_cases WHERE phenomenon = 'phantom_read'",
    ["first_count", "second_count"],
    [{ first_count: 2, second_count: 4 }],
  )],
  88: [teachingResult(
    "SELECT model, score FROM schema_choices WHERE duplicate_groups = 0 ORDER BY score DESC LIMIT 1",
    ["model", "score"],
    [{ model: "normalized", score: 95 }],
  )],
};

function pathToAny(session: GameSession, goals: readonly Position[]): Position[] {
  const snapshot = session.snapshot();
  const completed = new Set(snapshot.completedLessons);
  const livingActors = new Set(snapshot.worldActors.flatMap((actor) => {
    const alive = snapshot.monsters.some(
      (monster) => monster.id === actor.monsterId && monster.hp > 0,
    );
    return alive ? [key(actor)] : [];
  }));
  const goalKeys = new Set(goals.map(key));
  const start = { x: snapshot.player.x, y: snapshot.player.y };
  const pending: Position[] = [start];
  const previous = new Map<string, { from: string; step: Position }>();
  const visited = new Set([key(start)]);
  let reached: string | null = goalKeys.has(key(start)) ? key(start) : null;

  while (!reached && pending.length > 0) {
    const current = pending.shift();
    if (!current) break;
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next);
      if (
        visited.has(nextKey) ||
        livingActors.has(nextKey) ||
        !isMazeWalkable(snapshot.mazeFloor, next.x, next.y, completed)
      ) continue;
      visited.add(nextKey);
      previous.set(nextKey, { from: key(current), step: direction });
      if (goalKeys.has(nextKey)) {
        reached = nextKey;
        break;
      }
      pending.push(next);
    }
  }

  if (!reached) throw new Error(`没有纯步行路径可到达：${[...goalKeys].join(", ")}`);
  const path: Position[] = [];
  let cursor = reached;
  while (cursor !== key(start)) {
    const link = previous.get(cursor);
    if (!link) throw new Error(`路径回溯失败：${cursor}`);
    path.unshift(link.step);
    cursor = link.from;
  }
  return path;
}

function walkPath(session: GameSession, path: readonly Position[]): void {
  path.forEach((step) => {
    const move = session.attemptPlayerMove(step.x, step.y);
    expect(move, move.message).toMatchObject({ ok: true, moved: true });
    if (move.encounterId !== null) {
      const queries = AMBUSH_QUERIES[move.encounterId];
      if (!queries) throw new Error(`突发遭遇没有测试查询：${move.encounterId}`);
      queries.forEach((query) => {
        const resolution = session.resolveQuery(query);
        expect(resolution.accepted, resolution.message).toBe(true);
      });
      let repeatCount = 0;
      while (session.snapshot().mode === "combat" && repeatCount < 10) {
        const resolution = session.resolveQuery(queries.at(-1)!);
        expect(resolution.accepted, resolution.message).toBe(true);
        repeatCount += 1;
      }
      expect(session.snapshot().mode).toBe("explore");
    }
  });
}

function walkTo(session: GameSession, destination: Position): void {
  walkPath(session, pathToAny(session, [destination]));
  expect(session.snapshot().player).toMatchObject({
    x: destination.x,
    y: destination.y,
  });
}

function engageLessonByWalking(session: GameSession, lessonId: LessonId): void {
  const snapshot = session.snapshot();
  const monster = snapshot.monsters.find((entry) => entry.lessonId === lessonId);
  if (!monster) throw new Error(`缺少课程怪物：${lessonId}`);
  const actor = snapshot.worldActors.find((entry) => entry.monsterId === monster.id);
  if (!actor) throw new Error(`缺少课程 Actor：${lessonId}`);
  const adjacent = DIRECTIONS.map((direction) => ({
    x: actor.x + direction.x,
    y: actor.y + direction.y,
  })).filter((position) => isMazeWalkable(
    snapshot.mazeFloor,
    position.x,
    position.y,
    new Set(snapshot.completedLessons),
  ));
  walkPath(session, pathToAny(session, adjacent));
  const player = session.snapshot().player;
  const encounter = session.attemptPlayerMove(actor.x - player.x, actor.y - player.y);
  expect(encounter).toMatchObject({ ok: true, moved: false, encounterId: monster.id });
  expect(session.snapshot()).toMatchObject({ mode: "combat", lessonId });
}

function collectItemByWalking(session: GameSession, item: GroundItem): void {
  walkTo(session, item);
  if (item.collection === "interact") {
    expect(session.interact()).toMatchObject({ ok: true });
  } else {
    expect(session.snapshot().groundItems.some((entry) => entry.id === item.id)).toBe(false);
  }
}

function clearLessonByWalking(session: GameSession, lessonId: LessonId): void {
  engageLessonByWalking(session, lessonId);
  const queries = LESSON_QUERIES[lessonId];
  if (!queries) throw new Error(`课程没有测试查询：${lessonId}`);
  let finalResolution: ReturnType<GameSession["resolveQuery"]> | null = null;
  queries.forEach((query) => {
    const resolution = session.resolveQuery(query);
    expect(resolution.accepted, resolution.message).toBe(true);
    finalResolution = resolution;
  });
  let repeatCount = 0;
  while (session.snapshot().mode === "combat" && repeatCount < 10) {
    const resolution = session.resolveQuery(queries.at(-1)!);
    expect(resolution.accepted, resolution.message).toBe(true);
    finalResolution = resolution;
    repeatCount += 1;
  }
  expect(finalResolution?.lessonCompleted).toBe(lessonId);
  const snapshot = session.snapshot();
  const monster = snapshot.monsters.find((entry) => entry.lessonId === lessonId);
  const bundle = snapshot.lootBundles.find(
    (entry) => entry.sourceMonsterId === monster?.id,
  );
  if (!bundle) throw new Error(`${lessonId} 应产生课程战利品包`);
  walkTo(session, bundle);
  expect(session.interact()).toMatchObject({ ok: true, kind: "loot-bundle" });
  const protectedWeapon = bundle.items.find((item) => item.kind === "weapon" && item.protected);
  if (protectedWeapon) {
    let equipped = session.takeLootItem(bundle.id, protectedWeapon.dropId, "equip");
    if (!equipped.ok) {
      const replaceable = session.snapshot().equipmentInventory.find((item) => !item.protected);
      if (!replaceable) throw new Error(`${lessonId} 背包已满且没有可替换装备`);
      equipped = session.takeLootItem(
        bundle.id,
        protectedWeapon.dropId,
        "equip",
        replaceable.instanceId,
      );
    }
    expect(equipped.ok, equipped.message).toBe(true);
  }
  if (session.snapshot().mode === "loot") {
    expect(session.takeAllLoot(bundle.id).ok).toBe(true);
  }
  if (session.snapshot().mode === "loot") session.closeLootBundle();
}

function collectAggregateHammer(session: GameSession): void {
  const hammer = session.snapshot().groundItems.find(
    (item) => item.rewardId === "aggregate-hammer",
  );
  if (!hammer) throw new Error("聚合战锤没有生成在物理迷宫中");
  collectItemByWalking(session, hammer);
  expect(session.snapshot().player.weapon.id).toBe("aggregate-hammer");
}

describe("continuous physical maze run", () => {
  it.each([
    ["where", "is-null"],
    ["is-null", "where"],
  ] as const)("分支顺序 %s → %s 不依赖调试传送也能贯通八层", (first, second) => {
    const session = new GameSession(null, null, `physical-${first}-${second}`);
    clearLessonByWalking(session, "select");
    clearLessonByWalking(session, first);
    clearLessonByWalking(session, second);
    collectAggregateHammer(session);
    clearLessonByWalking(session, "group-by");
    clearLessonByWalking(session, "having");

    expect(session.snapshot()).toMatchObject({ mode: "transition", floor: 1 });
    expect(session.advanceFloor()).toBe(true);
    expect(session.snapshot()).toMatchObject({ mode: "explore", floor: 2 });

    clearLessonByWalking(session, "order-by");
    clearLessonByWalking(session, "distinct");
    clearLessonByWalking(session, "inner-join");
    clearLessonByWalking(session, "left-join");
    clearLessonByWalking(session, "join-boss");

    expect(session.snapshot()).toMatchObject({ mode: "transition", floor: 2 });
    expect(session.advanceFloor()).toBe(true);
    expect(session.snapshot()).toMatchObject({ mode: "explore", floor: 3 });
    expect(isSavedRun(session.toSavedRun())).toBe(true);

    clearLessonByWalking(session, "f3-inner");
    clearLessonByWalking(session, "f3-left");
    clearLessonByWalking(session, "f3-self");
    clearLessonByWalking(session, "f3-chain");
    clearLessonByWalking(session, "f3-union");
    clearLessonByWalking(session, "f3-audit");

    expect(session.snapshot()).toMatchObject({ mode: "transition", floor: 3 });
    expect(session.advanceFloor()).toBe(true);
    expect(session.snapshot()).toMatchObject({ mode: "explore", floor: 4 });
    expect(isSavedRun(session.toSavedRun())).toBe(true);

    clearLessonByWalking(session, "f4-scalar");
    clearLessonByWalking(session, "f4-in");
    clearLessonByWalking(session, "f4-exists");
    clearLessonByWalking(session, "f4-correlated");
    clearLessonByWalking(session, "f4-cte");
    clearLessonByWalking(session, "f4-recursive");

    expect(session.snapshot()).toMatchObject({ mode: "transition", floor: 4 });
    expect(session.advanceFloor()).toBe(true);
    expect(session.snapshot()).toMatchObject({ mode: "explore", floor: 5 });
    expect(isSavedRun(session.toSavedRun())).toBe(true);

    clearLessonByWalking(session, "f5-over");
    clearLessonByWalking(session, "f5-row-number");
    clearLessonByWalking(session, "f5-rank");
    clearLessonByWalking(session, "f5-lag-lead");
    clearLessonByWalking(session, "f5-frame");
    clearLessonByWalking(session, "f5-top-n");

    expect(session.snapshot()).toMatchObject({ mode: "transition", floor: 5 });
    expect(session.advanceFloor()).toBe(true);
    expect(session.snapshot()).toMatchObject({ mode: "explore", floor: 6 });
    expect(isSavedRun(session.toSavedRun())).toBe(true);

    clearLessonByWalking(session, "f6-insert");
    clearLessonByWalking(session, "f6-update");
    clearLessonByWalking(session, "f6-delete");
    clearLessonByWalking(session, "f6-constraint");
    clearLessonByWalking(session, "f6-transaction");
    clearLessonByWalking(session, "f6-savepoint");

    expect(session.snapshot()).toMatchObject({ mode: "transition", floor: 6 });
    expect(session.advanceFloor()).toBe(true);
    expect(session.snapshot()).toMatchObject({ mode: "explore", floor: 7 });
    expect(isSavedRun(session.toSavedRun())).toBe(true);

    clearLessonByWalking(session, "f7-btree");
    clearLessonByWalking(session, "f7-composite");
    clearLessonByWalking(session, "f7-covering");
    clearLessonByWalking(session, "f7-invalid");
    clearLessonByWalking(session, "f7-plan");
    clearLessonByWalking(session, "f7-optimize");

    expect(session.snapshot()).toMatchObject({ mode: "transition", floor: 7 });
    expect(session.advanceFloor()).toBe(true);
    expect(session.snapshot()).toMatchObject({ mode: "explore", floor: 8 });
    expect(isSavedRun(session.toSavedRun())).toBe(true);

    clearLessonByWalking(session, "f8-mvcc");
    clearLessonByWalking(session, "f8-lock");
    clearLessonByWalking(session, "f8-isolation");
    clearLessonByWalking(session, "f8-modeling");
    clearLessonByWalking(session, "f8-replication");
    clearLessonByWalking(session, "f8-sharding");
    clearLessonByWalking(session, "f8-security");

    expect(session.snapshot().mode).toBe("victory");
    expect(session.snapshot().campaign).toMatchObject({
      currentFloor: 8,
      status: "completed",
    });
    expect(session.snapshot().campaign.floors.every(
      (slot) => slot.status === "cleared",
    )).toBe(true);
    expect(isSavedRun(session.toSavedRun())).toBe(true);
    expect(session.snapshot().completedLessons).toEqual([
      "f8-mvcc",
      "f8-lock",
      "f8-isolation",
      "f8-modeling",
      "f8-replication",
      "f8-sharding",
      "f8-security",
    ]);
    expect(session.toProfile().masteredLessons).toEqual([
      "select",
      first,
      second,
      "group-by",
      "having",
      "order-by",
      "distinct",
      "inner-join",
      "left-join",
      "join-boss",
      "f3-inner",
      "f3-left",
      "f3-self",
      "f3-chain",
      "f3-union",
      "f3-audit",
      "f4-scalar",
      "f4-in",
      "f4-exists",
      "f4-correlated",
      "f4-cte",
      "f4-recursive",
      "f5-over",
      "f5-row-number",
      "f5-rank",
      "f5-lag-lead",
      "f5-frame",
      "f5-top-n",
      "f6-insert",
      "f6-update",
      "f6-delete",
      "f6-constraint",
      "f6-transaction",
      "f6-savepoint",
      "f7-btree",
      "f7-composite",
      "f7-covering",
      "f7-invalid",
      "f7-plan",
      "f7-optimize",
      "f8-mvcc",
      "f8-lock",
      "f8-isolation",
      "f8-modeling",
      "f8-replication",
      "f8-sharding",
      "f8-security",
    ]);
    expect(session.toProfile().victories).toBe(1);
  }, 20_000);
});
