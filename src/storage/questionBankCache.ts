/**
 * 浏览器 IndexedDB 题库缓存。
 * 只缓存通过 Manifest 校验的版本化字节，保证进行中的 Run 不被半更新题库替换。
 */
/**
 * 浏览器 IndexedDB 题库缓存。
 * 只缓存通过 Manifest 校验的版本化字节，保证进行中的 Run 不被半更新题库替换。
 */
export const CONTENT_DATABASE_NAME = "select-from-dungeon-content";
export const CONTENT_DATABASE_VERSION = 1;

export interface CachedQuestionBank {
  /** 一份已校验题库的版本、字节和摘要。 */
  /** 一份已校验题库的版本、字节和摘要。 */
  bankVersion: string;
  schemaVersion: number;
  sha256: string;
  byteLength: number;
  bytes: ArrayBuffer;
  storedAt: number;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  // 将 IndexedDB 事件接口转换为可组合的 Promise。
  // 将 IndexedDB 事件接口转换为可组合的 Promise。
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("content cache request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  // 只有事务 complete 才视为持久化成功。
  // 只有事务 complete 才视为持久化成功。
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("content cache aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("content cache failed"));
  });
}

async function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  // 数据库结构只保留一个题库 store，避免与学习账本混用。
  // 数据库结构只保留一个题库 store，避免与学习账本混用。
  const request = factory.open(CONTENT_DATABASE_NAME, CONTENT_DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains("question_banks")) {
      request.result.createObjectStore("question_banks", { keyPath: "bankVersion" });
    }
  };
  return requestResult(request);
}

export class QuestionBankCache {
  /** 负责版本化题库的读取、写入和 IndexedDB 不可用时的降级。 */
  /** 负责版本化题库的读取、写入和 IndexedDB 不可用时的降级。 */
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | null = globalThis.indexedDB ?? null) {}

  async get(bankVersion: string): Promise<CachedQuestionBank | null> {
    // 只返回请求版本，避免旧题库覆盖当前 Run。
    // 只返回请求版本，避免旧题库覆盖当前 Run。
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
    // 写入完整校验结果；浏览器存储失败只影响缓存，不影响游戏。
    // 写入完整校验结果；浏览器存储失败只影响缓存，不影响游戏。
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
    // 延迟打开数据库，避免页面启动时阻塞不使用题库的场景。
    // 延迟打开数据库，避免页面启动时阻塞不使用题库的场景。
    if (!this.factory) return Promise.reject(new Error("IndexedDB unavailable"));
    this.databasePromise ??= openDatabase(this.factory);
    return this.databasePromise;
  }
}
