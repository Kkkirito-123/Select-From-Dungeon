/** 物理 SQL 密门题目与结果契约；成功只改变对应门，不授予课程精通。 */
import type {
  FloorNumber,
} from "../domain/runGraph";
import type {
  GateChallengeBrief,
  GateChallengeId,
  QueryFeature,
  SqlQueryResult,
} from "../domain/types";
import { sqlSchemaLine } from "./sqlSchema";

interface GateChallengeDefinition {
  id: GateChallengeId;
  title: string;
  objective: string;
  schema: string[];
  hints: string[];
  requiredFeatures: QueryFeature[];
  expectedColumns: string[];
  expectedRows: Array<Record<string, unknown>>;
}

export interface GateChallengeEvaluation {
  accepted: boolean;
  message: string;
  missingFeatures: QueryFeature[];
}

const FLOOR_ONE_CHALLENGE: GateChallengeDefinition = {
  id: "aggregate-breach",
  title: "零行密文机关 · HAVING 王门",
  objective: "从 monsters 与 monster_signals 中找出至少拥有 3 条 echo 信号、且 echo 总电荷不少于 24 的未知记录。击败前不得读取 name；依次返回 id、echo_count、total_charge，按 total_charge 降序、id 升序。",
  schema: [
    sqlSchemaLine("monsters"),
    sqlSchemaLine("monster_signals"),
    "关系：monster_signals.monster_id = monsters.id",
  ],
  hints: [
    "先 JOIN 两张表，只保留 channel = 'echo'。",
    "只按 monsters.id 分组，用 COUNT 与 SUM 计算两种聚合值；身份会在击败后揭示。",
    "聚合条件写在 HAVING；最后按 total_charge DESC、id ASC 排序。",
  ],
  requiredFeatures: [
    "select",
    "from",
    "where",
    "join",
    "on",
    "count",
    "group-by",
    "having",
    "order-by",
  ],
  expectedColumns: ["id", "echo_count", "total_charge"],
  expectedRows: [
    { id: 4, echo_count: 3, total_charge: 24 },
    { id: 5, echo_count: 3, total_charge: 24 },
  ],
};

const FLOOR_TWO_CHALLENGE: GateChallengeDefinition = {
  id: "relation-breach",
  title: "七源密文机关 · JOIN 主核",
  objective: "统计二层每个房间的怪物数量与装备总 power，没有装备也必须保留。只保留装备总 power 不少于 10 的房间，依次返回 id、room_name、monster_count、total_power；按 total_power 降序、id 升序，只取前 2 行。",
  schema: [
    sqlSchemaLine("rooms"),
    sqlSchemaLine("monsters"),
    sqlSchemaLine("monster_gear"),
    "关系：monsters.room_id = rooms.id；monster_gear.monster_id = monsters.id",
  ],
  hints: [
    "从 rooms 出发连续 LEFT JOIN monsters 与 monster_gear，并用 rooms.floor = 2 限定楼层。",
    "怪物数使用 COUNT(DISTINCT monsters.id)；装备总值可用 COALESCE(SUM(power), 0)。",
    "按房间分组，在 HAVING 过滤总 power，再排序并 LIMIT 2。",
  ],
  requiredFeatures: [
    "select",
    "from",
    "where",
    "count",
    "distinct",
    "left-join",
    "on",
    "group-by",
    "having",
    "order-by",
    "limit",
  ],
  expectedColumns: ["id", "room_name", "monster_count", "total_power"],
  expectedRows: [
    { id: 25, room_name: "灯塔岛", monster_count: 1, total_power: 38 },
    { id: 23, room_name: "古树桥", monster_count: 1, total_power: 15 },
  ],
};

const FLOOR_THREE_CHALLENGE: GateChallengeDefinition = {
  id: "grave-breach",
  title: "三表墓印机关 · 关系审计",
  objective: "连接怪物、房间和装备，找出第三层 power 不低于 20 的未知记录。击败前不得读取怪物 name；依次返回 id、room_name、power；按 power 降序、id 升序，只取前 2 行。",
  schema: [
    sqlSchemaLine("monsters"),
    sqlSchemaLine("rooms"),
    sqlSchemaLine("monster_gear"),
    "关系：monsters.room_id = rooms.id；monster_gear.monster_id = monsters.id",
  ],
  hints: [
    "先把 monsters 连接 rooms，再连接 monster_gear。",
    "用 rooms.floor = 3 与 power >= 20 限定范围。",
    "按 power DESC、id ASC 排序并 LIMIT 2。",
  ],
  requiredFeatures: ["select", "from", "where", "join", "on", "order-by", "limit"],
  expectedColumns: ["id", "room_name", "power"],
  expectedRows: [
    { id: 28, room_name: "死灵王庭", power: 24 },
    { id: 33, room_name: "墓主祭坛", power: 22 },
  ],
};

