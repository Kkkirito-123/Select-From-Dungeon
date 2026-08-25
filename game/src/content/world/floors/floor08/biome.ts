import type { LessonStageDefinition, Monster } from "../../../../domain/shared/types";
import {
  biomeMonster,
  type BiomeEncounterDefinition,
} from "../shared/biome";

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
  objective: "区域首领第一击：查询 waiter_tx = 'T3' 的 waiter_tx、blocker_tx、resource，定位锁等待链。",
  queryTemplate: "",
  answerSql: "SELECT waiter_tx, blocker_tx, resource FROM lock_waits WHERE waiter_tx = 'T3';",
  hints: [
    "返回 waiter_tx、blocker_tx、resource。",
    "表是 lock_waits。",
    "过滤 waiter_tx = 'T3'。",
    "完整写法：SELECT waiter_tx, blocker_tx, resource FROM lock_waits WHERE waiter_tx = 'T3';",
  ],
  locks: ["WHERE"],
  requiredFeatures: ["where"],
  attackTargetIds: [89],
};

const THRONE_BOSS_CORE: LessonStageDefinition = {
  ...THRONE_BOSS_SCAN,
  id: "throne-boss-core",
  objective: "区域首领第二击：查询 second_count > first_count 的隔离异常，返回 phenomenon、first_count、second_count、prevented_by。",
  answerSql: "SELECT phenomenon, first_count, second_count, prevented_by FROM isolation_cases WHERE second_count > first_count ORDER BY id;",
  hints: [
    "返回 phenomenon、first_count、second_count、prevented_by。",
    "表是 isolation_cases。",
    "过滤 second_count > first_count。",
    "最后按 id 排序。",
    "完整写法：SELECT phenomenon, first_count, second_count, prevented_by FROM isolation_cases WHERE second_count > first_count ORDER BY id;",
  ],
  locks: ["WHERE", "ORDER BY"],
  requiredFeatures: ["where", "order-by"],
};

export const FLOOR_BIOME_ENCOUNTERS = [
  { monsterId: 85, floor: 8, biome: "obsidian-hall", role: "normal", randomEncounter: true, stages: [PRACTICE_DEMON] },
  { monsterId: 86, floor: 8, biome: "void-court", role: "normal", randomEncounter: true, stages: [PRACTICE_DARK_KNIGHT] },
  { monsterId: 87, floor: 8, biome: "void-court", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_LICH] },
  { monsterId: 88, floor: 8, biome: "data-throne", role: "normal", randomEncounter: true, stages: [PRACTICE_GOLEM] },
  { monsterId: 89, floor: 8, biome: "void-court", role: "area-boss", randomEncounter: false, stages: [THRONE_BOSS_SCAN, THRONE_BOSS_CORE] },
] as const satisfies readonly BiomeEncounterDefinition[];
