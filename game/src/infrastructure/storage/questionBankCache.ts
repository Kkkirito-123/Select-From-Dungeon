/**
 * 统一数据数据库中的题库缓存。
 *
 * 缓存只用于提升启动时加载速度，不能成为题库版本或玩家进度的真相。
 * 读写失败时返回 null/false，让上层决定使用网络资源或本地降级路径。
 */
import { DATA_DB_NAME, DATA_DB_VERSION, openDataDatabase } from "./dataDb";

export const CONTENT_DATABASE_NAME = DATA_DB_NAME;
export const CONTENT_DATABASE_VERSION = DATA_DB_VERSION;

export interface CachedQuestionBank {
  bankVersion: string;
  schemaVersion: number;
  sha256: string;
  byteLength: number;
  bytes: ArrayBuffer;
  storedAt: number;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("content cache request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("content cache aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("content cache failed"));
  });
}

export class QuestionBankCache {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | null = globalThis.indexedDB ?? null) {}

  async get(bankVersion: string): Promise<CachedQuestionBank | null> {
    if (!this.factory) return null;
    try {
      const database = await this.database();
      const transaction = database.transaction("question_banks", "readonly");
      const value = await requestResult<CachedQuestionBank | undefined>(
        transaction.objectStore("question_banks").get(bankVersion),
      );
      await transactionComplete(transaction);
      return value ?? null;
    } catch {
      return null;
    }
  }

  async put(value: CachedQuestionBank): Promise<boolean> {
    if (!this.factory) return false;
    try {
      const database = await this.database();
      const transaction = database.transaction("question_banks", "readwrite");
      transaction.objectStore("question_banks").put(value);
      await transactionComplete(transaction);
      return true;
    } catch {
      return false;
    }
  }

  private database(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error("IndexedDB unavailable"));
    this.databasePromise ??= openDataDatabase(this.factory);
    return this.databasePromise;
  }
}
