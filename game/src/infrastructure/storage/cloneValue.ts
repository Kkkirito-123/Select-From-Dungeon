/** 存档数据的深克隆；没有 structuredClone 时使用 JSON 兜底。 */
export function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
