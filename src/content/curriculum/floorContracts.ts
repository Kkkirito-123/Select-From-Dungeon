/**
 * 八层课程运行契约的静态定义。
 *
 * 契约约束楼层的课程顺序、遭遇角色、运行时边界和奖励规则；它不是
 * 玩家运行状态，也不产生持久化副作用。domain 读取这里的定义来校验
 * 内容完整性，UI 只消费已经转换好的快照数据。
 */
import type { RunLessonId } from "../../domain/progression/runGraph";

export const CAMPAIGN_FLOORS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type CampaignFloorNumber = (typeof CAMPAIGN_FLOORS)[number];
export type ExerciseTier = 1 | 2 | 3;
export type EncounterRole =
  | "normal"
  | "mini-elite"
  | "area-boss"
  | "fixed-elite"
  | "floor-boss";
export type RuntimeBoundary =
  | "sqlite-readonly"
  | "sqlite-sandbox"
  | "sqlite-plan"
  | "scenario-simulation";
export type TopologyStrategy =
  | "looped-keep"
  | "aggregate-hub"
  | "relational-islands"
  | "nested-chambers"
  | "partition-rings"
  | "rollback-factory"
  | "rollback-nest"
  | "btree-branches"
  | "throne-ascent";

export interface FloorLessonContract {
  id: RunLessonId;
  label: string;
  concepts: readonly string[];
  prerequisites: readonly RunLessonId[];
  tier: ExerciseTier;
  minimumCorrectAnswers: number;
  deterministicRewardId: string;
}

export interface EncounterContract {
  role: EncounterRole;
  name: string;
  lessonIds: readonly RunLessonId[];
  minimumCorrectAnswers: number;
  xp: 1 | 3 | 5;
  required: boolean;
}

export interface FloorThemeContract {
  topology: TopologyStrategy;
  worldElement: string;
  material: string;
  landmark: string;
  bossArena: string;
  palette: readonly string[];
}

export interface FloorContentContract {
  floor: CampaignFloorNumber;
  id: `floor-${CampaignFloorNumber}`;
  name: string;
  learningGoal: string;
  runtime: RuntimeBoundary;
  runtimeNotice: string;
  lessons: readonly FloorLessonContract[];
  encounters: readonly EncounterContract[];
  monsterPool: readonly string[];
  equipmentPool: readonly string[];
  lootPool: readonly string[];
  completionRewardId: string;
  nextFloorKeyId: string | null;
  theme: FloorThemeContract;
}

export interface FloorContractValidation {
  valid: boolean;
  errors: string[];
}

function defineLesson(
  id: RunLessonId,
  label: string,
  concepts: readonly string[],
  prerequisites: readonly RunLessonId[],
  tier: ExerciseTier,
  minimumCorrectAnswers = tier,
): FloorLessonContract {
  return {
    id,
    label,
    concepts,
    prerequisites,
    tier,
    minimumCorrectAnswers,
    deterministicRewardId: `course-reward:${id}`,
  };
}

function encounterSet(
  names: readonly [string, string, string | null, string, string],
  lessonIds: readonly RunLessonId[],
  floor: CampaignFloorNumber,
): readonly EncounterContract[] {
  const finalLessons = lessonIds.slice(-Math.min(3, lessonIds.length));
  const encounters: EncounterContract[] = [
    {
      role: "normal",
      name: names[0],
      lessonIds: lessonIds.slice(0, 2),
      minimumCorrectAnswers: 1,
      xp: 1,
      required: false,
    },
    {
      role: "mini-elite",
      name: names[1],
      lessonIds: lessonIds.slice(0, 2),
      minimumCorrectAnswers: 2,
      xp: 3,
      required: false,
    },
    {
      role: "fixed-elite",
      name: names[3],
      lessonIds: lessonIds.slice(-2),
      minimumCorrectAnswers: 2,
      xp: 3,
      required: true,
    },
    {
      role: "floor-boss",
      name: names[4],
      lessonIds: finalLessons,
      minimumCorrectAnswers: floor === 8 ? 5 : lessonIds.length >= 6 ? 4 : 3,
      xp: 5,
      required: true,
    },
  ];
  if (names[2] !== null) {
    encounters.splice(2, 0, {
      role: "area-boss",
      name: names[2],
      lessonIds: lessonIds.slice(1, 3),
      minimumCorrectAnswers: 2,
      xp: 3,
      required: false,
    });
  }
  return encounters;
}

