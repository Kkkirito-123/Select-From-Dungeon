import type { RoomReward, RoomType } from "../domain/runGraph";
import type { ClaimableReward, Position, Relic } from "../domain/types";

export type ExitSlot = "north" | "east" | "south" | "west";

export interface RoomTemplate {
  label: string;
  rows: readonly string[];
  floorColor: number;
  accentColor: number;
}

export const EXIT_POSITIONS: Record<ExitSlot, Position> = {
  north: { x: 10, y: 1 },
  east: { x: 18, y: 6 },
  south: { x: 10, y: 11 },
  west: { x: 1, y: 6 },
};

export const EXIT_SLOTS: readonly ExitSlot[] = ["north", "east", "south", "west"];

const HALL_ROWS = [
  "####################",
  "#..................#",
  "#..##..........##..#",
  "#..##..........##..#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..##..........##..#",
  "#..##..........##..#",
  "#..................#",
  "####################",
] as const;

const CRYPT_ROWS = [
  "####################",
  "#..................#",
  "#..#..#......#..#..#",
  "#..#..#......#..#..#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..................#",
  "#..#..#......#..#..#",
  "#..#..#......#..#..#",
  "#..................#",
  "####################",
] as const;

const ARCHIVE_ROWS = [
  "####################",
  "#..................#",
  "#..#####....#####..#",
  "#..................#",
  "#..................#",
  "#..###........###..#",
  "#..................#",
  "#..###........###..#",
  "#..................#",
  "#..................#",
  "#..#####....#####..#",
  "#..................#",
  "####################",
] as const;

const THRONE_ROWS = [
  "####################",
  "#..................#",
  "#....##......##....#",
  "#..................#",
  "#..................#",
  "#..#............#..#",
  "#..#............#..#",
  "#..#............#..#",
  "#..................#",
  "#..................#",
  "#....##......##....#",
  "#..................#",
  "####################",
] as const;

export const ROOM_TEMPLATES: Record<RoomType, RoomTemplate> = {
  entry: {
    label: "玄铁城门",
    rows: HALL_ROWS,
    floorColor: 0x202631,
    accentColor: 0xd7ad55,
  },
  tutorial: {
    label: "青页档案室",
    rows: ARCHIVE_ROWS,
    floorColor: 0x1d2a2d,
    accentColor: 0x78c9b8,
  },
  lesson: {
    label: "腐化回廊",
    rows: HALL_ROWS,
    floorColor: 0x27232d,
    accentColor: 0x7f5a87,
  },
  rest: {
    label: "回滚篝火",
    rows: CRYPT_ROWS,
    floorColor: 0x282429,
    accentColor: 0xc86f4a,
  },
  treasure: {
    label: "索引秘藏",
    rows: ARCHIVE_ROWS,
    floorColor: 0x26291f,
    accentColor: 0xd7ad55,
  },
  event: {
    label: "未知事务",
    rows: CRYPT_ROWS,
    floorColor: 0x24202d,
    accentColor: 0x9a74a5,
  },
  elite: {
    label: "聚合钟楼",
    rows: THRONE_ROWS,
    floorColor: 0x29241e,
    accentColor: 0xd7ad55,
  },
  boss: {
    label: "魔王核心",
    rows: THRONE_ROWS,
    floorColor: 0x2b1c22,
    accentColor: 0xc75248,
  },
};

export const RELICS: Record<Relic["id"], Relic> = {
  "cache-chip": {
    id: "cache-chip",
    name: "缓存芯片",
    description: "每次查询额外减少 1 点 I/O 热量。",
    heatReduction: 1,
  },
  "schema-eye": {
    id: "schema-eye",
    name: "Schema 之眼",
    description: "进入新课程时自动揭示第一条提示。",
    heatReduction: 0,
  },
  "rollback-heart": {
    id: "rollback-heart",
    name: "回滚之心",
    description: "立即恢复 1 颗心，并将生命上限提高 1。",
    heatReduction: 0,
  },
  "query-lens": {
    id: "query-lens",
    name: "查询透镜",
    description: "精英房的证明；查询热量额外减少 1。",
    heatReduction: 1,
  },
};

