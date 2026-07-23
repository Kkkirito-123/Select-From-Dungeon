import type {
  LessonStageDefinition,
  Monster,
} from "../domain/types";
import type { FloorNumber } from "../domain/runGraph";

export type BiomeKind =
  | "drainage"
  | "slime-pool"
  | "ember-cellar"
  | "lake"
  | "swamp"
  | "forest"
  | "bone-yard"
  | "grave-mire"
  | "spirit-crypt"
  | "fire-forge"
  | "frost-vault"
  | "storm-core";

export type BiomeEncounterRole = "normal" | "mini-elite" | "area-boss";

export interface BiomeEncounterDefinition {
  monsterId: number;
  floor: FloorNumber;
  biome: BiomeKind;
  role: BiomeEncounterRole;
  randomEncounter: boolean;
  stages: readonly LessonStageDefinition[];
}

function biomeMonster(
  monster: Omit<Monster, "x" | "y" | "encounterType">,
): Monster {
  return {
    ...monster,
    x: 1,
    y: 1,
    encounterType: "ambush",
  };
}

export const FLOOR_ONE_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 1,
    id: 111,
    lessonId: "select",
    roomId: 11,
    name: "软泥怪",
    species: "small_slime",
    kind: "projection-slime",
    hp: 6,
    maxHp: 6,
    armor: 0,
    damage: 1,
    attackName: "软泥撞击",
    status: "dripping",
    weakness: "slash",
    masterId: 900,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 1,
    id: 211,
    lessonId: "where",
    roomId: 12,
    name: "水胶怪",
    species: "water_slime",
    kind: "projection-slime",
    hp: 7,
    maxHp: 7,
    armor: 0,
    damage: 1,
    attackName: "水泡冲击",
    status: "wet",
    weakness: "focus",
    masterId: 900,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 1,
    id: 311,
    lessonId: "is-null",
    roomId: 13,
    name: "毒胶怪",
    species: "poison_slime",
    kind: "projection-slime",
    hp: 7,
    maxHp: 7,
    armor: 0,
    damage: 1,
    attackName: "毒液喷溅",
    status: "toxic",
    weakness: "light",
    masterId: null,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 1,
    id: 810,
    lessonId: "group-by",
    roomId: 14,
    name: "铁胶怪",
    species: "iron_slime",
    kind: "projection-slime",
    hp: 12,
    maxHp: 12,
    armor: 1,
    damage: 1,
    attackName: "铁壳压击",
    status: "armored",
    weakness: "aggregate",
    masterId: 900,
    isBoss: false,
    rank: "elite",
  }),
] as const;

export const FLOOR_TWO_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 2,
    id: 1210,
    lessonId: "order-by",
    roomId: 31,
    name: "水怪",
    species: "lake_beast",
    kind: "sort-drake",
    hp: 12,
    maxHp: 12,
    armor: 0,
    damage: 1,
    attackName: "浪花扑击",
    status: "surfacing",
    weakness: "descending",
    masterId: 1810,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 2,
    id: 1310,
    lessonId: "distinct",
    roomId: 32,
    name: "水蛇",
    species: "water_snake",
    kind: "distinct-mimic",
    hp: 13,
    maxHp: 13,
    armor: 0,
    damage: 1,
    attackName: "水纹缠绕",
    status: "coiled",
    weakness: "unique",
    masterId: 1810,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 2,
    id: 1410,
    lessonId: "inner-join",
    roomId: 33,
    name: "青蛙",
    species: "swamp_frog",
    kind: "join-spider",
    hp: 13,
    maxHp: 13,
    armor: 0,
    damage: 1,
    attackName: "泥水跳击",
    status: "croaking",
    weakness: "relation",
    masterId: 1911,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 2,
    id: 1510,
    lessonId: "left-join",
    roomId: 34,
    name: "毒蛙",
    species: "poison_frog",
    kind: "left-join-wraith",
    hp: 16,
    maxHp: 16,
    armor: 0,
    damage: 2,
    attackName: "毒沼反击",
    status: "toxic",
    weakness: "left",
    masterId: 1911,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 2,
    id: 1610,
    lessonId: "order-by",
    roomId: 35,
    name: "猎犬",
    species: "forest_hound",
    kind: "filter-hound",
    hp: 13,
    maxHp: 13,
    armor: 0,
    damage: 1,
    attackName: "林间扑咬",
    status: "tracking",
    weakness: "descending",
    masterId: 1900,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 2,
    id: 1710,
    lessonId: "inner-join",
    roomId: 36,
    name: "树妖",
    species: "forest_treant",
    kind: "join-spider",
    hp: 18,
    maxHp: 18,
    armor: 1,
    damage: 2,
    attackName: "根须缠绕",
    status: "rooted",
    weakness: "relation",
    masterId: 1900,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 2,
    id: 1810,
    lessonId: "distinct",
    roomId: 37,
    name: "湖怪",
    species: "lake_boss",
    kind: "sort-drake",
    hp: 22,
    maxHp: 22,
    armor: 1,
    damage: 2,
    attackName: "深水冲击",
    status: "submerged",
    weakness: "unique",
    masterId: null,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 2,
    id: 1911,
    lessonId: "left-join",
    roomId: 38,
    name: "蛙王",
    species: "frog_boss",
    kind: "left-join-wraith",
    hp: 24,
    maxHp: 24,
    armor: 1,
    damage: 2,
    attackName: "沼王重压",
    status: "ruling",
    weakness: "left",
    masterId: null,
    isBoss: false,
    rank: "elite",
  }),
] as const;

