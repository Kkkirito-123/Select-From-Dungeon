/**
 * Dungeon Agent 的内部导航与移动停止判定。
 *
 * 本模块只在浏览器内使用完整 `GameSnapshot` 计算主线目标、已发现区域 frontier 和有限
 * BFS 路径；坐标不会进入协议返回值、日志或 Trace。它不触发移动、不访问 DOM、不安装
 * 全局桥，也不判断隐藏裁判结果。真实一步仍由 `bridge.ts` 发出 `dungeon:move` 事件。
 *
 * 路径只允许经过已发现且当前可走的格子。遇到模式、生命、楼层、任务或交互提示变化时，
 * 移动立即停止，让维护器重新 look，防止宏移动跨过真实游戏语义边界。
 */

import type { GameSnapshot } from "../../contracts/game/snapshots";
import { isMazeWalkable } from "../../domain/exploration/mazeGenerator";
import { findGridPath } from "../../domain/exploration/pathfinding";
import type { DungeonAgentMoveTarget } from "./protocol";

/** 内部导航坐标；只在页面内参与寻路。 */
export interface DungeonAgentPosition {
  x: number;
  y: number;
}

/** 结果中的目标与路径；坐标不得直接传给协议层。 */
export interface DungeonAgentNavigationPlan {
  target: DungeonAgentPosition | null;
  path: readonly DungeonAgentPosition[];
}

const DIRECTIONS: readonly DungeonAgentPosition[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * 查找当前主线目标坐标。
 *
 * @param snapshot 当前楼层快照。
 * @returns 当前课程奖励、课程怪物、房间锚点或楼层钥匙坐标；无目标时返回 `null`。
 * @remarks 坐标仅在浏览器内部用于寻路，不进入协议投影或 Trace。
 */
export function findDungeonAgentObjective(
  snapshot: GameSnapshot,
): DungeonAgentPosition | null {
  const claimableReward = snapshot.claimableReward
    ? snapshot.groundItems.find((item) => (
        item.sourceRoomId === snapshot.currentRoomId
        && item.collection === "interact"
        && item.rewardId === snapshot.claimableReward?.id
      ))
    : null;
  if (claimableReward) return { x: claimableReward.x, y: claimableReward.y };

  const objectiveId = snapshot.navigationGuidance.objectiveRoomId;
  if (objectiveId?.startsWith("area-boss:")) {
    const monsterId = Number(objectiveId.slice("area-boss:".length));
    const actor = snapshot.worldActors.find((entry) => entry.monsterId === monsterId);
    if (actor) return { x: actor.x, y: actor.y };
  }
  if (objectiveId) {
    const actor = snapshot.worldActors.find((entry) => (
      entry.roomNodeId === objectiveId
      && snapshot.monsters.some(
        (monster) => monster.id === entry.monsterId && monster.hp > 0,
      )
    ));
    if (actor) return { x: actor.x, y: actor.y };
    const anchor = snapshot.mazeFloor.anchors[objectiveId];
    if (anchor) return { ...anchor };
  }
  const floorKey = snapshot.groundItems.find((item) => item.rewardId === "floor-key");
  return floorKey ? { x: floorKey.x, y: floorKey.y } : null;
}

/**
 * 在已发现区域边缘寻找最近的未知可走格。
 *
 * @param snapshot 当前楼层快照。
 * @param discovered 已发现坐标集合；测试可传入受控集合。
 * @returns 与已发现区域相邻的最近 frontier，找不到时返回 `null`。
 */
export function findDungeonAgentFrontier(
  snapshot: GameSnapshot,
  discovered: ReadonlySet<string> = new Set(snapshot.discoveredCells),
): DungeonAgentPosition | null {
  const start = { x: snapshot.player.x, y: snapshot.player.y };
  const key = (x: number, y: number): string => `${x}:${y}`;
  const queue = [start];
  const seen = new Set([key(start.x, start.y)]);
  const completedLessons = new Set(snapshot.completedLessons);
  const openedGates = new Set(snapshot.openedGateIds);
  const campfires = new Set(snapshot.campfires.map((entry) => key(entry.x, entry.y)));
  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    if (!current) break;
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next.x, next.y);
      if (
        campfires.has(nextKey)
        || !isMazeWalkable(
          snapshot.mazeFloor,
          next.x,
          next.y,
          completedLessons,
          openedGates,
        )
      ) continue;
      if (!discovered.has(nextKey)) return next;
      if (seen.has(nextKey)) continue;
      seen.add(nextKey);
      queue.push(next);
    }
  }
  return null;
}

