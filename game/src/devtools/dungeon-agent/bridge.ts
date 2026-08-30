/**
 * SQL Dungeon 专用的开发态协议 1.0 浏览器桥装配器。
 *
 * 本文件只把协议方法组合到当前临时 GameSession：它维护快照订阅、一次性检查点、有限
 * Trace、隐藏 judge 缓存和 `window.__DUNGEON_PLAYTEST__` 的安装/清理。DOM 动作、玩家投影、
 * 导航和桥内查询分别由 actions/projection/navigation/query 模块负责。
 *
 * 桥只能由通过 `DEV + localhost + ?playtest=agent` 校验的入口安装。完整地图、管理员答案
 * 和固定 SQL 只在页面内部参与规划或判定，不进入协议返回值、Trace、控制台或 Node 日志。
 * 任何检查点、UI 或协议异常都会返回稳定失败事件，维护器据此阻断 patch/重放。
 */

import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { StorageLike } from "../../contracts/storage/storageLike";
import { finalMigrationProgress } from "../../domain/progression/finalMigration";
import type { GameSession } from "../../features/game-session/GameSession";
import type { Monster } from "../../domain/shared/types";
import {
  saveDungeonAgentCheckpoint,
  type DungeonAgentJudge,
  type DungeonAgentLaunch,
  type DungeonAgentResult,
  type DungeonAgentView,
  type DungeonPlaytestBridge,
} from "./protocol";
import {
  clickDungeonAgentAction,
  DUNGEON_AGENT_ACTION_SELECTORS,
  DUNGEON_AGENT_SQL_MAX_LENGTH,
  dungeonAgentMovementSettleDelay,
  isDungeonAgentVisible,
  readDungeonAgentOverlay,
  writeDungeonAgentSql,
  sleepDungeonAgent,
  waitDungeonAgentInteractionApplied,
  waitDungeonAgentUiReady,
  type VisibleOverlayState,
} from "./actions";
import {
  dungeonAgentMoveStopReason,
  planDungeonAgentNavigation,
  type DungeonAgentMoveStopReason,
} from "./navigation";
import { buildDungeonAgentView } from "./projection";
import { executeDungeonAgentQuery } from "./query";
import { DungeonAgentTrace } from "./trace";

const MAX_MOVE_STEPS = 64;
const UI_POLL_INTERVAL_MS = 24;

/** 安装桥所需的、与当前临时游戏实例绑定的依赖。 */
export interface DungeonAgentBridgeOptions {
  root: HTMLElement;
  session: GameSession;
  launch: DungeonAgentLaunch;
  checkpointStorage: StorageLike | null;
  checkpointRestored: boolean;
  resetSql: (monsters: readonly Monster[]) => void;
}

/**
 * 组合隐藏的确定性验证摘要。
 *
 * @param snapshot 当前隔离游戏快照。
 * @returns 只供维护器固定验证层读取的摘要；look/act/query 不会返回它。
 */
