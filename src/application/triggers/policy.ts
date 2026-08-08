/**
 * 触发距离和低频事件策略。
 *
 * 触发范围与 E 键交互范围不同：Agent 使用半径为 2 的圆形范围，实际
 * 篝火菜单仍由 GameSession 的相邻交互规则控制。
 */
import type { GameSnapshot } from "../../contracts/game/snapshots";

export const CAMPFIRE_TRIGGER_RADIUS = 2;

export function inCampfireRange(snapshot: GameSnapshot, campfireId: string): boolean {
  const campfire = snapshot.campfires.find((entry) => entry.id === campfireId);
  if (!campfire) return false;
  const dx = campfire.x - snapshot.player.x;
  const dy = campfire.y - snapshot.player.y;
  return dx * dx + dy * dy <= CAMPFIRE_TRIGGER_RADIUS * CAMPFIRE_TRIGGER_RADIUS;
}
