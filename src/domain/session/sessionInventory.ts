/**
 * GameSession 背包命令的纯结果辅助函数。
 *
 * 物品容量、装备和掉落规则仍由 GameSession 与 inventory domain 决定；
 * 这里不持有背包状态，只统一失败结果的形状。
 */
import type { InventoryResolution } from "../shared/types";

/** 创建背包操作失败结果。 */
export function inventoryFailure(message: string): InventoryResolution {
  return { ok: false, message, remainingItemIds: [] };
}