const FLOOR_FOUR_CHALLENGE: GateChallengeDefinition = {
  id: "forge-breach",
  title: "递归炉印机关 · CTE 主核",
  objective: "用 CTE 统计每只怪物的最高装备 power，只保留不低于 20 的第四层未知记录。击败前不得读取 name；依次返回 id、max_power；按 max_power 降序、id 升序，只取前 3 行。",
  schema: [
    sqlSchemaLine("monsters"),
    sqlSchemaLine("monster_gear"),
    "关系：monster_gear.monster_id = monsters.id",
  ],
  hints: [
    "CTE 中按 monster_id 分组，计算 MAX(power) AS max_power。",
    "在 HAVING 中保留 MAX(power) >= 20，再连接 monsters。",
    "主查询限定 room_id 51 到 60，排序后 LIMIT 3。",
  ],
  requiredFeatures: [
    "select",
    "from",
    "where",
    "join",
    "on",
    "group-by",
    "having",
    "order-by",
    "limit",
    "cte",
  ],
  expectedColumns: ["id", "max_power"],
  expectedRows: [
    { id: 39, max_power: 26 },
    { id: 44, max_power: 22 },
    { id: 38, max_power: 20 },
  ],
};

const FLOOR_FIVE_CHALLENGE: GateChallengeDefinition = {
  id: "iron-breach",
  title: "轮值密文机关 · 窗口军阵",
  objective: "用 CTE 与 ROW_NUMBER 找出第五层每个 sector 中装备 power 最高的未知记录。击败前不得读取 name；依次返回 sector、id、power、rn；按 power 降序、sector 升序，只取前 3 行。",
  schema: [
    sqlSchemaLine("monsters"),
    sqlSchemaLine("rooms"),
    sqlSchemaLine("monster_gear"),
    "关系：monsters.room_id = rooms.id；monster_gear.monster_id = monsters.id",
  ],
  hints: [
    "CTE 中连接 monsters、rooms 与 monster_gear，并用 rooms.floor = 5 限定楼层。",
    "ROW_NUMBER 按 sector 分区，在分区内按 power DESC、id ASC。",
    "外层保留 rn = 1，按 power DESC、sector ASC 排序并 LIMIT 3。",
  ],
  requiredFeatures: [
    "select",
    "from",
    "where",
    "join",
    "on",
    "cte",
    "row-number",
    "partition-by",
    "order-by",
    "limit",
  ],
  expectedColumns: ["sector", "id", "power", "rn"],
  expectedRows: [
    { sector: "core", id: 50, power: 28, rn: 1 },
    { sector: "barracks", id: 55, power: 26, rn: 1 },
    { sector: "wall", id: 49, power: 24, rn: 1 },
  ],
};

const FLOOR_SIX_CHALLENGE: GateChallengeDefinition = {
  id: "dragon-breach",
  title: "逆鳞密文机关 · 分区预演",
  objective: "不修改数据：用 CTE 与 ROW_NUMBER 找出第六层每个 sector 中装备 power 最高的未知记录。击败前不得读取 name；依次返回 id、power；按 power 降序、id 升序，只取前 3 行。",
  schema: [
    sqlSchemaLine("monsters"),
    sqlSchemaLine("rooms"),
    sqlSchemaLine("monster_gear"),
    "关系：monsters.room_id = rooms.id；monster_gear.monster_id = monsters.id",
  ],
  hints: [
    "机关仍是只读查询，不会开放 repair_queue 写权限。",
    "CTE 中连接装备表，按 sector 分区，以 power DESC、id ASC 编号。",
    "外层保留 rn = 1，按 power DESC、id ASC 排序并 LIMIT 3。",
  ],
  requiredFeatures: [
    "select",
    "from",
    "where",
    "join",
    "on",
    "cte",
    "row-number",
    "partition-by",
    "order-by",
    "limit",
  ],
  expectedColumns: ["id", "power"],
  expectedRows: [
    { id: 61, power: 32 },
    { id: 66, power: 30 },
    { id: 64, power: 29 },
  ],
};

