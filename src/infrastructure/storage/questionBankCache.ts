/**
 * 题库二进制的 IndexedDB 缓存。
 *
 * 缓存只用于提升启动时加载速度，不能成为题库版本或玩家进度的真相。
 * 读写失败时返回 null/false，让上层决定使用网络资源或本地降级路径。
 */
export const CONTENT_DATABASE_NAME = "select-from-dungeon-content";
export const CONTENT_DATABASE_VERSION = 1;

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

async function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(CONTENT_DATABASE_NAME, CONTENT_DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains("question_banks")) {
      request.result.createObjectStore("question_banks", { keyPath: "bankVersion" });
    }
  };
  return requestResult(request);
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
    this.databasePromise ??= openDatabase(this.factory);
    return this.databasePromise;
  }
}