function floorContract(
  input: Omit<FloorContentContract, "encounters"> & {
    encounterNames: readonly [string, string, string | null, string, string];
  },
): FloorContentContract {
  const { encounterNames, ...contract } = input;
  return {
    ...contract,
    encounters: encounterSet(
      encounterNames,
      contract.lessons.map((lesson) => lesson.id),
      contract.floor,
    ),
  };
}

const FLOOR_ONE_LESSONS = [
  defineLesson("select", "读取字段", ["SELECT", "FROM", "AS"], [], 1),
  defineLesson("where", "条件过滤", ["WHERE", "AND"], ["select"], 1),
  defineLesson("is-null", "空值判断", ["IS NULL"], ["select"], 1),
  defineLesson("group-by", "分组统计", ["COUNT", "GROUP BY"], ["where", "is-null"], 2),
  defineLesson("having", "过滤分组", ["GROUP BY", "HAVING"], ["group-by"], 3),
] as const;

const FLOOR_TWO_LESSONS = [
  defineLesson("order-by", "稳定排序", ["ORDER BY", "LIMIT"], ["having"], 1),
  defineLesson("distinct", "去除重复显示", ["DISTINCT", "ORDER BY"], ["order-by"], 1),
  defineLesson("inner-join", "匹配两表", ["INNER JOIN", "ON", "alias"], ["distinct"], 2),
  defineLesson("left-join", "保留左表", ["LEFT JOIN", "IS NULL"], ["inner-join"], 2),
  defineLesson("join-boss", "关系综合查询", ["JOIN", "GROUP BY", "HAVING", "ORDER BY"], ["left-join"], 3),
] as const;

const FLOOR_THREE_LESSONS = [
  defineLesson("f3-inner", "内连接", ["INNER JOIN", "ON"], ["join-boss"], 1),
  defineLesson("f3-left", "左连接", ["LEFT JOIN", "IS NULL"], ["f3-inner"], 2),
  defineLesson("f3-self", "自连接", ["SELF JOIN", "alias"], ["f3-inner"], 2),
  defineLesson("f3-chain", "多表连接", ["JOIN chain", "cardinality"], ["f3-left"], 2),
  defineLesson("f3-union", "集合合并", ["UNION", "UNION ALL"], ["f3-self"], 2),
  defineLesson(
    "f3-audit",
    "连接审计",
    ["JOIN", "COUNT", "GROUP BY", "HAVING"],
    ["f3-chain", "f3-union"],
    3,
  ),
] as const;

const FLOOR_FOUR_LESSONS = [
  defineLesson("f4-scalar", "标量子查询", ["scalar subquery"], ["f3-audit"], 1),
  defineLesson("f4-in", "集合子查询", ["IN", "NOT IN", "NULL"], ["f4-scalar"], 2),
  defineLesson("f4-exists", "存在性", ["EXISTS", "NOT EXISTS"], ["f4-in"], 2),
  defineLesson("f4-correlated", "相关子查询", ["correlated subquery"], ["f4-exists"], 2),
  defineLesson("f4-cte", "公共表表达式", ["WITH", "CTE"], ["f4-correlated"], 2),
  defineLesson(
    "f4-recursive",
    "递归表达式",
    ["WITH RECURSIVE"],
    ["f4-cte"],
    3,
  ),
] as const;

