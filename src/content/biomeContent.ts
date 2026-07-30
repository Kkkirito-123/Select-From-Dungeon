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
  | "storm-core"
  | "iron-yard"
  | "barracks"
  | "black-citadel"
  | "magma-nest"
  | "crystal-cavern"
  | "dragon-throne"
  | "crystal-grove"
  | "root-maze"
  | "index-heart"
  | "obsidian-hall"
  | "void-court"
  | "data-throne";

export type BiomeEncounterRole = "normal" | "mini-elite" | "area-boss";

export const MINI_ELITE_PERCENT_BY_FLOOR: Readonly<Record<FloorNumber, number>> = {
  1: 5,
  2: 7,
  3: 9,
  4: 11,
  5: 13,
  6: 15,
  7: 17,
  8: 19,
};

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
    id: 6,
    lessonId: "select",
    roomId: 11,
    name: "小水怪",
    species: "small_slime",
    kind: "projection-slime",
    hp: 6,
    maxHp: 6,
    armor: 0,
    damage: 1,
    attackName: "软泥撞击",
    status: "dripping",
    weakness: "slash",
    masterId: 5,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 1,
    id: 7,
    lessonId: "where",
    roomId: 12,
    name: "小史莱姆",
    species: "water_slime",
    kind: "projection-slime",
    hp: 7,
    maxHp: 7,
    armor: 0,
    damage: 1,
    attackName: "水泡冲击",
    status: "wet",
    weakness: "focus",
    masterId: 5,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 1,
    id: 8,
    lessonId: "is-null",
    roomId: 13,
    name: "灰史莱姆",
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
    id: 9,
    lessonId: "select",
    roomId: 14,
    name: "宝箱怪",
    species: "mimic_chest",
    kind: "distinct-mimic",
    hp: 30,
    maxHp: 30,
    armor: 0,
    damage: 1,
    attackName: "箱盖咬合",
    status: "sealed",
    weakness: "select",
    masterId: null,
    isBoss: false,
    rank: "elite",
  }),
] as const;

export const FLOOR_TWO_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 2,
    id: 15,
    lessonId: "order-by",
    roomId: 31,
    name: "水怪",
    species: "lake_beast",
    kind: "sort-drake",
    hp: 12,
    maxHp: 12,
    armor: 0,
    damage: 2,
    attackName: "浪花扑击",
    status: "surfacing",
    weakness: "descending",
    masterId: 21,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 2,
    id: 16,
    lessonId: "distinct",
    roomId: 32,
    name: "水蛇",
    species: "water_snake",
    kind: "distinct-mimic",
    hp: 13,
    maxHp: 13,
    armor: 0,
    damage: 2,
    attackName: "水纹缠绕",
    status: "coiled",
    weakness: "unique",
    masterId: 21,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 2,
    id: 17,
    lessonId: "inner-join",
    roomId: 33,
    name: "青蛙",
    species: "swamp_frog",
    kind: "join-spider",
    hp: 13,
    maxHp: 13,
    armor: 0,
    damage: 2,
    attackName: "泥水跳击",
    status: "croaking",
    weakness: "relation",
    masterId: 22,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 2,
    id: 18,
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
    masterId: 22,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 2,
    id: 19,
    lessonId: "order-by",
    roomId: 35,
    name: "猎犬",
    species: "forest_hound",
    kind: "filter-hound",
    hp: 13,
    maxHp: 13,
    armor: 0,
    damage: 2,
    attackName: "林间扑咬",
    status: "tracking",
    weakness: "descending",
    masterId: 14,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 2,
    id: 20,
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
    masterId: 14,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 2,
    id: 21,
    lessonId: "distinct",
    roomId: 37,
    name: "湖兽",
    species: "lake_boss",
    kind: "sort-drake",
    hp: 22,
    maxHp: 22,
    armor: 1,
    damage: 3,
    attackName: "深水冲击",
    status: "submerged",
    weakness: "unique",
    masterId: null,
    isBoss: true,
    rank: "elite",
  }),
  biomeMonster({
    floor: 2,
    id: 22,
    lessonId: "left-join",
    roomId: 38,
    name: "蛙王",
    species: "frog_boss",
    kind: "left-join-wraith",
    hp: 24,
    maxHp: 24,
    armor: 1,
    damage: 3,
    attackName: "沼王重压",
    status: "ruling",
    weakness: "left",
    masterId: null,
    isBoss: true,
    rank: "elite",
  }),
] as const;

export const FLOOR_THREE_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 3,
    id: 29,
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
    masterId: 28,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 3,
    id: 30,
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
    masterId: 28,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 3,
    id: 31,
    lessonId: "f3-self",
    roomId: 49,
    name: "鬼火",
    species: "spirit_flame",
    kind: "ghost",
    hp: 24,
    maxHp: 24,
    armor: 1,
    damage: 3,
    attackName: "灵焰追踪",
    status: "haunting",
    weakness: "alias",
    masterId: 33,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 3,
    id: 32,
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
    masterId: 33,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 3,
    id: 33,
    lessonId: "f3-union",
    roomId: 50,
    name: "墓主",
    species: "tomb_lord",
    kind: "necromancer",
    hp: 28,
    maxHp: 28,
    armor: 2,
    damage: 3,
    attackName: "墓碑合流",
    status: "sealed",
    weakness: "union",
    masterId: 28,
    isBoss: true,
    rank: "elite",
  }),
] as const;

export const FLOOR_FOUR_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 4,
    id: 40,
    lessonId: "f4-scalar",
    roomId: 57,
    name: "火苗",
    species: "ember_sprite",
    kind: "fire-spirit",
    hp: 18,
    maxHp: 18,
    armor: 0,
    damage: 3,
    attackName: "火苗飞射",
    status: "sparking",
    weakness: "scalar",
    masterId: 44,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 4,
    id: 41,
    lessonId: "f4-in",
    roomId: 58,
    name: "冰晶",
    species: "frost_shard",
    kind: "ice-spirit",
    hp: 18,
    maxHp: 18,
    armor: 0,
    damage: 3,
    attackName: "冰晶散射",
    status: "frozen",
    weakness: "in",
    masterId: 44,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 4,
    id: 42,
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
    masterId: 44,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 4,
    id: 43,
    lessonId: "f4-exists",
    roomId: 59,
    name: "电球",
    species: "storm_orb",
    kind: "thunder-spirit",
    hp: 18,
    maxHp: 18,
    armor: 0,
    damage: 3,
    attackName: "电弧撞击",
    status: "sparking",
    weakness: "exists",
    masterId: 44,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 4,
    id: 44,
    lessonId: "f4-in",
    roomId: 60,
    name: "炉主",
    species: "mirror_forge_lord",
    kind: "elemental-king",
    hp: 32,
    maxHp: 32,
    armor: 2,
    damage: 4,
    attackName: "炉火封锁",
    status: "sealed",
    weakness: "cte",
    masterId: 39,
    isBoss: true,
    rank: "elite",
  }),
] as const;

export const FLOOR_FIVE_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 5,
    id: 51,
    lessonId: "f5-over",
    roomId: 67,
    name: "小妖",
    species: "iron_goblin",
    kind: "goblin",
    hp: 18,
    maxHp: 18,
    armor: 0,
    damage: 3,
    attackName: "铁钉投掷",
    status: "scouting",
    weakness: "partition",
    masterId: 55,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 5,
    id: 52,
    lessonId: "f5-row-number",
    roomId: 68,
    name: "战兽",
    species: "barracks_orc",
    kind: "orc",
    hp: 20,
    maxHp: 20,
    armor: 0,
    damage: 3,
    attackName: "肩甲冲撞",
    status: "marching",
    weakness: "row-number",
    masterId: 55,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 5,
    id: 53,
    lessonId: "f5-rank",
    roomId: 68,
    name: "铁卫",
    species: "iron_guard",
    kind: "knight",
    hp: 24,
    maxHp: 24,
    armor: 1,
    damage: 4,
    attackName: "盾墙推进",
    status: "guarding",
    weakness: "rank",
    masterId: 55,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 5,
    id: 54,
    lessonId: "f5-frame",
    roomId: 69,
    name: "巨魔",
    species: "citadel_troll",
    kind: "troll",
    hp: 22,
    maxHp: 22,
    armor: 0,
    damage: 3,
    attackName: "石块砸击",
    status: "hauling",
    weakness: "frame",
    masterId: 55,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 5,
    id: 55,
    lessonId: "f5-top-n",
    roomId: 70,
    name: "堡主",
    species: "citadel_lord",
    kind: "castle-lord",
    hp: 36,
    maxHp: 36,
    armor: 2,
    damage: 4,
    attackName: "城弩齐射",
    status: "commanding",
    weakness: "top-n",
    masterId: 50,
    isBoss: true,
    rank: "elite",
  }),
] as const;