export const FLOOR_THREE_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 3,
    id: 7,
    lessonId: "f3-inner",
    roomId: 47,
    name: "碎骨",
    species: "bone_scout",
    kind: "skeleton",
    hp: 16,
    maxHp: 16,
    armor: 0,
    damage: 2,
    attackName: "碎骨突刺",
    status: "patrolling",
    weakness: "join",
    masterId: 6,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 3,
    id: 8,
    lessonId: "f3-left",
    roomId: 48,
    name: "腐尸",
    species: "grave_zombie",
    kind: "zombie",
    hp: 16,
    maxHp: 16,
    armor: 0,
    damage: 2,
    attackName: "腐土抓击",
    status: "wandering",
    weakness: "left",
    masterId: 6,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 3,
    id: 9,
    lessonId: "f3-self",
    roomId: 49,
    name: "鬼火",
    species: "spirit_flame",
    kind: "ghost",
    hp: 24,
    maxHp: 24,
    armor: 1,
    damage: 2,
    attackName: "灵焰追踪",
    status: "haunting",
    weakness: "alias",
    masterId: 11,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 3,
    id: 10,
    lessonId: "f3-self",
    roomId: 49,
    name: "游魂",
    species: "crypt_wraith",
    kind: "ghost",
    hp: 16,
    maxHp: 16,
    armor: 0,
    damage: 2,
    attackName: "魂火扑击",
    status: "drifting",
    weakness: "alias",
    masterId: 11,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 3,
    id: 11,
    lessonId: "f3-union",
    roomId: 50,
    name: "墓主",
    species: "tomb_lord",
    kind: "necromancer",
    hp: 28,
    maxHp: 28,
    armor: 2,
    damage: 2,
    attackName: "墓碑合流",
    status: "sealed",
    weakness: "union",
    masterId: 6,
    isBoss: false,
    rank: "elite",
  }),
] as const;

export const FLOOR_FOUR_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 4,
    id: 18,
    lessonId: "f4-scalar",
    roomId: 57,
    name: "火苗",
    species: "ember_sprite",
    kind: "fire-spirit",
    hp: 18,
    maxHp: 18,
    armor: 0,
    damage: 2,
    attackName: "火苗飞射",
    status: "sparking",
    weakness: "scalar",
    masterId: 22,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 4,
    id: 19,
    lessonId: "f4-in",
    roomId: 58,
    name: "冰晶",
    species: "frost_shard",
    kind: "ice-spirit",
    hp: 18,
    maxHp: 18,
    armor: 0,
    damage: 2,
    attackName: "冰晶散射",
    status: "frozen",
    weakness: "in",
    masterId: 22,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 4,
    id: 20,
    lessonId: "f4-exists",
    roomId: 59,
    name: "雷兽",
    species: "storm_beast",
    kind: "thunder-spirit",
    hp: 27,
    maxHp: 27,
    armor: 1,
    damage: 3,
    attackName: "雷爪",
    status: "charged",
    weakness: "exists",
    masterId: 22,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 4,
    id: 21,
    lessonId: "f4-exists",
    roomId: 59,
    name: "电球",
    species: "storm_orb",
    kind: "thunder-spirit",
    hp: 18,
    maxHp: 18,
    armor: 0,
    damage: 2,
    attackName: "电弧撞击",
    status: "sparking",
    weakness: "exists",
    masterId: 22,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 4,
    id: 22,
    lessonId: "f4-cte",
    roomId: 60,
    name: "炉主",
    species: "forge_lord",
    kind: "elemental-king",
    hp: 32,
    maxHp: 32,
    armor: 2,
    damage: 3,
    attackName: "熔炉封锁",
    status: "forging",
    weakness: "cte",
    masterId: 17,
    isBoss: false,
    rank: "elite",
  }),
] as const;

