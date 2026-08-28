/** 仅把普通对象识别为 JSON record，数组和 null 都不算对象记录。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 生成与键顺序无关的 JSON 文本。
 * 例：{ b: 2, a: 1 } 与 { a: 1, b: 2 } 都会得到 {"a":1,"b":2}，
 * 这样稳定 Hash 才能用于缓存键和请求去重。
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** 对 Agent 请求投影做摘要，不把原文写进 telemetry 或日志。 */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) => (
    byte.toString(16).padStart(2, "0")
  )).join("");
}

export const HASH_PATTERN = /^[0-9a-f]{64}$/u;
/** 拒绝 HTML、脚本协议和工具调用标记，避免远程文案被当成指令或标记解析。 */
export const HTML_OR_TOOL_MARKER = /<[^>]*>|javascript:|tool_call|function_call|<script/iu;

/** 校验外部返回的纯文本字段，maximum 同时限制网络响应和 UI 展示长度。 */
export function validPlainText(value: unknown, maximum: number): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !value.includes("\u0000") &&
    !HTML_OR_TOOL_MARKER.test(value);
}

/** 优先使用 UUID；旧环境没有 randomUUID 时再退回带时间和随机串的 ID。 */
export function requestId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