export const FLOOR_SIX_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 6,
    id: 62,
    lessonId: "f6-insert",
    roomId: 77,
    name: "小龙",
    species: "nest_hatchling",
    kind: "hatchling",
    hp: 20,
    maxHp: 20,
    armor: 0,
    damage: 4,
    attackName: "幼焰喷吐",
    status: "restless",
    weakness: "insert",
    masterId: 66,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 6,
    id: 63,
    lessonId: "f6-update",
    roomId: 79,
    name: "翼龙",
    species: "magma_wyvern",
    kind: "wyvern",
    hp: 22,
    maxHp: 22,
    armor: 0,
    damage: 4,
    attackName: "翼爪扫击",
    status: "circling",
    weakness: "update",
    masterId: 66,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 6,
    id: 64,
    lessonId: "f6-transaction",
    roomId: 79,
    name: "雷龙",
    species: "cavern_thunder_drake",
    kind: "dragon",
    hp: 29,
    maxHp: 29,
    armor: 1,
    damage: 4,
    attackName: "雷息",
    status: "charged",
    weakness: "rollback",
    masterId: 66,
    isBoss: false,
    rank: "elite",
  }),
  biomeMonster({
    floor: 6,
    id: 65,
    lessonId: "f6-constraint",
    roomId: 78,
    name: "晶龙",
    species: "cavern_crystal_drake",
    kind: "dragon",
    hp: 23,
    maxHp: 23,
    armor: 0,
    damage: 4,
    attackName: "晶片飞射",
    status: "crystallized",
    weakness: "constraint",
    masterId: 66,
    isBoss: false,
    rank: "normal",
  }),
  biomeMonster({
    floor: 6,
    id: 66,
    lessonId: "f6-savepoint",
    roomId: 80,
    name: "古龙",
    species: "ancient_cave_dragon",
    kind: "dragon-king",
    hp: 40,
    maxHp: 40,
    armor: 2,
    damage: 5,
    attackName: "古焰轰击",
    status: "ancient",
    weakness: "savepoint",
    masterId: 61,
    isBoss: true,
    rank: "elite",
  }),
] as const;

export const FLOOR_SEVEN_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 7, id: 73, lessonId: "f7-btree", roomId: 87, name: "枝妖",
    species: "branch_imp", kind: "index-guard", hp: 22, maxHp: 22, armor: 0,
    damage: 4, attackName: "枝刺", status: "guarding", weakness: "search",
    masterId: 77, isBoss: false, rank: "normal",
  }),
  biomeMonster({
    floor: 7, id: 74, lessonId: "f7-composite", roomId: 88, name: "根兽",
    species: "grove_root_beast", kind: "root-beast", hp: 24, maxHp: 24, armor: 1,
    damage: 4, attackName: "根撞", status: "rooted", weakness: "left-prefix",
    masterId: 77, isBoss: false, rank: "normal",
  }),
  biomeMonster({
    floor: 7, id: 75, lessonId: "f7-covering", roomId: 87, name: "晶灵",
    species: "grove_crystal_spirit", kind: "crystal-spirit", hp: 28, maxHp: 28, armor: 1,
    damage: 5, attackName: "晶光", status: "reflecting", weakness: "covering",
    masterId: 77, isBoss: false, rank: "elite",
  }),
  biomeMonster({
    floor: 7, id: 76, lessonId: "f7-invalid", roomId: 89, name: "树魔",
    species: "grove_tree_demon", kind: "vine-witch", hp: 24, maxHp: 24, armor: 1,
    damage: 4, attackName: "藤鞭", status: "casting", weakness: "range",
    masterId: 77, isBoss: false, rank: "normal",
  }),
  biomeMonster({
    floor: 7, id: 77, lessonId: "f7-optimize", roomId: 90, name: "林王",
    species: "grove_king", kind: "index-tree", hp: 48, maxHp: 48, armor: 2,
    damage: 5, attackName: "树冠重压", status: "ruling", weakness: "rewrite",
    masterId: 72, isBoss: true, rank: "elite",
  }),
] as const;

export const FLOOR_EIGHT_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 8, id: 85, lessonId: "f8-mvcc", roomId: 98, name: "魔兵",
    species: "demon_soldier", kind: "demon-soldier", hp: 26, maxHp: 26, armor: 1,
    damage: 5, attackName: "黑刃", status: "patrolling", weakness: "snapshot",
    masterId: 89, isBoss: false, rank: "normal",
  }),
  biomeMonster({
    floor: 8, id: 86, lessonId: "f8-lock", roomId: 99, name: "黑骑",
    species: "dark_knight", kind: "dark-knight", hp: 28, maxHp: 28, armor: 1,
    damage: 5, attackName: "锁链斩", status: "waiting", weakness: "deadlock",
    masterId: 89, isBoss: false, rank: "normal",
  }),
  biomeMonster({
    floor: 8, id: 87, lessonId: "f8-isolation", roomId: 99, name: "魔将",
    species: "demon_general", kind: "lich", hp: 32, maxHp: 32, armor: 2,
    damage: 6, attackName: "幻读", status: "shifting", weakness: "serializable",
    masterId: 89, isBoss: false, rank: "elite",
  }),
  biomeMonster({
    floor: 8, id: 88, lessonId: "f8-modeling", roomId: 100, name: "石像",
    species: "obsidian_statue", kind: "obsidian-golem", hp: 28, maxHp: 28, armor: 2,
    damage: 5, attackName: "石拳", status: "duplicating", weakness: "normalization",
    masterId: 89, isBoss: false, rank: "normal",
  }),
  biomeMonster({
    floor: 8, id: 89, lessonId: "f8-security", roomId: 101, name: "王兽",
    species: "throne_beast", kind: "shard-beast", hp: 56, maxHp: 56, armor: 3,
    damage: 7, attackName: "王庭冲撞", status: "guarding", weakness: "evidence",
    masterId: 84, isBoss: true, rank: "elite",
  }),
] as const;

const PRACTICE_SELECT: LessonStageDefinition = {
  id: "practice-select",
  objective: "查询 id = 6 的怪物 id 与 status。",
  queryTemplate: "",
  answerSql: "SELECT id, status FROM monsters WHERE id = 6;",
  hints: [
    "读取 id 与 status。",
    "目标表是 monsters。",
    "用 id = 6 锁定目标记录。",
    "完整写法：SELECT id, status FROM monsters WHERE id = 6;",
  ],
  locks: ["SELECT", "FROM"],
  requiredFeatures: ["select", "from"],
  attackTargetIds: [6],
};

const PRACTICE_WHERE: LessonStageDefinition = {
  id: "practice-where",
  objective: "返回 room_id = 12 且 status = 'wet' 的怪物 id。",
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
  attackTargetIds: [7],
};

