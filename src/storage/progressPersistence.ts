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
 * Coalesces movement and patrol snapshots into one trailing write while still
 * flushing combat, inventory, loot, query, and floor changes immediately.
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
