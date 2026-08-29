/**
 * Dungeon Maintainer 与浏览器游戏之间的开发态协议和临时存储边界。
 *
 * 本文件负责三件事：校验 `DEV + 本机地址 + ?playtest=agent` 启动条件、声明协议 1.0
 * 的有限数据结构，以及创建不会接触正式 IndexedDB/localStorage 的页面内存存储。
 * 它不安装全局桥、不执行移动或 SQL，也不启动维护器进程。
 *
 * 输入来自当前页面 URL、Vite 的开发标志和临时 Chromium Context 的 sessionStorage；
 * 输出只包含经过校验的启动参数、一次性检查点状态和玩家可见协议类型。保存检查点
 * 会把完整 Run 暂存在当前临时 Context 的 sessionStorage，但不会返回 Node、模型或
 * 正式浏览器数据目录；读取后立即删除，损坏数据会被明确标记为 invalid。
 */

import type { StorageLike } from "../../contracts/storage/storageLike";
import type { FloorNumber } from "../../domain/progression/runGraph";
import type { ProfileProgress, SavedRun } from "../../domain/shared/types";
import type { DataStore } from "../../infrastructure/storage/browserDataStore";
import {
  createEmptyProfile,
  isProfileProgress,
  isSavedRun,
} from "../../infrastructure/storage/localProgress";

/** 维护器可以请求的两种语义移动目标。 */
export type DungeonAgentMoveTarget = "objective" | "frontier";

/** URL 校验成功后的唯一试玩模式。 */
export type DungeonAgentMode = "agent";

/** 当前页面启动开发桥所需的已校验参数。 */
export interface DungeonAgentLaunch {
  mode: DungeonAgentMode;
  floor: FloorNumber;
}

/** 当前页面对刷新检查点的消费结果。 */
export type DungeonAgentCheckpointState = "none" | "restored" | "invalid";

/** 玩家可见的稳定动作入口；`tool` 明确该 ID 由 act 还是 query 消费。 */
export interface DungeonAgentAction {
  id: string;
  label: string;
  tool: "act" | "query";
}

/** 不含坐标的当前导航目标和前置依赖说明。 */
export interface DungeonAgentTargetView {
  kind: "reward" | "prerequisite-reward" | "shortcut-key" | "objective" | "frontier";
  label: string;
  prerequisites: readonly string[];
  actionId: DungeonAgentMoveTarget;
}

/** 当前 SQL 终端向玩家展示的查询状态。 */
export type DungeonAgentQueryStatusKind =
  | "neutral"
  | "success"
  | "warning"
  | "error";

/** 当前战斗题面中实际渲染给玩家的结构化说明。 */
export interface DungeonAgentTaskView {
  tier: string;
  situation: string;
  goal: string;
  outputs: readonly string[];
  fields: readonly {
    expression: string;
    meaning: string;
  }[];
  relations: readonly string[];
  constraints: readonly string[];
  success: string;
}

/** 当前已打开 SQL 终端的玩家可见内容。 */
export interface DungeonAgentTerminalView {
  kind: "combat" | "challenge";
  title: string;
  objective: string;
  inputSql: string;
  status: {
    kind: DungeonAgentQueryStatusKind;
    text: string;
  };
  lessonId: string | null;
  stageId: string | null;
  stageIndex: number | null;
  task: DungeonAgentTaskView | null;
  schema: readonly string[];
  locks: readonly string[];
  hints: readonly string[];
  result: string;
  plan: readonly string[];
}

/**
 * 允许进入维护模型上下文的玩家视图。
 *
 * 只有当前已打开终端 textarea 中玩家已经看见的 SQL 可以进入 `terminal.inputSql`。
 * 完整地图、隐藏答案、管理员答案字段、身份档案、背包、正式存档和隐藏裁判结果均不属于该类型。
 */
export interface DungeonAgentView {
  /** 绑定当前玩家可见状态和动作集合；状态变化后旧修订必须拒绝执行。 */
  revision: string;
  floor: number;
  mode: string;
  hp: {
    current: number;
    max: number;
    armor: number;
  };
  progress: {
    lessons: number;
    rooms: number;
    moves: number;
    queries: number;
    hintLevel: number;
  };
  actions: readonly DungeonAgentAction[];
  target: DungeonAgentTargetView | null;
  room: string;
  mission: {
    title: string;
    body: string;
    lesson: string;
  };
  record: {
    kicker: string;
    title: string;
    body: string;
  } | null;
  terminal: DungeonAgentTerminalView | null;
  prompt: string;
  banner: string;
}

/** 一次真实语义动作的有限结果。 */
export interface DungeonAgentResult {
  ok: boolean;
  event: string;
  steps: number;
  view: DungeonAgentView;
}

/**
 * 仅供确定性验证层读取的隐藏裁判摘要。
 *
 * `look/act/query` 不得返回此结构，维护模型也没有直接调用 judge 的工具。
 */
export interface DungeonAgentJudge {
  floor: number;
  mode: string;
  lessons: number;
  requiredLessons: number;
  bossDefeated: boolean;
  migrationSteps: number;
  migrationComplete: boolean;
  advanced: boolean;
  stageIndex: number;
  claimableReward: string | null;
  bossHp: number | null;
  victories: number;
  guidanceDistance: number | null;
}

/** 页面内环形 Trace 对外提供的低敏语义事件。 */
export interface DungeonAgentEvent {
  sequence: number;
  type: string;
  summary: string;
}

