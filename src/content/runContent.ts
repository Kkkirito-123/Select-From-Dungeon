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
  "floor-key": {
    id: "floor-key",
    name: "第一层钥匙",
    description: "魔王城第一层已经贯通。",
    kind: "key",
  },
};

export function rewardDetails(reward: RoomReward | null): ClaimableReward | null {
  if (!reward) return null;
  const details = REWARD_CATALOG[reward];
  return details ? { ...details } : null;
}

export function roomFlavor(type: RoomType, floor = 1): string {
  if (floor === 2) {
    const floorTwoCopy: Record<RoomType, string> = {
      entry: "传送残响正在退去。雷鸣奏鸣塔的电路会沿另一套路径重排。",
      tutorial: "雷序刻度不断交换位置，只有排序后的结果能够稳定电流。",
      lesson: "两张数据表在紫色电弧间靠近，等待一条明确的连接条件。",
      rest: "静电回滚站可以恢复生命；靠近后按 E 结算。",
      treasure: "覆盖索引仓只增强本轮构筑，不改变必修课程。",
      event: "事务井在电弧中等待调查，结果只影响当前 Run。",
      elite: "关系校验场会放大每一条错误连接。",
      boss: "雷鸣主核正在同时调度房间、怪物与装备三张表。",
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
