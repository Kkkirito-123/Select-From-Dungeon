/**
 * 浏览器本地 Run 与永久 Profile 的存储门面。
 *
 * 本模块只协调当前键的读写与容错。Run 不变量和 Profile 编解码分别由
 * 相邻功能模块负责。
 */
import type { ProfileProgress, SavedRun } from "../../contracts/game/persistence";
import type { StorageLike } from "../../contracts/storage/storageLike";
import {
  createEmptyProfile,
  encodeProfile,
  isProfileProgress,
} from "./profileCodec";
import { decodeRunJson, encodeRun } from "./runCodec";
import { isSavedRun } from "./runValidator";

export const RUN_SAVE_KEY = "select-from-dungeon:run:v12";
export const PROFILE_SAVE_KEY = "select-from-dungeon:profile:v3";

// 保留原有导入路径；调用方不需要知道内部验证文件。
export type { StorageLike } from "../../contracts/storage/storageLike";
export { createEmptyProfile, isProfileProgress } from "./profileCodec";
export { isSavedRun } from "./runValidator";

function safeGetItem(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function readJson(storage: StorageLike, key: string): unknown {
  return decodeRunJson(safeGetItem(storage, key));
}

/** 从当前键读取并验证 v12 Run；任何异常都返回 null。 */
export function loadRun(storage: StorageLike): SavedRun | null {
  const value = readJson(storage, RUN_SAVE_KEY);
  return isSavedRun(value) ? value : null;
}

/** 从当前键读取 v3 永久档案；无效数据回退为空档案。 */
export function loadProfile(storage: StorageLike): ProfileProgress {
  const value = readJson(storage, PROFILE_SAVE_KEY);
  return isProfileProgress(value) ? value : createEmptyProfile();
}

/** 序列化 Run；浏览器存储拒绝写入时静默保留内存状态。 */
export function saveRun(storage: StorageLike, run: SavedRun): void {
  try {
    storage.setItem(RUN_SAVE_KEY, encodeRun(run));
  } catch {
    // 沙箱 iframe 和隐私模式可能拒绝 localStorage 写入。
  }
}

/** 序列化永久档案；返回 false 表示浏览器存储不可写。 */
export function saveProfile(storage: StorageLike, profile: ProfileProgress): boolean {
  try {
    storage.setItem(PROFILE_SAVE_KEY, encodeProfile(profile));
    return true;
  } catch {
    // 即使无法持久化，内存中的 GameSession 仍应保持可玩。
    return false;
  }
}

/** 返回已经确认持久化的 JSON；写入失败时保留旧值供后续重试。 */
export function persistProfileIfChanged(
  storage: StorageLike,
  profile: ProfileProgress,
  lastPersistedJson: string,
): string {
  const nextJson = JSON.stringify(profile);
  if (nextJson === lastPersistedJson) return lastPersistedJson;
  return saveProfile(storage, profile) ? nextJson : lastPersistedJson;
}

export function clearRun(storage: StorageLike): void {
  try {
    storage.removeItem(RUN_SAVE_KEY);
  } catch {
    // 被阻止访问的存储区域本身就等价于一个空的已持久化 Run。
  }
}
