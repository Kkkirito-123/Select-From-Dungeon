/**
 * Phaser 移动输入的边界判断。
 *
 * 这里不计算地图碰撞，也不修改 GameSession；它只判断当前场景是否可以
 * 发起一次移动，把真实移动交给注入的 session 门面。
 */
import type { GameSnapshot } from "../../../contracts/game/snapshots";

/** 判断一次移动请求是否可以进入 GameSession。 */
export function canStartMovement(
  locked: boolean,
  mode: GameSnapshot["mode"],
): boolean {
  return !locked && mode === "explore";
}
