/**
 * 游戏输入边界。
 * 负责判断键盘事件是否被 DOM 控件捕获，并验证外部移动事件的形状；不
 * 直接调用 GameSession，也不解释游戏规则。
 */
import type { Position } from "../../domain/shared/types";

const UI_CAPTURE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[role='slider']",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='dialog'][aria-hidden='false']",
].join(",");

interface ClosestTarget {
  closest: (selector: string) => unknown;
}

function hasClosest(target: EventTarget | null): target is EventTarget & ClosestTarget {
  return typeof (target as Partial<ClosestTarget> | null)?.closest === "function";
}

export function isGameplayShortcutCaptured(target: EventTarget | null): boolean {
  return hasClosest(target) && Boolean(target.closest(UI_CAPTURE_SELECTOR));
}

export function parseExternalMoveDetail(detail: unknown): Position | null {
  if (!detail || typeof detail !== "object") return null;
  const { dx, dy } = detail as { dx?: unknown; dy?: unknown };
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) return null;
  if (Math.abs(Number(dx)) + Math.abs(Number(dy)) !== 1) return null;
  return { x: Number(dx), y: Number(dy) };
}
