/**
 * 浏览器存储的最小能力接口。
 *
 * 存档层只依赖这四个同步操作，因此测试可以注入内存实现，运行时也
 * 可以在 localStorage 不可用时提供降级实现。接口本身不负责序列化和校验。
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