function judgeSnapshot(snapshot: GameSnapshot): DungeonAgentJudge {
  const requiredLessons = snapshot.roomGraph.nodes.filter(
    (room) => room.required && room.lessonId,
  ).length;
  const boss = snapshot.monsters.find((monster) => (
    monster.isBoss
    && monster.rank === "boss"
    && monster.encounterType === "curriculum"
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
    stageIndex: snapshot.lessonStageIndex,
    claimableReward: snapshot.claimableReward?.id ?? null,
    bossHp: boss?.hp ?? null,
    victories: snapshot.profile.victories,
    guidanceDistance: snapshot.navigationGuidance.distance,
  };
}

/**
 * 构造交互生效判定使用的内部语义指纹。
 *
 * 指纹覆盖交互可能改变的模式、房间、课程、门、地面物和玩家可见覆盖层，但只在页面
 * 内比较，不进入协议结果或 Trace。
 */
export function dungeonAgentInteractionFingerprint(
  snapshot: GameSnapshot,
  overlay: VisibleOverlayState,
): string {
  return JSON.stringify({
    mode: snapshot.mode,
    floor: snapshot.floor,
    room: snapshot.currentRoomId,
    position: [snapshot.player.x, snapshot.player.y],
    course: {
      lesson: snapshot.lessonId,
      stage: snapshot.lessonStageId,
      stageIndex: snapshot.lessonStageIndex,
      completedLessons: snapshot.completedLessons,
      completedRooms: snapshot.completedRoomIds,
    },
    doors: {
      opened: snapshot.openedGateIds,
      activeChallenge: snapshot.activeGateChallenge?.id ?? null,
    },
    groundItems: snapshot.groundItems.map((item) => [
      item.id,
      item.sourceRoomId,
      item.x,
      item.y,
      item.collection,
      item.rewardId,
    ]),
    keyItems: snapshot.keyItems,
    claimableReward: snapshot.claimableReward?.id ?? null,
    activeCampfire: snapshot.activeCampfireId,
    activeLoot: snapshot.activeLootBundleId,
    prompt: snapshot.interactionPrompt,
    banner: snapshot.banner,
    overlay,
  });
}

/**
 * 安装绑定当前临时 GameSession 的协议 1.0 桥。
 *
 * @param options 已挂载的游戏根节点、Session、SQL 引擎和经三重入口校验的启动参数。
 * @returns 清理函数；调用后取消订阅并仅移除本次安装的全局桥。
 * @throws 启动参数不是固定 agent 模式时拒绝安装。
 */
export function installDungeonAgentBridge(
  options: DungeonAgentBridgeOptions,
): () => void {
  if (options.launch.mode !== "agent") {
    throw new Error("Dungeon Agent 桥只允许固定 agent 模式");
  }

  let snapshot = options.session.snapshot();
  const trace = new DungeonAgentTrace(500);
  const judgeByFloor = new Map<number, DungeonAgentJudge>([
    [snapshot.floor, judgeSnapshot(snapshot)],
  ]);
  const usedInteractions = new Set<string>();
  let lastNoProgressKey: string | null = null;
  const unsubscribe = options.session.subscribe((nextSnapshot) => {
    snapshot = nextSnapshot;
    judgeByFloor.set(nextSnapshot.floor, judgeSnapshot(nextSnapshot));
  });

  const interactionTargetKey = (): string => [
    snapshot.floor,
    snapshot.player.x,
    snapshot.player.y,
    snapshot.interactionPrompt,
    interactionFingerprint(),
  ].join(":");

  const interactionFingerprint = (): string => dungeonAgentInteractionFingerprint(
    snapshot,
    readDungeonAgentOverlay(options.root),
  );

  const currentView = (): DungeonAgentView => {
    const interactionConsumed = usedInteractions.has(interactionTargetKey());
    return buildDungeonAgentView(
      snapshot,
      readDungeonAgentOverlay(options.root),
      interactionConsumed,
    );
  };

  const result = (
    ok: boolean,
    event: string,
    steps = 0,
  ): DungeonAgentResult => ({
    ok,
    event,
    steps,
    view: currentView(),
  });

  const noProgressResult = (
    revision: string,
    actionId: string,
    event: string,
  ): DungeonAgentResult => {
    const key = `${revision}:${actionId}`;
    if (lastNoProgressKey === key) {
      trace.record("act", `action=${actionId} result=stalled`);
      return result(false, "stalled");
    }
    lastNoProgressKey = key;
    return result(false, event);
  };

  const markProgress = (): void => {
    lastNoProgressKey = null;
  };

  const bridge: DungeonPlaytestBridge = {
    version: 1,
    checkpointRestored: options.checkpointRestored,
    prepare(presetId) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(presetId)) return false;
      const prepared = options.session.adminApplyPreset(presetId).ok;
      if (prepared) {
        options.resetSql(options.session.snapshot().monsters);
        usedInteractions.clear();
        markProgress();
      }
      return prepared;
    },
    checkpoint() {
      const saved = Boolean(
        options.checkpointStorage
        && saveDungeonAgentCheckpoint(
          options.checkpointStorage,
          options.session.toSavedRun(),
          options.session.toProfile(),
        ),
      );
      trace.record("checkpoint", `saved=${String(saved)}`);
      return saved;
    },
    look() {
      const view = currentView();
      trace.record("look", `floor=${view.floor} mode=${view.mode}`);
      return view;
    },
    async act(revision, actionId, rawMaxSteps) {
      const visible = currentView();
      const available = visible.actions.some((action) => (
        action.id === actionId && action.tool === "act"
      ));
      if (revision !== visible.revision) {
        trace.record("act", `action=${actionId} result=stale-view`);
        return result(false, "stale-view");
      }
      if (!available) {
        trace.record("act", `action=${actionId} result=action-not-available`);
        return noProgressResult(revision, actionId, "action-not-available");
      }
      if (!await waitDungeonAgentUiReady(options.root)) {
        trace.record("act", `action=${actionId} result=ui-not-ready`);
        return noProgressResult(revision, actionId, "ui-not-ready");
      }

      const maxSteps = Number.isFinite(rawMaxSteps)
        ? Math.max(1, Math.min(MAX_MOVE_STEPS, Math.floor(rawMaxSteps)))
        : 1;
      if (actionId === "objective" || actionId === "frontier") {
        if (snapshot.mode !== "explore") {
          trace.record("act", `action=${actionId} result=movement-not-available`);
          return noProgressResult(revision, actionId, "movement-not-available");
        }
        let movedSteps = 0;

        while (movedSteps < maxSteps) {
          const navigation = planDungeonAgentNavigation(snapshot, actionId);
          if (!navigation.target) {
            const event = movedSteps > 0 ? "explored" : "target-not-visible";
            trace.record("act", `action=${actionId} steps=${movedSteps} result=${event}`);
            if (movedSteps > 0) markProgress();
            return movedSteps > 0
              ? result(true, event, movedSteps)
              : noProgressResult(revision, actionId, event);
          }
          if (navigation.path.length < 2) {
            const event = movedSteps > 0 ? "explored" : "no-discovered-path";
            trace.record("act", `action=${actionId} steps=${movedSteps} result=${event}`);
            if (movedSteps > 0) markProgress();
            return movedSteps > 0
              ? result(true, event, movedSteps)
              : noProgressResult(revision, actionId, event);
          }

          for (const next of navigation.path.slice(1, maxSteps - movedSteps + 1)) {
            const before = snapshot;
            window.dispatchEvent(new CustomEvent("dungeon:move", {
              detail: {
                dx: next.x - before.player.x,
                dy: next.y - before.player.y,
              },
            }));
            await sleepDungeonAgent(dungeonAgentMovementSettleDelay());
            const stopReason: DungeonAgentMoveStopReason | null = dungeonAgentMoveStopReason(
              before,
              snapshot,
            ) ?? (isDungeonAgentVisible(options.root, "#inspection-overlay") ? "action" : null);
            if (
              snapshot.player.x === before.player.x
              && snapshot.player.y === before.player.y
            ) {
              const event = stopReason ?? "blocked";
              trace.record("act", `action=${actionId} steps=${movedSteps} result=${event}`);
              return noProgressResult(revision, actionId, event);
            }
            movedSteps += 1;
            if (stopReason) {
              markProgress();
              trace.record(
                "act",
                `action=${actionId} steps=${movedSteps} result=${stopReason}`,
              );
              return result(true, stopReason, movedSteps);
            }
          }
        }

        markProgress();
        trace.record("act", `action=${actionId} steps=${movedSteps} result=move-complete`);
        return result(true, "move-complete", movedSteps);
      }

      const selector = DUNGEON_AGENT_ACTION_SELECTORS[actionId];
      const beforeTargetKey = actionId === "interact" ? interactionTargetKey() : null;
      const beforeFingerprint = interactionFingerprint();
      const beforePosition = actionId === "interact"
        ? `${snapshot.floor}:${snapshot.player.x}:${snapshot.player.y}`
        : null;
      if (!selector || !clickDungeonAgentAction(options.root, selector)) {
        trace.record("act", `action=${actionId} result=action-not-available`);
        return noProgressResult(revision, actionId, "action-not-available");
      }
      const actionApplied = await waitDungeonAgentInteractionApplied(
        interactionFingerprint,
        beforeFingerprint,
      );
      if (!actionApplied) {
        trace.record("act", `action=${actionId} result=action-not-applied`);
        return noProgressResult(revision, actionId, "action-not-applied");
      }
      if (beforeTargetKey) {
        usedInteractions.add(beforeTargetKey);
        const afterPosition = `${snapshot.floor}:${snapshot.player.x}:${snapshot.player.y}`;
        if (afterPosition !== beforePosition) usedInteractions.add(interactionTargetKey());
      }
      markProgress();
      trace.record("act", `action=${actionId} result=accepted`);
      return result(true, `action:${actionId}`);
    },
    async query(revision, sql) {
      const visible = currentView();
      if (revision !== visible.revision) {
        trace.record("query", "result=stale-view");
        return result(false, "stale-view");
      }
      const modeBeforeQuery = snapshot.mode;
      if (modeBeforeQuery !== "combat" && modeBeforeQuery !== "challenge") {
        trace.record("query", `mode=${modeBeforeQuery} result=query-not-available`);
        return result(false, "query-not-available");
      }
      if (
        typeof sql !== "string"
        || sql.length < 1
        || sql.length > DUNGEON_AGENT_SQL_MAX_LENGTH
        || sql.includes("\u0000")
      ) {
        trace.record("query", `mode=${modeBeforeQuery} result=input-invalid`);
        return result(false, "input-invalid");
      }
      if (!await waitDungeonAgentUiReady(options.root)) {
        trace.record("query", `mode=${modeBeforeQuery} result=ui-not-ready`);
        return result(false, "ui-not-ready");
      }
      if (!writeDungeonAgentSql(options.root, modeBeforeQuery, sql)) {
        trace.record("query", `mode=${modeBeforeQuery} result=terminal-not-open`);
        return result(false, "terminal-not-open");
      }
      await sleepDungeonAgent(UI_POLL_INTERVAL_MS);

      const queryResult = await executeDungeonAgentQuery({
        root: options.root,
        mode: modeBeforeQuery,
        readFingerprint: () => dungeonAgentInteractionFingerprint(
          snapshot,
          readDungeonAgentOverlay(options.root),
        ),
      });
      await sleepDungeonAgent(UI_POLL_INTERVAL_MS);
      trace.record(
        "query",
        `floor=${snapshot.floor} mode=${modeBeforeQuery} length=${sql.length} result=${queryResult.event}`,
      );
      // `ok` 表示真实游戏是否接受本次查询，而不是“桥函数成功返回”。否则重放层
      // 会把 query-rejected 当作修复通过，导致 /verify 产生假阳性。
      return result(queryResult.accepted, queryResult.event);
    },
    judge(floor) {
      const judge = judgeByFloor.get(floor) ?? judgeSnapshot(snapshot);
      return { ...judge, advanced: snapshot.floor > floor };
    },
    events(afterSequence) {
      return trace.eventsAfter(afterSequence);
    },
  };

  window.__DUNGEON_PLAYTEST__ = bridge;
  return () => {
    unsubscribe();
    if (window.__DUNGEON_PLAYTEST__ === bridge) {
      delete window.__DUNGEON_PLAYTEST__;
    }
  };
}
