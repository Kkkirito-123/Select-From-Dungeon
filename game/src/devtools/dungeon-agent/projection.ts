/**
 * Dungeon Agent 的玩家可见状态投影。
 *
 * 本模块把完整 `GameSnapshot` 和有限 DOM 覆盖层裁剪成协议允许的 `DungeonAgentView`。
 * 它只返回玩家已经能看到的楼层、模式、生命、进度、房间、任务、提示和固定动作；完整
 * 地图、SQL、管理员答案、正式存档、身份、背包和隐藏裁判字段不会经过该边界。
 *
 * 主线目标和 frontier 的坐标由 navigation 模块在页面内部计算，仅用于决定动作标签，
 * 不会写入视图或 Trace。投影是纯函数，不启动浏览器、不修改 Session、不写存储。
 */

import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { DungeonAgentAction, DungeonAgentView } from "./protocol";
import type { VisibleOverlayState } from "./actions";
import { findDungeonAgentObjective } from "./navigation";

function action(id: string, label: string): DungeonAgentAction {
  return { id, label };
}

const EMPTY_OVERLAY: VisibleOverlayState = {
  inspectionOpen: false,
  reviewOpen: false,
  record: null,
};

/**
 * 构造仅含玩家可见信息的协议投影。
 *
 * @param snapshot 当前隔离 GameSession 快照，只在函数内部裁剪。
 * @param overlay 当前 DOM 覆盖层的有限可见状态；省略时视为没有覆盖层。
 * @returns 不含完整地图、SQL、答案、身份、背包、存档或隐藏裁判的视图。
 */
export function buildDungeonAgentView(
  snapshot: GameSnapshot,
  overlay: VisibleOverlayState = EMPTY_OVERLAY,
): DungeonAgentView {
  const actions: DungeonAgentAction[] = [];
  const addMovementAction = (): void => {
    if (findDungeonAgentObjective(snapshot)) {
      actions.push(action(
        "objective",
        `沿真实路线前往${snapshot.navigationGuidance.objectiveTitle ?? "当前主线目标"}`,
      ));
    } else {
      actions.push(action("frontier", "探索已发现区域旁的未知位置"));
    }
  };

  if (overlay.inspectionOpen) {
    actions.push(action("continue", "继续当前记录"));
    if (snapshot.mode === "explore") addMovementAction();
  } else if (overlay.reviewOpen || snapshot.mode === "death-review") {
    actions.push(action("close-review", "关闭复盘"));
  } else if (snapshot.mode === "explore") {
    addMovementAction();
    if (snapshot.interactionPrompt.startsWith("E")) {
      actions.push(action("interact", snapshot.interactionPrompt));
    }
  } else if (snapshot.mode === "combat" || snapshot.mode === "challenge") {
    actions.push(action(
      "query",
      snapshot.mode === "combat" ? "提交当前桥内答案" : "提交当前密文答案",
    ));
  } else if (snapshot.mode === "campfire") {
    actions.push(action("rest", "在此休息"), action("leave", "离开篝火"));
  } else if (snapshot.mode === "loot") {
    actions.push(
      action("take-all", "尽量领取全部战利品"),
      action("leave-loot", "保留并离开"),
    );
  } else if (snapshot.mode === "inventory") {
    actions.push(action("close-inventory", "关闭背包"));
  } else if (snapshot.mode === "victory") {
    actions.push(action("continue", "继续 MIGRATE 终章"));
  }

  return {
    floor: snapshot.floor,
    mode: snapshot.mode,
    hp: {
      current: snapshot.player.hp,
      max: snapshot.player.maxHp,
      armor: snapshot.player.armorHp,
    },
    progress: {
      lessons: snapshot.completedLessons.length,
      rooms: snapshot.completedRoomIds.length,
      moves: snapshot.totalMoves,
      queries: snapshot.queryCount,
      hintLevel: snapshot.hintLevel,
    },
    actions,
    room: snapshot.currentRoomTitle,
    mission: {
      title: snapshot.missionTitle,
      body: snapshot.missionBody,
      lesson: snapshot.lessonIntro,
    },
    record: overlay.record,
    prompt: snapshot.interactionPrompt,
    banner: snapshot.banner,
  };
}
