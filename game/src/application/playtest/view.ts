/**
 * 试玩桥的玩家投影与确定性寻路辅助。
 *
 * 本模块只把现有 `GameSnapshot` 裁剪为人类界面已经公开的有限字段，并在已发现区域
 * 内选择目标或最近 frontier。它不执行移动、读取管理员答案、返回完整地图，也不做
 * 隐藏裁判判断。所有输出只在开发态桥和本机 Runner 之间传递。
 */

import type { GameSnapshot } from "../../contracts/game/snapshots";
import { isMazeWalkable } from "../../domain/exploration/mazeGenerator";
import type { PlaytestMode } from "./mode";

/** 宏移动遇到语义变化时的固定停止原因。 */
export type PlaytestStopReason = "mode" | "health" | "floor" | "task" | "action";

/** Runner 可以选择的稳定动作 ID 与玩家可见标签。 */
export interface PlaytestAction {
  id: string;
  label: string;
}

/** 经过裁剪的玩家可见状态；禁止扩展为完整快照或管理员数据。 */
export interface PlaytestView {
  floor: number;
  mode: GameSnapshot["mode"];
  assist: boolean;
  answerReady: boolean;
  hp: { current: number; max: number; armor: number };
  room: string;
  mission: { title: string; body: string; lesson: string };
  combat: {
    target: string;
    round: number;
    task: Omit<NonNullable<GameSnapshot["taskBrief"]>, "hints"> | null;
    schema: readonly string[];
    hints: readonly string[];
  } | null;
  progress: {
    lessons: number;
    rooms: number;
    moves: number;
    queries: number;
    hintLevel: number;
  };
  record: { kicker: string; title: string; body: string } | null;
  prompt: string;
  banner: string;
  actions: readonly PlaytestAction[];
}

interface OverlayState {
  inspectionOpen: boolean;
  reviewOpen: boolean;
  settlementOpen?: boolean;
  record?: { kicker: string; title: string; body: string } | null;
}

const action = (id: string, label: string): PlaytestAction => ({ id, label });

/**
 * 构造玩家可见投影。
 * @param snapshot 当前临时 Session 快照，只在本函数内裁剪。
 * @param mode 已校验的试玩模式，用于决定是否提供目标动作和答案可用性布尔值。
 * @param overlay 当前 DOM 覆盖层的有限状态。
 * @param gateAnswerReady 密文挑战是否存在桥内预选答案，不包含答案正文。
 * @returns 不含地图、答案、身份、存档或完整快照的投影。
 */
export function buildPlaytestView(
  snapshot: GameSnapshot,
  mode: PlaytestMode,
  overlay: OverlayState,
  gateAnswerReady = false,
): PlaytestView {
  const actions: PlaytestAction[] = [];
  const addMovement = () => {
    const objective = findPlaytestObjective(snapshot);
    const objectiveVisible = objective !== null && snapshot.discoveredCells.includes(
      `${objective.x}:${objective.y}`,
    );
    if (objective !== null && (mode === "agent" || objectiveVisible)) {
      actions.push(action(
        "objective",
        `沿真实路线前往${snapshot.navigationGuidance.objectiveTitle ?? "当前主线目标"}`,
      ));
    } else {
      actions.push(action("frontier", "探索已发现区域旁的未知位置"));
    }
  };
  if (
    overlay.settlementOpen &&
    (snapshot.mode === "transition" || snapshot.mode === "victory")
  ) {
    actions.push(action("wait", "等待战斗结算完成"));
  } else if (overlay.inspectionOpen) {
    actions.push(action("continue", "继续当前记录"));
    if (snapshot.mode === "explore") addMovement();
  } else if (overlay.reviewOpen || snapshot.mode === "death-review") {
    actions.push(action("close-review", "关闭复盘"));
  } else if (snapshot.mode === "explore") {
    addMovement();
    if (snapshot.interactionPrompt.startsWith("E")) {
      actions.push(action("interact", snapshot.interactionPrompt));
    }
  } else if (snapshot.mode === "combat" || snapshot.mode === "challenge") {
    actions.push(action("query", snapshot.mode === "combat" ? "提交当前答案" : "提交密文答案"));
  } else if (snapshot.mode === "campfire") {
    actions.push(action("rest", "在此休息"), action("leave", "离开篝火"));
  } else if (snapshot.mode === "loot") {
    actions.push(action("take-all", "尽量领取全部战利品"), action("leave-loot", "保留并离开"));
  } else if (snapshot.mode === "inventory") {
    actions.push(action("close-inventory", "关闭背包"));
  } else if (snapshot.mode === "victory") {
    actions.push(action("continue", "继续 MIGRATE 终章"));
  }

  return {
    floor: snapshot.floor,
    mode: snapshot.mode,
    assist: false,
    answerReady: mode === "agent" && (
      snapshot.adminAnswerSql !== null || (snapshot.mode === "challenge" && gateAnswerReady)
    ),
    hp: {
      current: snapshot.player.hp,
      max: snapshot.player.maxHp,
      armor: snapshot.player.armorHp,
    },
    room: snapshot.currentRoomTitle,
    mission: {
      title: snapshot.missionTitle,
      body: snapshot.missionBody,
      lesson: snapshot.lessonIntro,
    },
    combat: snapshot.mode === "combat"
      ? {
          target: snapshot.focusMonsterId === null
            ? "ID #---"
            : `ID #${String(snapshot.focusMonsterId).padStart(3, "0")}`,
          round: snapshot.combat?.round ?? 0,
          task: snapshot.taskBrief ? (({ hints: _hints, ...task }) => task)(snapshot.taskBrief) : null,
          schema: snapshot.schema,
          hints: snapshot.hints,
        }
      : null,
    progress: {
      lessons: snapshot.completedLessons.length,
      rooms: snapshot.completedRoomIds.length,
      moves: snapshot.totalMoves,
      queries: snapshot.queryCount,
      hintLevel: snapshot.hintLevel,
    },
    record: overlay.inspectionOpen ? overlay.record ?? null : null,
    prompt: snapshot.interactionPrompt,
    banner: snapshot.banner,
    actions,
  };
}

