export const FLOOR_ONE_LESSONS = [
  "select",
  "where",
  "is-null",
  "group-by",
  "having",
] as const;

export const FLOOR_TWO_LESSONS = [
  "order-by",
  "distinct",
  "inner-join",
  "left-join",
  "join-boss",
] as const;

export const REQUIRED_RUN_LESSONS = [
  ...FLOOR_ONE_LESSONS,
  ...FLOOR_TWO_LESSONS,
] as const;

export type RunLessonId = (typeof REQUIRED_RUN_LESSONS)[number];
export type FloorNumber = 1 | 2;

export type RoomType =
  | "entry"
  | "tutorial"
  | "lesson"
  | "rest"
  | "treasure"
  | "event"
  | "elite"
  | "boss";

export type RoomReward =
  | "data-blade"
  | "filter-rune"
  | "null-lantern"
  | "aggregate-hammer"
  | "sort-saber"
  | "join-chain"
  | "restore-12-hp"
  | "restore-20-hp"
  | "cool-8-heat"
  | "cool-12-heat"
  | "hint-token"
  | "schema-shard"
  | "weapon-cache"
  | "reroll-token"
  | "elite-query-lens"
  | "elite-transaction-shield"
  | "floor-key";

export interface RoomNode {
  id: string;
  type: RoomType;
  title: string;
  depth: number;
  lane: number;
  required: boolean;
  lessonId?: RunLessonId;
  prerequisiteLessons: RunLessonId[];
  reward: RoomReward | null;
  next: string[];
}

export interface RoomGraph {
  version: 2;
  floor: FloorNumber;
  seed: string;
  entryId: string;
  bossId: string;
  nodes: RoomNode[];
}

export interface RoomGraphValidation {
  valid: boolean;
  errors: string[];
}

type RandomSource = () => number;

const DEFAULT_SEED = "魔王城-第一层";
const ENTRY_ID = "floor-1-entry";
const HUB_ID = "floor-1-tutorial";
const WHERE_ID = "floor-1-where";
const NULL_ID = "floor-1-is-null";
const REST_ID = "floor-1-rest";
const TREASURE_ID = "floor-1-treasure";
const EVENT_ID = "floor-1-event";
const GROUP_ID = "floor-1-group-by";
const ELITE_ID = "floor-1-having-elite";
const BOSS_ID = "floor-1-boss";
const FLOOR_2_ENTRY_ID = "floor-2-entry";
const FLOOR_2_ORDER_ID = "floor-2-order";
const FLOOR_2_DISTINCT_ID = "floor-2-distinct";
const FLOOR_2_REST_ID = "floor-2-rest";
const FLOOR_2_TREASURE_ID = "floor-2-treasure";
const FLOOR_2_EVENT_ID = "floor-2-event";
const FLOOR_2_JOIN_ID = "floor-2-inner-join";
const FLOOR_2_LEFT_ID = "floor-2-left-join";
const FLOOR_2_ELITE_ID = "floor-2-join-elite";
const FLOOR_2_BOSS_ID = "floor-2-boss";

const OPTIONAL_REWARDS = {
  rest: ["restore-12-hp", "restore-20-hp", "cool-8-heat", "cool-12-heat"],
  treasure: ["hint-token", "schema-shard", "weapon-cache", "reroll-token"],
  event: ["hint-token", "schema-shard", "cool-12-heat", "reroll-token"],
  elite: ["elite-query-lens", "elite-transaction-shield"],
} as const satisfies Record<"rest" | "treasure" | "event" | "elite", readonly RoomReward[]>;

const REQUIRED_PREREQUISITES: Record<RunLessonId, readonly RunLessonId[]> = {
  select: [],
  where: ["select"],
  "is-null": ["select"],
  "group-by": ["where", "is-null"],
  having: ["group-by"],
  "order-by": [],
  distinct: ["order-by"],
  "inner-join": ["distinct"],
  "left-join": ["inner-join"],
  "join-boss": ["left-join"],
};

export function lessonsForFloor(floor: FloorNumber): readonly RunLessonId[] {
  return floor === 1 ? FLOOR_ONE_LESSONS : FLOOR_TWO_LESSONS;
}

