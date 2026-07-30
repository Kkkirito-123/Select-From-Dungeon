import type {
  LessonDefinition,
  LessonId,
  LessonStageDefinition,
  Monster,
  Position,
  Weapon,
} from "../domain/types";
import {
  FLOOR_TWO_LESSONS,
  FLOOR_TWO_LOOT_AFTER_LESSON,
  FLOOR_TWO_MONSTERS,
} from "./floor2Level";
import {
  FLOOR_THREE_LESSON_DEFINITIONS,
  FLOOR_THREE_MONSTERS,
} from "./floor3Level";
import {
  FLOOR_FOUR_LESSON_DEFINITIONS,
  FLOOR_FOUR_MONSTERS,
} from "./floor4Level";
import {
  FLOOR_FIVE_LESSON_DEFINITIONS,
  FLOOR_FIVE_MONSTERS,
} from "./floor5Level";
import {
  FLOOR_SIX_LESSON_DEFINITIONS,
  FLOOR_SIX_MONSTERS,
} from "./floor6Level";
import {
  FLOOR_SEVEN_LESSON_DEFINITIONS,
  FLOOR_SEVEN_MONSTERS,
} from "./floor7Level";
import {
  FLOOR_EIGHT_LESSON_DEFINITIONS,
  FLOOR_EIGHT_MONSTERS,
} from "./floor8Level";
import {
  BIOME_PRACTICE_STAGES,
  FLOOR_ONE_BIOME_MONSTERS,
  FLOOR_THREE_BIOME_MONSTERS,
  FLOOR_FOUR_BIOME_MONSTERS,
  FLOOR_FIVE_BIOME_MONSTERS,
  FLOOR_SIX_BIOME_MONSTERS,
  FLOOR_SEVEN_BIOME_MONSTERS,
  FLOOR_EIGHT_BIOME_MONSTERS,
  practiceStagesFor,
} from "./biomeContent";
import { sqlSchemaLine } from "./sqlSchema";

export const TILE_SIZE = 32;
export const MAP_ROWS = [
  "####################",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "####################",
] as const;

export const PLAYER_START = { x: 10, y: 10 } as const;

export const DATA_BLADE: Weapon = {
  id: "data-blade",
  name: "数据之刃",
  damage: 6,
  heatReduction: 0,
  description: "基础查询武器。每次正确读取造成 6 点伤害。",
};

export const FILTER_BOW: Weapon = {
  id: "filter-bow",
  name: "过滤弓",
  damage: 7,
  heatReduction: 1,
  description: "WHERE 条件命中时造成 7 点伤害，并减少 1 点查询热量。",
};

export const NULL_LANTERN: Weapon = {
  id: "null-lantern",
  name: "空值提灯",
  damage: 8,
  heatReduction: 1,
  description: "照出未知值的轮廓。正确处理 NULL 时稳定破甲。",
};

export const AGGREGATE_HAMMER: Weapon = {
  id: "aggregate-hammer",
  name: "聚合战锤",
  damage: 12,
  heatReduction: 2,
  description: "为 GROUP BY 与 HAVING 打造，对聚合守卫造成 12 点伤害。",
};