const REWARD_CATALOG: Partial<Record<RoomReward, ClaimableReward>> = {
  "restore-12-hp": {
    id: "restore-12-hp",
    name: "回滚篝火",
    description: "恢复 1 颗心。",
    kind: "heal",
  },
  "restore-20-hp": {
    id: "restore-20-hp",
    name: "完整回滚",
    description: "恢复全部生命。",
    kind: "heal",
  },
  "cool-8-heat": {
    id: "cool-8-heat",
    name: "冷却片",
    description: "清除 8 点 I/O 热量。",
    kind: "cool",
  },
  "cool-12-heat": {
    id: "cool-12-heat",
    name: "冷却核心",
    description: "清除 12 点 I/O 热量。",
    kind: "cool",
  },
  "hint-token": {
    id: "hint-token",
    name: "Schema 之眼",
    description: "获得遗物：新课程自动展示第一条提示。",
    kind: "relic",
  },
  "schema-shard": {
    id: "schema-shard",
    name: "缓存芯片",
    description: "获得遗物：查询热量额外减少 1。",
    kind: "relic",
  },
  "weapon-cache": {
    id: "weapon-cache",
    name: "回滚之心",
    description: "获得遗物：生命上限提高 1，并恢复 1 颗心。",
    kind: "relic",
  },
  "reroll-token": {
    id: "reroll-token",
    name: "事务残页",
    description: "记录一次随机事件，并清除 8 点热量。",
    kind: "event",
  },
  "elite-query-lens": {
    id: "elite-query-lens",
    name: "查询透镜",
    description: "精英遗物：查询热量额外减少 1。",
    kind: "relic",
  },
  "elite-transaction-shield": {
    id: "elite-transaction-shield",
    name: "事务护印",
    description: "精英奖励：恢复 1 颗心并清除热量。",
    kind: "event",
  },
  "filter-rune": {
    id: "filter-rune",
    name: "过滤弓",
    description: "WHERE 条件命中时造成 7 点伤害，并减少 1 点查询热量。",
    kind: "weapon",
  },
  "null-lantern": {
    id: "null-lantern",
    name: "空值提灯",
    description: "IS NULL 条件命中时造成 8 点伤害，并减少 1 点查询热量。",
    kind: "weapon",
  },
  "aggregate-hammer": {
    id: "aggregate-hammer",
    name: "聚合战锤",
    description: "领取必修武器，开启 GROUP BY 钟楼。",
    kind: "weapon",
  },
  "sort-saber": {
    id: "sort-saber",
    name: "雷序军刀",
    description: "领取第二层必修武器，强化 ORDER BY 与 LIMIT 查询。",
    kind: "weapon",
  },
  "join-chain": {
    id: "join-chain",
    name: "关系链刃",
    description: "领取第二层必修武器，用关系连接击穿 JOIN 守卫。",
    kind: "weapon",
  },
  "bone-blade": {
    id: "bone-blade",
    name: "骨剑",
    description: "领取第三层必修武器，用真实键关系击穿亡者护甲。",
    kind: "weapon",
  },
  "rune-staff": {
    id: "rune-staff",
    name: "符文杖",
    description: "领取第四层必修武器，把子查询结果转化为元素伤害。",
    kind: "weapon",
  },
  "iron-axe": {
    id: "iron-axe",
    name: "黑铁斧",
    description: "领取第五层必修武器，把窗口排名转化为黑铁重击。",
    kind: "weapon",
  },
  "dragon-spear": {
    id: "dragon-spear",
    name: "龙枪",
    description: "领取第六层必修武器，在一次性事务沙箱中稳定破甲。",
    kind: "weapon",
  },
  "crystal-blade": {
    id: "crystal-blade",
    name: "水晶剑",
    description: "领取第七层必修武器，用真实 SQLite 执行计划击穿索引守卫。",
    kind: "weapon",
  },
  "royal-sword": {
    id: "royal-sword",
    name: "王者剑",
    description: "领取第八层最终武器，把事故证据查询转化为王座重击。",
    kind: "weapon",
  },
  "floor-key": {
    id: "floor-key",
    name: "本层钥匙",
    description: "当前楼层已经贯通；拾取后结算本层进度。",
    kind: "key",
  },
};

export function rewardDetails(reward: RoomReward | null): ClaimableReward | null {
  if (!reward) return null;
  const details = REWARD_CATALOG[reward];
  return details ? { ...details } : null;
}

