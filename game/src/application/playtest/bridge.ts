/**
 * 仅限开发态的协议 v2 浏览器试玩桥。
 *
 * 本模块把 Pi Agent 的五种固定调用转换为真实移动、界面点击、SQL 提交和有限
 * 裁判断言；路径仍由现有迷宫规则计算，答案只在桥内部从管理员状态读取。它不负责
 * 启动浏览器、生成报告、调用模型或写入存档。调用方必须先满足开发构建、本机地址和
 * `?playtest=agent` 三重入口条件；返回投影不得包含答案、完整地图、存档、背包或身份。
 */

import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { StorageLike } from "../../contracts/storage/storageLike";
import { gateAnswer } from "./gateAnswers";
import { findGridPath } from "../../domain/exploration/pathfinding";
import { isMazeWalkable } from "../../domain/exploration/mazeGenerator";
import { finalMigrationProgress } from "../../domain/progression/finalMigration";
import type { GameSession } from "../../domain/session/GameSession";
import {
  savePlaytestCheckpoint,
  type PlaytestLaunch,
  type PlaytestMode,
} from "./mode";
import {
  buildPlaytestView,
  findPlaytestFrontier,
  findPlaytestObjective,
  moveShouldStop,
  type PlaytestView,
} from "./view";

const MAX_MOVE_STEPS = 64;
const MOVE_WAIT_MS = 24;
const QUERY_WAIT_ATTEMPTS = 500;

/** 一次固定桥动作的有限结果；`view` 只包含玩家可见投影。 */
export interface PlaytestToolResult {
  ok: boolean;
  event: string;
  steps: number;
  view: PlaytestView;
}

/** 隐藏裁判的最小断言，只供确定性 Runner 判断楼层是否完成。 */
export interface PlaytestJudge {
  floor: number;
  mode: GameSnapshot["mode"];
  lessons: number;
  requiredLessons: number;
  bossDefeated: boolean;
  migrationSteps: number;
  migrationComplete: boolean;
  advanced: boolean;
}

/** 外部 Runner 唯一可见的协议 v2 工具面，不提供传送、状态写入或 SQL 参数。 */
export interface DungeonPlaytestBridge {
  readonly version: 2;
  /** 当前页面是否由紧邻上一次刷新前的检查点恢复。 */
  readonly checkpointRestored: boolean;
  /** 把当前临时 Run 写入只存活于本 Chromium Context 的一次性检查点。 */
  checkpoint(): boolean;
  look(): PlaytestView;
  go(
    target: "objective" | "frontier",
    maxSteps: number,
  ): Promise<PlaytestToolResult>;
  use(actionId: string): Promise<PlaytestToolResult>;
  query(): Promise<PlaytestToolResult>;
  judge(floor: number): PlaytestJudge;
}

function judgeSnapshot(snapshot: GameSnapshot): PlaytestJudge {
  const requiredLessons = snapshot.roomGraph.nodes.filter(
    (room) => room.required && room.lessonId,
  ).length;
  const boss = snapshot.monsters.find((monster) => (
    monster.isBoss && monster.rank === "boss" && monster.encounterType === "curriculum"
  ));
  const migration = finalMigrationProgress(snapshot.openedGateIds);
  return {
    floor: snapshot.floor,
    mode: snapshot.mode,
    lessons: snapshot.completedLessons.length,
    requiredLessons,
    bossDefeated: Boolean(boss && boss.hp <= 0),
    migrationSteps: migration.completedStepIds.length,
    migrationComplete: migration.complete,
    advanced: false,
  };
}

declare global {
  interface Window {
    __DUNGEON_PLAYTEST__?: DungeonPlaytestBridge;
  }
}