const PRACTICE_SELECT: LessonStageDefinition = {
  id: "practice-select",
  objective: "查询 id = 111 的软泥怪名字 name。",
  queryTemplate: "",
  answerSql: "SELECT name FROM monsters WHERE id = 111;",
  hints: [
    "读取怪物名字。",
    "目标表是 monsters。",
    "用 id = 111 锁定软泥怪。",
    "完整写法：SELECT name FROM monsters WHERE id = 111;",
  ],
  locks: ["SELECT", "FROM"],
  requiredFeatures: ["select", "from"],
  attackTargetIds: [111],
};

const PRACTICE_WHERE: LessonStageDefinition = {
  id: "practice-where",
  objective: "返回 room_id = 12 且 status = 'wet' 的水胶怪 id。",
  queryTemplate: "",
  answerSql: "SELECT id FROM monsters WHERE room_id = 12 AND status = 'wet';",
  hints: [
    "返回 id。",
    "从 monsters 查询。",
    "同时过滤 room_id 与 status。",
    "完整写法：SELECT id FROM monsters WHERE room_id = 12 AND status = 'wet';",
  ],
  locks: ["WHERE", "AND"],
  requiredFeatures: ["where", "and"],
  attackTargetIds: [211],
};

const PRACTICE_NULL: LessonStageDefinition = {
  id: "practice-null",
  objective: "查询 status = 'toxic' 且 master_id 为空的毒胶怪 name。",
  queryTemplate: "",
  answerSql: "SELECT name FROM monsters WHERE master_id IS NULL AND status = 'toxic';",
  hints: [
    "先找没有主人的怪物。",
    "NULL 使用 IS NULL。",
    "再用 AND 过滤 toxic 状态。",
    "完整写法：SELECT name FROM monsters WHERE master_id IS NULL AND status = 'toxic';",
  ],
  locks: ["WHERE", "IS NULL"],
  requiredFeatures: ["where", "is-null"],
  attackTargetIds: [311],
};

const PRACTICE_GROUP: LessonStageDefinition = {
  id: "practice-group",
  objective: "按 channel 统计 monster_id = 810 的信号数，别名为 total。",
  queryTemplate: "",
  answerSql: "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 810 GROUP BY channel;",
  hints: [
    "读取 channel 和计数。",
    "计数写作 COUNT(*) AS total。",
    "按 channel 分组。",
    "完整写法：SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 810 GROUP BY channel;",
  ],
  locks: ["COUNT", "GROUP BY"],
  requiredFeatures: ["count", "group-by"],
  attackTargetIds: [810],
};

const PRACTICE_GROUP_CORE: LessonStageDefinition = {
  id: "practice-group-core",
  objective: "第二击：查询 id = 810 的铁胶怪 name。",
  queryTemplate: "",
  answerSql: "SELECT name FROM monsters WHERE id = 810;",
  hints: [
    "读取 name。",
    "目标表是 monsters。",
    "用 id = 810 锁定铁胶怪。",
    "完整写法：SELECT name FROM monsters WHERE id = 810;",
  ],
  locks: ["SELECT", "FROM", "WHERE"],
  requiredFeatures: ["select", "from", "where"],
  attackTargetIds: [810],
};

const PRACTICE_ORDER: LessonStageDefinition = {
  id: "practice-order",
  objective: "按 charge 从高到低，取出 monster_id = 1210 的最强 channel。",
  queryTemplate: "",
  answerSql: "SELECT channel FROM monster_signals WHERE monster_id = 1210 ORDER BY charge DESC LIMIT 1;",
  hints: [
    "从 monster_signals 读取 channel。",
    "按 charge 降序排列。",
    "只保留第一行。",
    "完整写法：SELECT channel FROM monster_signals WHERE monster_id = 1210 ORDER BY charge DESC LIMIT 1;",
  ],
  locks: ["ORDER BY", "LIMIT"],
  requiredFeatures: ["order-by", "limit"],
  attackTargetIds: [1210],
};

const PRACTICE_DISTINCT: LessonStageDefinition = {
  id: "practice-distinct",
  objective: "去重查询 monster_id = 1310 的 channel，并按 channel 排序。",
  queryTemplate: "",
  answerSql: "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 1310 ORDER BY channel;",
  hints: [
    "SELECT 后加入 DISTINCT。",
    "读取 channel。",
    "按 channel 排序。",
    "完整写法：SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 1310 ORDER BY channel;",
  ],
  locks: ["DISTINCT", "ORDER BY"],
  requiredFeatures: ["distinct", "order-by"],
  attackTargetIds: [1310],
};

