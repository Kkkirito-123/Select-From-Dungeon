/** 存档写入协调器：合并高频移动快照，并对战斗、背包和拓扑变化立即落盘。 */
import type { GameSession } from "../domain/GameSession";
import type { GameSnapshot } from "../domain/types";
import { STORAGE_RUNTIME_CONFIG } from "../config/runtimeConfig";
import {
  persistProfileIfChanged,
  saveRun,
  type StorageLike,
} from "./localProgress";

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

export function persistenceFingerprint(
  snapshot: GameSnapshot,
): PersistenceFingerprint {
  // 指纹只包含需要立即保存的关键字段，不记录移动轨迹或按键。
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
  // 关键状态变化立即刷盘，普通移动则交给尾随防抖写入。
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
  storage: StorageLike,
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
    saveRun(storage, source.toSavedRun());
    lastProfileJson = persistProfileIfChanged(
      storage,
      source.toProfile(),
      lastProfileJson,
    );
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