const PRACTICE_NULL: LessonStageDefinition = {
  id: "practice-null",
  objective: "查询 status = 'toxic' 且 master_id 为空的怪物 id。",
  queryTemplate: "",
  answerSql: "SELECT id FROM monsters WHERE master_id IS NULL AND status = 'toxic';",
  hints: [
    "先找没有主人的怪物。",
    "NULL 使用 IS NULL。",
    "再用 AND 过滤 toxic 状态。",
    "完整写法：SELECT id FROM monsters WHERE master_id IS NULL AND status = 'toxic';",
  ],
  locks: ["WHERE", "IS NULL"],
  requiredFeatures: ["where", "is-null"],
  attackTargetIds: [8],
};

const PRACTICE_GROUP: LessonStageDefinition = {
  id: "practice-group",
  objective: "从 monster_signals 按 channel 统计 monster_id = 9 的信号数，别名为 total。",
  queryTemplate: "",
  answerSql: "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 9 GROUP BY channel;",
  hints: [
    "数据表是 monster_signals。",
    "读取 channel 和计数。",
    "计数写作 COUNT(*) AS total。",
    "按 channel 分组。",
    "完整写法：SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 9 GROUP BY channel;",
  ],
  locks: ["COUNT", "GROUP BY"],
  requiredFeatures: ["count", "group-by"],
  attackTargetIds: [9],
};

const PRACTICE_GROUP_CORE: LessonStageDefinition = {
  id: "practice-group-core",
  objective: "第二击：查询 id = 9 的怪物 id 与 status。",
  queryTemplate: "",
  answerSql: "SELECT id, status FROM monsters WHERE id = 9;",
  hints: [
    "读取 id 与 status。",
    "目标表是 monsters。",
    "用 id = 9 锁定目标记录。",
    "完整写法：SELECT id, status FROM monsters WHERE id = 9;",
  ],
  locks: ["SELECT", "FROM", "WHERE"],
  requiredFeatures: ["select", "from", "where"],
  attackTargetIds: [9],
};

const PRACTICE_MIMIC: readonly LessonStageDefinition[] = [
  PRACTICE_SELECT,
  PRACTICE_WHERE,
  PRACTICE_NULL,
  PRACTICE_GROUP,
  PRACTICE_GROUP_CORE,
];

const PRACTICE_ORDER: LessonStageDefinition = {
  id: "practice-order",
  objective: "从 monster_signals 按 charge 从高到低，取出 monster_id = 15 的最强 channel。",
  queryTemplate: "",
  answerSql: "SELECT channel FROM monster_signals WHERE monster_id = 15 ORDER BY charge DESC LIMIT 1;",
  hints: [
    "从 monster_signals 读取 channel。",
    "按 charge 降序排列。",
    "只保留第一行。",
    "完整写法：SELECT channel FROM monster_signals WHERE monster_id = 15 ORDER BY charge DESC LIMIT 1;",
  ],
  locks: ["ORDER BY", "LIMIT"],
  requiredFeatures: ["order-by", "limit"],
  attackTargetIds: [15],
};

const PRACTICE_DISTINCT: LessonStageDefinition = {
  id: "practice-distinct",
  objective: "从 monster_signals 去重查询 monster_id = 16 的 channel，并按 channel 排序。",
  queryTemplate: "",
  answerSql: "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 16 ORDER BY channel;",
  hints: [
    "数据表是 monster_signals。",
    "SELECT 后加入 DISTINCT。",
    "读取 channel。",
    "按 channel 排序。",
    "完整写法：SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 16 ORDER BY channel;",
  ],
  locks: ["DISTINCT", "ORDER BY"],
  requiredFeatures: ["distinct", "order-by"],
  attackTargetIds: [16],
};

const PRACTICE_INNER_JOIN: LessonStageDefinition = {
  id: "practice-inner-join",
  objective: "给 monsters 使用别名 m、rooms 使用别名 r；连接后返回 m.id = 17 的 m.id，并把 r.name 命名为 room_name。",
  queryTemplate: "",
  answerSql: "SELECT m.id, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 17;",
  hints: [
    "monsters.room_id 对应 rooms.id。",
    "给两张表使用短别名。",
    "把 rooms.name 命名为 room_name。",
    "完整写法：SELECT m.id, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 17;",
  ],
  locks: ["INNER JOIN", "ON"],
  requiredFeatures: ["join", "on"],
  attackTargetIds: [17],
};

const PRACTICE_LEFT_JOIN: LessonStageDefinition = {
  id: "practice-left-join",
  objective: "给 monsters 使用别名 m、monster_gear 使用别名 g；LEFT JOIN 后返回 m.room_id = 34 且 g.monster_id 为空的 m.id。",
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
  attackTargetIds: [18],
};

const PRACTICE_LEFT_CORE: LessonStageDefinition = {
  id: "practice-left-core",
  objective: "第二击：从 monsters 返回 id = 18 且 status = 'toxic' 的 id。",
  queryTemplate: "",
  answerSql: "SELECT id FROM monsters WHERE id = 18 AND status = 'toxic';",
  hints: [
    "读取 id。",
    "使用 WHERE。",
    "用 AND 同时检查 id 与 status。",
    "完整写法：SELECT id FROM monsters WHERE id = 18 AND status = 'toxic';",
  ],
  locks: ["WHERE", "AND"],
  requiredFeatures: ["where", "and"],
  attackTargetIds: [18],
};

const FOREST_ORDER: LessonStageDefinition = {
  id: "practice-forest-order",
  objective: "从 monsters 返回 id = 19 的 id 与 hp，按 hp 降序并只取一行。",
  queryTemplate: "",
  answerSql: "SELECT id, hp FROM monsters WHERE id = 19 ORDER BY hp DESC LIMIT 1;",
  hints: [
    "读取 id 与 hp。",
    "先用 WHERE 锁定 ID #019。",
    "按 hp DESC 排序并 LIMIT 1。",
    "完整写法：SELECT id, hp FROM monsters WHERE id = 19 ORDER BY hp DESC LIMIT 1;",
  ],
  locks: ["ORDER BY", "LIMIT"],
  requiredFeatures: ["order-by", "limit"],
  attackTargetIds: [19],
};

const FOREST_JOIN: LessonStageDefinition = {
  id: "practice-forest-join",
  objective: "第一击：给 monsters 使用别名 m、rooms 使用别名 r，查询 m.id = 20 的 m.id 与 room_name。",
  queryTemplate: "",
  answerSql: "SELECT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 20;",
  hints: [
    "连接 monsters AS m 与 rooms AS r。",
    "ON m.room_id = r.id。",
    "读取 m.id，并把 r.name 命名为 room_name。",
    "完整写法：SELECT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 20;",
  ],
  locks: ["INNER JOIN", "ON"],
  requiredFeatures: ["join", "on"],
  attackTargetIds: [20],
};

const FOREST_JOIN_CORE: LessonStageDefinition = {
  id: "practice-forest-join-core",
  objective: "第二击：连接 monsters AS m 与 rooms AS r，返回 m.id = 20 的 m.id，并把 r.sector 命名为 room_sector；按 r.sector 排序且只取一行。",
  queryTemplate: "",
  answerSql: "SELECT m.id, r.sector AS room_sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 20 ORDER BY r.sector LIMIT 1;",
  hints: [
    "保持 monsters 与 rooms 的连接。",
    "读取 m.id，并把 r.sector 命名为 room_sector。",
    "按 r.sector 排序并 LIMIT 1。",
    "完整写法：SELECT m.id, r.sector AS room_sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 20 ORDER BY r.sector LIMIT 1;",
  ],
  locks: ["INNER JOIN", "ON", "ORDER BY", "LIMIT"],
  requiredFeatures: ["join", "on", "order-by", "limit"],
  attackTargetIds: [20],
};

const LAKE_BOSS_SCAN: LessonStageDefinition = {
  id: "lake-boss-scan",
  objective: "第一击：按 charge 从高到低查询 monster_id = 21 的前两条 channel 与 charge。",
  queryTemplate: "",
  answerSql: "SELECT channel, charge FROM monster_signals WHERE monster_id = 21 ORDER BY charge DESC LIMIT 2;",
  hints: [
    "从 monster_signals 读取 channel 与 charge。",
    "用 WHERE monster_id = 21 锁定信号。",
    "按 charge DESC 排序并 LIMIT 2。",
    "完整写法：SELECT channel, charge FROM monster_signals WHERE monster_id = 21 ORDER BY charge DESC LIMIT 2;",
  ],
  locks: ["SELECT", "FROM", "WHERE"],
  requiredFeatures: ["select", "from", "where"],
  attackTargetIds: [21],
};

