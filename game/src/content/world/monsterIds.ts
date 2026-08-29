/** 怪物稳定显示 ID 与随机流身份，不创建运行时怪物。 */
import type { FloorNumber } from "../../domain/progression/runGraph";

export const MONSTER_ID_COUNT = 89;

export const CURRENT_MONSTER_IDS_BY_FLOOR: Readonly<
  Record<FloorNumber, readonly number[]>
> = {
  1: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  2: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
  3: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
  4: [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44],
  5: [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55],
  6: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66],
  7: [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77],
  8: [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89],
};

const EARLY_MONSTER_RANDOM_IDS = [
  101, 201, 301, 800, 900, 111, 211, 311, 810,
  1200, 1300, 1400, 1500, 1900, 1210, 1310, 1410, 1510, 1610, 1710, 1810, 1911,
] as const;

/** 保持当前巡逻和可选掉落的确定性结果与显示 ID 解耦。 */
export function monsterRandomSeedId(id: number): number {
  if (id >= 23 && id <= MONSTER_ID_COUNT) return id - 22;
  return EARLY_MONSTER_RANDOM_IDS[id - 1] ?? id;
}
