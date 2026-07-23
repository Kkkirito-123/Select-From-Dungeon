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
  | "btree-branches"
  | "throne-ascent";

export interface FloorLessonContract {
  id: string;
  label: string;
  concepts: readonly string[];
  prerequisites: readonly string[];
  tier: ExerciseTier;
  minimumCorrectAnswers: number;
  deterministicRewardId: string;
}

export interface EncounterContract {
  role: EncounterRole;
  name: string;
  lessonIds: readonly string[];
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
  id: string,
  label: string,
  concepts: readonly string[],
  prerequisites: readonly string[],
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
  names: readonly [string, string, string, string, string],
  lessonIds: readonly string[],
  floor: CampaignFloorNumber,
): readonly EncounterContract[] {
  const finalLessons = lessonIds.slice(-Math.min(3, lessonIds.length));
  return [
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
      role: "area-boss",
      name: names[2],
      lessonIds: lessonIds.slice(1, 3),
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
}

function floorContract(
  input: Omit<FloorContentContract, "encounters"> & {
    encounterNames: readonly [string, string, string, string, string];
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
  defineLesson("f1-select", "选择字段", ["SELECT", "FROM", "AS"], [], 1),
  defineLesson("f1-where", "条件过滤", ["WHERE", "比较运算"], ["f1-select"], 1),
  defineLesson("f1-boolean", "组合条件", ["AND", "OR", "NOT"], ["f1-where"], 2),
  defineLesson("f1-pattern", "集合与模式", ["IN", "BETWEEN", "LIKE"], ["f1-boolean"], 2),
  defineLesson("f1-null", "空值判断", ["IS NULL", "IS NOT NULL"], ["f1-where"], 1),
  defineLesson(
    "f1-sort",
    "去重排序",
    ["DISTINCT", "ORDER BY", "LIMIT", "OFFSET"],
    ["f1-pattern", "f1-null"],
    3,
  ),
] as const;

const FLOOR_TWO_LESSONS = [
  defineLesson("f2-count", "计数", ["COUNT(*)", "COUNT(column)"], ["f1-sort"], 1),
  defineLesson("f2-aggregate", "聚合函数", ["SUM", "AVG", "MIN", "MAX"], ["f2-count"], 1),
  defineLesson("f2-group", "分组", ["GROUP BY"], ["f2-aggregate"], 2),
  defineLesson("f2-having", "分组过滤", ["WHERE", "HAVING"], ["f2-group"], 2),
  defineLesson("f2-case", "条件聚合", ["CASE WHEN"], ["f2-having"], 2),
  defineLesson(
    "f2-ranking",
    "聚合榜单",
    ["GROUP BY", "HAVING", "ORDER BY", "LIMIT"],
    ["f2-case"],
    3,
  ),
] as const;

const FLOOR_THREE_LESSONS = [
  defineLesson("f3-inner", "内连接", ["INNER JOIN", "ON"], ["f2-ranking"], 1),
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
    name: "余烬青石城",
    learningGoal: "完成可靠的单表选择、过滤、空值处理和稳定排序。",
    runtime: "sqlite-readonly",
    runtimeNotice: "题目在浏览器内真实执行只读 SQLite 查询。",
    lessons: FLOOR_ONE_LESSONS,
    encounterNames: ["史莱姆", "铁史莱姆", "大史莱姆", "软泥卫", "史莱姆王"],
    monsterPool: ["史莱姆", "水史莱姆", "毒史莱姆", "铁史莱姆", "史莱姆王"],
    equipmentPool: ["short-blade", "slime-vest"],
    lootPool: ["slime-gel", "red-potion", "short-blade", "slime-vest"],
    completionRewardId: "course-proof:floor-1",
    nextFloorKeyId: "floor-key:2",
    theme: {
      topology: "looped-keep",
      worldElement: "余烬与火炬",
      material: "青石与旧铁",
      landmark: "Schema 档案厅",
      bossArena: "半圆火盆审判厅",
      palette: ["#111820", "#2c3744", "#d59b45", "#79d3c4"],
    },
  }),
  floorContract({
    floor: 2,
    id: "floor-2",
    name: "蒸汽聚合钟楼",
    learningGoal: "把明细行转换为可信、稳定且可解释的分组统计。",
    runtime: "sqlite-readonly",
    runtimeNotice: "题目在浏览器内真实执行只读 SQLite 聚合查询。",
    lessons: FLOOR_TWO_LESSONS,
    encounterNames: ["猎犬", "黑猎犬", "湖怪", "狼人", "兽王"],
    monsterPool: ["水怪", "水蛇", "青蛙", "毒蛙", "猎犬", "树妖", "兽王"],
    equipmentPool: ["hunter-bow", "vine-armor"],
    lootPool: ["water-drop", "frog-potion", "forest-fruit", "hunter-bow", "vine-armor"],
    completionRewardId: "course-proof:floor-2",
    nextFloorKeyId: "floor-key:3",
    theme: {
      topology: "aggregate-hub",
      worldElement: "蒸汽与齿轮",
      material: "黄铜与铆钉",
      landmark: "中央聚合钟轴",
      bossArena: "圆形钟面核心",
      palette: ["#17171b", "#60452e", "#c69b4d", "#d8e2dc"],
    },
  }),
  floorContract({
    floor: 3,
    id: "floor-3",
    name: "雷鸣关系桥城",
    learningGoal: "根据真实键关系连接数据，并识别缺失匹配和连接放大。",
    runtime: "sqlite-readonly",
    runtimeNotice: "题目在浏览器内真实执行只读 SQLite 连接查询。",
    lessons: FLOOR_THREE_LESSONS,
    encounterNames: ["骷髅", "铠骷髅", "墓主", "骷髅骑士", "死灵王"],
    monsterPool: ["骷髅", "僵尸", "幽灵", "铠骷髅", "死灵王"],
    equipmentPool: ["bone-blade", "bone-armor"],
    lootPool: ["holy-water", "bone-blade", "spirit-lamp", "bone-armor"],
    completionRewardId: "course-proof:floor-3",
    nextFloorKeyId: "floor-key:4",
    theme: {
      topology: "relational-islands",
      worldElement: "雷电与风暴",
      material: "悬浮石台与金属桥",
      landmark: "三表关系桥",
      bossArena: "三平台雷鸣主核",
      palette: ["#0b1432", "#223f75", "#5ed4ff", "#9c6cff"],
    },
  }),
  floorContract({
    floor: 4,
    id: "floor-4",
    name: "镜影子查询地窟",
    learningGoal: "用子查询、EXISTS 与 CTE 表达依赖另一结果集的问题。",
    runtime: "sqlite-readonly",
    runtimeNotice: "题目在浏览器内真实执行只读 SQLite 子查询和 CTE。",
    lessons: FLOOR_FOUR_LESSONS,
    encounterNames: ["火灵", "雷灵", "炎王", "石巨人", "元素王"],
    monsterPool: ["火灵", "冰灵", "雷灵", "石巨人", "元素王"],
    equipmentPool: ["rune-staff", "rune-armor"],
    lootPool: ["fire-crystal", "ice-crystal", "rune-staff", "rune-armor"],
    completionRewardId: "course-proof:floor-4",
    nextFloorKeyId: "floor-key:5",
    theme: {
      topology: "nested-chambers",
      worldElement: "镜影与幽火",
      material: "黑石与碎镜",
      landmark: "CTE 档案环",
      bossArena: "同心镜室",
      palette: ["#100e18", "#31204f", "#8b7ca8", "#62d5b2"],
    },
  }),
  floorContract({
    floor: 5,
    id: "floor-5",
    name: "星轨窗口观测塔",
    learningGoal: "在保留明细行的同时完成排名、相邻比较和累计统计。",
    runtime: "sqlite-readonly",
    runtimeNotice: "题目在浏览器内真实执行 SQLite 窗口查询。",
    lessons: FLOOR_FIVE_LESSONS,
    encounterNames: ["哥布林", "兽人队长", "巨魔", "黑骑士", "城主"],
    monsterPool: ["哥布林", "兽人", "骑士", "兽人队长", "城主"],
    equipmentPool: ["iron-axe", "iron-armor"],
    lootPool: ["repair-plate", "iron-axe", "knight-sword", "iron-armor"],
    completionRewardId: "course-proof:floor-5",
    nextFloorKeyId: "floor-key:6",
    theme: {
      topology: "partition-rings",
      worldElement: "星光与时间环",
      material: "天文金属与玻璃",
      landmark: "分区星轨",
      bossArena: "星盘圆厅",
      palette: ["#091426", "#243d70", "#7ec8ff", "#eadb80"],
    },
  }),
  floorContract({
    floor: 6,
    id: "floor-6",
    name: "熔火回滚铸造厂",
    learningGoal: "在隔离副本中安全写入、验证约束并正确提交或回滚。",
    runtime: "sqlite-sandbox",
    runtimeNotice: "写操作只进入一次性 SQLite 沙箱，退出后不污染课程与永久档案。",
    lessons: FLOOR_SIX_LESSONS,
    encounterNames: ["幼龙", "雷龙", "晶龙", "巨龙", "龙王"],
    monsterPool: ["幼龙", "飞龙", "雷龙", "巨龙", "龙王"],
    equipmentPool: ["dragon-spear", "dragon-scale-armor"],
    lootPool: ["dragon-potion", "dragon-fang", "dragon-spear", "dragon-scale-armor"],
    completionRewardId: "course-proof:floor-6",
    nextFloorKeyId: "floor-key:7",
    theme: {
      topology: "rollback-factory",
      worldElement: "熔岩与冷却液",
      material: "黑铁与管线",
      landmark: "事务保存点",
      bossArena: "双状态事务熔炉",
      palette: ["#151719", "#4a2a22", "#e25932", "#68c9cf"],
    },
  }),
  floorContract({
    floor: 7,
    id: "floor-7",
    name: "翠晶索引森林",
    learningGoal: "根据查询模式选择索引，并用可重复的计划证据验证取舍。",
    runtime: "sqlite-plan",
    runtimeNotice: "只把 SQLite EXPLAIN QUERY PLAN 作为教学证据，不宣称等同 MySQL 执行计划。",
    lessons: FLOOR_SEVEN_LESSONS,
    encounterNames: ["小恶魔", "眼魔", "深渊兽", "魔将", "魔龙"],
    monsterPool: ["小恶魔", "魔犬", "眼魔", "魔将", "魔龙"],
    equipmentPool: ["abyss-blade", "demon-armor"],
    lootPool: ["black-fruit", "black-potion", "abyss-blade", "demon-armor"],
    completionRewardId: "course-proof:floor-7",
    nextFloorKeyId: "floor-key:8",
    theme: {
      topology: "btree-branches",
      worldElement: "树根与数据流",
      material: "翠晶与黑木",
      landmark: "B+ 树分支",
      bossArena: "古树根系核心",
      palette: ["#071a16", "#173d32", "#55bd7a", "#9ef0b2"],
    },
  }),
  floorContract({
    floor: 8,
    id: "floor-8",
    name: "黑金数据王座",
    learningGoal: "把 SQL、索引、事务和数据库面试知识组成可解释的事故诊断。",
    runtime: "scenario-simulation",
    runtimeNotice: "查询可真实执行；MySQL 的 MVCC、锁、复制和分片使用可重复场景模拟，不冒充 SQLite 实证。",
    lessons: FLOOR_EIGHT_LESSONS,
    encounterNames: ["魔兵", "魔骑士", "大魔将", "魔像", "魔王"],
    monsterPool: ["魔兵", "魔像", "魔骑士", "大魔将", "魔王"],
    equipmentPool: ["royal-sword", "royal-armor"],
    lootPool: ["full-potion", "royal-sword", "royal-staff", "royal-armor"],
    completionRewardId: "campaign-proof",
    nextFloorKeyId: null,
    theme: {
      topology: "throne-ascent",
      worldElement: "王火与虚空",
      material: "黑曜石与黄金",
      landmark: "七翼王门",
      bossArena: "阶梯王座大厅",
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
  1: 6,
  2: 6,
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
      if (matches.length !== 1) {
        errors.push(`第 ${contract.floor} 层必须恰好配置一个 ${role} 原型。`);
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