const LAKE_BOSS_SORT: LessonStageDefinition = {
  id: "lake-boss-sort",
  objective: "第二击：去重查询 monster_id = 21 的 channel，并按 channel 排序。",
  queryTemplate: "",
  answerSql: "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 21 ORDER BY channel;",
  hints: [
    "读取不同的 channel。",
    "使用 DISTINCT 去重。",
    "按 channel 排序。",
    "完整写法：SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 21 ORDER BY channel;",
  ],
  locks: ["DISTINCT", "ORDER BY"],
  requiredFeatures: ["distinct", "order-by"],
  attackTargetIds: [21],
};

const FROG_BOSS_LEFT: LessonStageDefinition = {
  id: "frog-boss-left",
  objective: "第一击：给 monsters 使用别名 m、monster_gear 使用别名 g；LEFT JOIN 后返回 m.id = 22 且 g.monster_id 为空的 m.id。",
  queryTemplate: "",
  answerSql: "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 22 AND g.monster_id IS NULL;",
  hints: [
    "从 monsters m LEFT JOIN monster_gear g。",
    "连接 id 与 monster_id。",
    "同时检查 m.id 与空装备记录。",
    "完整写法：SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 22 AND g.monster_id IS NULL;",
  ],
  locks: ["LEFT JOIN", "ON", "IS NULL"],
  requiredFeatures: ["left-join", "on", "is-null"],
  attackTargetIds: [22],
};

const FROG_BOSS_DISTINCT: LessonStageDefinition = {
  id: "frog-boss-distinct",
  objective: "第二击：连接 monsters AS m 与 rooms AS r，去重返回二层 m.id = 22 的 m.id，并把 r.name 命名为 room_name；按 m.id 排序。",
  queryTemplate: "",
  answerSql: "SELECT DISTINCT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE r.floor = 2 AND m.id = 22 ORDER BY m.id;",
  hints: [
    "连接 monsters 与 rooms。",
    "用 DISTINCT 读取 m.id，并把 r.name 命名为 room_name。",
    "WHERE 限定二层和 ID #022，最后排序。",
    "完整写法：SELECT DISTINCT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE r.floor = 2 AND m.id = 22 ORDER BY m.id;",
  ],
  locks: ["DISTINCT", "INNER JOIN", "ON", "ORDER BY"],
  requiredFeatures: ["distinct", "join", "on", "order-by"],
  attackTargetIds: [22],
};

const PRACTICE_BONE: LessonStageDefinition = {
  id: "practice-bone",
  objective: "连接 monsters 与 rooms，查询 id = 29 的 id 与 room_name。",
  queryTemplate: "",
  answerSql: "SELECT m.id, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 29;",
  hints: [
    "读取怪物 ID 与房间名。",
    "连接 monsters 与 rooms。",
    "ON m.room_id = r.id。",
    "完整写法：SELECT m.id, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 29;",
  ],
  locks: ["INNER JOIN", "ON"],
  requiredFeatures: ["join", "on"],
  attackTargetIds: [29],
};

const PRACTICE_ZOMBIE: LessonStageDefinition = {
  id: "practice-zombie",
  objective: "LEFT JOIN 装备表，找出 id = 30 且没有装备的记录。",
  queryTemplate: "",
  answerSql: "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 30 AND g.monster_id IS NULL;",
  hints: [
    "从 monsters m 开始。",
    "LEFT JOIN monster_gear g。",
    "检查 g.monster_id IS NULL。",
    "完整写法：SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 30 AND g.monster_id IS NULL;",
  ],
  locks: ["LEFT JOIN", "IS NULL"],
  requiredFeatures: ["left-join", "is-null"],
  attackTargetIds: [30],
};

const PRACTICE_SPIRIT: LessonStageDefinition = {
  id: "practice-spirit",
  objective: "自连接 monsters，查询 ID #031 的 child_id 与 master_id。",
  queryTemplate: "",
  answerSql: "SELECT child.id AS child_id, master.id AS master_id FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 31;",
  hints: [
    "同一张表使用 child 与 master 两个别名。",
    "连接 child.master_id = master.id。",
    "锁定 child.id = 31。",
    "完整写法：SELECT child.id AS child_id, master.id AS master_id FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 31;",
  ],
  locks: ["SELF JOIN", "ON"],
  requiredFeatures: ["self-join", "on"],
  attackTargetIds: [31],
};

const PRACTICE_SPIRIT_CORE: LessonStageDefinition = {
  id: "practice-spirit-core",
  objective: "第二击：查询 id = 31 且 status = 'haunting' 的 id。",
  queryTemplate: "",
  answerSql: "SELECT id FROM monsters WHERE id = 31 AND status = 'haunting';",
  hints: [
    "读取 id。",
    "使用 WHERE。",
    "用 AND 同时限定 id 与 status。",
    "完整写法：SELECT id FROM monsters WHERE id = 31 AND status = 'haunting';",
  ],
  locks: ["WHERE", "AND"],
  requiredFeatures: ["where", "and"],
  attackTargetIds: [31],
};

const PRACTICE_WRAITH: LessonStageDefinition = {
  id: "practice-wraith",
  objective: "自连接 monsters，查询 ID #032 的 child_id 与 master_id。",
  queryTemplate: "",
  answerSql: "SELECT child.id AS child_id, master.id AS master_id FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 32;",
  hints: [
    "同一张表使用两个别名。",
    "连接 child.master_id = master.id。",
    "锁定 child.id = 32。",
    "完整写法：SELECT child.id AS child_id, master.id AS master_id FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 32;",
  ],
  locks: ["SELF JOIN", "ON"],
  requiredFeatures: ["self-join", "on"],
  attackTargetIds: [32],
};

const GRAVE_BOSS_SCAN: LessonStageDefinition = {
  id: "grave-boss-scan",
  objective: "区域首领第一击：用 UNION 合并 room_id = 49 与 50 的 id，并按 id 排序。",
  queryTemplate: "",
  answerSql: "SELECT id FROM monsters WHERE room_id = 49 UNION SELECT id FROM monsters WHERE room_id = 50 ORDER BY id;",
  hints: [
    "两边都只返回 id。",
    "分别过滤 room_id = 49 与 50。",
    "用 UNION 合并。",
    "完整写法：SELECT id FROM monsters WHERE room_id = 49 UNION SELECT id FROM monsters WHERE room_id = 50 ORDER BY id;",
  ],
  locks: ["UNION", "ORDER BY"],
  requiredFeatures: ["union", "order-by"],
  attackTargetIds: [33],
};

const GRAVE_BOSS_CORE: LessonStageDefinition = {
  id: "grave-boss-core",
  objective: "区域首领第二击：自连接 monsters，返回 id = 33 的 child_id 与 master_id。",
  queryTemplate: "",
  answerSql: "SELECT child.id AS child_id, master.id AS master_id FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 33;",
  hints: [
    "为 monsters 使用 child 与 master 两个别名。",
    "连接 child.master_id = master.id。",
    "锁定 child.id = 33。",
    "完整写法：SELECT child.id AS child_id, master.id AS master_id FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 33;",
  ],
  locks: ["SELF JOIN", "ON"],
  requiredFeatures: ["self-join", "on"],
  attackTargetIds: [33],
};

