/**
 * 开发态试玩入口与临时内存存储。
 *
 * 本模块只判断页面是否具备启用桥的三重条件，并为试玩创建不持久化的 Run/Profile
 * 适配器。它不安装全局桥、执行管理员动作或读取浏览器正式存储；生产构建必须通过
 * `import.meta.env.DEV` 分支将调用路径整体裁掉。
 */

import type { DataStore } from "../../infrastructure/storage/browserDataStore";
import {
  createEmptyProfile,
  isProfileProgress,
  isSavedRun,
} from "../../infrastructure/storage/localProgress";
import type { StorageLike } from "../../contracts/storage/storageLike";
import type { FloorNumber } from "../../domain/progression/runGraph";
import type { ProfileProgress, SavedRun } from "../../domain/shared/types";

/** MVP 只有一条 Agent 闭环；答案辅助属于桥内部能力，不再暴露 Smoke 模式。 */
export type PlaytestMode = "agent";

/** 经 URL 和环境校验后的试玩启动参数。 */
export interface PlaytestLaunch {
  mode: PlaytestMode;
  floor: FloorNumber;
}

/** 当前页面是否消费了维护器刷新前写入的一次性检查点。 */
export type PlaytestCheckpointState = "none" | "restored" | "invalid";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CHECKPOINT_KEY = "dungeon.playtest.reload.v1";

interface PlaytestCheckpoint {
  schemaVersion: 1;
  run: SavedRun;
  profile: ProfileProgress;
}

/**
 * 解析并校验试玩入口。
 * @param url 当前页面 URL，只允许本机 HTTP(S) 解析结果中的本机主机名。
 * @param isDev Vite 开发构建标志；生产值必须为 `false`。
 * @returns 合法楼层与固定 `agent` 模式，否则返回 `null`。
 */
export function playtestLaunchFromUrl(
  url: URL,
  isDev: boolean,
): PlaytestLaunch | null {
  if (!isDev || !LOCAL_HOSTS.has(url.hostname)) return null;
  const mode = url.searchParams.get("playtest");
  if (mode !== "agent") return null;
  const rawFloor = url.searchParams.get("floor") ?? "1";
  const floor = Number(rawFloor);
  if (!Number.isInteger(floor) || floor < 1 || floor > 8) return null;
  return { mode, floor: floor as FloorNumber };
}

/** 临时试玩所需的最小数据与引导存储组合。 */
export type PlaytestStore = DataStore & StorageLike & {
  readonly checkpointState: PlaytestCheckpointState;
};

/**
 * 创建页面内存试玩存储。
 * @returns 只保留当前页面引导键值的适配器；Run 与 Profile 写入被有意丢弃。
 * @remarks 不读取 IndexedDB、localStorage 或用户正式 Profile。
 */
export function createPlaytestStore(
  checkpointStorage: StorageLike | null = null,
): PlaytestStore {
  const values = new Map<string, string>();
  let run: SavedRun | null = null;
  let profile = createEmptyProfile();
  let checkpointState: PlaytestCheckpointState = "none";
  if (checkpointStorage) {
    let raw: string | null = null;
    try {
      raw = checkpointStorage.getItem(CHECKPOINT_KEY);
      checkpointStorage.removeItem(CHECKPOINT_KEY);
    } catch {
      checkpointState = "invalid";
    }
    if (raw) {
      try {
        const value: unknown = JSON.parse(raw);
        if (
          value && typeof value === "object"
          && "schemaVersion" in value && value.schemaVersion === 1
          && "run" in value && isSavedRun(value.run)
          && "profile" in value && isProfileProgress(value.profile)
        ) {
          run = value.run;
          profile = value.profile;
          checkpointState = "restored";
        } else {
          checkpointState = "invalid";
        }
      } catch {
        checkpointState = "invalid";
        // 损坏的一次性检查点直接丢弃；调用方会通过刷新前后投影不一致明确阻断修复。
      }
    }
  }
  return {
    checkpointState,
    loadRun: () => run,
    loadProfile: () => profile,
    saveRun: (_value: SavedRun) => undefined,
    saveProfile: (_value: ProfileProgress) => undefined,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

/**
 * 把当前试玩状态写入临时页面会话，供紧接着的一次源码刷新恢复。
 *
 * @param storage 当前临时 Chromium Context 的 sessionStorage；不可传正式数据存储。
 * @param run GameSession 生成的完整 Run，仅留在浏览器内部，不返回给 Node 或模型。
 * @param profile 当前临时 Profile。
 * @returns 写入是否成功；失败时维护器必须停止刷新复测。
 */
export function savePlaytestCheckpoint(
  storage: StorageLike,
  run: SavedRun,
  profile: ProfileProgress,
): boolean {
  const value: PlaytestCheckpoint = { schemaVersion: 1, run, profile };
  try {
    storage.setItem(CHECKPOINT_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
