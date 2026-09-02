/**
 * GameSession 到浏览器存档的运行时协调器。
 *
 * 它只监听快照并决定立即保存还是合并延迟保存，不参与规则计算。关键
 * 状态变化（查询、模式、物品、背包和地图拓扑）立即落盘，普通移动可
 * 在短窗口内合并；页面隐藏或销毁时由调用方显式 flush/destroy。
 */
import type { GameSession } from "../../features/game-session/GameSession";
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
  /** 当前会话模式，例如 "explore"、"combat" 或 "campfire"。 */
  mode: string;
  /** 已执行 SQL 回合数；查询成功/失败都属于需要立即保存的进度。 */
  queryCount: number;
  /** 地面物品与战利品包的稳定 ID 串，用于检测拾取、丢弃和生成变化。 */
  itemIds: string;
  /** 装备、护甲耐久和恢复品数量的 JSON 快照。 */
  inventoryState: string;
  /** 迷宫拓扑签名；换楼层或迁移地图后必须立即写入。 */
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
  // 这个指纹不是完整存档，而是“是否需要立即落盘”的廉价判断。
  // 例如 inventoryState 可能序列化为：
  // {"weapon":"filter-bow","armor":null,"armorHp":0,
  //  "equipment":["filter-bow"],"consumables":[["minor-potion",2]]}
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
  // 首次收到快照必须保存；之后只要关键字段变化，就跳过 debounce 窗口直接写入。
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
 * 数据始终由同一个 GameSession 快照导出为 Run 与 Profile，存储层不反向修改规则状态。
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
    // Run 和 Profile 同时从同一时刻读取，避免保存出“局内状态已前进、永久档案未更新”的组合。
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
    // 管理员模式是内存预览，不能覆盖玩家正式存档；离开预览后才恢复正常保存。
    if (adminPreview || source.snapshot().adminMode) return;
    persistCurrent();
  };
  const schedule = (): void => {
    clearPending();
    timer = timerApi.setTimeout(flush, PROGRESS_SAVE_DEBOUNCE_MS);
  };

  // 持久化与界面共享同一快照发布源，再按变化类型选择立即写入或合并写入。
  const unsubscribe = source.subscribe((snapshot) => {
    if (destroyed) return;
    if (snapshot.adminMode) {
      // 切入管理员预览前，先把尚未执行的正式延迟写入完成，随后冻结持久化。
      const hadPendingFormalSave = timer !== null;
      clearPending();
      if (!adminPreview && hadPendingFormalSave) persistCurrent();
      adminPreview = true;
      return;
    }
    const current = persistenceFingerprint(snapshot);
    const critical = isCriticalPersistenceChange(previousFingerprint, current);
    previousFingerprint = current;
    // 关键变化立即写入；普通移动只保留最后一次快照，减少高频巡逻/移动造成的存储写入。
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
