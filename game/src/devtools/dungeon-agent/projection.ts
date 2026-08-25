/**
 * Dungeon Agent 的玩家可见状态投影。
 *
 * 本模块把完整 `GameSnapshot` 和有限 DOM 覆盖层裁剪成协议允许的 `DungeonAgentView`。
 * 它只返回玩家已经能看到的楼层、模式、生命、进度、房间、任务、提示、当前打开终端和
 * 固定动作；完整地图、隐藏答案、管理员答案字段、正式存档、身份、背包和隐藏裁判字段
 * 不会经过该边界。
 *
 * 主线目标和 frontier 的坐标由 navigation 模块在页面内部计算，仅用于决定动作标签，
 * 不会写入视图或 Trace。投影是纯函数，不启动浏览器、不修改 Session、不写存储。
 */

import type { GameSnapshot } from "../../contracts/game/snapshots";
import type {
  DungeonAgentAction,
  DungeonAgentTaskView,
  DungeonAgentTerminalView,
  DungeonAgentView,
} from "./protocol";
import type { VisibleOverlayState } from "./actions";
import { findDungeonAgentObjective } from "./navigation";

function action(id: string, label: string): DungeonAgentAction {
  return { id, label };
}

const EMPTY_OVERLAY: VisibleOverlayState = {
  inspectionOpen: false,
  reviewOpen: false,
  record: null,
  terminal: null,
};

function taskView(snapshot: GameSnapshot): DungeonAgentTaskView | null {
  const brief = snapshot.taskBrief;
  if (!brief) return null;
  return {
    tier: brief.tierLabel,
    situation: brief.situation,
    goal: brief.queryGoal,
    outputs: [...brief.outputColumns],
    fields: brief.fieldGuide.map((field) => ({ ...field })),
    relations: [...brief.relations],
    constraints: [...brief.constraints],
    success: brief.successEffect,
  };
}

function terminalView(
  snapshot: GameSnapshot,
  overlay: VisibleOverlayState,
): DungeonAgentTerminalView | null {
  const terminal = overlay.terminal;
  if (!terminal) return null;
  const challenge = terminal.kind === "challenge"
    ? snapshot.activeGateChallenge
    : null;
  return {
    kind: terminal.kind,
    title: terminal.title,
    objective: challenge?.objective ?? snapshot.missionBody,
    inputSql: terminal.inputSql,
    status: { ...terminal.status },
    lessonId: terminal.kind === "combat" ? snapshot.lessonId : null,
    stageId: terminal.kind === "combat" ? snapshot.lessonStageId : null,
    stageIndex: terminal.kind === "combat" ? snapshot.lessonStageIndex : null,
    task: terminal.kind === "combat" ? taskView(snapshot) : null,
    schema: [...(challenge?.schema ?? snapshot.schema)],
    locks: terminal.kind === "combat" ? [...snapshot.locks] : [],
    hints: [...(challenge?.hints ?? snapshot.hints)],
    result: terminal.result,
    plan: [...terminal.plan],
  };
}

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
  } else if (snapshot.mode === "combat") {
    if (overlay.terminal?.kind !== "combat") {
      actions.push(action("terminal", "打开当前 SQL 战斗终端"));
    }
    actions.push(action("query", "执行当前终端中的 SQL"));
  } else if (snapshot.mode === "challenge") {
    actions.push(action("query", "执行当前终端中的 SQL 密文"));
    actions.push(action("leave-challenge", "安全退出当前 SQL 密文终端"));
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
    terminal: terminalView(snapshot, overlay),
    prompt: snapshot.interactionPrompt,
    banner: snapshot.banner,
  };
}