const PRACTICE_FIRE: LessonStageDefinition = {
  id: "practice-fire",
  objective: "用标量子查询返回 room_id = 57 中最小的 id。",
  queryTemplate: "",
  answerSql: "SELECT id FROM monsters WHERE id = (SELECT MIN(id) FROM monsters WHERE room_id = 57);",
  hints: [
    "外层读取 id。",
    "内层计算 room_id = 57 的 MIN(id)。",
    "外层用 id = (...)。",
    "完整写法：SELECT id FROM monsters WHERE id = (SELECT MIN(id) FROM monsters WHERE room_id = 57);",
  ],
  locks: ["SUBQUERY"],
  requiredFeatures: ["subquery"],
  attackTargetIds: [40],
};

const PRACTICE_ICE: LessonStageDefinition = {
  id: "practice-ice",
  objective: "用 IN 子查询返回 room_id 位于 frost-vault 区域的怪物 id。",
  queryTemplate: "",
  answerSql: "SELECT id FROM monsters WHERE room_id IN (SELECT id FROM rooms WHERE sector = 'frost-vault') ORDER BY id;",
  hints: [
    "内层从 rooms 查询 id。",
    "过滤 sector = 'frost-vault'。",
    "外层用 room_id IN (...)。",
    "完整写法：SELECT id FROM monsters WHERE room_id IN (SELECT id FROM rooms WHERE sector = 'frost-vault') ORDER BY id;",
  ],
  locks: ["IN", "SUBQUERY"],
  requiredFeatures: ["in", "subquery"],
  attackTargetIds: [41],
};

const PRACTICE_STORM: LessonStageDefinition = {
  id: "practice-storm",
  objective: "用 EXISTS 查询 id = 42 且存在装备记录的怪物 id。",
  queryTemplate: "",
  answerSql: "SELECT m.id FROM monsters m WHERE m.id = 42 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  hints: [
    "外层锁定 ID #042。",
    "EXISTS 内层查询 monster_gear。",
    "用 g.monster_id = m.id 相关。",
    "完整写法：SELECT m.id FROM monsters m WHERE m.id = 42 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  ],
  locks: ["EXISTS", "SUBQUERY"],
  requiredFeatures: ["exists", "subquery"],
  attackTargetIds: [42],
};

const PRACTICE_STORM_CORE: LessonStageDefinition = {
  id: "practice-storm-core",
  objective: "第二击：查询 id = 42 且 status = 'charged' 的 id。",
  queryTemplate: "",
  answerSql: "SELECT id FROM monsters WHERE id = 42 AND status = 'charged';",
  hints: [
    "读取 id。",
    "使用 WHERE 与 AND。",
    "同时限定 id 和 status。",
    "完整写法：SELECT id FROM monsters WHERE id = 42 AND status = 'charged';",
  ],
  locks: ["WHERE", "AND"],
  requiredFeatures: ["where", "and"],
  attackTargetIds: [42],
};

const PRACTICE_SPARK: LessonStageDefinition = {
  id: "practice-spark",
  objective: "用 EXISTS 查询 id = 43 且存在装备记录的怪物 id。",
  queryTemplate: "",
  answerSql: "SELECT m.id FROM monsters m WHERE m.id = 43 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  hints: [
    "外层读取 m.id。",
    "EXISTS 内层检查 monster_gear。",
    "通过 g.monster_id = m.id 关联。",
    "完整写法：SELECT m.id FROM monsters m WHERE m.id = 43 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  ],
  locks: ["EXISTS", "SUBQUERY"],
  requiredFeatures: ["exists", "subquery"],
  attackTargetIds: [43],
};

const FORGE_BOSS_SCAN: LessonStageDefinition = {
  id: "forge-boss-scan",
  objective: "区域首领第一击：从 monster_gear 用 CTE 保存 power >= 19 的 monster_id，返回 monsters.id = 44 的 id。",
  queryTemplate: "",
  answerSql: "WITH strong AS (SELECT monster_id FROM monster_gear WHERE power >= 19) SELECT m.id FROM monsters m INNER JOIN strong s ON m.id = s.monster_id WHERE m.id = 44;",
  hints: [
    "先写 WITH strong AS (...)。",
    "CTE 过滤 power >= 19。",
    "主查询连接 monsters 与 strong。",
    "完整写法：WITH strong AS (SELECT monster_id FROM monster_gear WHERE power >= 19) SELECT m.id FROM monsters m INNER JOIN strong s ON m.id = s.monster_id WHERE m.id = 44;",
  ],
  locks: ["WITH / CTE", "JOIN"],
  requiredFeatures: ["cte", "join"],
  attackTargetIds: [44],
};

const FORGE_BOSS_CORE: LessonStageDefinition = {
  id: "forge-boss-core",
  objective: "区域首领第二击：用 EXISTS 返回 id = 44 且存在装备记录的 id。",
  queryTemplate: "",
  answerSql: "SELECT m.id FROM monsters m WHERE m.id = 44 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  hints: [
    "外层读取 m.id。",
    "EXISTS 检查装备记录。",
    "内层关联 g.monster_id = m.id。",
    "完整写法：SELECT m.id FROM monsters m WHERE m.id = 44 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);",
  ],
  locks: ["EXISTS", "SUBQUERY"],
  requiredFeatures: ["exists", "subquery"],
  attackTargetIds: [44],
};

const PRACTICE_GOBLIN: LessonStageDefinition = {
  id: "practice-goblin",
  objective: "查询 id 51 到 52 的 id，并按 master_id 分区计算 guard_total。",
  queryTemplate: "",
  answerSql: "SELECT id, COUNT(*) OVER (PARTITION BY master_id) AS guard_total FROM monsters WHERE id BETWEEN 51 AND 52 ORDER BY id;",
  hints: [
    "返回 id 与 guard_total。",
    "使用 COUNT(*) OVER (...)。",
    "按 master_id 分区。",
    "完整写法：SELECT id, COUNT(*) OVER (PARTITION BY master_id) AS guard_total FROM monsters WHERE id BETWEEN 51 AND 52 ORDER BY id;",
  ],
  locks: ["OVER", "PARTITION BY"],
  requiredFeatures: ["over", "partition-by"],
  attackTargetIds: [51],
};

const PRACTICE_ORC: LessonStageDefinition = {
  id: "practice-orc",
  objective: "连接装备表，对 id 51 到 52 按 power 降序生成 pos，并按 pos 返回 id。",
  queryTemplate: "",
  answerSql: "SELECT m.id, ROW_NUMBER() OVER (ORDER BY g.power DESC, m.id) AS pos FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 52 ORDER BY pos;",
  hints: [
    "返回 id 与 pos。",
    "使用 ROW_NUMBER() OVER (...)。",
    "窗口按装备 power DESC、id 排序。",
    "完整写法：SELECT m.id, ROW_NUMBER() OVER (ORDER BY g.power DESC, m.id) AS pos FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 52 ORDER BY pos;",
  ],
  locks: ["ROW_NUMBER", "ORDER BY"],
  requiredFeatures: ["row-number", "order-by"],
  attackTargetIds: [52],
};

const PRACTICE_KNIGHT: LessonStageDefinition = {
  id: "practice-knight",
  objective: "连接装备表，查询 id 52 到 53 的 id、power 与 rank_no，按 power 降序排列。",
  queryTemplate: "",
  answerSql: "SELECT m.id, g.power, RANK() OVER (ORDER BY g.power DESC) AS rank_no FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 52 AND 53 ORDER BY g.power DESC, m.id;",
  hints: [
    "返回 id、power、rank_no。",
    "rank_no 使用 RANK()。",
    "窗口按装备 power DESC。",
    "完整写法：SELECT m.id, g.power, RANK() OVER (ORDER BY g.power DESC) AS rank_no FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 52 AND 53 ORDER BY g.power DESC, m.id;",
  ],
  locks: ["RANK", "OVER"],
  requiredFeatures: ["rank", "over"],
  attackTargetIds: [53],
};

