/**
 * SQL 教学数据库的静态关系 fixture。
 *
 * 这些数据属于课程内容，不负责创建数据库、执行查询或修改游戏状态；
 * SqlEngine 只在初始化时读取它们写入内存 SQLite。
 */
export interface MonsterSignalFixture {
  id: number;
  monsterId: number;
  channel: string;
  charge: number;
}

export interface MonsterGearFixture {
  id: number;
  monsterId: number;
  gearName: string;
  power: number;
}

export const MONSTER_SIGNAL_FIXTURES: readonly MonsterSignalFixture[] = [
  { id: 1, monsterId: 4, channel: "echo", charge: 7 },
  { id: 2, monsterId: 4, channel: "echo", charge: 8 },
  { id: 3, monsterId: 4, channel: "echo", charge: 9 },
  { id: 4, monsterId: 4, channel: "noise", charge: 1 },
  { id: 5, monsterId: 5, channel: "echo", charge: 7 },
  { id: 6, monsterId: 5, channel: "echo", charge: 8 },
  { id: 7, monsterId: 5, channel: "echo", charge: 9 },
  { id: 8, monsterId: 5, channel: "ward", charge: 4 },
  { id: 9, monsterId: 5, channel: "ward", charge: 5 },
  { id: 10, monsterId: 5, channel: "noise", charge: 1 },
  { id: 11, monsterId: 9, channel: "echo", charge: 6 },
  { id: 12, monsterId: 9, channel: "echo", charge: 7 },
  { id: 13, monsterId: 9, channel: "noise", charge: 2 },
  { id: 14, monsterId: 9, channel: "noise", charge: 3 },
  { id: 15, monsterId: 10, channel: "pulse", charge: 9 },
  { id: 16, monsterId: 10, channel: "surge", charge: 13 },
  { id: 17, monsterId: 10, channel: "arc", charge: 11 },
  { id: 18, monsterId: 15, channel: "arc", charge: 7 },
  { id: 19, monsterId: 15, channel: "surge", charge: 10 },
  { id: 20, monsterId: 11, channel: "echo", charge: 5 },
  { id: 21, monsterId: 11, channel: "echo", charge: 6 },
  { id: 22, monsterId: 11, channel: "mirror", charge: 8 },
  { id: 23, monsterId: 11, channel: "mirror", charge: 9 },
  { id: 24, monsterId: 16, channel: "echo", charge: 4 },
  { id: 25, monsterId: 16, channel: "echo", charge: 5 },
  { id: 26, monsterId: 16, channel: "mirror", charge: 7 },
  { id: 27, monsterId: 21, channel: "deep", charge: 7 },
  { id: 28, monsterId: 21, channel: "wake", charge: 11 },
  { id: 29, monsterId: 21, channel: "wake", charge: 9 },
  { id: 30, monsterId: 21, channel: "surge", charge: 14 },
  { id: 31, monsterId: 21, channel: "surge", charge: 13 },
] as const;