const PRACTICE_INNER_JOIN: LessonStageDefinition = {
  id: "practice-inner-join",
  objective: "连接 monsters 与 rooms，查询 id = 1410 的青蛙 name 和 room_name。",
  queryTemplate: "",
  answerSql: "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 1410;",
  hints: [
    "monsters.room_id 对应 rooms.id。",
    "给两张表使用短别名。",
    "把 rooms.name 命名为 room_name。",
    "完整写法：SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 1410;",
  ],
  locks: ["INNER JOIN", "ON"],
  requiredFeatures: ["join", "on"],
  attackTargetIds: [1410],
};

const PRACTICE_LEFT_JOIN: LessonStageDefinition = {
  id: "practice-left-join",
  objective: "LEFT JOIN 装备表，找出 room_id = 34 且没有装备的毒蛙 id。",
  queryTemplate: "",
  answerSql: "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 34 AND g.monster_id IS NULL;",
  hints: [
    "从 monsters m LEFT JOIN monster_gear g。",
    "连接条件是 m.id = g.monster_id。",
    "同时过滤 room_id 与空装备记录。",
    "完整写法：SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 34 AND g.monster_id IS NULL;",
  ],
  locks: ["LEFT JOIN", "IS NULL"],
  requiredFeatures: ["left-join", "is-null"],
  attackTargetIds: [1510],
};

const PRACTICE_LEFT_CORE: LessonStageDefinition = {
  id: "practice-left-core",
  objective: "第二击：按 id 与 toxic 状态查询毒蛙 name。",
  queryTemplate: "",
  answerSql: "SELECT name FROM monsters WHERE id = 1510 AND status = 'toxic';",
  hints: [
    "读取 name。",
    "使用 WHERE。",
    "用 AND 同时检查 id 与 status。",
    "完整写法：SELECT name FROM monsters WHERE id = 1510 AND status = 'toxic';",
  ],
  locks: ["WHERE", "AND"],
  requiredFeatures: ["where", "and"],
  attackTargetIds: [1510],
};

const FOREST_ORDER: LessonStageDefinition = {
  id: "practice-forest-order",
  objective: "按 hp 降序查询 id = 1610 的猎犬 name 与 hp，只取一行。",
  queryTemplate: "",
  answerSql: "SELECT name, hp FROM monsters WHERE id = 1610 ORDER BY hp DESC LIMIT 1;",
  hints: [
    "读取 name 与 hp。",
    "先用 WHERE 锁定猎犬。",
    "按 hp DESC 排序并 LIMIT 1。",
    "完整写法：SELECT name, hp FROM monsters WHERE id = 1610 ORDER BY hp DESC LIMIT 1;",
  ],
  locks: ["ORDER BY", "LIMIT"],
  requiredFeatures: ["order-by", "limit"],
  attackTargetIds: [1610],
};

const FOREST_JOIN: LessonStageDefinition = {
  id: "practice-forest-join",
  objective: "连接 monsters 与 rooms，查询 id = 1710 的树妖 name 与 room_name。",
  queryTemplate: "",
  answerSql: "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 1710;",
  hints: [
    "连接 monsters 与 rooms。",
    "ON m.room_id = r.id。",
    "WHERE 锁定 id = 1710。",
    "完整写法：SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 1710;",
  ],
  locks: ["INNER JOIN", "ON"],
  requiredFeatures: ["join", "on"],
  attackTargetIds: [1710],
};

const FOREST_JOIN_CORE: LessonStageDefinition = {
  id: "practice-forest-join-core",
  objective: "第二击：连接房间后按 sector 排序，查询树妖 name 与 sector，只取一行。",
  queryTemplate: "",
  answerSql: "SELECT m.name, r.sector FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 1710 ORDER BY r.sector LIMIT 1;",
  hints: [
    "保持 monsters 与 rooms 的连接。",
    "读取 m.name 与 r.sector。",
    "按 r.sector 排序并 LIMIT 1。",
    "完整写法：SELECT m.name, r.sector FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 1710 ORDER BY r.sector LIMIT 1;",
  ],
  locks: ["INNER JOIN", "ON", "ORDER BY", "LIMIT"],
  requiredFeatures: ["join", "on", "order-by", "limit"],
  attackTargetIds: [1710],
};

const LAKE_BOSS_SCAN: LessonStageDefinition = {
  id: "lake-boss-scan",
  objective: "湖怪第一击：查询 id = 1810 的 name 与 status。",
  queryTemplate: "",
  answerSql: "SELECT name, status FROM monsters WHERE id = 1810;",
  hints: [
    "读取 name 与 status。",
    "从 monsters 查询。",
    "用 WHERE id = 1810 锁定湖怪。",
    "完整写法：SELECT name, status FROM monsters WHERE id = 1810;",
  ],
  locks: ["SELECT", "FROM", "WHERE"],
  requiredFeatures: ["select", "from", "where"],
  attackTargetIds: [1810],
};