const PRACTICE_TROLL: LessonStageDefinition = {
  id: "practice-troll",
  objective: "连接装备表，查询 id 51 到 54 的 id 与 running_power，按 id 累计 power。",
  queryTemplate: "",
  answerSql: "SELECT m.id, SUM(g.power) OVER (ORDER BY m.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 54 ORDER BY m.id;",
  hints: [
    "返回 id 与 running_power。",
    "使用 SUM(g.power) OVER (...)。",
    "写明从第一行到当前行的 ROWS Frame。",
    "完整写法：SELECT m.id, SUM(g.power) OVER (ORDER BY m.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 54 ORDER BY m.id;",
  ],
  locks: ["OVER", "ROWS FRAME"],
  requiredFeatures: ["over", "window-frame"],
  attackTargetIds: [54],
};

const IRON_BOSS_SCAN: LessonStageDefinition = {
  id: "iron-boss-scan",
  objective: "用 CTE 和 ROW_NUMBER 找出 id 51 到 54 中装备 power 最高的 id、power。",
  queryTemplate: "",
  answerSql: "WITH ranked AS (SELECT m.id, g.power, ROW_NUMBER() OVER (ORDER BY g.power DESC, m.id) AS rn FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 54) SELECT id, power FROM ranked WHERE rn = 1;",
  hints: [
    "先在 ranked CTE 内编号。",
    "窗口按装备 power DESC、id 排序。",
    "外层保留 rn = 1。",
    "完整写法：WITH ranked AS (SELECT m.id, g.power, ROW_NUMBER() OVER (ORDER BY g.power DESC, m.id) AS rn FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 54) SELECT id, power FROM ranked WHERE rn = 1;",
  ],
  locks: ["WITH", "ROW_NUMBER"],
  requiredFeatures: ["cte", "row-number"],
  attackTargetIds: [55],
};

const IRON_BOSS_CORE: LessonStageDefinition = {
  id: "iron-boss-core",
  objective: "连接装备表，查询 id 51 到 54 的 id 与 prev_power，用 LAG 按 id 读取上一行 power。",
  queryTemplate: "",
  answerSql: "SELECT m.id, LAG(g.power) OVER (ORDER BY m.id) AS prev_power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 54 ORDER BY m.id;",
  hints: [
    "返回 id 与 prev_power。",
    "使用 LAG(g.power)。",
    "窗口和结果都按 id 排序。",
    "完整写法：SELECT m.id, LAG(g.power) OVER (ORDER BY m.id) AS prev_power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 54 ORDER BY m.id;",
  ],
  locks: ["LAG", "ORDER BY"],
  requiredFeatures: ["lag", "order-by"],
  attackTargetIds: [55],
};

const PRACTICE_HATCHLING: LessonStageDefinition = {
  id: "practice-hatchling",
  objective: "向 repair_queue 写入 id = 7、item = 'ember'、quantity = 1、status = 'ready'。",
  queryTemplate: "",
  answerSql: "INSERT INTO repair_queue(id, item, quantity, status) VALUES (7, 'ember', 1, 'ready');",
  hints: [
    "使用 INSERT INTO repair_queue。",
    "明确写出四个字段。",
    "值是 7、'ember'、1、'ready'。",
    "完整写法：INSERT INTO repair_queue(id, item, quantity, status) VALUES (7, 'ember', 1, 'ready');",
  ],
  locks: ["INSERT"],
  requiredFeatures: ["insert"],
  attackTargetIds: [62],
};

const PRACTICE_WYVERN: LessonStageDefinition = {
  id: "practice-wyvern",
  objective: "把 repair_queue 中 id = 1 的 quantity 更新为 3。",
  queryTemplate: "",
  answerSql: "UPDATE repair_queue SET quantity = 3 WHERE id = 1;",
  hints: [
    "使用 UPDATE repair_queue。",
    "SET quantity = 3。",
    "WHERE id = 1。",
    "完整写法：UPDATE repair_queue SET quantity = 3 WHERE id = 1;",
  ],
  locks: ["UPDATE", "WHERE"],
  requiredFeatures: ["update", "where"],
  attackTargetIds: [63],
};

const PRACTICE_THUNDER_DRAKE: LessonStageDefinition = {
  id: "practice-thunder-drake",
  objective: "BEGIN 后把 id = 1 的 quantity 改成 8，再 ROLLBACK。",
  queryTemplate: "",
  answerSql: "BEGIN; UPDATE repair_queue SET quantity = 8 WHERE id = 1; ROLLBACK;",
  hints: [
    "第一条是 BEGIN。",
    "中间 UPDATE id = 1。",
    "最后 ROLLBACK。",
    "完整写法：BEGIN; UPDATE repair_queue SET quantity = 8 WHERE id = 1; ROLLBACK;",
  ],
  locks: ["BEGIN", "UPDATE", "ROLLBACK"],
  requiredFeatures: ["transaction", "update", "rollback"],
  attackTargetIds: [64],
};

const PRACTICE_CRYSTAL_DRAKE: LessonStageDefinition = {
  id: "practice-crystal-drake",
  objective: "用 INSERT OR IGNORE 尝试写入 quantity = -2 的无效 id = 7，保持沙箱不变。",
  queryTemplate: "",
  answerSql: "INSERT OR IGNORE INTO repair_queue(id, item, quantity, status) VALUES (7, 'bad', -2, 'ready');",
  hints: [
    "使用 INSERT OR IGNORE。",
    "目标表是 repair_queue。",
    "无效 quantity 是 -2。",
    "完整写法：INSERT OR IGNORE INTO repair_queue(id, item, quantity, status) VALUES (7, 'bad', -2, 'ready');",
  ],
  locks: ["INSERT", "OR IGNORE"],
  requiredFeatures: ["insert", "constraint"],
  attackTargetIds: [65],
};

const DRAGON_BOSS_SCAN: LessonStageDefinition = {
  id: "dragon-boss-scan",
  objective: "修复 id = 2 后建立 clean 保存点；删除 id = 3，再 ROLLBACK TO clean 并 COMMIT。",
  queryTemplate: "",
  answerSql: "BEGIN; UPDATE repair_queue SET status = 'fixed' WHERE id = 2; SAVEPOINT clean; DELETE FROM repair_queue WHERE id = 3; ROLLBACK TO clean; COMMIT;",
  hints: [
    "先 BEGIN 并修复 id = 2。",
    "建立 SAVEPOINT clean。",
    "删除 id = 3 后 ROLLBACK TO clean。",
    "完整写法：BEGIN; UPDATE repair_queue SET status = 'fixed' WHERE id = 2; SAVEPOINT clean; DELETE FROM repair_queue WHERE id = 3; ROLLBACK TO clean; COMMIT;",
  ],
  locks: ["SAVEPOINT", "ROLLBACK TO", "COMMIT"],
  requiredFeatures: ["savepoint", "rollback", "commit"],
  attackTargetIds: [66],
};

const DRAGON_BOSS_CORE: LessonStageDefinition = {
  id: "dragon-boss-core",
  objective: "BEGIN 后建立 keep 保存点，删除 id = 4，RELEASE keep 并 COMMIT。",
  queryTemplate: "",
  answerSql: "BEGIN; SAVEPOINT keep; DELETE FROM repair_queue WHERE id = 4; RELEASE keep; COMMIT;",
  hints: [
    "先 BEGIN。",
    "建立 SAVEPOINT keep。",
    "删除 id = 4，RELEASE 后 COMMIT。",
    "完整写法：BEGIN; SAVEPOINT keep; DELETE FROM repair_queue WHERE id = 4; RELEASE keep; COMMIT;",
  ],
  locks: ["SAVEPOINT", "RELEASE", "COMMIT"],
  requiredFeatures: ["savepoint", "delete", "commit"],
  attackTargetIds: [66],
};

const PRACTICE_BRANCH: LessonStageDefinition = {
  id: "practice-branch",
  objective: "查询 id = 1 的 code。",
  queryTemplate: "",
  answerSql: "SELECT code FROM index_records WHERE id = 1;",
  hints: [
    "返回 code。",
    "表是 index_records。",
    "用 id = 1 点查。",
    "完整写法：SELECT code FROM index_records WHERE id = 1;",
  ],
  locks: ["WHERE"],
  requiredFeatures: ["where"],
  attackTargetIds: [73],
};