const FLOOR_FIVE_LESSONS = [
  defineLesson("f5-over", "窗口分区", ["OVER", "PARTITION BY"], ["f4-recursive"], 1),
  defineLesson("f5-row-number", "行号", ["ROW_NUMBER"], ["f5-over"], 1),
  defineLesson("f5-rank", "并列排名", ["RANK", "DENSE_RANK"], ["f5-row-number"], 2),
  defineLesson("f5-lag-lead", "前后行", ["LAG", "LEAD"], ["f5-rank"], 2),
  defineLesson("f5-frame", "窗口范围", ["window frame", "running total"], ["f5-lag-lead"], 2),
  defineLesson("f5-top-n", "分组前 N", ["CTE", "ROW_NUMBER"], ["f5-frame"], 3),
] as const;

const FLOOR_SIX_LESSONS = [
  defineLesson("f6-insert", "安全写入", ["INSERT"], ["f5-top-n"], 1),
  defineLesson("f6-update", "定向更新", ["UPDATE", "WHERE"], ["f6-insert"], 1),
  defineLesson("f6-delete", "定向删除", ["DELETE", "WHERE"], ["f6-update"], 2),
  defineLesson("f6-constraint", "约束", ["PRIMARY KEY", "UNIQUE", "CHECK"], ["f6-delete"], 2),
  defineLesson("f6-transaction", "事务", ["BEGIN", "COMMIT", "ROLLBACK"], ["f6-constraint"], 2),
  defineLesson("f6-savepoint", "保存点", ["SAVEPOINT", "ROLLBACK TO"], ["f6-transaction"], 3),
] as const;

const FLOOR_SEVEN_LESSONS = [
  defineLesson("f7-btree", "索引结构", ["B+ tree", "range scan"], ["f6-savepoint"], 1),
  defineLesson("f7-composite", "联合索引", ["composite index", "leftmost prefix"], ["f7-btree"], 2),
  defineLesson("f7-covering", "覆盖索引", ["covering index", "table lookup"], ["f7-composite"], 2),
  defineLesson("f7-invalid", "索引失效", ["function", "conversion", "wildcard"], ["f7-covering"], 2),
  defineLesson("f7-plan", "执行计划", ["EXPLAIN QUERY PLAN"], ["f7-invalid"], 2),
  defineLesson("f7-optimize", "查询优化", ["rewrite", "index tradeoff"], ["f7-plan"], 3),
] as const;

const FLOOR_EIGHT_LESSONS = [
  defineLesson("f8-mvcc", "版本可见性", ["MVCC", "snapshot"], ["f7-optimize"], 1),
  defineLesson("f8-lock", "锁与死锁", ["row lock", "deadlock", "wait graph"], ["f8-mvcc"], 2),
  defineLesson("f8-isolation", "隔离异常", ["dirty read", "non-repeatable read", "phantom"], ["f8-lock"], 2),
  defineLesson("f8-modeling", "数据建模", ["normalization", "primary key"], ["f8-isolation"], 2),
  defineLesson("f8-replication", "复制取舍", ["replication lag", "failover"], ["f8-modeling"], 2),
  defineLesson("f8-sharding", "分片取舍", ["shard key", "routing"], ["f8-replication"], 2),
  defineLesson("f8-security", "查询安全", ["parameterization", "least privilege"], ["f8-sharding"], 3),
] as const;