export const MONSTER_GEAR_FIXTURES: readonly MonsterGearFixture[] = [
  { id: 1, monsterId: 10, gearName: "雷序军刀", power: 13 },
  { id: 2, monsterId: 11, gearName: "镜像甲片", power: 8 },
  { id: 3, monsterId: 12, gearName: "古树链刃", power: 15 },
  { id: 4, monsterId: 14, gearName: "主透镜", power: 21 },
  { id: 5, monsterId: 14, gearName: "备用透镜", power: 17 },
  { id: 6, monsterId: 15, gearName: "湖鳞", power: 7 },
  { id: 7, monsterId: 16, gearName: "镜蛇蜕", power: 6 },
  { id: 8, monsterId: 17, gearName: "沼叶", power: 9 },
  { id: 9, monsterId: 23, gearName: "骨短刀", power: 15 },
  { id: 10, monsterId: 25, gearName: "魂灯", power: 16 },
  { id: 11, monsterId: 26, gearName: "墓卫剑", power: 18 },
  { id: 12, monsterId: 27, gearName: "骨枪", power: 20 },
  { id: 13, monsterId: 28, gearName: "死灵冠", power: 24 },
  { id: 14, monsterId: 31, gearName: "鬼火瓶", power: 17 },
  { id: 15, monsterId: 33, gearName: "墓主印", power: 22 },
  { id: 16, monsterId: 36, gearName: "雷晶", power: 17 },
  { id: 17, monsterId: 37, gearName: "炉心", power: 18 },
  { id: 18, monsterId: 38, gearName: "炎冠", power: 20 },
  { id: 19, monsterId: 39, gearName: "元素核", power: 26 },
  { id: 20, monsterId: 42, gearName: "雷兽爪", power: 19 },
  { id: 21, monsterId: 44, gearName: "霜炉锤", power: 22 },
  { id: 22, monsterId: 43, gearName: "电容核", power: 16 },
  { id: 23, monsterId: 45, gearName: "短矛", power: 18 },
  { id: 24, monsterId: 47, gearName: "黑铁盾", power: 20 },
  { id: 25, monsterId: 48, gearName: "骑枪", power: 22 },
  { id: 26, monsterId: 49, gearName: "城墙锤", power: 24 },
  { id: 27, monsterId: 50, gearName: "城主冠", power: 28 },
  { id: 28, monsterId: 53, gearName: "卫队盾", power: 24 },
  { id: 29, monsterId: 55, gearName: "堡垒弩", power: 26 },
  { id: 30, monsterId: 56, gearName: "幼龙爪", power: 20 },
  { id: 31, monsterId: 58, gearName: "雷龙角", power: 24 },
  { id: 32, monsterId: 59, gearName: "龙晶甲", power: 25 },
  { id: 33, monsterId: 60, gearName: "古龙鳞", power: 28 },
  { id: 34, monsterId: 61, gearName: "龙王冠", power: 32 },
  { id: 35, monsterId: 64, gearName: "电龙核", power: 29 },
  { id: 36, monsterId: 66, gearName: "古龙骨", power: 30 },
  { id: 49, monsterId: 46, gearName: "战斧", power: 20 },
  { id: 50, monsterId: 51, gearName: "侦察短刀", power: 18 },
  { id: 51, monsterId: 52, gearName: "兽骨肩甲", power: 20 },
  { id: 52, monsterId: 54, gearName: "石魔投索", power: 22 },
  { id: 53, monsterId: 57, gearName: "翼爪", power: 22 },
  { id: 54, monsterId: 62, gearName: "火壳", power: 21 },
  { id: 55, monsterId: 63, gearName: "翼刃", power: 23 },
  { id: 56, monsterId: 65, gearName: "矿龙晶爪", power: 27 },
  { id: 57, monsterId: 67, gearName: "枝剑", power: 31 },
  { id: 58, monsterId: 69, gearName: "镜盾", power: 33 },
  { id: 59, monsterId: 71, gearName: "晶眼", power: 35 },
  { id: 60, monsterId: 72, gearName: "树心", power: 38 },
  { id: 61, monsterId: 75, gearName: "晶核", power: 34 },
  { id: 62, monsterId: 77, gearName: "林王冠", power: 37 },
  { id: 63, monsterId: 78, gearName: "旧版灯", power: 39 },
  { id: 64, monsterId: 79, gearName: "锁骑链", power: 41 },
  { id: 65, monsterId: 81, gearName: "黑曜拳", power: 43 },
  { id: 66, monsterId: 82, gearName: "双塔印", power: 45 },
  { id: 67, monsterId: 83, gearName: "分片角", power: 46 },
  { id: 68, monsterId: 84, gearName: "档案王冠", power: 50 },
  { id: 69, monsterId: 87, gearName: "魔将刃", power: 44 },
  { id: 70, monsterId: 89, gearName: "王兽牙", power: 48 },
] as const;