export function stableStringHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string): RandomSource {
  let state = stableStringHash(seed) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function shuffled<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function pick<T>(values: readonly T[], random: RandomSource): T {
  return values[Math.floor(random() * values.length)];
}

function room(
  input: Omit<RoomNode, "prerequisiteLessons" | "next"> & {
    prerequisiteLessons?: readonly RunLessonId[];
    next?: readonly string[];
  },
): RoomNode {
  return {
    ...input,
    prerequisiteLessons: [...(input.prerequisiteLessons ?? [])],
    next: [...(input.next ?? [])],
  };
}

function generateFloorOneGraph(rawSeed: string): RoomGraph {
  const seed = rawSeed.trim() || DEFAULT_SEED;
  const random = createSeededRandom(`select-from-dungeon:run-graph:v2:floor-1:${seed}`);
  const branchIds = [WHERE_ID, NULL_ID, REST_ID, TREASURE_ID, EVENT_ID] as const;
  const branchOrder = shuffled(branchIds, random);
  const laneById = new Map(
    branchOrder.map((id, index) => [id, index - 2] as const),
  );
  const hubExits = shuffled([...branchIds, GROUP_ID], random);
  const groupLane = random() < 0.5 ? -0.5 : 0.5;

  const nodes: RoomNode[] = [
    room({
      id: ENTRY_ID,
      type: "entry",
      title: "魔王城门",
      depth: 0,
      lane: 0,
      required: true,
      reward: null,
      next: [HUB_ID],
    }),
    room({
      id: HUB_ID,
      type: "tutorial",
      title: "SELECT 数据石碑",
      depth: 1,
      lane: 0,
      required: true,
      lessonId: "select",
      reward: "filter-rune",
      next: hubExits,
    }),
    room({
      id: WHERE_ID,
      type: "lesson",
      title: "WHERE 猎犬廊",
      depth: 2,
      lane: laneById.get(WHERE_ID) ?? -2,
      required: true,
      lessonId: "where",
      prerequisiteLessons: ["select"],
      reward: "filter-rune",
      next: [HUB_ID],
    }),
    room({
      id: NULL_ID,
      type: "lesson",
      title: "IS NULL 无主墓室",
      depth: 2,
      lane: laneById.get(NULL_ID) ?? -1,
      required: true,
      lessonId: "is-null",
      prerequisiteLessons: ["select"],
      reward: "null-lantern",
      next: [HUB_ID],
    }),
    room({
      id: REST_ID,
      type: "rest",
      title: "回滚篝火",
      depth: 2,
      lane: laneById.get(REST_ID) ?? 0,
      required: false,
      prerequisiteLessons: ["select"],
      reward: pick(OPTIONAL_REWARDS.rest, random),
      next: [HUB_ID],
    }),
    room({
      id: TREASURE_ID,
      type: "treasure",
      title: "索引秘藏",
      depth: 2,
      lane: laneById.get(TREASURE_ID) ?? 1,
      required: false,
      prerequisiteLessons: ["select"],
      reward: pick(OPTIONAL_REWARDS.treasure, random),
      next: [HUB_ID],
    }),
    room({
      id: EVENT_ID,
      type: "event",
      title: "未知事务",
      depth: 2,
      lane: laneById.get(EVENT_ID) ?? 2,
      required: false,
      prerequisiteLessons: ["select"],
      reward: pick(OPTIONAL_REWARDS.event, random),
      next: [HUB_ID],
    }),
    room({
      id: GROUP_ID,
      type: "event",
      title: "聚合战锤祭坛",
      depth: 3,
      lane: groupLane,
      required: true,
      prerequisiteLessons: ["where", "is-null"],
      reward: "aggregate-hammer",
      next: [ELITE_ID],
    }),
    room({
      id: ELITE_ID,
      type: "elite",
      title: "GROUP BY 聚合执行官",
      depth: 4,
      lane: -groupLane,
      required: true,
      lessonId: "group-by",
      prerequisiteLessons: ["where", "is-null"],
      reward: pick(OPTIONAL_REWARDS.elite, random),
      next: [BOSS_ID],
    }),
    room({
      id: BOSS_ID,
      type: "boss",
      title: "HAVING 魔王 · 查询监视者",
      depth: 5,
      lane: 0,
      required: true,
      lessonId: "having",
      prerequisiteLessons: ["group-by"],
      reward: "floor-key",
    }),
  ];

  return {
    version: 2,
    floor: 1,
    seed,
    entryId: ENTRY_ID,
    bossId: BOSS_ID,
    nodes,
  };
}

function generateFloorTwoGraph(rawSeed: string): RoomGraph {
  const seed = rawSeed.trim() || "雷鸣奏鸣塔-第二层";
  const random = createSeededRandom(`select-from-dungeon:run-graph:v2:floor-2:${seed}`);
  const sideIds = [
    FLOOR_2_DISTINCT_ID,
    FLOOR_2_REST_ID,
    FLOOR_2_TREASURE_ID,
    FLOOR_2_EVENT_ID,
  ] as const;
  const sideOrder = shuffled(sideIds, random);
  const laneById = new Map(sideOrder.map((id, index) => [id, index - 1.5] as const));
  const orderExits = shuffled([...sideIds], random);

  const nodes: RoomNode[] = [
    room({
      id: FLOOR_2_ENTRY_ID,
      type: "entry",
      title: "雷鸣传送台",
      depth: 0,
      lane: 0,
      required: true,
      reward: null,
      next: [FLOOR_2_ORDER_ID],
    }),
    room({
      id: FLOOR_2_ORDER_ID,
      type: "tutorial",
      title: "ORDER BY 雷序回廊",
      depth: 1,
      lane: 0,
      required: true,
      lessonId: "order-by",
      reward: "sort-saber",
      next: orderExits,
    }),
    room({
      id: FLOOR_2_DISTINCT_ID,
      type: "lesson",
      title: "DISTINCT 镜像阵列",
      depth: 2,
      lane: laneById.get(FLOOR_2_DISTINCT_ID) ?? -1.5,
      required: true,
      lessonId: "distinct",
      prerequisiteLessons: ["order-by"],
      reward: "schema-shard",
      next: [FLOOR_2_JOIN_ID],
    }),
    room({
      id: FLOOR_2_REST_ID,
      type: "rest",
      title: "静电回滚站",
      depth: 2,
      lane: laneById.get(FLOOR_2_REST_ID) ?? -0.5,
      required: false,
      prerequisiteLessons: ["order-by"],
      reward: pick(OPTIONAL_REWARDS.rest, random),
      next: [FLOOR_2_DISTINCT_ID],
    }),
    room({
      id: FLOOR_2_TREASURE_ID,
      type: "treasure",
      title: "覆盖索引仓",
      depth: 2,
      lane: laneById.get(FLOOR_2_TREASURE_ID) ?? 0.5,
      required: false,
      prerequisiteLessons: ["order-by"],
      reward: pick(OPTIONAL_REWARDS.treasure, random),
      next: [FLOOR_2_DISTINCT_ID],
    }),
    room({
      id: FLOOR_2_EVENT_ID,
      type: "event",
      title: "电弧事务井",
      depth: 2,
      lane: laneById.get(FLOOR_2_EVENT_ID) ?? 1.5,
      required: false,
      prerequisiteLessons: ["order-by"],
      reward: pick(OPTIONAL_REWARDS.event, random),
      next: [FLOOR_2_DISTINCT_ID],
    }),
    room({
      id: FLOOR_2_JOIN_ID,
      type: "lesson",
      title: "INNER JOIN 双表桥",
      depth: 3,
      lane: -0.8,
      required: true,
      lessonId: "inner-join",
      prerequisiteLessons: ["distinct"],
      reward: "join-chain",
      next: [FLOOR_2_LEFT_ID],
    }),
    room({
      id: FLOOR_2_LEFT_ID,
      type: "lesson",
      title: "LEFT JOIN 缺口层",
      depth: 4,
      lane: 0.8,
      required: true,
      lessonId: "left-join",
      prerequisiteLessons: ["inner-join"],
      reward: "elite-transaction-shield",
      next: [FLOOR_2_ELITE_ID],
    }),
    room({
      id: FLOOR_2_ELITE_ID,
      type: "elite",
      title: "关系链校验场",
      depth: 5,
      lane: -0.5,
      required: true,
      prerequisiteLessons: ["left-join"],
      reward: pick(OPTIONAL_REWARDS.elite, random),
      next: [FLOOR_2_BOSS_ID],
    }),
    room({
      id: FLOOR_2_BOSS_ID,
      type: "boss",
      title: "JOIN 指挥家 · 雷鸣主核",
      depth: 6,
      lane: 0,
      required: true,
      lessonId: "join-boss",
      prerequisiteLessons: ["left-join"],
      reward: "floor-key",
    }),
  ];

  return {
    version: 2,
    floor: 2,
    seed,
    entryId: FLOOR_2_ENTRY_ID,
    bossId: FLOOR_2_BOSS_ID,
    nodes,
  };
}

export function generateRoomGraph(rawSeed: string, floor: FloorNumber = 1): RoomGraph {
  return floor === 1
    ? generateFloorOneGraph(rawSeed)
    : generateFloorTwoGraph(rawSeed);
}

function reachableIds(startId: string, nodesById: Map<string, RoomNode>): Set<string> {
  const visited = new Set<string>();
  const pending = [startId];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const node = nodesById.get(id);
    if (!node) continue;
    node.next.forEach((nextId) => {
      if (!visited.has(nextId)) pending.push(nextId);
    });
  }
  return visited;
}

