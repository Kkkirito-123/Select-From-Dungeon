import type { LessonStageDefinition, Monster } from "../../../../domain/shared/types";
import {
  biomeMonster,
  type BiomeEncounterDefinition,
} from "../shared/biome";

/** 第七层生态遭遇池：题目同时记录 EXPLAIN 计划要求和目标索引特征。 */
export const FLOOR_SEVEN_BIOME_MONSTERS: readonly Monster[] = [
  biomeMonster({
    floor: 7, id: 73, lessonId: "f7-btree", roomId: 87, name: "枝妖",
    species: "branch_imp", kind: "index-guard", hp: 22, maxHp: 22, armor: 0,
    damage: 4, attackName: "枝刺", status: "guarding", weakness: "search",
    masterId: 77, isBoss: false, rank: "normal",
  }),
  biomeMonster({
    floor: 7, id: 74, lessonId: "f7-composite", roomId: 88, name: "藤兽",
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
  objective: "第一击：把 void 区查询改写为复合索引前缀 realm = 'void'，返回 code、score 并按 score 降序；真实计划必须命中 idx_index_records_realm_score。",
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
  objective: "第二击：用 category + code 的复合索引前缀范围查询 boss 的 VOI code；真实计划必须使用 SEARCH。",
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

export const FLOOR_BIOME_ENCOUNTERS = [
  { monsterId: 73, floor: 7, biome: "crystal-grove", role: "normal", randomEncounter: true, stages: [PRACTICE_BRANCH] },
  { monsterId: 74, floor: 7, biome: "root-maze", role: "normal", randomEncounter: true, stages: [PRACTICE_ROOT] },
  { monsterId: 75, floor: 7, biome: "crystal-grove", role: "mini-elite", randomEncounter: true, stages: [PRACTICE_CRYSTAL] },
  { monsterId: 76, floor: 7, biome: "index-heart", role: "normal", randomEncounter: true, stages: [PRACTICE_VINE] },
  { monsterId: 77, floor: 7, biome: "root-maze", role: "area-boss", randomEncounter: false, stages: [INDEX_BOSS_SCAN, INDEX_BOSS_CORE] },
] as const satisfies readonly BiomeEncounterDefinition[];
