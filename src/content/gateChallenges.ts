import type {
  FloorNumber,
} from "../domain/runGraph";
import type {
  GateChallengeBrief,
  GateChallengeId,
  QueryFeature,
  SqlQueryResult,
} from "../domain/types";

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
    "monsters(id, name)",
    "monster_signals(id, monster_id, channel, charge)",
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
    { id: 800, name: "聚合执行官 · 四路钟", echo_count: 3, total_charge: 24 },
    { id: 900, name: "查询监视者 · 魔王核心", echo_count: 3, total_charge: 24 },
  ],
};

const FLOOR_TWO_CHALLENGE: GateChallengeDefinition = {
  id: "relation-breach",
  title: "关系越权协议 · JOIN 主核",
  objective: "统计二层每个房间的怪物数量与装备总 power，没有装备也必须保留。只保留装备总 power 不少于 10 的房间，依次返回 id、room_name、monster_count、total_power；按 total_power 降序、id 升序，只取前 2 行。",
  schema: [
    "rooms(id, name, floor)",
    "monsters(id, room_id)",
    "monster_gear(id, monster_id, power)",
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
    { id: 25, room_name: "雷鸣主核", monster_count: 1, total_power: 38 },
    { id: 23, room_name: "双表桥", monster_count: 1, total_power: 15 },
  ],
};

function definitionForFloor(floor: FloorNumber): GateChallengeDefinition {
  return floor === 1 ? FLOOR_ONE_CHALLENGE : FLOOR_TWO_CHALLENGE;
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