export const FLOOR_CONTRACTS: readonly FloorContentContract[] = [
  floorContract({
    floor: 1,
    id: "floor-1",
    name: "地下余烬档案",
    learningGoal: "从读取、过滤和空值判断出发，完成分组与分组过滤。",
    runtime: "sqlite-readonly",
    runtimeNotice: "题目在浏览器内真实执行只读 SQLite 查询。",
    lessons: FLOOR_ONE_LESSONS,
    encounterNames: ["小水怪", "灰史莱姆", null, "宝箱怪", "登记官"],
    monsterPool: ["史莱姆", "水史莱姆", "毒史莱姆", "铁史莱姆", "登记官", "小水怪", "小史莱姆", "灰史莱姆", "宝箱怪"],
    equipmentPool: ["short-blade", "slime-vest"],
    lootPool: ["slime-gel", "red-potion", "short-blade", "slime-vest"],
    completionRewardId: "course-proof:floor-1",
    nextFloorKeyId: "floor-key:2",
    theme: {
      topology: "looped-keep",
      worldElement: "余烬、退水与无名床牌",
      material: "潮湿青石、旧铁与封存纸页",
      landmark: "档案水轮",
      bossArena: "回燃登记厅",
      palette: ["#111820", "#2c3744", "#d59b45", "#79d3c4"],
    },
  }),
  floorContract({
    floor: 2,
    id: "floor-2",
    name: "月潮群岛",
    learningGoal: "用排序、去重和连接保留记录来源并打开跨岛关系。",
    runtime: "sqlite-readonly",
    runtimeNotice: "题目在浏览器内真实执行只读 SQLite 排序与连接查询。",
    lessons: FLOOR_TWO_LESSONS,
    encounterNames: ["林犬", "沼蛙", "湖兽", "蛙王", "灯塔守卫"],
    monsterPool: ["猎犬", "水蛇", "树妖", "毒蛙", "灯塔守卫", "水怪", "镜蛇", "青蛙", "沼蛙", "林犬", "古树精", "湖兽", "蛙王"],
    equipmentPool: ["hunter-bow", "vine-armor"],
    lootPool: ["water-drop", "frog-potion", "forest-fruit", "hunter-bow", "vine-armor"],
    completionRewardId: "course-proof:floor-2",
    nextFloorKeyId: "floor-key:3",
    theme: {
      topology: "aggregate-hub",
      worldElement: "潮汐、航标与退潮村落",
      material: "湿木、白沙、古根与风化白石",
      landmark: "中央月潮船闸",
      bossArena: "月潮灯塔",
      palette: ["#17171b", "#60452e", "#c69b4d", "#d8e2dc"],
    },
  }),
  floorContract({
    floor: 3,
    id: "floor-3",
    name: "白霜墓原",
    learningGoal: "根据真实键关系连接数据，并识别缺失匹配和连接放大。",
    runtime: "sqlite-readonly",
    runtimeNotice: "题目在浏览器内真实执行只读 SQLite 连接查询。",
    lessons: FLOOR_THREE_LESSONS,
    encounterNames: ["骷髅", "铠骷髅", "墓主", "骨骑士", "死灵王"],
    monsterPool: ["骷髅", "僵尸", "幽灵", "铠骷髅", "骨骑士", "死灵王", "碎骨", "腐尸", "鬼火", "游魂", "墓主"],
    equipmentPool: ["bone-blade", "bone-armor"],
    lootPool: ["holy-water", "bone-blade", "spirit-lamp", "bone-armor"],
    completionRewardId: "course-proof:floor-3",
    nextFloorKeyId: "floor-key:4",
    theme: {
      topology: "relational-islands",
      worldElement: "白霜、墓碑与幽火",
      material: "冻土、墓石与遗骨",
      landmark: "断裂骨桥",
      bossArena: "墓城王庭",
      palette: ["#0b1432", "#223f75", "#5ed4ff", "#9c6cff"],
    },
  }),
  floorContract({
    floor: 4,
    id: "floor-4",
    name: "三相升炉",
    learningGoal: "用子查询、EXISTS 与 CTE 表达依赖另一结果集的问题。",
    runtime: "sqlite-readonly",
    runtimeNotice: "题目在浏览器内真实执行只读 SQLite 子查询和 CTE。",
    lessons: FLOOR_FOUR_LESSONS,
    encounterNames: ["火灵", "雷兽", "霜炉主", "炎王", "元素王"],
    monsterPool: ["火灵", "冰灵", "雷灵", "石巨人", "炎王", "元素王", "火苗", "冰晶", "雷兽", "电球", "霜炉主"],
    equipmentPool: ["rune-staff", "rune-armor"],
    lootPool: ["fire-crystal", "ice-crystal", "rune-staff", "rune-armor"],
    completionRewardId: "course-proof:floor-4",
    nextFloorKeyId: "floor-key:5",
    theme: {
      topology: "nested-chambers",
      worldElement: "火、冰与雷的依赖链",
      material: "熔岩砖、霜铁与雷晶",
      landmark: "依赖脊柱",
      bossArena: "元素王座",
      palette: ["#100e18", "#31204f", "#8b7ca8", "#62d5b2"],
    },
  }),
  floorContract({
    floor: 5,
    id: "floor-5",
    name: "黑铁轮值城",
    learningGoal: "在保留明细行的同时完成排名、相邻比较和累计统计。",
    runtime: "sqlite-readonly",
    runtimeNotice: "题目在浏览器内真实执行 SQLite 窗口查询。",
    lessons: FLOOR_FIVE_LESSONS,
    encounterNames: ["哥布林", "铁卫", "堡主", "铁骑", "城主"],
    monsterPool: ["哥布林", "兽人", "骑士", "铁骑", "巨魔", "城主", "小妖", "战兽", "铁卫", "石魔", "堡主"],
    equipmentPool: ["iron-axe", "iron-armor"],
    lootPool: ["repair-plate", "iron-axe", "knight-sword", "iron-armor"],
    completionRewardId: "course-proof:floor-5",
    nextFloorKeyId: "floor-key:6",
    theme: {
      topology: "partition-rings",
      worldElement: "城墙、军阵与黑铁",
      material: "铆钉黑铁与旧石",
      landmark: "轮值军钟",
      bossArena: "黑铁主厅",
      palette: ["#05080b", "#222b32", "#82d5c8", "#e0ae4b"],
    },
  }),
  floorContract({
    floor: 6,
    id: "floor-6",
    name: "龙脊回滚工坊",
    learningGoal: "在隔离副本中安全写入、验证约束并正确提交或回滚。",
    runtime: "sqlite-sandbox",
    runtimeNotice: "写操作只进入一次性 SQLite 沙箱，退出后不污染课程与永久档案。",
    lessons: FLOOR_SIX_LESSONS,
    encounterNames: ["幼龙", "电龙", "古龙", "巨龙", "龙王"],
    monsterPool: ["幼龙", "飞龙", "雷龙", "晶龙", "巨龙", "龙王", "小龙", "翼龙", "电龙", "矿龙", "古龙"],
    equipmentPool: ["dragon-spear", "dragon-armor"],
    lootPool: ["dragon-potion", "repair-plate", "dragon-spear", "dragon-armor"],
    completionRewardId: "course-proof:floor-6",
    nextFloorKeyId: "floor-key:7",
    theme: {
      topology: "rollback-nest",
      worldElement: "熔岩、龙晶与古龙骨",
      material: "火山岩与龙晶",
      landmark: "保存点祭台",
      bossArena: "王焰巢",
      palette: ["#0b0303", "#352421", "#f15a3f", "#6ce0d5"],
    },
  }),
  floorContract({
    floor: 7,
    id: "floor-7",
    name: "残照索引王苑",
    learningGoal: "根据查询模式选择索引，并用可重复的计划证据验证取舍。",
    runtime: "sqlite-plan",
    runtimeNotice: "只把 SQLite EXPLAIN QUERY PLAN 作为教学证据，不宣称等同 MySQL 执行计划。",
    lessons: FLOOR_SEVEN_LESSONS,
    encounterNames: ["枝妖", "晶灵", "林王", "眼魔", "古树"],
    monsterPool: ["树卫", "根兽", "镜灵", "藤巫", "眼魔", "古树", "枝妖", "藤兽", "晶灵", "树魔", "林王"],
    equipmentPool: ["abyss-blade", "demon-armor"],
    lootPool: ["black-fruit", "black-potion", "abyss-blade", "demon-armor"],
    completionRewardId: "course-proof:floor-7",
    nextFloorKeyId: "floor-key:8",
    theme: {
      topology: "btree-branches",
      worldElement: "残照、树根与数据流",
      material: "水晶枝、黑木与计划叶片",
      landmark: "执行计划树",
      bossArena: "索引树心",
      palette: ["#071a16", "#173d32", "#55bd7a", "#9ef0b2"],
    },
  }),
  floorContract({
    floor: 8,
    id: "floor-8",
    name: "黑金迁移高堂",
    learningGoal: "把 SQL、索引、事务和数据库面试知识组成可解释的事故诊断。",
    runtime: "scenario-simulation",
    runtimeNotice: "查询可真实执行；MySQL 的 MVCC、锁、复制和分片使用可重复场景模拟，不冒充 SQLite 实证。",
    lessons: FLOOR_EIGHT_LESSONS,
    encounterNames: ["魔兵", "魔将", "王兽", "巨兽", "档案王"],
    monsterPool: ["幽魂", "锁骑", "巫妖", "魔像", "双子", "巨兽", "档案王", "魔兵", "黑骑", "魔将", "石像", "王兽"],
    equipmentPool: ["royal-sword", "royal-armor"],
    lootPool: ["full-potion", "royal-sword", "royal-staff", "royal-armor"],
    completionRewardId: "campaign-proof",
    nextFloorKeyId: null,
    theme: {
      topology: "throne-ascent",
      worldElement: "王火与虚空",
      material: "黑曜石与黄金",
      landmark: "七层证据窗",
      bossArena: "迁移王座",
      palette: ["#09090d", "#2b2232", "#c99b45", "#e5d39b"],
    },
  }),
] as const;

