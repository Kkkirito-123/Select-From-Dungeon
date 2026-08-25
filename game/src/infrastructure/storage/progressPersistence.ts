/**
 * GameSession 到浏览器存档的运行时协调器。
 *
 * 它只监听快照并决定立即保存还是合并延迟保存，不参与规则计算。关键
 * 状态变化（查询、模式、物品、背包和地图拓扑）立即落盘，普通移动可
 * 在短窗口内合并；页面隐藏或销毁时由调用方显式 flush/destroy。
 */
import type { GameSession } from "../../domain/session/GameSession";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import { STORAGE_RUNTIME_CONFIG } from "../../contracts/config/runtime";
import {
  persistProfileIfChanged,
  saveRun,
} from "./localProgress";
import type { StorageLike } from "../../contracts/storage/storageLike";
import type { ProfileProgress, SavedRun } from "../../domain/shared/types";

export const PROGRESS_SAVE_DEBOUNCE_MS = STORAGE_RUNTIME_CONFIG.progressSaveDebounceMs;

export interface PersistenceFingerprint {
  mode: string;
  queryCount: number;
  itemIds: string;
  inventoryState: string;
  topologyHash: number;
}

export interface ProgressPersistenceController {
  flush(): void;
  destroy(): void;
}

interface TimerApi {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timer: number): void;
}

type ProgressSource = Pick<
  GameSession,
  "subscribe" | "snapshot" | "toSavedRun" | "toProfile"
>;

export interface ProgressStore {
  saveRun(value: SavedRun): void;
  saveProfile(value: ProfileProgress): void;
}

type StorageTarget = StorageLike | ProgressStore;

function isProgressStore(value: StorageTarget): value is ProgressStore {
  return typeof (value as Partial<ProgressStore>).saveRun === "function" &&
    typeof (value as Partial<ProgressStore>).saveProfile === "function";
}

export function persistenceFingerprint(
  snapshot: GameSnapshot,
): PersistenceFingerprint {
  return {
    mode: snapshot.mode,
    queryCount: snapshot.queryCount,
    itemIds: [
      ...snapshot.groundItems.map((item) => item.id),
      ...snapshot.lootBundles.map((bundle) => (
        `${bundle.id}:${bundle.items.map((item) => item.dropId).join(",")}`
      )),
    ].sort().join("|"),
    inventoryState: JSON.stringify({
      weapon: snapshot.player.weapon.id,
      armor: snapshot.player.armor?.id ?? null,
      armorHp: snapshot.player.armorHp,
      equipment: snapshot.equipmentInventory.map((item) => item.instanceId),
      consumables: snapshot.consumables.map((stack) => [
        stack.item.id,
        stack.quantity,
      ]),
    }),
    topologyHash: snapshot.mazeFloor.topologyHash,
  };
}

export function isCriticalPersistenceChange(
  previous: PersistenceFingerprint | null,
  current: PersistenceFingerprint,
): boolean {
  return previous === null ||
    current.mode !== previous.mode ||
    current.queryCount !== previous.queryCount ||
    current.itemIds !== previous.itemIds ||
    current.inventoryState !== previous.inventoryState ||
    current.topologyHash !== previous.topologyHash;
}

/**
 * 将移动与巡逻快照合并为一次尾随写入，同时让战斗、背包、战利品、查询和
 * 楼层变化继续立即落盘。
 */
export function startProgressPersistence(
  source: ProgressSource,
  storage: StorageTarget,
  initialProfileJson: string,
  timerApi: TimerApi = window,
): ProgressPersistenceController {
  let timer: number | null = null;
  let lastProfileJson = initialProfileJson;
  let previousFingerprint: PersistenceFingerprint | null = null;
  let destroyed = false;
  let adminPreview = false;

  const clearPending = (): void => {
    if (timer === null) return;
    timerApi.clearTimeout(timer);
    timer = null;
  };
  const persistCurrent = (): void => {
    const run = source.toSavedRun();
    const profile = source.toProfile();
    if (isProgressStore(storage)) {
      storage.saveRun(run);
      const nextProfileJson = JSON.stringify(profile);
      if (nextProfileJson !== lastProfileJson) {
        storage.saveProfile(profile);
        lastProfileJson = nextProfileJson;
      }
      return;
    }
    saveRun(storage, run);
    lastProfileJson = persistProfileIfChanged(storage, profile, lastProfileJson);
  };
  const flush = (): void => {
    if (destroyed) return;
    clearPending();
    if (adminPreview || source.snapshot().adminMode) return;
    persistCurrent();
  };
  const schedule = (): void => {
    clearPending();
    timer = timerApi.setTimeout(flush, PROGRESS_SAVE_DEBOUNCE_MS);
  };
  const unsubscribe = source.subscribe((snapshot) => {
    if (destroyed) return;
    if (snapshot.adminMode) {
      const hadPendingFormalSave = timer !== null;
      clearPending();
      if (!adminPreview && hadPendingFormalSave) persistCurrent();
      adminPreview = true;
      return;
    }
    const current = persistenceFingerprint(snapshot);
    const critical = isCriticalPersistenceChange(previousFingerprint, current);
    previousFingerprint = current;
    if (critical) flush();
    else schedule();
  });

  return {
    flush,
    destroy: () => {
      if (destroyed) return;
      clearPending();
      unsubscribe();
      destroyed = true;
    },
  };
}
