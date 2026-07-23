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
  title: "聚合越权协议 · HAVING 王门",
  objective: "从 monsters 与 monster_signals 中找出至少拥有 3 条 echo 信号、且 echo 总电荷不少于 24 的怪物。依次返回 id、name、echo_count、total_charge；按 total_charge 降序、id 升序。",
  schema: [
    sqlSchemaLine("monsters"),
    sqlSchemaLine("monster_signals"),
    "关系：monster_signals.monster_id = monsters.id",
  ],
  hints: [
    "先 JOIN 两张表，只保留 channel = 'echo'。",
    "按怪物 id、name 分组，用 COUNT 与 SUM 计算两种聚合值。",
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
  expectedColumns: ["id", "name", "echo_count", "total_charge"],
  expectedRows: [
    { id: 800, name: "铁胶怪", echo_count: 3, total_charge: 24 },
    { id: 900, name: "泥王", echo_count: 3, total_charge: 24 },
  ],
};

const FLOOR_TWO_CHALLENGE: GateChallengeDefinition = {
  id: "relation-breach",
  title: "关系越权协议 · JOIN 主核",
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
    { id: 25, room_name: "丛林王庭", monster_count: 1, total_power: 38 },
    { id: 23, room_name: "古树桥", monster_count: 1, total_power: 15 },
  ],
};

const FLOOR_THREE_CHALLENGE: GateChallengeDefinition = {
  id: "grave-breach",
  title: "墓城越权协议 · 三表审计",
  objective: "连接怪物、房间和装备，找出第三层 power 不低于 20 的记录。依次返回 id、name、room_name、power；按 power 降序、id 升序，只取前 2 行。",
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
  expectedColumns: ["id", "name", "room_name", "power"],
  expectedRows: [
    { id: 6, name: "死灵王", room_name: "死灵王庭", power: 24 },
    { id: 11, name: "墓主", room_name: "墓主祭坛", power: 22 },
  ],
};

const FLOOR_FOUR_CHALLENGE: GateChallengeDefinition = {
  id: "forge-breach",
  title: "熔炉越权协议 · CTE 主核",
  objective: "用 CTE 统计每只怪物的最高装备 power，只保留不低于 20 的第四层怪物。依次返回 id、name、max_power；按 max_power 降序、id 升序，只取前 3 行。",
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
  expectedColumns: ["id", "name", "max_power"],
  expectedRows: [
    { id: 17, name: "元素王", max_power: 26 },
    { id: 22, name: "炉主", max_power: 22 },
    { id: 16, name: "炎王", max_power: 20 },
  ],
};

const FLOOR_FIVE_CHALLENGE: GateChallengeDefinition = {
  id: "iron-breach",
  title: "黑铁越权协议 · 窗口军阵",
  objective: "用 CTE 与 ROW_NUMBER 找出第五层每个 sector 中装备 power 最高的怪物。依次返回 sector、name、power、rn；按 power 降序、sector 升序，只取前 3 行。",
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
  expectedColumns: ["sector", "name", "power", "rn"],
  expectedRows: [
    { sector: "core", name: "城主", power: 28, rn: 1 },
    { sector: "citadel-boss", name: "堡主", power: 26, rn: 1 },
    { sector: "barracks", name: "铁卫", power: 24, rn: 1 },
  ],
};

const FLOOR_SIX_CHALLENGE: GateChallengeDefinition = {
  id: "dragon-breach",
  title: "龙巢越权协议 · 分区预演",
  objective: "不修改数据：用 CTE 与 ROW_NUMBER 找出第六层每个 sector 中装备 power 最高的怪物。依次返回 id、name、power；按 power 降序、id 升序，只取前 3 行。",
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
  expectedColumns: ["id", "name", "power"],
  expectedRows: [
    { id: 39, name: "龙王", power: 32 },
    { id: 44, name: "古龙", power: 30 },
    { id: 42, name: "雷龙", power: 29 },
  ],
};

function definitionForFloor(floor: FloorNumber): GateChallengeDefinition {
  if (floor === 1) return FLOOR_ONE_CHALLENGE;
  if (floor === 2) return FLOOR_TWO_CHALLENGE;
  if (floor === 3) return FLOOR_THREE_CHALLENGE;
  if (floor === 4) return FLOOR_FOUR_CHALLENGE;
  if (floor === 5) return FLOOR_FIVE_CHALLENGE;
  return FLOOR_SIX_CHALLENGE;
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
