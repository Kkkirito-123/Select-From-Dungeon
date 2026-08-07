/**
 * Run JSON 编解码边界。
 *
 * 本模块只负责 JSON 的解析和 v12 Run 的序列化，不判断地图、课程或迁移
 * 不变量。结构校验仍由 localProgress 的验证器负责，避免编码层偷偷新增规则。
 */
import type { SavedRun } from "../../contracts/game/persistence";

/** 解析浏览器存储中的 JSON；空值或损坏 JSON 统一返回 null。 */
export function decodeRunJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** 序列化已经通过校验的 v12 Run。 */
export function encodeRun(run: SavedRun): string {
  return JSON.stringify(run);
}
