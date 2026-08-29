/** 统一的浏览器数据数据库。 */

export const DATA_DB_NAME = "select-from-dungeon-data";
export const DATA_DB_VERSION = 1;

export const DATA_STORES = {
  run: "run_nodes",
  floor: "floor_nodes",
  profile: "profile_nodes",
  guide: "guide_nodes",
  attempts: "attempts",
  questionStats: "question_stats",
  lessonStats: "lesson_stats",
  questionBanks: "question_banks",
} as const;

type DataStoreName = typeof DATA_STORES[keyof typeof DATA_STORES];

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("data request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("data transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("data transaction failed"));
  });
}

export function openDataDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DATA_DB_NAME, DATA_DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(DATA_STORES.run)) {
      database.createObjectStore(DATA_STORES.run, { keyPath: "key" });
    }
    if (!database.objectStoreNames.contains(DATA_STORES.floor)) {
      const floors = database.createObjectStore(DATA_STORES.floor, { keyPath: "key" });
      floors.createIndex("runId", "runId");
      floors.createIndex("floor", "floor");
    }
    if (!database.objectStoreNames.contains(DATA_STORES.profile)) {
      database.createObjectStore(DATA_STORES.profile, { keyPath: "key" });
    }
    if (!database.objectStoreNames.contains(DATA_STORES.guide)) {
      database.createObjectStore(DATA_STORES.guide, { keyPath: "key" });
    }
    if (!database.objectStoreNames.contains(DATA_STORES.attempts)) {
      const attempts = database.createObjectStore(DATA_STORES.attempts, { keyPath: "attemptId" });
      attempts.createIndex("recordedAt", "recordedAt");
    }
    if (!database.objectStoreNames.contains(DATA_STORES.questionStats)) {
      database.createObjectStore(DATA_STORES.questionStats, { keyPath: "key" });
    }
    if (!database.objectStoreNames.contains(DATA_STORES.lessonStats)) {
      database.createObjectStore(DATA_STORES.lessonStats, { keyPath: "key" });
    }
    if (!database.objectStoreNames.contains(DATA_STORES.questionBanks)) {
      database.createObjectStore(DATA_STORES.questionBanks, { keyPath: "bankVersion" });
    }
  };
  return requestResult(request);
}

export async function readNode<T>(
  database: IDBDatabase,
  storeName: DataStoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  const transaction = database.transaction(storeName, "readonly");
  const value = await requestResult<T | undefined>(transaction.objectStore(storeName).get(key));
  await transactionDone(transaction);
  return value;
}

export async function writeNodes(
  database: IDBDatabase,
  storeNames: readonly DataStoreName[],
  values: readonly { store: DataStoreName; value: object }[],
): Promise<void> {
  const transaction = database.transaction([...storeNames], "readwrite");
  values.forEach(({ store, value }) => transaction.objectStore(store).put(value));
  await transactionDone(transaction);
}

export async function deleteNode(
  database: IDBDatabase,
  storeName: DataStoreName,
  key: IDBValidKey,
): Promise<void> {
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

export { transactionDone };