interface BridgeOptions {
  root: HTMLElement;
  session: GameSession;
  launch: PlaytestLaunch;
  checkpointStorage: StorageLike | null;
  checkpointRestored: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function visible(root: ParentNode, selector: string): boolean {
  const element = root.querySelector<HTMLElement>(selector);
  return Boolean(element && !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function text(root: ParentNode, selector: string): string {
  return root.querySelector<HTMLElement>(selector)?.textContent?.trim() ?? "";
}

function safeRecordBody(value: string): string {
  return value
    .split("\n")
    .map((line) => /\b(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(line)
      ? "[SQL 正文未传给试玩模型]"
      : line)
    .join("\n");
}

function overlayState(root: ParentNode): {
  inspectionOpen: boolean;
  reviewOpen: boolean;
  settlementOpen: boolean;
  record: { kicker: string; title: string; body: string } | null;
} {
  const inspectionOpen = visible(root, "#inspection-overlay");
  return {
    inspectionOpen,
    reviewOpen: root.querySelector("#answer-review")?.classList.contains("is-open") ?? false,
    settlementOpen: root.querySelector("#combat-result-card")?.classList.contains("is-visible") ?? false,
    record: inspectionOpen ? {
      kicker: text(root, "#inspection-kicker"),
      title: text(root, "#inspection-title"),
      body: safeRecordBody(text(root, "#inspection-message")),
    } : null,
  };
}

function click(root: ParentNode, selector: string): boolean {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button || button.disabled) return false;
  button.click();
  return true;
}

async function waitForUiReady(root: ParentNode): Promise<boolean> {
  for (let attempt = 0; attempt < QUERY_WAIT_ATTEMPTS; attempt += 1) {
    const stage = root.querySelector<HTMLElement>(".game-stage");
    if (!stage?.classList.contains("is-resolving")) return true;
    await sleep(MOVE_WAIT_MS);
  }
  return false;
}

function playerPath(snapshot: GameSnapshot, target: { x: number; y: number }): { x: number; y: number }[] {
  const discovered = new Set(snapshot.discoveredCells);
  const completed = new Set(snapshot.completedLessons);
  const opened = new Set(snapshot.openedGateIds);
  const campfires = new Set(snapshot.campfires.map((entry) => `${entry.x}:${entry.y}`));
  return findGridPath(snapshot.player, target, (x, y) => (
    discovered.has(`${x}:${y}`) &&
    !campfires.has(`${x}:${y}`) &&
    isMazeWalkable(snapshot.mazeFloor, x, y, completed, opened)
  ));
}

/**
 * 安装绑定当前临时 Session 的五工具桥。
 * @param options 已挂载的游戏根节点、临时 Session 和经入口校验的启动参数。
 * @returns 销毁订阅并移除全局桥对象的清理函数。
 * @throws 桥内部领域操作失败时由对应异步工具返回失败结果，不扩大管理员权限。
 */
export function installPlaytestBridge(options: BridgeOptions): () => void {
  const mode: PlaytestMode = options.launch.mode;
  let snapshot = options.session.snapshot();
  const judgeByFloor = new Map<number, PlaytestJudge>([[snapshot.floor, judgeSnapshot(snapshot)]]);
  const usedInteractions = new Set<string>();
  const unsubscribe = options.session.subscribe((next) => {
    snapshot = next;
    judgeByFloor.set(next.floor, judgeSnapshot(next));
  });

  const interactionKey = (): string => [
    snapshot.floor,
    snapshot.player.x,
    snapshot.player.y,
    snapshot.completedLessons.length,
    snapshot.interactionPrompt,
  ].join(":");
  // 异步 UI 操作后必须重新读取当前快照；函数边界也避免 TypeScript 沿用调用前的
  // mode 收窄，从而把已经发生的 combat -> transition 变化误判为不可能。
  const currentSnapshot = (): GameSnapshot => snapshot;
  const look = (): PlaytestView => {
    const gateAnswerReady = mode === "agent" && snapshot.mode === "challenge";
    const view = buildPlaytestView(snapshot, mode, overlayState(options.root), gateAnswerReady);
    if (!usedInteractions.has(interactionKey())) return view;
    return {
      ...view,
      actions: view.actions.filter((entry) => entry.id !== "interact"),
    };
  };
  const result = (ok: boolean, event: string, steps = 0): PlaytestToolResult => ({
    ok,
    event,
    steps,
    view: look(),
  });

  const bridge: DungeonPlaytestBridge = {
    version: 2,
    checkpointRestored: options.checkpointRestored,
    checkpoint() {
      if (!options.checkpointStorage) return false;
      return savePlaytestCheckpoint(
        options.checkpointStorage,
        options.session.toSavedRun(),
        options.session.toProfile(),
      );
    },
    look,
    async go(targetId, rawMaxSteps) {
      // 阅读记录后，go 先通过真实按钮关闭覆盖层，再继续真实移动。
      if (visible(options.root, "#inspection-overlay")) {
        click(options.root, "#close-inspection");
        await sleep(MOVE_WAIT_MS);
      }
      if (!await waitForUiReady(options.root)) return result(false, "ui-not-ready");
      if (snapshot.mode !== "explore") return result(false, "movement-not-available");
      const maxSteps = Math.max(1, Math.min(MAX_MOVE_STEPS, Math.floor(rawMaxSteps)));
      const visibleObjective = findPlaytestObjective(snapshot);
      const objectiveAllowed = mode === "agent" || (
        visibleObjective !== null &&
        snapshot.discoveredCells.includes(`${visibleObjective.x}:${visibleObjective.y}`)
      );
      if (targetId === "objective" && !objectiveAllowed) {
        return result(false, "target-not-visible");
      }
      let moved = 0;
      while (moved < maxSteps) {
        const target = targetId === "frontier"
          ? findPlaytestFrontier(snapshot)
          : targetId === "objective"
            ? findPlaytestObjective(snapshot)
          : null;
        if (!target) {
          return result(moved > 0, moved > 0 ? "explored" : "target-not-visible", moved);
        }
        let path = playerPath(snapshot, target);
        // 当前目标尚未连入已发现区域时，执行器在桥内部回退最近 frontier。
        // 地图和纠错过程不会进入 Node 侧报告，更不会交给维护模型逐格推理。
        if (path.length === 0 && targetId === "objective") {
          const frontier = findPlaytestFrontier(snapshot);
          if (frontier) {
            const adjacent = [
              { x: frontier.x + 1, y: frontier.y },
              { x: frontier.x - 1, y: frontier.y },
              { x: frontier.x, y: frontier.y + 1 },
              { x: frontier.x, y: frontier.y - 1 },
            ];
            const discovered = new Set(snapshot.discoveredCells);
            const approach = adjacent.find((point) => discovered.has(`${point.x}:${point.y}`));
            path = approach ? playerPath(snapshot, approach) : [];
            if (path.length > 0) path.push(frontier);
          }
        }
        if (path.length === 0 && targetId === "frontier") {
          const adjacent = [
            { x: target.x + 1, y: target.y },
            { x: target.x - 1, y: target.y },
            { x: target.x, y: target.y + 1 },
            { x: target.x, y: target.y - 1 },
          ];
          const discovered = new Set(snapshot.discoveredCells);
          const approach = adjacent.find((point) => discovered.has(`${point.x}:${point.y}`));
          path = approach ? playerPath(snapshot, approach) : [];
          if (path.length > 0) path.push(target);
        }
        if (path.length < 2) {
          return result(moved > 0, moved > 0 ? "explored" : "no-discovered-path", moved);
        }

        for (const next of path.slice(1, maxSteps - moved + 1)) {
          const before = snapshot;
          window.dispatchEvent(new CustomEvent("dungeon:move", {
            detail: { dx: next.x - before.player.x, dy: next.y - before.player.y },
          }));
          await sleep(MOVE_WAIT_MS);
          const stopped = moveShouldStop(before, snapshot);
          if (snapshot.player.x === before.player.x && snapshot.player.y === before.player.y) {
            if (stopped) return result(true, stopped, moved);
            return result(false, "blocked", moved);
          }
          moved += 1;
          if (stopped) return result(true, stopped, moved);
        }
        if (targetId === "objective" && findPlaytestObjective(snapshot)) {
          const objectivePath = playerPath(snapshot, findPlaytestObjective(snapshot) ?? snapshot.player);
          if (objectivePath.length >= 2) break;
        }
      }
      return result(true, "move-complete", moved);
    },
    async use(actionId) {
      const selectors: Record<string, string> = {
        continue: "#close-inspection",
        "close-review": "#close-review",
        interact: "#interact",
        terminal: "#open-sql",
        rest: "#rest-at-campfire",
        leave: "#leave-campfire",
        "take-all": "#take-all-loot",
        "leave-loot": "#close-loot",
        "close-inventory": "#close-inventory",
        query: "#open-sql",
        "leave-challenge": "#close-gate-terminal",
      };
      const selector = selectors[actionId];
      const beforeKey = actionId === "interact" ? interactionKey() : null;
      const beforePosition = actionId === "interact"
        ? `${snapshot.floor}:${snapshot.player.x}:${snapshot.player.y}`
        : null;
      if (!selector || !click(options.root, selector)) return result(false, "action-not-available");
      if (beforeKey) {
        // 交互按点击前状态去重，避免同步领域事件先把玩家传走后只记住目的地。
        // 若交互确实移动了玩家（区域门或捷径），两端都在本进度阶段标记为已处理，
        // 防止确定性 Runner 把路过的双向交通反复当作主线动作。
        usedInteractions.add(beforeKey);
        const afterPosition = `${snapshot.floor}:${snapshot.player.x}:${snapshot.player.y}`;
        if (afterPosition !== beforePosition) usedInteractions.add(interactionKey());
      }
      await sleep(MOVE_WAIT_MS);
      // Boss 奖励可能在领取战利品后才进入 transition。此处与 query 的检查共同保证
      // 管理员权限不会阻止正式 FloorTransitionCoordinator 执行真实升层。
      if (snapshot.mode === "transition") options.session.disableAdminMode();
      return result(true, `action:${actionId}`);
    },
    async query() {
      if (snapshot.mode !== "combat" && snapshot.mode !== "challenge") {
        return result(false, "query-not-available");
      }
      const gate = snapshot.mode === "challenge";
      const textarea = options.root.querySelector<HTMLTextAreaElement>(
        gate ? "#gate-sql-editor" : "#sql-editor",
      );
      const button = options.root.querySelector<HTMLButtonElement>(
        gate ? "#execute-gate-query" : "#execute-query",
      );
      if (!textarea || !button) return result(false, "terminal-not-ready");
      if (!visible(options.root, gate ? "#gate-terminal" : "#combat-terminal")) {
        click(options.root, gate ? "#interact" : "#open-sql");
        await sleep(MOVE_WAIT_MS);
      }
      const assistedSql = gate
        ? gateAnswer(snapshot.floor)
        : snapshot.adminAnswerSql;
      if (!assistedSql) return result(false, "answer-not-ready");
      // Agent 只选择“提交答案”，答案从管理员接口读取，正文永远不进入投影。
      textarea.value = assistedSql;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      const queryCount = snapshot.queryCount;
      const beforeMode = snapshot.mode;
      button.click();
      for (let attempt = 0; attempt < QUERY_WAIT_ATTEMPTS; attempt += 1) {
        await sleep(MOVE_WAIT_MS);
        if (snapshot.queryCount !== queryCount || snapshot.mode !== beforeMode) break;
      }
      const resolved = snapshot.queryCount !== queryCount || snapshot.mode !== beforeMode;
      const ready = resolved && await waitForUiReady(options.root);
      // 管理员权限只负责提供当前层答案。取得层钥匙后立即退出辅助模式，
      // 让 AppShell 的真实 FloorTransitionCoordinator 调用 advanceFloor。
      if (ready && currentSnapshot().mode === "transition") {
        options.session.disableAdminMode();
      }
      return result(ready, ready ? "query-resolved" : "query-timeout");
    },
    judge(floor) {
      const value = judgeByFloor.get(floor) ?? judgeSnapshot(snapshot);
      return { ...value, advanced: snapshot.floor > floor };
    },
  };

  window.__DUNGEON_PLAYTEST__ = bridge;
  return () => {
    unsubscribe();
    if (window.__DUNGEON_PLAYTEST__ === bridge) delete window.__DUNGEON_PLAYTEST__;
  };
}