export const INITIAL_MONSTERS: readonly Monster[] = [
  {
    floor: 1,
    id: 1,
    lessonId: "select",
    roomId: 1,
    name: "史莱姆",
    species: "projection_slime",
    kind: "projection-slime",
    x: 10,
    y: 5,
    hp: 12,
    maxHp: 12,
    armor: 0,
    damage: 1,
    attackName: "字段喷溅",
    status: "idle",
    weakness: "slash",
    masterId: 5,
    isBoss: false,
    rank: "normal",
    encounterType: "curriculum",
  },
  {
    floor: 1,
    id: 2,
    lessonId: "where",
    roomId: 2,
    name: "水史莱姆",
    species: "water_slime_guard",
    kind: "projection-slime",
    x: 10,
    y: 5,
    hp: 14,
    maxHp: 14,
    armor: 0,
    damage: 1,
    attackName: "多余行水泡",
    status: "escaped",
    weakness: "focus",
    masterId: 5,
    isBoss: false,
    rank: "normal",
    encounterType: "curriculum",
  },
  {
    floor: 1,
    id: 3,
    lessonId: "is-null",
    roomId: 3,
    name: "毒史莱姆",
    species: "poison_slime_guard",
    kind: "projection-slime",
    x: 10,
    y: 5,
    hp: 14,
    maxHp: 14,
    armor: 0,
    damage: 1,
    attackName: "空值毒液",
    status: "cursed",
    weakness: "light",
    masterId: null,
    isBoss: false,
    rank: "normal",
    encounterType: "curriculum",
  },
  {
    floor: 1,
    id: 4,
    lessonId: "group-by",
    roomId: 4,
    name: "铁史莱姆",
    species: "iron_slime_guard",
    kind: "projection-slime",
    x: 10,
    y: 5,
    hp: 12,
    maxHp: 12,
    armor: 0,
    damage: 1,
    attackName: "铁壳震荡",
    status: "anchored",
    weakness: "aggregate",
    masterId: 5,
    isBoss: false,
    rank: "elite",
    encounterType: "curriculum",
  },
  {
    floor: 1,
    id: 5,
    lessonId: "having",
    roomId: 5,
    name: "登记官",
    species: "registry_keeper",
    kind: "projection-slime",
    x: 10,
    y: 5,
    hp: 24,
    maxHp: 24,
    armor: 0,
    damage: 1,
    attackName: "档案封存",
    status: "registering",
    weakness: "having",
    masterId: null,
    isBoss: true,
    rank: "boss",
    encounterType: "curriculum",
  },
  ...FLOOR_ONE_BIOME_MONSTERS,
  ...FLOOR_TWO_MONSTERS,
  ...FLOOR_THREE_MONSTERS,
  ...FLOOR_THREE_BIOME_MONSTERS,
  ...FLOOR_FOUR_MONSTERS,
  ...FLOOR_FOUR_BIOME_MONSTERS,
  ...FLOOR_FIVE_MONSTERS,
  ...FLOOR_FIVE_BIOME_MONSTERS,
  ...FLOOR_SIX_MONSTERS,
  ...FLOOR_SIX_BIOME_MONSTERS,
  ...FLOOR_SEVEN_MONSTERS,
  ...FLOOR_SEVEN_BIOME_MONSTERS,
  ...FLOOR_EIGHT_MONSTERS,
  ...FLOOR_EIGHT_BIOME_MONSTERS,
] as const;

export const PRACTICE_STAGES: Readonly<Record<number, LessonStageDefinition>> = {
  ...Object.fromEntries(
    Object.entries(BIOME_PRACTICE_STAGES).map(([id, stages]) => [id, stages[0]]),
  ),
};

export function practiceStageFor(monsterId: number): LessonStageDefinition | null {
  return PRACTICE_STAGES[monsterId] ?? null;
}

export { practiceStagesFor };

const MONSTER_SCHEMA = [
  sqlSchemaLine("monsters"),
  "每条记录都是魔王城里真实存在的怪物。",
];

