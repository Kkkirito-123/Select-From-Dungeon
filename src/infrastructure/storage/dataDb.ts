/** 统一的浏览器数据数据库。 */

export const DATA_DB_NAME = "select-from-dungeon-data";
export const DATA_DB_VERSION = 1;
export const OLD_LEARNING_DB = "select-from-dungeon-learning";
export const OLD_CONTENT_DB = "select-from-dungeon-content";

export const DATA_STORES = {
  meta: "meta",
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
    if (!database.objectStoreNames.contains(DATA_STORES.meta)) {
      database.createObjectStore(DATA_STORES.meta, { keyPath: "key" });
    }
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

type ListedDb = { name?: string };
type ListedFactory = IDBFactory & {
  databases?: () => Promise<readonly ListedDb[]>;
};

async function oldDbNames(factory: IDBFactory): Promise<Set<string> | null> {
  const list = await (factory as ListedFactory).databases?.();
  if (!list) return null;
  return new Set(
    list
      .map((item) => item.name)
      .filter((name): name is string => Boolean(name)),
  );
}

function openOldDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      reject(new Error(`old database ${name} does not exist`));
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("old database open failed"));
  });
}

async function readOldStores(
  factory: IDBFactory,
  name: string,
  stores: readonly string[],
): Promise<Record<string, unknown[]>> {
  const database = await openOldDatabase(factory, name);
  const result: Record<string, unknown[]> = {};
  try {
    for (const storeName of stores) {
      if (!database.objectStoreNames.contains(storeName)) {
        result[storeName] = [];
        continue;
      }
      const transaction = database.transaction(storeName, "readonly");
      result[storeName] = await requestResult<unknown[]>(transaction.objectStore(storeName).getAll());
      await transactionDone(transaction);
    }
    return result;
  } finally {
    database.close();
  }
}

/** 把旧的两个 IndexedDB 复制进统一库，旧库保留作为恢复来源。 */
export async function migrateOldData(
  factory: IDBFactory,
  database: IDBDatabase,
): Promise<void> {
  const marker = await readNode<{ key: string }>(
    database,
    DATA_STORES.meta,
    "old-db-v1",
  );
  if (marker) return;

  const names = await oldDbNames(factory);
  const mayExist = (name: string): boolean => names === null || names.has(name);
  const learning: Record<string, unknown[]> = mayExist(OLD_LEARNING_DB)
    ? await readOldStores(factory, OLD_LEARNING_DB, [
      DATA_STORES.attempts,
      DATA_STORES.questionStats,
      DATA_STORES.lessonStats,
    ]).catch(() => ({} as Record<string, unknown[]>))
    : {};
  const content: Record<string, unknown[]> = mayExist(OLD_CONTENT_DB)
    ? await readOldStores(factory, OLD_CONTENT_DB, [DATA_STORES.questionBanks])
      .catch(() => ({} as Record<string, unknown[]>))
    : {};

  const values: { store: DataStoreName; value: object }[] = [];
  for (const value of learning[DATA_STORES.attempts] ?? []) {
    values.push({ store: DATA_STORES.attempts, value: value as object });
  }
  for (const value of learning[DATA_STORES.questionStats] ?? []) {
    values.push({ store: DATA_STORES.questionStats, value: value as object });
  }
  for (const value of learning[DATA_STORES.lessonStats] ?? []) {
    values.push({ store: DATA_STORES.lessonStats, value: value as object });
  }
  for (const value of content[DATA_STORES.questionBanks] ?? []) {
    values.push({ store: DATA_STORES.questionBanks, value: value as object });
  }
  values.push({ store: DATA_STORES.meta, value: { key: "old-db-v1", copied: true } });
  await writeNodes(
    database,
    [
      DATA_STORES.meta,
      DATA_STORES.attempts,
      DATA_STORES.questionStats,
      DATA_STORES.lessonStats,
      DATA_STORES.questionBanks,
    ],
    values,
  );
}