const LAKE_BOSS_SORT: LessonStageDefinition = {
  id: "lake-boss-sort",
  objective: "湖怪第二击：去重查询 id = 1810 的 status，并按 status 排序。",
  queryTemplate: "",
  answerSql: "SELECT DISTINCT status FROM monsters WHERE id = 1810 ORDER BY status;",
  hints: [
    "读取不同的 status。",
    "使用 DISTINCT 去重。",
    "按 status 排序。",
    "完整写法：SELECT DISTINCT status FROM monsters WHERE id = 1810 ORDER BY status;",
  ],
  locks: ["DISTINCT", "ORDER BY"],
  requiredFeatures: ["distinct", "order-by"],
  attackTargetIds: [1810],
};

const FROG_BOSS_LEFT: LessonStageDefinition = {
  id: "frog-boss-left",
  objective: "蛙王第一击：LEFT JOIN 装备表，查询没有装备记录的 id = 1911。",
  queryTemplate: "",
  answerSql: "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 1911 AND g.monster_id IS NULL;",
  hints: [
    "从 monsters m LEFT JOIN monster_gear g。",
    "连接 id 与 monster_id。",
    "同时检查 m.id 与空装备记录。",
    "完整写法：SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 1911 AND g.monster_id IS NULL;",
  ],
  locks: ["LEFT JOIN", "ON", "IS NULL"],
  requiredFeatures: ["left-join", "on", "is-null"],
  attackTargetIds: [1911],
};

const FROG_BOSS_DISTINCT: LessonStageDefinition = {
  id: "frog-boss-distinct",
  objective: "蛙王第二击：连接房间，去重查询二层 id = 1911 的 name，并按 name 排序。",
  queryTemplate: "",
  answerSql: "SELECT DISTINCT m.name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE r.floor = 2 AND m.id = 1911 ORDER BY m.name;",
  hints: [
    "连接 monsters 与 rooms。",
    "用 DISTINCT 读取 m.name。",
    "WHERE 限定二层和蛙王 id，最后排序。",
    "完整写法：SELECT DISTINCT m.name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE r.floor = 2 AND m.id = 1911 ORDER BY m.name;",
  ],
  locks: ["DISTINCT", "INNER JOIN", "ON", "ORDER BY"],
  requiredFeatures: ["distinct", "join", "on", "order-by"],
  attackTargetIds: [1911],
};

const PRACTICE_BONE: LessonStageDefinition = {
  id: "practice-bone",
  objective: "连接 monsters 与 rooms，查询 id = 7 的 name 与 room_name。",
  queryTemplate: "",
  answerSql: "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 7;",
  hints: [
    "读取怪物名与房间名。",
    "连接 monsters 与 rooms。",
    "ON m.room_id = r.id。",
    "完整写法：SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 7;",
  ],
  locks: ["INNER JOIN", "ON"],
  requiredFeatures: ["join", "on"],
  attackTargetIds: [7],
};

const PRACTICE_ZOMBIE: LessonStageDefinition = {
  id: "practice-zombie",
  objective: "LEFT JOIN 装备表，找出 id = 8 且没有装备的腐尸。",
  queryTemplate: "",
  answerSql: "SELECT m.name FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 8 AND g.monster_id IS NULL;",
  hints: [
    "从 monsters m 开始。",
    "LEFT JOIN monster_gear g。",
    "检查 g.monster_id IS NULL。",
    "完整写法：SELECT m.name FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 8 AND g.monster_id IS NULL;",
  ],
  locks: ["LEFT JOIN", "IS NULL"],
  requiredFeatures: ["left-join", "is-null"],
  attackTargetIds: [8],
};

const PRACTICE_SPIRIT: LessonStageDefinition = {
  id: "practice-spirit",
  objective: "自连接 monsters，查询鬼火 #9 的 name 与 master_name。",
  queryTemplate: "",
  answerSql: "SELECT child.name, master.name AS master_name FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 9;",
  hints: [
    "同一张表使用 child 与 master 两个别名。",
    "连接 child.master_id = master.id。",
    "锁定 child.id = 9。",
    "完整写法：SELECT child.name, master.name AS master_name FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 9;",
  ],
  locks: ["SELF JOIN", "ON"],
  requiredFeatures: ["self-join", "on"],
  attackTargetIds: [9],
};