const PRACTICE_ROOT: LessonStageDefinition = {
  id: "practice-root",
  objective: "查询 crystal 区 score >= 88 的 code、score，按 score 降序。",
  queryTemplate: "",
  answerSql: "SELECT code, score FROM index_records WHERE realm = 'crystal' AND score >= 88 ORDER BY score DESC;",
  hints: [
    "返回 code、score。",
    "先过滤 realm = 'crystal'。",
    "再过滤 score >= 88。",
    "按 score DESC。",
    "完整写法：SELECT code, score FROM index_records WHERE realm = 'crystal' AND score >= 88 ORDER BY score DESC;",
  ],
  locks: ["WHERE", "AND", "ORDER BY"],
  requiredFeatures: ["where", "and", "order-by"],
  attackTargetIds: [74],
};

const PRACTICE_CRYSTAL: LessonStageDefinition = {
  id: "practice-crystal",
  objective: "查询 charm 类别的 category、code，按 code 排序，并保持覆盖索引。",
  queryTemplate: "",
  answerSql: "SELECT category, code FROM index_records WHERE category = 'charm' ORDER BY code;",
  hints: [
    "只返回 category、code。",
    "过滤 category = 'charm'。",
    "按 code 排序。",
    "完整写法：SELECT category, code FROM index_records WHERE category = 'charm' ORDER BY code;",
  ],
  locks: ["WHERE", "ORDER BY"],
  requiredFeatures: ["where", "order-by"],
  attackTargetIds: [75],
};

const PRACTICE_VINE: LessonStageDefinition = {
  id: "practice-vine",
  objective: "不用函数，查询 code 从 CRY-101（含）到 CRY-103（不含）的 code。",
  queryTemplate: "",
  answerSql: "SELECT code FROM index_records WHERE code >= 'CRY-101' AND code < 'CRY-103' ORDER BY code;",
  hints: [
    "返回 code。",
    "下界是 CRY-101。",
    "上界是 CRY-103，使用小于。",
    "最后按 code 排序。",
    "完整写法：SELECT code FROM index_records WHERE code >= 'CRY-101' AND code < 'CRY-103' ORDER BY code;",
  ],
  locks: ["WHERE", "AND", "ORDER BY"],
  requiredFeatures: ["where", "and", "order-by"],
  attackTargetIds: [76],
};

const INDEX_BOSS_SCAN: LessonStageDefinition = {
  id: "index-boss-scan",
  objective: "查询 void 区的 code、score，按 score 降序。",
  queryTemplate: "",
  answerSql: "SELECT code, score FROM index_records WHERE realm = 'void' ORDER BY score DESC;",
  hints: [
    "返回 code、score。",
    "过滤 realm = 'void'。",
    "按 score DESC。",
    "完整写法：SELECT code, score FROM index_records WHERE realm = 'void' ORDER BY score DESC;",
  ],
  locks: ["WHERE", "ORDER BY"],
  requiredFeatures: ["where", "order-by"],
  attackTargetIds: [77],
};

const INDEX_BOSS_CORE: LessonStageDefinition = {
  ...INDEX_BOSS_SCAN,
  id: "index-boss-core",
  objective: "核心：查询 code 处于 VOI 前缀范围的 boss code，按 code 排序。",
  answerSql: "SELECT code FROM index_records WHERE category = 'boss' AND code >= 'VOI' AND code < 'VOJ' ORDER BY code;",
  hints: [
    "只返回 code。",
    "先过滤 category = 'boss'。",
    "VOI 前缀可写成 >= 'VOI' 且 < 'VOJ'。",
    "最后按 code 排序。",
    "完整写法：SELECT code FROM index_records WHERE category = 'boss' AND code >= 'VOI' AND code < 'VOJ' ORDER BY code;",
  ],
  locks: ["WHERE", "AND", "ORDER BY"],
  requiredFeatures: ["where", "and", "order-by"],
};

const PRACTICE_DEMON: LessonStageDefinition = {
  id: "practice-demon",
  objective: "查询事务 12 可见且 row_id = 3 的 value。",
  queryTemplate: "",
  answerSql: "SELECT value FROM tx_versions WHERE row_id = 3 AND created_tx <= 12 AND (expired_tx IS NULL OR expired_tx > 12);",
  hints: [
    "返回 value。",
    "锁定 row_id = 3。",
    "created_tx 不晚于 12。",
    "再判断版本未过期。",
    "完整写法：SELECT value FROM tx_versions WHERE row_id = 3 AND created_tx <= 12 AND (expired_tx IS NULL OR expired_tx > 12);",
  ],
  locks: ["WHERE", "AND", "IS NULL"],
  requiredFeatures: ["where", "and", "is-null"],
  attackTargetIds: [85],
};

const PRACTICE_DARK_KNIGHT: LessonStageDefinition = {
  id: "practice-dark-knight",
  objective: "查询 waiter_tx = 'T3' 的 blocker_tx、resource。",
  queryTemplate: "",
  answerSql: "SELECT blocker_tx, resource FROM lock_waits WHERE waiter_tx = 'T3';",
  hints: [
    "返回 blocker_tx、resource。",
    "表是 lock_waits。",
    "过滤 waiter_tx = 'T3'。",
    "完整写法：SELECT blocker_tx, resource FROM lock_waits WHERE waiter_tx = 'T3';",
  ],
  locks: ["WHERE"],
  requiredFeatures: ["where"],
  attackTargetIds: [86],
};

const PRACTICE_LICH: LessonStageDefinition = {
  id: "practice-lich",
  objective: "查询 phenomenon = 'phantom_read' 的 first_count、second_count。",
  queryTemplate: "",
  answerSql: "SELECT first_count, second_count FROM isolation_cases WHERE phenomenon = 'phantom_read';",
  hints: [
    "返回 first_count、second_count。",
    "表是 isolation_cases。",
    "过滤 phantom_read。",
    "完整写法：SELECT first_count, second_count FROM isolation_cases WHERE phenomenon = 'phantom_read';",
  ],
  locks: ["WHERE"],
  requiredFeatures: ["where"],
  attackTargetIds: [87],
};

const PRACTICE_GOLEM: LessonStageDefinition = {
  id: "practice-golem",
  objective: "查询 duplicate_groups = 0 的 model、score，按 score 降序只取一行。",
  queryTemplate: "",
  answerSql: "SELECT model, score FROM schema_choices WHERE duplicate_groups = 0 ORDER BY score DESC LIMIT 1;",
  hints: [
    "返回 model、score。",
    "过滤 duplicate_groups = 0。",
    "按 score DESC。",
    "LIMIT 1。",
    "完整写法：SELECT model, score FROM schema_choices WHERE duplicate_groups = 0 ORDER BY score DESC LIMIT 1;",
  ],
  locks: ["WHERE", "ORDER BY", "LIMIT"],
  requiredFeatures: ["where", "order-by", "limit"],
  attackTargetIds: [88],
};

const THRONE_BOSS_SCAN: LessonStageDefinition = {
  id: "throne-boss-scan",
  objective: "查询 route_ok = 0 的 account_id、shard_id。",
  queryTemplate: "",
  answerSql: "SELECT account_id, shard_id FROM shard_routes WHERE route_ok = 0;",
  hints: [
    "返回 account_id、shard_id。",
    "表是 shard_routes。",
    "过滤 route_ok = 0。",
    "完整写法：SELECT account_id, shard_id FROM shard_routes WHERE route_ok = 0;",
  ],
  locks: ["WHERE"],
  requiredFeatures: ["where"],
  attackTargetIds: [89],
};

