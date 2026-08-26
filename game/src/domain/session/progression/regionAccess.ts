/**
 * GameSession 的区域首领访问规则。
 *
 * 本模块只判断权威怪物生命状态，不读取地图、不修改会话，也不把相邻楼层当成
 * 运行时依赖。导航与传送调用方共享同一“生命值大于零才存活”的定义。
 */
import type { Monster } from "../../shared/types";

/** 查找仍能阻挡区域通道的指定首领。 */
export function livingRequiredBoss(
  monsters: readonly Monster[],
  requiredBossId: number,
): Monster | null {
  return monsters.find((monster) => (
    monster.id === requiredBossId && monster.hp > 0
  )) ?? null;
}