const PRACTICE_SPIRIT_CORE: LessonStageDefinition = {
  id: "practice-spirit-core",
  objective: "第二击：查询 id = 9 且 status = 'haunting' 的鬼火 name。",
  queryTemplate: "",
  answerSql: "SELECT name FROM monsters WHERE id = 9 AND status = 'haunting';",
  hints: [
    "读取 name。",
    "使用 WHERE。",
    "用 AND 同时限定 id 与 status。",
    "完整写法：SELECT name FROM monsters WHERE id = 9 AND status = 'haunting';",
  ],
  locks: ["WHERE", "AND"],
  requiredFeatures: ["where", "and"],
  attackTargetIds: [9],
};

const PRACTICE_WRAITH: LessonStageDefinition = {
  id: "practice-wraith",
  objective: "自连接 monsters，查询游魂 #10 的 name 与 master_name。",
  queryTemplate: "",
  answerSql: "SELECT child.name, master.name AS master_name FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 10;",
  hints: [
    "同一张表使用两个别名。",
    "连接 child.master_id = master.id。",
    "锁定 child.id = 10。",
    "完整写法：SELECT child.name, master.name AS master_name FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 10;",
  ],
  locks: ["SELF JOIN", "ON"],
  requiredFeatures: ["self-join", "on"],
  attackTargetIds: [10],
};

const GRAVE_BOSS_SCAN: LessonStageDefinition = {
  id: "grave-boss-scan",
  objective: "墓主第一击：用 UNION 合并 room_id = 49 与 50 的 id、name，并按 id 排序。",
  queryTemplate: "",
  answerSql: "SELECT id, name FROM monsters WHERE room_id = 49 UNION SELECT id, name FROM monsters WHERE room_id = 50 ORDER BY id;",
  hints: [
    "两边都返回 id、name。",
    "分别过滤 room_id = 49 与 50。",
    "用 UNION 合并。",
    "完整写法：SELECT id, name FROM monsters WHERE room_id = 49 UNION SELECT id, name FROM monsters WHERE room_id = 50 ORDER BY id;",
  ],
  locks: ["UNION", "ORDER BY"],
  requiredFeatures: ["union", "order-by"],
  attackTargetIds: [11],
};

const GRAVE_BOSS_CORE: LessonStageDefinition = {
  id: "grave-boss-core",
  objective: "墓主第二击：自连接 monsters，返回 id = 11 的 name 与 master_name。",
  queryTemplate: "",
  answerSql: "SELECT child.name, master.name AS master_name FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 11;",
  hints: [
    "为 monsters 使用 child 与 master 两个别名。",
    "连接 child.master_id = master.id。",
    "锁定 child.id = 11。",
    "完整写法：SELECT child.name, master.name AS master_name FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 11;",
  ],
  locks: ["SELF JOIN", "ON"],
  requiredFeatures: ["self-join", "on"],
  attackTargetIds: [11],
};

const PRACTICE_FIRE: LessonStageDefinition = {
  id: "practice-fire",
  objective: "用标量子查询返回 room_id = 57 中最小 id 对应的 name。",
  queryTemplate: "",
  answerSql: "SELECT name FROM monsters WHERE id = (SELECT MIN(id) FROM monsters WHERE room_id = 57);",
  hints: [
    "外层读取 name。",
    "内层计算 room_id = 57 的 MIN(id)。",
    "外层用 id = (...)。",
    "完整写法：SELECT name FROM monsters WHERE id = (SELECT MIN(id) FROM monsters WHERE room_id = 57);",
  ],
  locks: ["SUBQUERY"],
  requiredFeatures: ["subquery"],
  attackTargetIds: [18],
};

const PRACTICE_ICE: LessonStageDefinition = {
  id: "practice-ice",
  objective: "用 IN 子查询返回 room_id 位于 frost-vault 区域的冰晶 name。",
  queryTemplate: "",
  answerSql: "SELECT name FROM monsters WHERE room_id IN (SELECT id FROM rooms WHERE sector = 'frost-vault') ORDER BY name;",
  hints: [
    "内层从 rooms 查询 id。",
    "过滤 sector = 'frost-vault'。",
    "外层用 room_id IN (...)。",
    "完整写法：SELECT name FROM monsters WHERE room_id IN (SELECT id FROM rooms WHERE sector = 'frost-vault') ORDER BY name;",
  ],
  locks: ["IN", "SUBQUERY"],
  requiredFeatures: ["in", "subquery"],
  attackTargetIds: [19],
};

