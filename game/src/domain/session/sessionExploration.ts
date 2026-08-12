/**
 * GameSession 的探索结果辅助函数。
 *
 * 本模块只处理移动相关的纯结果和状态判断，不读取或修改 GameSession，
 * 也不接触地图渲染、存档和 DOM。这样协调器可以集中提交状态变化。
 */
import type {
  MoveResolution,
  PlayMode,
  Position,
} from "../shared/types";

const MOVEMENT_BLOCKED_MODES: readonly PlayMode[] = [
  "campfire",
  "inventory",
  "loot",
  "death-review",
  "challenge",
  "combat",
  "transition",
  "victory",
  "defeat",
];

/** 判断当前模式是否禁止玩家移动。 */
export function movementModeIsBlocked(mode: PlayMode): boolean {
  return MOVEMENT_BLOCKED_MODES.includes(mode);
}

/** 创建一次没有副作用的移动失败结果。 */
export function movementFailure(
  from: Position,
  to: Position,
  blockedBy: MoveResolution["blockedBy"],
  message: string,
): MoveResolution {
  return {
    ok: false,
    moved: false,
    from,
    to,
    encounterId: null,
    pickedItemIds: [],
    blockedBy,
    hazard: null,
    message,
  };
}