const FLOOR_SEVEN_CHALLENGE: GateChallengeDefinition = {
  id: "index-breach",
  title: "最优叶密文机关 · 分区检索",
  objective: "用 CTE 与 ROW_NUMBER 找出每个 realm 中 score 最高的索引记录。返回 realm、code、score；按 score 降序，只取前 3 行。",
  schema: [
    "index_records(id, realm, category, score, code, payload)",
    "真实 SQLite 索引：(realm, score DESC)、(category, code)、code",
  ],
  hints: [
    "CTE 中用 ROW_NUMBER，按 realm 分区、score DESC 与 id ASC 编号。",
    "外层保留 rn = 1。",
    "按 score DESC 排序并 LIMIT 3。",
  ],
  requiredFeatures: [
    "select", "from", "where", "cte", "row-number", "partition-by", "order-by", "limit",
  ],
  expectedColumns: ["realm", "code", "score"],
  expectedRows: [
    { realm: "crystal", code: "CRY-106", score: 95 },
    { realm: "ember", code: "EMB-203", score: 92 },
    { realm: "void", code: "VOI-302", score: 86 },
  ],
};

const FLOOR_EIGHT_CHALLENGE: GateChallengeDefinition = {
  id: "throne-breach",
  title: "王令校验密文 · 副本决策窗",
  objective: "用 CTE 与 ROW_NUMBER 为健康 replica 按 region 分区、lag_ms 升序排名。返回 region、node、lag_ms，只保留 rn = 1；按 lag_ms 升序。",
  schema: [
    "replica_status(node, region, lag_ms, healthy, role)",
    "固定教学记录，不代表 SQLite 自带复制。",
  ],
  hints: [
    "CTE 先过滤 role = 'replica' 且 healthy = 1。",
    "ROW_NUMBER 按 region 分区，以 lag_ms、node 升序编号。",
    "外层保留 rn = 1 并按 lag_ms 排序。",
  ],
  requiredFeatures: [
    "select", "from", "where", "and", "cte", "row-number", "partition-by", "order-by",
  ],
  expectedColumns: ["region", "node", "lag_ms"],
  expectedRows: [
    { region: "west", node: "replica-b", lag_ms: 18 },
    { region: "north", node: "replica-c", lag_ms: 42 },
  ],
};

function definitionForFloor(floor: FloorNumber): GateChallengeDefinition {
  if (floor === 1) return FLOOR_ONE_CHALLENGE;
  if (floor === 2) return FLOOR_TWO_CHALLENGE;
  if (floor === 3) return FLOOR_THREE_CHALLENGE;
  if (floor === 4) return FLOOR_FOUR_CHALLENGE;
  if (floor === 5) return FLOOR_FIVE_CHALLENGE;
  if (floor === 6) return FLOOR_SIX_CHALLENGE;
  if (floor === 7) return FLOOR_SEVEN_CHALLENGE;
  return FLOOR_EIGHT_CHALLENGE;
}

export function gateChallengeForFloor(
  floor: FloorNumber,
  gateId: string,
): GateChallengeBrief {
  const definition = definitionForFloor(floor);
  return {
    id: definition.id,
    gateId,
    title: definition.title,
    objective: definition.objective,
    schema: [...definition.schema],
    hints: [...definition.hints],
  };
}

export function gateChallengeIdForFloor(floor: FloorNumber): GateChallengeId {
  return definitionForFloor(floor).id;
}

export function evaluateGateChallenge(
  floor: FloorNumber,
  result: SqlQueryResult,
): GateChallengeEvaluation {
  const definition = definitionForFloor(floor);
  const featureSet = new Set(result.features);
  if (/\bdistinct\b/i.test(result.sql)) featureSet.add("distinct");
  const missingFeatures = definition.requiredFeatures.filter(
    (feature) => !featureSet.has(feature),
  );
  if (missingFeatures.length > 0) {
    return {
      accepted: false,
      message: `机关仍锁定：核心结构缺少 ${missingFeatures.join("、")}。`,
      missingFeatures,
    };
  }

  const columnsMatch = result.columns.length === definition.expectedColumns.length
    && result.columns.every(
      (column, index) => column.toLocaleLowerCase() === definition.expectedColumns[index],
    );
  if (!columnsMatch) {
    return {
      accepted: false,
      message: `机关仍锁定：输出字段必须依次命名为 ${definition.expectedColumns.join("、")}。`,
      missingFeatures: [],
    };
  }

  const rowsMatch = result.rows.length === definition.expectedRows.length
    && result.rows.every((row, rowIndex) => (
      definition.expectedColumns.every(
        (column) => row[column] === definition.expectedRows[rowIndex][column],
      )
    ));
  return rowsMatch
    ? {
        accepted: true,
        message: "查询计划与门锁校验值完全一致。",
        missingFeatures: [],
      }
    : {
        accepted: false,
        message: "机关仍锁定：结果行不匹配。检查 JOIN 关系、聚合条件、排序方向与行数限制。",
        missingFeatures: [],
      };
}
