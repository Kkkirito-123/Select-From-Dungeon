/**
 * GameSession 交互命令的纯结果辅助函数。
 *
 * 交互失败的提示提交仍由 GameSession 负责；本模块只构造返回值，避免
 * 存档、UI 和 Phaser 逻辑渗入领域结果格式。
 */
import type {
  InteractionResolution,
  TravelResolution,
} from "../shared/types";

/** 创建一个没有命中实体的交互失败结果。 */
export function interactionFailure(message: string): InteractionResolution {
  return { ok: false, kind: "none", message };
}

/** 创建一个房间旅行失败结果。 */
export function travelFailure(
  roomId: string,
  message: string,
): TravelResolution {
  return { ok: false, roomId, message };
}