const PRACTICE_STORM: LessonStageDefinition = {
  id: "practice-storm",
  objective: "用 EXISTS 查询 id = 20 且存在装备记录的雷兽 name。",
  queryTemplate: "",
  answerSql: "SELECT m.name FROM monsters m WHERE m.id = 20 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  hints: [
    "外层锁定雷兽。",
    "EXISTS 内层查询 monster_gear。",
    "用 g.monster_id = m.id 相关。",
    "完整写法：SELECT m.name FROM monsters m WHERE m.id = 20 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  ],
  locks: ["EXISTS", "SUBQUERY"],
  requiredFeatures: ["exists", "subquery"],
  attackTargetIds: [20],
};

const PRACTICE_STORM_CORE: LessonStageDefinition = {
  id: "practice-storm-core",
  objective: "第二击：查询 id = 20 且 status = 'charged' 的雷兽 name。",
  queryTemplate: "",
  answerSql: "SELECT name FROM monsters WHERE id = 20 AND status = 'charged';",
  hints: [
    "读取 name。",
    "使用 WHERE 与 AND。",
    "同时限定 id 和 status。",
    "完整写法：SELECT name FROM monsters WHERE id = 20 AND status = 'charged';",
  ],
  locks: ["WHERE", "AND"],
  requiredFeatures: ["where", "and"],
  attackTargetIds: [20],
};

const PRACTICE_SPARK: LessonStageDefinition = {
  id: "practice-spark",
  objective: "用 EXISTS 查询 id = 21 且存在装备记录的电球 name。",
  queryTemplate: "",
  answerSql: "SELECT m.name FROM monsters m WHERE m.id = 21 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  hints: [
    "外层读取 m.name。",
    "EXISTS 内层检查 monster_gear。",
    "通过 g.monster_id = m.id 关联。",
    "完整写法：SELECT m.name FROM monsters m WHERE m.id = 21 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  ],
  locks: ["EXISTS", "SUBQUERY"],
  requiredFeatures: ["exists", "subquery"],
  attackTargetIds: [21],
};

const FORGE_BOSS_SCAN: LessonStageDefinition = {
  id: "forge-boss-scan",
  objective: "炉主第一击：用 CTE 保存 power >= 19 的 monster_id，返回 id = 22 的 name。",
  queryTemplate: "",
  answerSql: "WITH strong AS (SELECT monster_id FROM monster_gear WHERE power >= 19) SELECT m.name FROM monsters m INNER JOIN strong s ON m.id = s.monster_id WHERE m.id = 22;",
  hints: [
    "先写 WITH strong AS (...)。",
    "CTE 过滤 power >= 19。",
    "主查询连接 monsters 与 strong。",
    "完整写法：WITH strong AS (SELECT monster_id FROM monster_gear WHERE power >= 19) SELECT m.name FROM monsters m INNER JOIN strong s ON m.id = s.monster_id WHERE m.id = 22;",
  ],
  locks: ["WITH / CTE", "JOIN"],
  requiredFeatures: ["cte", "join"],
  attackTargetIds: [22],
};

const FORGE_BOSS_CORE: LessonStageDefinition = {
  id: "forge-boss-core",
  objective: "炉主第二击：用 EXISTS 返回 id = 22 且存在装备记录的 name。",
  queryTemplate: "",
  answerSql: "SELECT m.name FROM monsters m WHERE m.id = 22 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  hints: [
    "外层读取 m.name。",
    "EXISTS 检查装备记录。",
    "内层关联 g.monster_id = m.id。",
    "完整写法：SELECT m.name FROM monsters m WHERE m.id = 22 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  ],
  locks: ["EXISTS", "SUBQUERY"],
  requiredFeatures: ["exists", "subquery"],
  attackTargetIds: [22],
};