/**
 * `window.__DUNGEON_PLAYTEST__` 暴露的唯一协议 1.0。
 *
 * 所有方法均不接受 JavaScript、CSS 选择器或鼠标坐标。act 只能消费当前 look 返回的
 * 修订与动作；query 把 SQL 写入当前固定玩家 textarea 后点击真实提交控件。
 */
export interface DungeonPlaytestBridge {
  readonly version: 1;
  readonly checkpointRestored: boolean;
  /** 仅供游戏拥有的 Benchmark Adapter 建立确定性起点。 */
  prepare(presetId: string): boolean;
  checkpoint(): boolean;
  look(): DungeonAgentView;
  act(
    revision: string,
    actionId: string,
    maxSteps: number,
  ): Promise<DungeonAgentResult>;
  query(revision: string, sql: string): Promise<DungeonAgentResult>;
  judge(floor: number): DungeonAgentJudge;
  events(afterSequence: number): readonly DungeonAgentEvent[];
}

declare global {
  interface Window {
    __DUNGEON_PLAYTEST__?: DungeonPlaytestBridge;
  }
}

/** 试玩页面使用的内存 DataStore 与引导键值存储组合。 */
export type DungeonAgentStore = DataStore & StorageLike & {
  readonly checkpointState: DungeonAgentCheckpointState;
};

const LOCAL_PLAYTEST_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CHECKPOINT_KEY = "dungeon.maintainer.checkpoint.v1";

interface DungeonAgentCheckpoint {
  schemaVersion: 1;
  run: SavedRun;
  profile: ProfileProgress;
}

/**
 * 校验当前页面能否进入维护器试玩模式。
 *
 * @param url 当前页面的绝对 URL。
 * @param isDevelopment Vite 开发构建标志；生产构建必须传入 `false`。
 * @returns 合法时返回固定 agent 模式和 1 至 8 层，否则返回 `null`。
 */
export function parseDungeonAgentLaunch(
  url: URL,
  isDevelopment: boolean,
): DungeonAgentLaunch | null {
  if (!isDevelopment || !LOCAL_PLAYTEST_HOSTS.has(url.hostname)) return null;
  if (url.searchParams.get("playtest") !== "agent") return null;
  const floor = Number(url.searchParams.get("floor") ?? "1");
  if (!Number.isInteger(floor) || floor < 1 || floor > 8) return null;
  return { mode: "agent", floor: floor as FloorNumber };
}

/**
 * 创建与正式浏览器数据完全隔离的试玩存储。
 *
 * @param checkpointStorage 当前临时 Chromium Context 的 sessionStorage；不可传正式
 * 数据库或 localStorage。缺失时仍可试玩，但源码刷新无法恢复场景。
 * @returns 页面内存 DataStore；Run/Profile 的后续保存会被有意丢弃。
 * @remarks 检查点读取后立即删除，确保一次刷新只能消费一次相同状态。
 */
export function createDungeonAgentStore(
  checkpointStorage: StorageLike | null = null,
): DungeonAgentStore {
  const transientValues = new Map<string, string>();
  let restoredRun: SavedRun | null = null;
  let restoredProfile = createEmptyProfile();
  let checkpointState: DungeonAgentCheckpointState = "none";

  if (checkpointStorage) {
    let rawCheckpoint: string | null = null;
    try {
      rawCheckpoint = checkpointStorage.getItem(CHECKPOINT_KEY);
      // 检查点是一次性恢复令牌。先删除再解析，损坏内容也不能在后续刷新中反复尝试。
      checkpointStorage.removeItem(CHECKPOINT_KEY);
    } catch {
      checkpointState = "invalid";
    }
    if (rawCheckpoint) {
      try {
        const candidate: unknown = JSON.parse(rawCheckpoint);
        if (
          candidate
          && typeof candidate === "object"
          && !Array.isArray(candidate)
          && "schemaVersion" in candidate
          && candidate.schemaVersion === 1
          && "run" in candidate
          && isSavedRun(candidate.run)
          && "profile" in candidate
          && isProfileProgress(candidate.profile)
        ) {
          restoredRun = candidate.run;
          restoredProfile = candidate.profile;
          checkpointState = "restored";
        } else {
          checkpointState = "invalid";
        }
      } catch {
        checkpointState = "invalid";
      }
    }
  }

  return {
    checkpointState,
    loadRun: () => restoredRun,
    loadProfile: () => restoredProfile,
    saveRun: (_value: SavedRun) => undefined,
    saveProfile: (_value: ProfileProgress) => undefined,
    getItem: (key) => transientValues.get(key) ?? null,
    setItem: (key, value) => transientValues.set(key, value),
    removeItem: (key) => transientValues.delete(key),
  };
}

/**
 * 保存紧邻下一次 Vite 刷新的临时游戏检查点。
 *
 * @param storage 当前临时 Chromium Context 的 sessionStorage。
 * @param run GameSession 生成的完整临时 Run，只留在浏览器内部。
 * @param profile 当前临时 Profile，只用于恢复同一试玩场景。
 * @returns 写入成功返回 `true`；配额、隐私模式或存储异常时返回 `false`。
 * @remarks 调用方收到 `false` 后必须停止 patch/刷新流程，不能假装可以稳定重放。
 */
export function saveDungeonAgentCheckpoint(
  storage: StorageLike,
  run: SavedRun,
  profile: ProfileProgress,
): boolean {
  const checkpoint: DungeonAgentCheckpoint = {
    schemaVersion: 1,
    run,
    profile,
  };
  try {
    storage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
    return true;
  } catch {
    return false;
  }
}
