/** 浏览器端统一数据树。 */
import { GUIDE_KEY } from "../../contracts/storage/keys";
import type { StorageLike } from "../../contracts/storage/storageLike";
import type { ProfileProgress, SavedRun } from "../../domain/shared/types";
import {
  createEmptyProfile,
  isSavedRun,
  loadProfile as loadOldProfile,
  loadRun as loadOldRun,
  PROFILE_SAVE_KEY,
  RUN_SAVE_KEY,
  saveProfile as saveOldProfile,
  saveRun as saveOldRun,
} from "./localProgress";
import {
  DATA_STORES,
  deleteNode,
  migrateOldData,
  openDataDatabase,
  readNode,
  writeNodes,
} from "./dataDb";
import {
  CURRENT_KEY,
  floorKey,
  joinRun,
  splitRun,
  TREE_SCHEMA,
  type FloorNode,
  type GuideNode,
  type ProfileNode,
  type RunNode,
} from "./dataTree";
import { cloneValue } from "./cloneValue";

export interface DataStore {
  loadRun(): SavedRun | null;
  loadProfile(): ProfileProgress;
  saveRun(value: SavedRun): void;
  saveProfile(value: ProfileProgress): void;
}

export class BrowserDataStore implements DataStore {
  private database: IDBDatabase | null = null;
  private run: SavedRun | null = null;
  private profile: ProfileProgress = createEmptyProfile();
  private guide: string | null = null;
  private writes = Promise.resolve();

  private constructor(private readonly fallback: StorageLike) {}

  static async open(
    fallback: StorageLike,
    factory: IDBFactory | null = globalThis.indexedDB ?? null,
  ): Promise<BrowserDataStore> {
    const store = new BrowserDataStore(fallback);
    await store.init(factory);
    return store;
  }

  loadRun(): SavedRun | null {
    return this.run ? cloneValue(this.run) : null;
  }

  loadProfile(): ProfileProgress {
    return cloneValue(this.profile);
  }

  saveRun(value: SavedRun): void {
    this.run = cloneValue(value);
    if (!this.database) {
      saveOldRun(this.fallback, value);
      return;
    }
    const tree = splitRun(value);
    this.queue(() => writeNodes(
      this.database as IDBDatabase,
      [DATA_STORES.run, DATA_STORES.floor],
      [
        { store: DATA_STORES.run, value: tree.run },
        { store: DATA_STORES.floor, value: tree.floor },
      ],
    ));
  }

  saveProfile(value: ProfileProgress): void {
    this.profile = cloneValue(value);
    if (!this.database) {
      saveOldProfile(this.fallback, value);
      return;
    }
    const node: ProfileNode = {
      key: CURRENT_KEY,
      schema: TREE_SCHEMA,
      data: cloneValue(value),
    };
    this.queue(() => writeNodes(
      this.database as IDBDatabase,
      [DATA_STORES.profile],
      [{ store: DATA_STORES.profile, value: node }],
    ));
  }

  getItem(key: string): string | null {
    if (key === GUIDE_KEY) return this.guide;
    return this.fallback.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (key !== GUIDE_KEY) {
      this.fallback.setItem(key, value);
      return;
    }
    this.guide = value;
    if (!this.database) {
      this.fallback.setItem(key, value);
      return;
    }
    const node: GuideNode = {
      key: CURRENT_KEY,
      schema: TREE_SCHEMA,
      value,
    };
    this.queue(() => writeNodes(
      this.database as IDBDatabase,
      [DATA_STORES.guide],
      [{ store: DATA_STORES.guide, value: node }],
    ));
  }

  removeItem(key: string): void {
    if (key !== GUIDE_KEY) {
      this.fallback.removeItem(key);
      return;
    }
    this.guide = null;
    if (!this.database) {
      this.fallback.removeItem(key);
      return;
    }
    this.queue(() => deleteNode(
      this.database as IDBDatabase,
      DATA_STORES.guide,
      CURRENT_KEY,
    ));
  }

  close(): void {
    const database = this.database;
    this.database = null;
    void this.writes.finally(() => database?.close());
  }

  private async init(factory: IDBFactory | null): Promise<void> {
    if (!factory) {
      this.loadFallback();
      return;
    }
    try {
      this.database = await openDataDatabase(factory);
      await migrateOldData(factory, this.database);
      const runNode = await readNode<RunNode>(this.database, DATA_STORES.run, CURRENT_KEY);
      const profileNode = await readNode<ProfileNode>(this.database, DATA_STORES.profile, CURRENT_KEY);
      const guideNode = await readNode<GuideNode>(this.database, DATA_STORES.guide, CURRENT_KEY);

      if (runNode?.schema === TREE_SCHEMA) {
        const floor = await readNode<FloorNode>(
          this.database,
          DATA_STORES.floor,
          floorKey(runNode.data.runInstanceId, runNode.data.floor),
        );
        const joined = floor?.schema === TREE_SCHEMA ? joinRun(runNode, floor) : null;
        this.run = joined && isSavedRun(joined) ? joined : null;
      }
      if (!this.run) {
        const oldRun = loadOldRun(this.fallback);
        if (oldRun) this.saveRun(oldRun);
      }

      this.profile = profileNode?.schema === TREE_SCHEMA
        ? cloneValue(profileNode.data)
        : loadOldProfile(this.fallback);
      if (!profileNode && this.fallback.getItem(PROFILE_SAVE_KEY)) {
        this.saveProfile(this.profile);
      }

      this.guide = guideNode?.schema === TREE_SCHEMA
        ? guideNode.value
        : this.fallback.getItem(GUIDE_KEY);
      if (!guideNode && this.guide !== null) this.setItem(GUIDE_KEY, this.guide);
    } catch {
      this.database?.close();
      this.database = null;
      this.loadFallback();
    }
  }

  private loadFallback(): void {
    this.run = loadOldRun(this.fallback);
    this.profile = loadOldProfile(this.fallback);
    this.guide = this.fallback.getItem(GUIDE_KEY);
  }

  private queue(task: () => Promise<void>): void {
    this.writes = this.writes.then(task, task).catch(() => undefined);
  }
}

export { GUIDE_KEY, RUN_SAVE_KEY };