export const BIOME_ENCOUNTERS: readonly BiomeEncounterDefinition[] = [
  { monsterId: 111, floor: 1, biome: "drainage", role: "normal", randomEncounter: true, stages: [PRACTICE_SELECT] },
  { monsterId: 211, floor: 1, biome: "slime-pool", role: "normal", randomEncounter: true, stages: [PRACTICE_WHERE] },
  { monsterId: 311, floor: 1, biome: "ember-cellar", role: "normal", randomEncounter: true, stages: [PRACTICE_NULL] },
  { monsterId: 810, floor: 1, biome: "ember-cellar", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_GROUP, PRACTICE_GROUP_CORE] },
  { monsterId: 1210, floor: 2, biome: "lake", role: "normal", randomEncounter: true, stages: [PRACTICE_ORDER] },
  { monsterId: 1310, floor: 2, biome: "lake", role: "normal", randomEncounter: true, stages: [PRACTICE_DISTINCT] },
  { monsterId: 1410, floor: 2, biome: "swamp", role: "normal", randomEncounter: true, stages: [PRACTICE_INNER_JOIN] },
  { monsterId: 1510, floor: 2, biome: "swamp", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_LEFT_JOIN, PRACTICE_LEFT_CORE] },
  { monsterId: 1610, floor: 2, biome: "forest", role: "normal", randomEncounter: true, stages: [FOREST_ORDER] },
  { monsterId: 1710, floor: 2, biome: "forest", role: "mini-elite", randomEncounter: true, stages: [FOREST_JOIN, FOREST_JOIN_CORE] },
  { monsterId: 1810, floor: 2, biome: "lake", role: "area-boss", randomEncounter: false, stages: [LAKE_BOSS_SCAN, LAKE_BOSS_SORT] },
  { monsterId: 1911, floor: 2, biome: "swamp", role: "area-boss", randomEncounter: false, stages: [FROG_BOSS_LEFT, FROG_BOSS_DISTINCT] },
  { monsterId: 7, floor: 3, biome: "bone-yard", role: "normal", randomEncounter: true, stages: [PRACTICE_BONE] },
  { monsterId: 8, floor: 3, biome: "grave-mire", role: "normal", randomEncounter: true, stages: [PRACTICE_ZOMBIE] },
  { monsterId: 9, floor: 3, biome: "spirit-crypt", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_SPIRIT, PRACTICE_SPIRIT_CORE] },
  { monsterId: 10, floor: 3, biome: "spirit-crypt", role: "normal", randomEncounter: true, stages: [PRACTICE_WRAITH] },
  { monsterId: 11, floor: 3, biome: "spirit-crypt", role: "area-boss", randomEncounter: false, stages: [GRAVE_BOSS_SCAN, GRAVE_BOSS_CORE] },
  { monsterId: 18, floor: 4, biome: "fire-forge", role: "normal", randomEncounter: true, stages: [PRACTICE_FIRE] },
  { monsterId: 19, floor: 4, biome: "frost-vault", role: "normal", randomEncounter: true, stages: [PRACTICE_ICE] },
  { monsterId: 20, floor: 4, biome: "storm-core", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_STORM, PRACTICE_STORM_CORE] },
  { monsterId: 21, floor: 4, biome: "storm-core", role: "normal", randomEncounter: true, stages: [PRACTICE_SPARK] },
  { monsterId: 22, floor: 4, biome: "fire-forge", role: "area-boss", randomEncounter: false, stages: [FORGE_BOSS_SCAN, FORGE_BOSS_CORE] },
] as const;

export const BIOME_PRACTICE_STAGES: Readonly<Record<number, readonly LessonStageDefinition[]>> =
  Object.fromEntries(BIOME_ENCOUNTERS.map((encounter) => [
    encounter.monsterId,
    encounter.stages,
  ]));

export function biomeEncounterFor(
  monsterId: number,
): BiomeEncounterDefinition | null {
  return BIOME_ENCOUNTERS.find((encounter) => encounter.monsterId === monsterId) ?? null;
}

export function practiceStagesFor(
  monsterId: number,
): readonly LessonStageDefinition[] {
  return BIOME_PRACTICE_STAGES[monsterId] ?? [];
}

export function weightedBiomeEncounterIds(
  floor: FloorNumber,
  biome: BiomeKind,
  unlockedLessons: ReadonlySet<Monster["lessonId"]>,
): number[] {
  const available = BIOME_ENCOUNTERS.filter((encounter) => (
    encounter.floor === floor &&
    encounter.biome === biome &&
    encounter.randomEncounter &&
    unlockedLessons.has(
      [
        ...FLOOR_ONE_BIOME_MONSTERS,
        ...FLOOR_TWO_BIOME_MONSTERS,
        ...FLOOR_THREE_BIOME_MONSTERS,
        ...FLOOR_FOUR_BIOME_MONSTERS,
      ]
        .find((monster) => monster.id === encounter.monsterId)?.lessonId ?? "select",
    )
  ));
  const normal = available.filter((encounter) => encounter.role === "normal");
  const elites = available.filter((encounter) => encounter.role === "mini-elite");
  if (normal.length === 0) return [];
  const eliteShare = floor === 1 ? 5 : floor === 2 ? 7 : floor === 3 ? 9 : 11;
  const normalCopies = Math.max(1, Math.floor((100 - eliteShare) / normal.length));
  const eliteCopies = elites.length === 0 ? 0 : Math.max(1, Math.floor(eliteShare / elites.length));
  return [
    ...normal.flatMap((encounter) => Array(normalCopies).fill(encounter.monsterId) as number[]),
    ...elites.flatMap((encounter) => Array(eliteCopies).fill(encounter.monsterId) as number[]),
  ];
}