const THRONE_BOSS_CORE: LessonStageDefinition = {
  ...THRONE_BOSS_SCAN,
  id: "throne-boss-core",
  objective: "核心：查询参数化且最小权限的 method，按 id。",
  answerSql: "SELECT method FROM security_cases WHERE parameterized = 1 AND least_privilege = 1 ORDER BY id;",
  hints: [
    "只返回 method。",
    "过滤 parameterized = 1。",
    "再过滤 least_privilege = 1。",
    "按 id 排序。",
    "完整写法：SELECT method FROM security_cases WHERE parameterized = 1 AND least_privilege = 1 ORDER BY id;",
  ],
  locks: ["WHERE", "AND", "ORDER BY"],
  requiredFeatures: ["where", "and", "order-by"],
};

export const BIOME_ENCOUNTERS: readonly BiomeEncounterDefinition[] = [
  { monsterId: 6, floor: 1, biome: "drainage", role: "normal", randomEncounter: true, stages: [PRACTICE_SELECT] },
  { monsterId: 7, floor: 1, biome: "slime-pool", role: "normal", randomEncounter: true, stages: [PRACTICE_WHERE] },
  { monsterId: 8, floor: 1, biome: "ember-cellar", role: "normal", randomEncounter: true, stages: [PRACTICE_NULL] },
  { monsterId: 9, floor: 1, biome: "drainage", role: "mini-elite", randomEncounter: false, stages: PRACTICE_MIMIC },
  { monsterId: 15, floor: 2, biome: "lake", role: "normal", randomEncounter: true, stages: [PRACTICE_ORDER] },
  { monsterId: 16, floor: 2, biome: "lake", role: "normal", randomEncounter: true, stages: [PRACTICE_DISTINCT] },
  { monsterId: 17, floor: 2, biome: "swamp", role: "normal", randomEncounter: true, stages: [PRACTICE_INNER_JOIN] },
  { monsterId: 18, floor: 2, biome: "swamp", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_LEFT_JOIN, PRACTICE_LEFT_CORE] },
  { monsterId: 19, floor: 2, biome: "forest", role: "normal", randomEncounter: true, stages: [FOREST_ORDER] },
  { monsterId: 20, floor: 2, biome: "forest", role: "mini-elite", randomEncounter: true, stages: [FOREST_JOIN, FOREST_JOIN_CORE] },
  { monsterId: 21, floor: 2, biome: "lake", role: "area-boss", randomEncounter: false, stages: [LAKE_BOSS_SCAN, LAKE_BOSS_SORT] },
  { monsterId: 22, floor: 2, biome: "swamp", role: "area-boss", randomEncounter: false, stages: [FROG_BOSS_LEFT, FROG_BOSS_DISTINCT] },
  { monsterId: 29, floor: 3, biome: "bone-yard", role: "normal", randomEncounter: true, stages: [PRACTICE_BONE] },
  { monsterId: 30, floor: 3, biome: "grave-mire", role: "normal", randomEncounter: true, stages: [PRACTICE_ZOMBIE] },
  { monsterId: 31, floor: 3, biome: "spirit-crypt", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_SPIRIT, PRACTICE_SPIRIT_CORE] },
  { monsterId: 32, floor: 3, biome: "spirit-crypt", role: "normal", randomEncounter: true, stages: [PRACTICE_WRAITH] },
  { monsterId: 33, floor: 3, biome: "grave-mire", role: "area-boss", randomEncounter: false, stages: [GRAVE_BOSS_SCAN, GRAVE_BOSS_CORE] },
  { monsterId: 40, floor: 4, biome: "fire-forge", role: "normal", randomEncounter: true, stages: [PRACTICE_FIRE] },
  { monsterId: 41, floor: 4, biome: "frost-vault", role: "normal", randomEncounter: true, stages: [PRACTICE_ICE] },
  { monsterId: 42, floor: 4, biome: "storm-core", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_STORM, PRACTICE_STORM_CORE] },
  { monsterId: 43, floor: 4, biome: "storm-core", role: "normal", randomEncounter: true, stages: [PRACTICE_SPARK] },
  { monsterId: 44, floor: 4, biome: "frost-vault", role: "area-boss", randomEncounter: false, stages: [FORGE_BOSS_SCAN, FORGE_BOSS_CORE] },
  { monsterId: 51, floor: 5, biome: "iron-yard", role: "normal", randomEncounter: true, stages: [PRACTICE_GOBLIN] },
  { monsterId: 52, floor: 5, biome: "barracks", role: "normal", randomEncounter: true, stages: [PRACTICE_ORC] },
  { monsterId: 53, floor: 5, biome: "barracks", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_KNIGHT] },
  { monsterId: 54, floor: 5, biome: "black-citadel", role: "normal", randomEncounter: true, stages: [PRACTICE_TROLL] },
  { monsterId: 55, floor: 5, biome: "barracks", role: "area-boss", randomEncounter: false, stages: [IRON_BOSS_SCAN, IRON_BOSS_CORE] },
  { monsterId: 62, floor: 6, biome: "magma-nest", role: "normal", randomEncounter: true, stages: [PRACTICE_HATCHLING] },
  { monsterId: 63, floor: 6, biome: "dragon-throne", role: "normal", randomEncounter: true, stages: [PRACTICE_WYVERN] },
  { monsterId: 64, floor: 6, biome: "dragon-throne", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_THUNDER_DRAKE] },
  { monsterId: 65, floor: 6, biome: "crystal-cavern", role: "normal", randomEncounter: true, stages: [PRACTICE_CRYSTAL_DRAKE] },
  { monsterId: 66, floor: 6, biome: "crystal-cavern", role: "area-boss", randomEncounter: false, stages: [DRAGON_BOSS_SCAN, DRAGON_BOSS_CORE] },
  { monsterId: 73, floor: 7, biome: "crystal-grove", role: "normal", randomEncounter: true, stages: [PRACTICE_BRANCH] },
  { monsterId: 74, floor: 7, biome: "root-maze", role: "normal", randomEncounter: true, stages: [PRACTICE_ROOT] },
  { monsterId: 75, floor: 7, biome: "crystal-grove", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_CRYSTAL] },
  { monsterId: 76, floor: 7, biome: "index-heart", role: "normal", randomEncounter: true, stages: [PRACTICE_VINE] },
  { monsterId: 77, floor: 7, biome: "root-maze", role: "area-boss", randomEncounter: false, stages: [INDEX_BOSS_SCAN, INDEX_BOSS_CORE] },
  { monsterId: 85, floor: 8, biome: "obsidian-hall", role: "normal", randomEncounter: true, stages: [PRACTICE_DEMON] },
  { monsterId: 86, floor: 8, biome: "void-court", role: "normal", randomEncounter: true, stages: [PRACTICE_DARK_KNIGHT] },
  { monsterId: 87, floor: 8, biome: "void-court", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_LICH] },
  { monsterId: 88, floor: 8, biome: "data-throne", role: "normal", randomEncounter: true, stages: [PRACTICE_GOLEM] },
  { monsterId: 89, floor: 8, biome: "void-court", role: "area-boss", randomEncounter: false, stages: [THRONE_BOSS_SCAN, THRONE_BOSS_CORE] },
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
        ...FLOOR_FIVE_BIOME_MONSTERS,
        ...FLOOR_SIX_BIOME_MONSTERS,
        ...FLOOR_SEVEN_BIOME_MONSTERS,
        ...FLOOR_EIGHT_BIOME_MONSTERS,
      ]
        .find((monster) => monster.id === encounter.monsterId)?.lessonId ?? "select",
    )
  ));
  const normal = available.filter((encounter) => encounter.role === "normal");
  const elites = available.filter((encounter) => encounter.role === "mini-elite");
  if (normal.length === 0) return [];
  const eliteShare = MINI_ELITE_PERCENT_BY_FLOOR[floor];
  const normalCopies = Math.max(1, Math.floor((100 - eliteShare) / normal.length));
  const eliteCopies = elites.length === 0 ? 0 : Math.max(1, Math.floor(eliteShare / elites.length));
  return [
    ...normal.flatMap((encounter) => Array(normalCopies).fill(encounter.monsterId) as number[]),
    ...elites.flatMap((encounter) => Array(eliteCopies).fill(encounter.monsterId) as number[]),
  ];
}