export function roomFlavor(type: RoomType, floor = 1): string {
  if (floor === 8) {
    const floorEightCopy: Record<RoomType, string> = {
      entry: "黑曜王城只接受可验证的事故证据；复制与分片均使用明确标注的教学记录。",
      tutorial: "版本厅保存创建与过期事务号，用查询重建事务 12 的快照。",
      lesson: "锁、隔离、模型与路由事故都固定在本轮 SQLite 夹具中。",
      rest: "王城篝火隔离战斗。靠近后按 E 休息或复盘本层。",
      treasure: "黑曜宝库只提供构筑奖励，不改变事故证据。",
      event: "事故碑廊解释边界：这里训练推理，不模拟生产分布式数据库。",
      elite: "巨兽桥要求先验证路由和副本状态，再作取舍。",
      boss: "魔王拥有五阶段事故链；每一击都必须给出可复现结果。",
    };
    return floorEightCopy[type];
  }
  if (floor === 7) {
    const floorSevenCopy: Record<RoomType, string> = {
      entry: "水晶林门记录真实 SQLite EXPLAIN QUERY PLAN，不伪装成其他数据库。",
      tutorial: "枝径用主键 SEARCH 展示从根到叶的点查路径。",
      lesson: "联合、覆盖与范围改写同时接受结果和计划证据。",
      rest: "晶火篝火稳定索引林。靠近后按 E 休息或复盘。",
      treasure: "索引宝库只增强构筑，不替代查询计划判断。",
      event: "计划石碑记录 SCAN、SEARCH 与临时 B-Tree 的差异。",
      elite: "晶眼会放大一次无效索引或额外排序。",
      boss: "古树要求结果正确、索引路径合理且没有不必要的临时排序。",
    };
    return floorSevenCopy[type];
  }
  if (floor === 6) {
    const floorSixCopy: Record<RoomType, string> = {
      entry: "熔巢石门已闭合。所有写操作只进入本场一次性 SQLite 副本。",
      tutorial: "孵化台等待一条明确列名的 INSERT，永久怪物档案不会被修改。",
      lesson: "龙巢修复队要求精确 WHERE、约束证据与可验证的前后状态。",
      rest: "龙息篝火隔绝沙箱操作。靠近后按 E 休息或复盘。",
      treasure: "龙鳞宝库只提供构筑奖励，不改变事务夹具。",
      event: "古龙碑记录失败路径，但不会写入永久世界。",
      elite: "事务熔洞要求在提交和回滚之间做出明确选择。",
      boss: "龙王守着保存点；局部错误必须回滚，正确修复必须提交。",
    };
    return floorSixCopy[type];
  }
  if (floor === 5) {
    const floorFiveCopy: Record<RoomType, string> = {
      entry: "黑铁城门已经落锁。外城、兵营与内城由同一 Seed 固定。",
      tutorial: "哥布林军阵保留每名士兵，同时在 OVER 窗口内完成分区统计。",
      lesson: "要塞守军按区域、顺序与前后行组织，窗口定义决定结果。",
      rest: "铁炉篝火稳定军阵。靠近后按 E 休息或复盘。",
      treasure: "军械宝库只改变当前构筑，不替代窗口函数。",
      event: "战旗回廊记录本轮路线，不改变必修数据。",
      elite: "累计城墙要求明确 ROWS Frame，不能依赖模糊默认值。",
      boss: "城主把每个区域的前 N 名藏进 CTE。",
    };
    return floorFiveCopy[type];
  }
  if (floor === 4) {
    const floorFourCopy: Record<RoomType, string> = {
      entry: "熔炉升降台已经锁定本层 Seed。火、冰与雷晶区域等待探索。",
      tutorial: "火室要求先让内层查询返回一个值，再由外层锁定目标。",
      lesson: "元素记录藏在另一份结果集中。观察内外层的依赖方向。",
      rest: "熔炉篝火稳定着元素流。靠近后按 E 休息或复盘。",
      treasure: "晶石宝库提供构筑奖励，不改变子查询课程。",
      event: "元素祭坛只影响当前 Run，不会更改必修数据。",
      elite: "符文环要求把中间结果命名后再继续查询。",
      boss: "元素王把主从链藏进递归 CTE。",
    };
    return floorFourCopy[type];
  }
  if (floor === 3) {
    const floorThreeCopy: Record<RoomType, string> = {
      entry: "墓城石门已经闭合。骨桥、墓园和幽火地宫由同一 Seed 固定。",
      tutorial: "骷髅与墓室分属两张表，只有真实键关系能让骨桥成形。",
      lesson: "亡者档案互相引用。别名、缺失匹配与多表链决定前路。",
      rest: "守墓篝火驱散寒意。靠近后按 E 休息或复盘。",
      treasure: "遗骨宝库提供构筑奖励，不替代 JOIN 练习。",
      event: "幽魂碑廊只影响当前 Run，不改变必修关系。",
      elite: "合葬厅要求把两条结果路径合并。",
      boss: "死灵王正在审计整座墓城的关系与装备。",
    };
    return floorThreeCopy[type];
  }
  if (floor === 2) {
    const floorTwoCopy: Record<RoomType, string> = {
      entry: "传送残响正在湖岸退去。森林、湖泊和泥沼会沿同一 Seed 重新分布。",
      tutorial: "林间足迹不断交换位置，只有排序后的结果能够锁定猎犬。",
      lesson: "怪物档案和区域记录分散在不同数据表，等待明确的连接条件。",
      rest: "湖畔篝火可以恢复生命；靠近后按 E 休息或复盘。",
      treasure: "猎具仓只增强本轮构筑，不改变必修课程。",
      event: "泥沼古井等待调查，结果只影响当前 Run。",
      elite: "树妖校验场会放大每一条错误连接。",
      boss: "丛林王正在同时控制房间、怪物与装备三张表。",
    };
    return floorTwoCopy[type];
  }
  const copy: Record<RoomType, string> = {
    entry: "铸铁门后的路线每局都会重排，但所有必修知识都不会消失。",
    tutorial: "青色数据页从书架间飘落，史莱姆守着第一条 SELECT。",
    lesson: "数据库石砖正在渗出紫光。这里封存着一条必修查询。",
    rest: "篝火像一次尚未提交的回滚，靠近后按 E 结算。",
    treasure: "索引箱只改变本轮构筑，不会随机夺走课程所需武器。",
    event: "事务祭坛等待一次选择；结果只影响当前 Run。",
    elite: "聚合钟摆把每一组信号压成沉重的一击。",
    boss: "HAVING 魔王正在等待最终结果集。",
  };
  return copy[type];
}