export const LESSONS: readonly LessonDefinition[] = [
  {
    id: "select",
    concept: "SELECT / FROM",
    title: "青页回廊 · 读取怪物档案",
    intro: "ID #001 把弱点与真名藏进怪物档案。完整写出 SELECT 与 FROM，先找到突破口，再确认它是谁。",
    schema: MONSTER_SCHEMA,
    primaryMonsterId: 1,
    stages: [
      {
        id: "select-weakness",
        objective: "第一击：查询 id = 1 的 weakness，找到突破口。",
        queryTemplate: "",
        answerSql: "SELECT weakness FROM monsters WHERE id = 1;",
        hints: [
          "SELECT 后写想看到的列，FROM 后写数据表。",
          "目标列是 weakness，目标表是 monsters。",
          "使用 WHERE id = 1 只保留 ID #001。",
          "完整写法：SELECT weakness FROM monsters WHERE id = 1;",
        ],
        locks: ["SELECT", "FROM"],
        requiredFeatures: ["select", "from"],
        attackTargetIds: [1],
      },
      {
        id: "select-name",
        objective: "第二击：查询 id = 1 的 id 与 status，确认目标仍在档案中。",
        queryTemplate: "",
        answerSql: "SELECT id, status FROM monsters WHERE id = 1;",
        hints: [
          "这次仍从 monsters 读取，但同时查看两个字段。",
          "SELECT 后依次写 id, status。",
          "WHERE 仍然锁定 id = 1。",
          "完整写法：SELECT id, status FROM monsters WHERE id = 1;",
        ],
        locks: ["SELECT", "FROM"],
        requiredFeatures: ["select", "from"],
        attackTargetIds: [1],
      },
    ],
  },
  {
    id: "where",
    concept: "WHERE / AND",
    title: "软泥水池 · 精确过滤",
    intro: "ID #002 混在排水记录中。房间与状态都与目标有关，任何多余行都会引来水泡反击。",
    schema: MONSTER_SCHEMA,
    primaryMonsterId: 2,
    stages: [
      {
        id: "where-target",
        objective: "第一击：返回 room_id = 2 且 status = 'escaped' 的怪物 id。",
        queryTemplate: "",
        answerSql: "SELECT id FROM monsters WHERE room_id = 2 AND status = 'escaped';",
        hints: [
          "返回列：id。",
          "数据表：monsters。",
          "过滤字段：room_id 与 status，用 AND 连接。",
          "精确值：room_id = 2，status = 'escaped'。",
          "完整写法：SELECT id FROM monsters WHERE room_id = 2 AND status = 'escaped';",
        ],
        locks: ["WHERE", "AND"],
        requiredFeatures: ["where", "and"],
        attackTargetIds: [2],
      },
      {
        id: "where-weakness",
        objective: "第二击：按 id = 2 与 status = 'escaped' 返回 weakness。",
        queryTemplate: "",
        answerSql: "SELECT weakness FROM monsters WHERE id = 2 AND status = 'escaped';",
        hints: [
          "返回列：weakness。",
          "数据表：monsters。",
          "过滤字段：id 与 status，用 AND 连接。",
          "精确值：id = 2，status = 'escaped'。",
          "完整写法：SELECT weakness FROM monsters WHERE id = 2 AND status = 'escaped';",
        ],
        locks: ["WHERE", "AND"],
        requiredFeatures: ["where", "and"],
        attackTargetIds: [2],
      },
    ],
  },
  {
    id: "is-null",
    concept: "IS NULL",
    title: "毒泥仓窖 · 判断未知",
    intro: "仓窖里只有 ID #003 没有主人。NULL 不是普通值，等号无法照出它。",
    schema: MONSTER_SCHEMA,
    primaryMonsterId: 3,
    stages: [
      {
        id: "null-target",
        objective: "第一击：返回 room_id = 3 且 master_id 为空的怪物 id。",
        queryTemplate: "",
        answerSql: "SELECT id FROM monsters WHERE room_id = 3 AND master_id IS NULL;",
        hints: [
          "NULL 表示未知，不能写 = NULL。",
          "判断空值使用 IS NULL。",
          "同时保留 room_id = 3，两个条件用 AND。",
          "完整写法：SELECT id FROM monsters WHERE room_id = 3 AND master_id IS NULL;",
        ],
        locks: ["WHERE", "IS NULL"],
        requiredFeatures: ["where", "is-null"],
        attackTargetIds: [3],
      },
      {
        id: "null-name",
        objective: "第二击：找出 master_id 为空且 status = 'cursed' 的怪物 id。",
        queryTemplate: "",
        answerSql: "SELECT id FROM monsters WHERE master_id IS NULL AND status = 'cursed';",
        hints: [
          "这次仍返回 id，但不能直接用 id 作为过滤条件。",
          "master_id 仍使用 IS NULL。",
          "再用 AND 增加 status = 'cursed'。",
          "完整写法：SELECT id FROM monsters WHERE master_id IS NULL AND status = 'cursed';",
        ],
        locks: ["WHERE", "IS NULL"],
        requiredFeatures: ["where", "is-null"],
        attackTargetIds: [3],
      },
    ],
  },
  {
    id: "group-by",
    concept: "COUNT / GROUP BY",
    title: "回执归档厅 · 统计信号",
    intro: "ID #004 把恢复回执拆成 echo 与 noise。按 channel 分组统计，聚合战锤才能找到对应档案架。",
    schema: [
      sqlSchemaLine("monster_signals"),
      "ID #004 的信号分为 echo 与 noise。",
    ],
    primaryMonsterId: 4,
    stages: [
      {
        id: "group-signals",
        objective: "从 monster_signals 按 channel 分组统计 monster_id = 4 的信号数，数量别名为 total。",
        queryTemplate: "",
        answerSql: "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 4 GROUP BY channel;",
        hints: [
          "COUNT(*) 统计每组行数，GROUP BY 决定分组列。",
          "读取 channel 和 COUNT(*) AS total。",
          "WHERE 先锁定 monster_id = 4，再 GROUP BY channel。",
          "完整写法：SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 4 GROUP BY channel;",
        ],
        locks: ["COUNT", "GROUP BY"],
        requiredFeatures: ["count", "group-by"],
        attackTargetIds: [4],
      },
    ],
  },
  {
    id: "having",
    concept: "HAVING",
    title: "回燃登记厅 · 过滤分组",
    intro: "ID #005 的信号分成 echo、ward 与 noise。HAVING 只在分组形成之后过滤它们。",
    schema: [
      sqlSchemaLine("monster_signals"),
      "ID #005；HAVING 在 GROUP BY 之后过滤聚合结果。",
    ],
    primaryMonsterId: 5,
    stages: [
      {
        id: "having-shield",
        objective: "第一阶段：只保留信号数不少于 2 的 channel，数量别名为 total。",
        queryTemplate: "",
        answerSql: "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 2;",
        hints: [
          "WHERE 过滤原始行，HAVING 过滤已经形成的组。",
          "先按 channel 分组，再判断 COUNT(*)。",
          "护盾阈值是 COUNT(*) >= 2。",
          "完整写法：SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 2;",
        ],
        locks: ["GROUP BY", "HAVING"],
        requiredFeatures: ["group-by", "having"],
        attackTargetIds: [5],
      },
      {
        id: "having-core",
        objective: "核心阶段：把阈值提高到至少 3，只留下最强的 echo 组。",
        queryTemplate: "",
        answerSql: "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 3;",
        hints: [
          "保持相同分组，把 HAVING 阈值提高。",
          "需要只返回 total = 3 的 echo 组。",
          "核心条件是 COUNT(*) >= 3。",
          "完整写法：SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 3;",
        ],
        locks: ["GROUP BY", "HAVING"],
        requiredFeatures: ["group-by", "having"],
        attackTargetIds: [5],
      },
    ],
  },
  ...FLOOR_TWO_LESSONS,
  ...FLOOR_THREE_LESSON_DEFINITIONS,
  ...FLOOR_FOUR_LESSON_DEFINITIONS,
  ...FLOOR_FIVE_LESSON_DEFINITIONS,
  ...FLOOR_SIX_LESSON_DEFINITIONS,
  ...FLOOR_SEVEN_LESSON_DEFINITIONS,
  ...FLOOR_EIGHT_LESSON_DEFINITIONS,
] as const;

export const LOOT_AFTER_LESSON: Partial<Record<LessonId, { weapon: Weapon; position: Position }>> = {
  select: { weapon: FILTER_BOW, position: { x: 10, y: 5 } },
  "is-null": { weapon: NULL_LANTERN, position: { x: 10, y: 5 } },
  ...FLOOR_TWO_LOOT_AFTER_LESSON,
};

export function lessonById(id: LessonId): LessonDefinition {
  const lesson = LESSONS.find((entry) => entry.id === id);
  if (!lesson) throw new Error(`未知课程：${id}`);
  return lesson;
}