const REQUIRED_ROLES: readonly EncounterRole[] = [
  "normal",
  "mini-elite",
  "area-boss",
  "fixed-elite",
  "floor-boss",
];
const EXPECTED_LESSON_COUNTS: Record<CampaignFloorNumber, number> = {
  1: 5,
  2: 5,
  3: 6,
  4: 6,
  5: 6,
  6: 6,
  7: 6,
  8: 7,
};

const FORBIDDEN_MONSTER_TOKENS = [
  "SELECT",
  "WHERE",
  "JOIN",
  "GROUP",
  "HAVING",
  "NULL",
  "ORDER",
  "SQL",
];

function isDirectMonsterName(name: string): boolean {
  return (
    /^[\p{Script=Han}]{2,4}$/u.test(name) &&
    !FORBIDDEN_MONSTER_TOKENS.some((token) => name.toUpperCase().includes(token))
  );
}

export function floorContractFor(
  floor: CampaignFloorNumber,
): FloorContentContract {
  const contract = FLOOR_CONTRACTS.find((entry) => entry.floor === floor);
  if (!contract) throw new Error(`缺少第 ${floor} 层内容契约。`);
  return contract;
}

export function validateFloorContracts(
  contracts: readonly FloorContentContract[],
): FloorContractValidation {
  const errors: string[] = [];
  const floorIds = new Set<CampaignFloorNumber>();
  const lessonIds = new Set<string>();
  const knownLessons = new Set<string>();

  contracts.forEach((contract, index) => {
    const expectedFloor = CAMPAIGN_FLOORS[index];
    if (contract.floor !== expectedFloor || contract.id !== `floor-${expectedFloor}`) {
      errors.push(`第 ${index + 1} 个契约没有使用连续楼层编号。`);
    }
    if (floorIds.has(contract.floor)) errors.push(`楼层重复：${contract.floor}`);
    floorIds.add(contract.floor);
    if (contract.lessons.length !== EXPECTED_LESSON_COUNTS[contract.floor]) {
      errors.push(`第 ${contract.floor} 层缺少完整必修课程。`);
    }

    contract.lessons.forEach((lesson) => {
      if (lessonIds.has(lesson.id)) errors.push(`课程 ID 重复：${lesson.id}`);
      lessonIds.add(lesson.id);
      lesson.prerequisites.forEach((prerequisite) => {
        if (!knownLessons.has(prerequisite)) {
          errors.push(`课程 ${lesson.id} 引用了尚未出现的前置课程 ${prerequisite}。`);
        }
      });
      if (
        lesson.concepts.length === 0 ||
        lesson.minimumCorrectAnswers < lesson.tier ||
        lesson.deterministicRewardId.length === 0
      ) {
        errors.push(`课程 ${lesson.id} 的题阶、概念或确定奖励无效。`);
      }
      knownLessons.add(lesson.id);
    });

    REQUIRED_ROLES.forEach((role) => {
      const matches = contract.encounters.filter((encounter) => encounter.role === role);
      const expectedCount = contract.floor === 1 && role === "area-boss" ? 0 : 1;
      if (matches.length !== expectedCount) {
        errors.push(`第 ${contract.floor} 层必须恰好配置 ${expectedCount} 个 ${role} 原型。`);
      }
    });
    contract.encounters.forEach((encounter) => {
      if (!isDirectMonsterName(encounter.name)) {
        errors.push(`怪物名不可直接输入：${encounter.name}`);
      }
      if (
        encounter.lessonIds.length === 0 ||
        encounter.lessonIds.some((lessonId) => !contract.lessons.some((lesson) => lesson.id === lessonId))
      ) {
        errors.push(`怪物 ${encounter.name} 引用了本层不存在的课程。`);
      }
      if (
        (encounter.role === "normal" && encounter.minimumCorrectAnswers !== 1) ||
        (encounter.role !== "normal" && encounter.minimumCorrectAnswers < 2)
      ) {
        errors.push(`怪物 ${encounter.name} 的最低正确作答次数不符合阶级。`);
      }
    });
    const boss = contract.encounters.find((encounter) => encounter.role === "floor-boss");
    if (!boss || !boss.required || boss.xp !== 5) {
      errors.push(`第 ${contract.floor} 层缺少必修层主。`);
    }
    if (contract.floor === 8 && boss && boss.minimumCorrectAnswers < 5) {
      errors.push("最终魔王至少需要五次递进正确作答。");
    }
    if (
      contract.completionRewardId.length === 0 ||
      (contract.floor < 8 && !contract.nextFloorKeyId) ||
      (contract.floor === 8 && contract.nextFloorKeyId !== null)
    ) {
      errors.push(`第 ${contract.floor} 层缺少正确的关键结业奖励。`);
    }
    if (
      contract.monsterPool.length < 4 ||
      contract.monsterPool.some((name) => !isDirectMonsterName(name))
    ) {
      errors.push(`第 ${contract.floor} 层怪物池数量或名称无效。`);
    }
    if (
      contract.equipmentPool.length < 2 ||
      contract.lootPool.length < 3 ||
      new Set(contract.equipmentPool).size !== contract.equipmentPool.length ||
      new Set(contract.lootPool).size !== contract.lootPool.length
    ) {
      errors.push(`第 ${contract.floor} 层装备池或掉落池无效。`);
    }
    if (contract.theme.palette.length < 4) {
      errors.push(`第 ${contract.floor} 层主题色板不足。`);
    }
    if (
      contract.floor === 7 &&
      !/SQLite.+MySQL/u.test(contract.runtimeNotice)
    ) {
      errors.push("第七层必须明确 SQLite 计划证据不等同 MySQL。");
    }
    if (
      contract.floor === 8 &&
      !/MySQL.+模拟/u.test(contract.runtimeNotice)
    ) {
      errors.push("第八层必须明确 MySQL 专属概念采用场景模拟。");
    }
  });

  if (contracts.length !== CAMPAIGN_FLOORS.length) {
    errors.push("八层内容契约必须恰好包含 8 层。");
  }
  return { valid: errors.length === 0, errors };
}
