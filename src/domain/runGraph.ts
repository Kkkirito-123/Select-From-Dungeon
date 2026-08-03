/** 课程与物理兴趣点图：描述先修关系和路线目标，不直接拥有地图几何。 */
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

export const FLOOR_THREE_LESSONS = [
  "f3-inner",
  "f3-left",
  "f3-self",
  "f3-chain",
  "f3-union",
  "f3-audit",
] as const;

export const FLOOR_FOUR_LESSONS = [
  "f4-scalar",
  "f4-in",
  "f4-exists",
  "f4-correlated",
  "f4-cte",
  "f4-recursive",
] as const;

export const FLOOR_FIVE_LESSONS = [
  "f5-over",
  "f5-row-number",
  "f5-rank",
  "f5-lag-lead",
  "f5-frame",
  "f5-top-n",
] as const;

export const FLOOR_SIX_LESSONS = [
  "f6-insert",
  "f6-update",
  "f6-delete",
  "f6-constraint",
  "f6-transaction",
  "f6-savepoint",
] as const;

export const FLOOR_SEVEN_LESSONS = [
  "f7-btree",
  "f7-composite",
  "f7-covering",
  "f7-invalid",
  "f7-plan",
  "f7-optimize",
] as const;

export const FLOOR_EIGHT_LESSONS = [
  "f8-mvcc",
  "f8-lock",
  "f8-isolation",
  "f8-modeling",
  "f8-replication",
  "f8-sharding",
  "f8-security",
] as const;

export const REQUIRED_RUN_LESSONS = [
  ...FLOOR_ONE_LESSONS,
  ...FLOOR_TWO_LESSONS,
  ...FLOOR_THREE_LESSONS,
  ...FLOOR_FOUR_LESSONS,
  ...FLOOR_FIVE_LESSONS,
  ...FLOOR_SIX_LESSONS,
  ...FLOOR_SEVEN_LESSONS,
  ...FLOOR_EIGHT_LESSONS,
] as const;

export type RunLessonId = (typeof REQUIRED_RUN_LESSONS)[number];
export type FloorNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

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
  | "bone-blade"
  | "rune-staff"
  | "iron-axe"
  | "dragon-spear"
  | "crystal-blade"
  | "royal-sword"
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
  "f3-inner": [],
  "f3-left": ["f3-inner"],
  "f3-self": ["f3-inner"],
  "f3-chain": ["f3-left", "f3-self"],
  "f3-union": ["f3-chain"],
  "f3-audit": ["f3-union"],
  "f4-scalar": [],
  "f4-in": ["f4-scalar"],
  "f4-exists": ["f4-in"],
  "f4-correlated": ["f4-exists"],
  "f4-cte": ["f4-correlated"],
  "f4-recursive": ["f4-cte"],
  "f5-over": [],
  "f5-row-number": ["f5-over"],
  "f5-rank": ["f5-row-number"],
  "f5-lag-lead": ["f5-rank"],
  "f5-frame": ["f5-lag-lead"],
  "f5-top-n": ["f5-frame"],
  "f6-insert": [],
  "f6-update": ["f6-insert"],
  "f6-delete": ["f6-update"],
  "f6-constraint": ["f6-delete"],
  "f6-transaction": ["f6-constraint"],
  "f6-savepoint": ["f6-transaction"],
  "f7-btree": [],
  "f7-composite": ["f7-btree"],
  "f7-covering": ["f7-composite"],
  "f7-invalid": ["f7-covering"],
  "f7-plan": ["f7-invalid"],
  "f7-optimize": ["f7-plan"],
  "f8-mvcc": [],
  "f8-lock": ["f8-mvcc"],
  "f8-isolation": ["f8-lock"],
  "f8-modeling": ["f8-isolation"],
  "f8-replication": ["f8-modeling"],
  "f8-sharding": ["f8-replication"],
  "f8-security": ["f8-sharding"],
};

