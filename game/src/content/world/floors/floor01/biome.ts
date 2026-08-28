import type { LessonStageDefinition, Monster } from "../../../../domain/shared/types";
import {
  biomeMonster,
  type BiomeEncounterDefinition,
} from "../shared/biome";

/** 第一层生态遭遇池：水渠、软泥池和余烬地窖对应基础 SQL 阶段。 */
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

const PRACTICE_MIMIC: readonly LessonStageDefinition[] = [
  PRACTICE_SELECT,
  PRACTICE_NULL,
];

export const FLOOR_BIOME_ENCOUNTERS = [
  { monsterId: 6, floor: 1, biome: "drainage", role: "normal", randomEncounter: true, stages: [PRACTICE_SELECT] },
  { monsterId: 7, floor: 1, biome: "slime-pool", role: "normal", randomEncounter: true, stages: [PRACTICE_WHERE] },
  { monsterId: 8, floor: 1, biome: "ember-cellar", role: "normal", randomEncounter: true, stages: [PRACTICE_NULL] },
  { monsterId: 9, floor: 1, biome: "drainage", role: "mini-elite", randomEncounter: false, stages: PRACTICE_MIMIC },
] as const satisfies readonly BiomeEncounterDefinition[];