function hasPathToBoss(startId: string, bossId: string, nodesById: Map<string, RoomNode>): boolean {
  return reachableIds(startId, nodesById).has(bossId);
}

export function validateRoomGraph(graph: RoomGraph): RoomGraphValidation {
  const errors: string[] = [];
  if (graph.version !== 2 || (graph.floor !== 1 && graph.floor !== 2)) {
    errors.push("课程图版本或楼层无效。");
  }
  if (graph.nodes.length < 8 || graph.nodes.length > 10) {
    errors.push("每层房间数必须在 8 到 10 之间。");
  }

  const nodesById = new Map<string, RoomNode>();
  graph.nodes.forEach((node) => {
    if (nodesById.has(node.id)) errors.push(`房间 ID 重复：${node.id}`);
    nodesById.set(node.id, node);
  });

  const entry = nodesById.get(graph.entryId);
  const boss = nodesById.get(graph.bossId);
  if (!entry || entry.type !== "entry") errors.push("入口房不存在或类型错误。");
  if (!boss || boss.type !== "boss") errors.push("Boss 房不存在或类型错误。");

  graph.nodes.forEach((node) => {
    const uniqueNext = new Set(node.next);
    if (uniqueNext.size !== node.next.length) {
      errors.push(`房间 ${node.id} 存在重复出口。`);
    }
    node.next.forEach((nextId) => {
      if (!nodesById.has(nextId)) errors.push(`房间 ${node.id} 指向未知房间 ${nextId}。`);
    });
    if (node.type !== "boss" && node.next.length === 0) {
      errors.push(`非 Boss 房 ${node.id} 没有出口。`);
    }
  });

  if (entry && boss) {
    const fromEntry = reachableIds(entry.id, nodesById);
    if (!fromEntry.has(boss.id)) errors.push("入口无法到达 Boss。");
    graph.nodes.forEach((node) => {
      if (!fromEntry.has(node.id)) errors.push(`房间 ${node.id} 无法从入口到达。`);
      if (node.type !== "boss" && !hasPathToBoss(node.id, boss.id, nodesById)) {
        errors.push(`非 Boss 房 ${node.id} 无法继续到达 Boss。`);
      }
    });
  }

  const roomsByLesson = new Map<RunLessonId, RoomNode[]>();
  graph.nodes.forEach((node) => {
    if (!node.lessonId) return;
    const rooms = roomsByLesson.get(node.lessonId) ?? [];
    rooms.push(node);
    roomsByLesson.set(node.lessonId, rooms);
  });

  lessonsForFloor(graph.floor).forEach((lessonId) => {
    const rooms = roomsByLesson.get(lessonId) ?? [];
    if (rooms.length === 0) {
      errors.push(`缺少必修课程房：${lessonId}`);
      return;
    }
    if (!rooms.some((node) => node.required)) {
      errors.push(`必修课程房未标记为 required：${lessonId}`);
    }
    const requiredPrerequisites = REQUIRED_PREREQUISITES[lessonId];
    const hasValidPrerequisites = rooms.some((node) =>
      requiredPrerequisites.every((required) => node.prerequisiteLessons.includes(required))
    );
    if (!hasValidPrerequisites) {
      errors.push(`课程房 ${lessonId} 缺少前置课程约束。`);
    }
  });

  const whereRoom = graph.floor === 1 ? roomsByLesson.get("where")?.[0] : undefined;
  const nullRoom = graph.floor === 1 ? roomsByLesson.get("is-null")?.[0] : undefined;
  if (graph.floor === 1 && whereRoom && nullRoom) {
    const hasCommonEntry = graph.nodes.some(
      (node) => node.next.includes(whereRoom.id) && node.next.includes(nullRoom.id),
    );
    if (
      !hasCommonEntry ||
      whereRoom.prerequisiteLessons.includes("is-null") ||
      nullRoom.prerequisiteLessons.includes("where")
    ) {
      errors.push("WHERE 与 IS NULL 必须可以自由选择完成顺序。");
    }
  }

  (["rest", "treasure", "event", "elite"] as const).forEach((type) => {
    if (!graph.nodes.some((node) => node.type === type)) {
      errors.push(`缺少 ${type} 房。`);
    }
  });

  return { valid: errors.length === 0, errors };
}
