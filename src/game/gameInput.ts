/** 输入边界工具：区分游戏快捷键和被 UI/输入框消费的键盘事件。 */
import type { Position } from "../domain/types";

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
