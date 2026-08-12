/** 存档数据的兼容克隆。旧浏览器可能没有 structuredClone。 */
export function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