export function lessonsForFloor(floor: FloorNumber): readonly RunLessonId[] {
  if (floor === 1) return FLOOR_ONE_LESSONS;
  if (floor === 2) return FLOOR_TWO_LESSONS;
  if (floor === 3) return FLOOR_THREE_LESSONS;
  if (floor === 4) return FLOOR_FOUR_LESSONS;
  if (floor === 5) return FLOOR_FIVE_LESSONS;
  if (floor === 6) return FLOOR_SIX_LESSONS;
  if (floor === 7) return FLOOR_SEVEN_LESSONS;
  return FLOOR_EIGHT_LESSONS;
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
      title: "余烬地窖入口",
      depth: 0,
      lane: 0,
      required: true,
      reward: null,
      next: [HUB_ID],
    }),
    room({
      id: HUB_ID,
      type: "tutorial",
      title: "SELECT 排水石碑",
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
      title: "WHERE 软泥水池",
      depth: 2,
      lane: laneById.get(WHERE_ID) ?? -2,
      required: true,
      lessonId: "where",
      prerequisiteLessons: ["select"],
      reward: "cool-8-heat",
      next: [HUB_ID],
    }),
    room({
      id: NULL_ID,
      type: "lesson",
      title: "IS NULL 毒泥仓窖",
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
      title: "登记前哨",
      depth: 2,
      lane: laneById.get(REST_ID) ?? 0,
      required: false,
      prerequisiteLessons: ["group-by"],
      reward: pick(OPTIONAL_REWARDS.rest, random),
      next: [HUB_ID],
    }),
    room({
      id: TREASURE_ID,
      type: "treasure",
      title: "旧仓库宝箱",
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
      title: "苔藓排水井",
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
      title: "恢复回执台",
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
      title: "GROUP BY 回执归档间",
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
      title: "HAVING ID #005",
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
  const seed = rawSeed.trim() || "月潮群岛-第二层";
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
      title: "潮汐码头",
      depth: 0,
      lane: 0,
      required: true,
      reward: null,
      next: [FLOOR_2_ORDER_ID],
    }),
    room({
      id: FLOOR_2_ORDER_ID,
      type: "tutorial",
      title: "ORDER BY 七盏浮标",
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
      title: "DISTINCT 七岔潮渠",
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
      title: "浅滩篝火",
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
      title: "沉船补给舱",
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
      title: "沉水村落",
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
      title: "INNER JOIN 双端根桥",
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
      title: "LEFT JOIN 沉水村落",
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
      title: "ID #012 根桥回声",
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
      title: "ID #014",
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

interface AdvancedFloorGraphConfig {
  floor: 3 | 4 | 5 | 6 | 7;
  defaultSeed: string;
  entryTitle: string;
  lessonIds: readonly [
    RunLessonId,
    RunLessonId,
    RunLessonId,
    RunLessonId,
    RunLessonId,
    RunLessonId,
  ];
  lessonTitles: readonly [string, string, string, string, string, string];
  firstReward:
    | "bone-blade"
    | "rune-staff"
    | "iron-axe"
    | "dragon-spear"
    | "crystal-blade";
  sideTitles: readonly [string, string, string];
}

const ADVANCED_FLOOR_CONFIG: Readonly<Record<3 | 4 | 5 | 6 | 7, AdvancedFloorGraphConfig>> = {
  3: {
    floor: 3,
    defaultSeed: "亡者墓城-第三层",
    entryTitle: "墓城石门",
    lessonIds: [
      "f3-inner",
      "f3-left",
      "f3-self",
      "f3-chain",
      "f3-union",
      "f3-audit",
    ],
    lessonTitles: [
      "INNER JOIN 骨桥",
      "LEFT JOIN 墓道",
      "SELF JOIN 灵堂",
      "多表连接 骑士墓",
      "UNION 合葬厅",
      "连接审计 死灵王",
    ],
    firstReward: "bone-blade",
    sideTitles: ["守墓篝火", "遗骨宝库", "幽魂碑廊"],
  },
  4: {
    floor: 4,
    defaultSeed: "元素熔炉-第四层",
    entryTitle: "熔炉升降台",
    lessonIds: [
      "f4-scalar",
      "f4-in",
      "f4-exists",
      "f4-correlated",
      "f4-cte",
      "f4-recursive",
    ],
    lessonTitles: [
      "标量子查询 火室",
      "IN 子查询 冰库",
      "EXISTS 雷池",
      "相关子查询 石炉",
      "WITH 符文环",
      "递归 CTE 元素王",
    ],
    firstReward: "rune-staff",
    sideTitles: ["熔炉篝火", "晶石宝库", "元素祭坛"],
  },
  5: {
    floor: 5,
    defaultSeed: "黑铁要塞-第五层",
    entryTitle: "黑铁城门",
    lessonIds: [
      "f5-over",
      "f5-row-number",
      "f5-rank",
      "f5-lag-lead",
      "f5-frame",
      "f5-top-n",
    ],
    lessonTitles: [
      "OVER 军阵",
      "ROW_NUMBER 哨塔",
      "RANK 竞技场",
      "LAG/LEAD 巡逻线",
      "窗口 Frame 城墙",
      "分组 Top-N 城主厅",
    ],
    firstReward: "iron-axe",
    sideTitles: ["铁炉篝火", "军械宝库", "战旗回廊"],
  },
  6: {
    floor: 6,
    defaultSeed: "巨龙熔巢-第六层",
    entryTitle: "熔巢入口",
    lessonIds: [
      "f6-insert",
      "f6-update",
      "f6-delete",
      "f6-constraint",
      "f6-transaction",
      "f6-savepoint",
    ],
    lessonTitles: [
      "INSERT 孵化台",
      "UPDATE 鳞甲炉",
      "DELETE 清巢槽",
      "约束龙门",
      "事务熔洞",
      "SAVEPOINT 龙王巢",
    ],
    firstReward: "dragon-spear",
    sideTitles: ["龙息篝火", "龙鳞宝库", "古龙碑廊"],
  },
  7: {
    floor: 7,
    defaultSeed: "水晶索引林-第七层",
    entryTitle: "水晶林门",
    lessonIds: [
      "f7-btree",
      "f7-composite",
      "f7-covering",
      "f7-invalid",
      "f7-plan",
      "f7-optimize",
    ],
    lessonTitles: [
      "B+ 树 枝径",
      "联合索引 根道",
      "覆盖索引 镜湖",
      "索引失效 藤门",
      "执行计划 晶眼",
      "查询优化 古树心",
    ],
    firstReward: "crystal-blade",
    sideTitles: ["晶火篝火", "索引宝库", "计划石碑"],
  },
};

function generateAdvancedFloorGraph(
  rawSeed: string,
  config: AdvancedFloorGraphConfig,
): RoomGraph {
  const seed = rawSeed.trim() || config.defaultSeed;
  const random = createSeededRandom(
    `select-from-dungeon:run-graph:v2:floor-${config.floor}:${seed}`,
  );
  const prefix = `floor-${config.floor}`;
  const lessonRoomIds = config.lessonIds.map((_, index) => `${prefix}-lesson-${index + 1}`);
  const sideIds = [`${prefix}-rest`, `${prefix}-treasure`, `${prefix}-event`] as const;
  const sideOrder = shuffled(sideIds, random);
  const laneById = new Map(sideOrder.map((id, index) => [id, index - 1] as const));
  const [first, second, third, fourth, fifth, boss] = lessonRoomIds;
  const firstExits = shuffled([second, third, ...sideIds], random);

  const nodes: RoomNode[] = [
    room({
      id: `${prefix}-entry`,
      type: "entry",
      title: config.entryTitle,
      depth: 0,
      lane: 0,
      required: true,
      reward: null,
      next: [first],
    }),
    room({
      id: first,
      type: "tutorial",
      title: config.lessonTitles[0],
      depth: 1,
      lane: 0,
      required: true,
      lessonId: config.lessonIds[0],
      reward: config.firstReward,
      next: firstExits,
    }),
    room({
      id: second,
      type: "lesson",
      title: config.lessonTitles[1],
      depth: 2,
      lane: -0.8,
      required: true,
      lessonId: config.lessonIds[1],
      prerequisiteLessons: REQUIRED_PREREQUISITES[config.lessonIds[1]],
      reward: "schema-shard",
      next: config.floor === 3 ? [fourth] : [third],
    }),
    room({
      id: third,
      type: "lesson",
      title: config.lessonTitles[2],
      depth: 2,
      lane: 0.8,
      required: true,
      lessonId: config.lessonIds[2],
      prerequisiteLessons: REQUIRED_PREREQUISITES[config.lessonIds[2]],
      reward: "hint-token",
      next: [fourth],
    }),
    room({
      id: fourth,
      type: "lesson",
      title: config.lessonTitles[3],
      depth: 3,
      lane: -0.4,
      required: true,
      lessonId: config.lessonIds[3],
      prerequisiteLessons: REQUIRED_PREREQUISITES[config.lessonIds[3]],
      reward: "elite-query-lens",
      next: [fifth],
    }),
    room({
      id: fifth,
      type: "elite",
      title: config.lessonTitles[4],
      depth: 4,
      lane: 0.4,
      required: true,
      lessonId: config.lessonIds[4],
      prerequisiteLessons: REQUIRED_PREREQUISITES[config.lessonIds[4]],
      reward: "elite-transaction-shield",
      next: [boss],
    }),
    room({
      id: boss,
      type: "boss",
      title: config.lessonTitles[5],
      depth: 5,
      lane: 0,
      required: true,
      lessonId: config.lessonIds[5],
      prerequisiteLessons: REQUIRED_PREREQUISITES[config.lessonIds[5]],
      reward: "floor-key",
    }),
    room({
      id: sideIds[0],
      type: "rest",
      title: config.sideTitles[0],
      depth: 2,
      lane: laneById.get(sideIds[0]) ?? -1,
      required: false,
      prerequisiteLessons: [config.lessonIds[0]],
      reward: pick(OPTIONAL_REWARDS.rest, random),
      next: [second],
    }),
    room({
      id: sideIds[1],
      type: "treasure",
      title: config.sideTitles[1],
      depth: 3,
      lane: laneById.get(sideIds[1]) ?? 0,
      required: false,
      prerequisiteLessons: [config.lessonIds[0]],
      reward: pick(OPTIONAL_REWARDS.treasure, random),
      next: [second],
    }),
    room({
      id: sideIds[2],
      type: "event",
      title: config.sideTitles[2],
      depth: 4,
      lane: laneById.get(sideIds[2]) ?? 1,
      required: false,
      prerequisiteLessons: [config.lessonIds[0]],
      reward: pick(OPTIONAL_REWARDS.event, random),
      next: [second],
    }),
  ];

  return {
    version: 2,
    floor: config.floor,
    seed,
    entryId: `${prefix}-entry`,
    bossId: boss,
    nodes,
  };
}

function generateFloorEightGraph(rawSeed: string): RoomGraph {
  const seed = rawSeed.trim() || "黑曜数据王座-第八层";
  const random = createSeededRandom(
    `select-from-dungeon:run-graph:v2:floor-8:${seed}`,
  );
  const lessonIds = FLOOR_EIGHT_LESSONS;
  const lessonTitles = [
    "MVCC 版本厅",
    "死锁 双骑门",
    "隔离异常 幻境",
    "数据建模 石像庭",
    "复制 双塔",
    "分片 巨兽桥",
    "安全 魔王座",
  ] as const;
  const lessonRoomIds = lessonIds.map((_, index) => `floor-8-lesson-${index + 1}`);
  const sideIds = ["floor-8-rest", "floor-8-treasure", "floor-8-event"] as const;
  const sideOrder = shuffled(sideIds, random);
  const laneById = new Map(sideOrder.map((id, index) => [id, index - 1] as const));
  const nodes: RoomNode[] = [
    room({
      id: "floor-8-entry",
      type: "entry",
      title: "黑曜王城门",
      depth: 0,
      lane: 0,
      required: true,
      reward: null,
      next: [lessonRoomIds[0]],
    }),
    ...lessonRoomIds.map((id, index) => room({
      id,
      type: index === 0
        ? "tutorial"
        : index === lessonRoomIds.length - 1
          ? "boss"
          : index === lessonRoomIds.length - 2
            ? "elite"
            : "lesson",
      title: lessonTitles[index],
      depth: index + 1,
      lane: index % 2 === 0 ? -0.45 : 0.45,
      required: true,
      lessonId: lessonIds[index],
      prerequisiteLessons: REQUIRED_PREREQUISITES[lessonIds[index]],
      reward: index === 0
        ? "royal-sword"
        : index === lessonRoomIds.length - 1
          ? "floor-key"
          : index === lessonRoomIds.length - 2
            ? "elite-transaction-shield"
            : index === 2
              ? "schema-shard"
              : "hint-token",
      next: index === lessonRoomIds.length - 1
        ? []
        : index === 0
          ? shuffled([lessonRoomIds[1], ...sideIds], random)
          : [lessonRoomIds[index + 1]],
    })),
    ...sideIds.map((id, index) => room({
      id,
      type: (["rest", "treasure", "event"] as const)[index],
      title: (["王城篝火", "黑曜宝库", "事故碑廊"] as const)[index],
      depth: 2 + index,
      lane: laneById.get(id) ?? index - 1,
      required: false,
      prerequisiteLessons: ["f8-mvcc"],
      reward: pick(OPTIONAL_REWARDS[(["rest", "treasure", "event"] as const)[index]], random),
      next: [lessonRoomIds[1]],
    })),
  ];
  return {
    version: 2,
    floor: 8,
    seed,
    entryId: "floor-8-entry",
    bossId: lessonRoomIds[lessonRoomIds.length - 1],
    nodes,
  };
}

export function generateRoomGraph(rawSeed: string, floor: FloorNumber = 1): RoomGraph {
  if (floor === 1) return generateFloorOneGraph(rawSeed);
  if (floor === 2) return generateFloorTwoGraph(rawSeed);
  if (floor === 8) return generateFloorEightGraph(rawSeed);
  return generateAdvancedFloorGraph(rawSeed, ADVANCED_FLOOR_CONFIG[floor]);
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
  if (
    graph.version !== 2 ||
    !([1, 2, 3, 4, 5, 6, 7, 8] as const).includes(graph.floor)
  ) {
    errors.push("课程图版本或楼层无效。");
  }
  if (graph.nodes.length < 8 || graph.nodes.length > 11) {
    errors.push("每层房间数必须在 8 到 11 之间。");
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