/**
 * 查找当前主线目标坐标。
 * @param snapshot 当前楼层快照。
 * @returns 课程怪物、房间锚点或楼层钥匙坐标；没有目标时返回 `null`。
 * @remarks 坐标只在浏览器桥内部用于 BFS，不进入 Node 报告或模型上下文。
 */
export function findPlaytestObjective(
  snapshot: GameSnapshot,
): { x: number; y: number } | null {
  const objectiveId = snapshot.navigationGuidance.objectiveRoomId;
  if (objectiveId?.startsWith("area-boss:")) {
    const monsterId = Number(objectiveId.slice("area-boss:".length));
    const actor = snapshot.worldActors.find((entry) => entry.monsterId === monsterId);
    if (actor) return { x: actor.x, y: actor.y };
  }
  if (objectiveId) {
    const actor = snapshot.worldActors.find((entry) => (
      entry.roomNodeId === objectiveId &&
      snapshot.monsters.some((monster) => monster.id === entry.monsterId && monster.hp > 0)
    ));
    if (actor) return { x: actor.x, y: actor.y };
    const anchor = snapshot.mazeFloor.anchors[objectiveId];
    if (anchor) return { ...anchor };
  }
  const floorKey = snapshot.groundItems.find((item) => item.rewardId === "floor-key");
  return floorKey ? { x: floorKey.x, y: floorKey.y } : null;
}

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

/**
 * 返回最近的未知可走 frontier。
 * @param snapshot 当前楼层快照。
 * @param discovered 已发现坐标集合；默认取玩家真实发现记录。
 * @returns 与已发现区域相邻的最近未知格，找不到时返回 `null`。
 */
export function findPlaytestFrontier(
  snapshot: GameSnapshot,
  discovered: ReadonlySet<string> = new Set(snapshot.discoveredCells),
): { x: number; y: number } | null {
  const start = { x: snapshot.player.x, y: snapshot.player.y };
  const key = (x: number, y: number) => `${x}:${y}`;
  const queue = [start];
  const seen = new Set([key(start.x, start.y)]);
  const completed = new Set(snapshot.completedLessons);
  const opened = new Set(snapshot.openedGateIds);
  const campfires = new Set(snapshot.campfires.map((entry) => key(entry.x, entry.y)));
  let index = 0;
  while (index < queue.length) {
    const current = queue[index++];
    if (!current) break;
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next.x, next.y);
      if (
        campfires.has(nextKey) ||
        !isMazeWalkable(snapshot.mazeFloor, next.x, next.y, completed, opened)
      ) continue;
      if (!discovered.has(nextKey)) return next;
      if (seen.has(nextKey)) continue;
      seen.add(nextKey);
      queue.push(next);
    }
  }
  return null;
}

/**
 * 判断一批真实移动是否应在语义事件处停止并重新规划。
 * @param before 移动前快照。
 * @param after 单步移动后快照。
 * @returns 固定停止原因；无关键变化时返回 `null`。
 */
export function moveShouldStop(
  before: GameSnapshot,
  after: GameSnapshot,
): PlaytestStopReason | null {
  if (after.mode !== before.mode) return "mode";
  if (after.player.hp !== before.player.hp || after.player.armorHp !== before.player.armorHp) {
    return "health";
  }
  if (after.floor !== before.floor) return "floor";
  if (
    after.lessonStageId !== before.lessonStageId ||
    after.missionTitle !== before.missionTitle ||
    after.completedLessons.length !== before.completedLessons.length
  ) return "task";
  if (after.interactionPrompt !== before.interactionPrompt && after.interactionPrompt.startsWith("E")) {
    return "action";
  }
  return null;
}