/** 真实宏移动遇到语义状态变化时的固定停止原因。 */
export type DungeonAgentMoveStopReason = "mode" | "health" | "floor" | "task" | "action";

/**
 * 判断逐格移动后是否必须停止并让维护器重新观察。
 *
 * @param before 单步移动前快照。
 * @param after 单步移动后快照。
 * @returns 关键语义变化类型；可继续移动时返回 `null`。
 */
export function dungeonAgentMoveStopReason(
  before: GameSnapshot,
  after: GameSnapshot,
): DungeonAgentMoveStopReason | null {
  if (after.mode !== before.mode) return "mode";
  if (
    after.player.hp !== before.player.hp
    || after.player.armorHp !== before.player.armorHp
  ) return "health";
  if (after.floor !== before.floor) return "floor";
  if (
    after.lessonStageId !== before.lessonStageId
    || after.missionTitle !== before.missionTitle
    || after.completedLessons.length !== before.completedLessons.length
  ) return "task";
  if (
    after.interactionPrompt !== before.interactionPrompt
    && after.interactionPrompt.startsWith("E")
  ) return "action";
  return null;
}

function pathWithinDiscoveredArea(
  snapshot: GameSnapshot,
  target: DungeonAgentPosition,
): DungeonAgentPosition[] {
  const discovered = new Set(snapshot.discoveredCells);
  const completedLessons = new Set(snapshot.completedLessons);
  const openedGates = new Set(snapshot.openedGateIds);
  const campfires = new Set(
    snapshot.campfires.map((entry) => `${entry.x}:${entry.y}`),
  );
  return findGridPath(snapshot.player, target, (x, y) => (
    discovered.has(`${x}:${y}`)
    && !campfires.has(`${x}:${y}`)
    && isMazeWalkable(
      snapshot.mazeFloor,
      x,
      y,
      completedLessons,
      openedGates,
    )
  ));
}

function pathToFrontier(
  snapshot: GameSnapshot,
  frontier: DungeonAgentPosition,
): DungeonAgentPosition[] {
  const discovered = new Set(snapshot.discoveredCells);
  const adjacent = DIRECTIONS.map((direction) => ({
    x: frontier.x + direction.x,
    y: frontier.y + direction.y,
  }));
  const approach = adjacent.find((point) => discovered.has(`${point.x}:${point.y}`));
  if (!approach) return [];
  const path = pathWithinDiscoveredArea(snapshot, approach);
  if (path.length > 0) path.push(frontier);
  return path;
}

/**
 * 根据语义目标生成一次受限导航计划。
 *
 * @param snapshot 当前浏览器内快照。
 * @param target `objective` 或 `frontier`，来自协议固定枚举。
 * @returns 目标不可见时 target 为 null；无已发现路径时保留目标但 path 为空。
 */
export function planDungeonAgentNavigation(
  snapshot: GameSnapshot,
  target: DungeonAgentMoveTarget,
): DungeonAgentNavigationPlan {
  const targetPosition = target === "objective"
    ? findDungeonAgentObjective(snapshot)
    : findDungeonAgentFrontier(snapshot);
  if (!targetPosition) return { target: null, path: [] };

  let path = pathWithinDiscoveredArea(snapshot, targetPosition);
  if (path.length === 0) {
    const frontier = target === "frontier"
      ? targetPosition
      : findDungeonAgentFrontier(snapshot);
    path = frontier ? pathToFrontier(snapshot, frontier) : [];
  }
  return { target: targetPosition, path };
}
