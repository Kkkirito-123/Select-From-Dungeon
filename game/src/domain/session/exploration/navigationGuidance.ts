/**
 * GameSession 的纯导航引导计算。
 *
 * 本模块只根据只读地图和进度计算目标、路线及下一引导级别；玩家位置、
 * guidance 字段和 banner 仍由 GameSession 统一提交。
 */
import { NAVIGATION_RUNTIME_CONFIG } from "../../../contracts/config/runtime";
import {
  isMazeWalkable,
  type MazeFloor,
} from "../../exploration/mazeGenerator";
import {
  biomeRegionAt,
  type BiomePlan,
} from "../../exploration/biome";
import { findGridPath } from "../../exploration/pathfinding";
import {
  lessonsForFloor,
  type FloorNumber,
  type RoomGraph,
} from "../../progression/runGraph";
import type {
  GameSnapshot,
  LessonId,
  Monster,
  Position,
} from "../../shared/types";
import { distance } from "../sessionState";
import { livingRequiredBoss } from "../progression/regionAccess";

export interface NavigationGuidanceContext {
  floor: FloorNumber;
  graph: RoomGraph;
  mazeFloor: MazeFloor;
  biomePlan: BiomePlan;
  monsters: readonly Monster[];
  completedLessons: ReadonlySet<LessonId>;
  openedGateIds: ReadonlySet<string>;
  player: Position;
  currentRoomId: string;
}

export interface NavigationGuidanceState {
  objectiveId: string | null;
  steps: number;
  level: 0 | 1 | 2 | 3;
}

interface GuidanceObjective {
  id: string;
  title: string;
  roomNodeId: string | null;
  target: Position;
}

export interface NavigationGuidanceProgress {
  state: NavigationGuidanceState;
  raised: boolean;
  banner: string | null;
}

function guidanceObjective(
  context: NavigationGuidanceContext,
): GuidanceObjective | null {
  const nextLessonId = lessonsForFloor(context.floor)
    .find((lessonId) => !context.completedLessons.has(lessonId));
  if (!nextLessonId) return null;
  const room = context.graph.nodes.find((node) => node.lessonId === nextLessonId);
  const target = room ? context.mazeFloor.anchors[room.id] : null;
  if (!room || !target) return null;

  const rearPortal = context.biomePlan.portals.find((portal) => (
    portal.id === `biome-portal:${context.floor}:middle-rear`
  ));
  const guardian = rearPortal?.requiredBossId === null || rearPortal?.requiredBossId === undefined
    ? null
    : livingRequiredBoss(context.monsters, rearPortal.requiredBossId);
  const middleRegion = rearPortal
    ? context.biomePlan.regions.find((region) => region.id === rearPortal.fromRegionId)
    : null;
  if (
    guardian &&
    rearPortal &&
    middleRegion?.areaBossPosition &&
    biomeRegionAt(context.biomePlan, target).id === rearPortal.toRegionId
  ) {
    return {
      id: `area-boss:${guardian.id}`,
      title: `区域首领 ID #${String(guardian.id).padStart(3, "0")}`,
      roomNodeId: null,
      target: { ...middleRegion.areaBossPosition },
    };
  }
  return {
    id: room.id,
    title: room.title,
    roomNodeId: room.id,
    target: { ...target },
  };
}

function guidanceRoute(
  context: NavigationGuidanceContext,
  target: Position,
): Position[] {
  const rearPortal = context.biomePlan.portals.find((portal) => (
    portal.id === `biome-portal:${context.floor}:middle-rear`
  ));
  const lockedRegionId = rearPortal?.requiredBossId !== null &&
    rearPortal?.requiredBossId !== undefined &&
    livingRequiredBoss(context.monsters, rearPortal.requiredBossId)
      ? rearPortal.toRegionId
      : null;
  return findGridPath(
    context.player,
    target,
    (x, y) => {
      const position = { x, y };
      return isMazeWalkable(
        context.mazeFloor,
        x,
        y,
        context.completedLessons,
        context.openedGateIds,
      ) && (
        lockedRegionId === null ||
        biomeRegionAt(context.biomePlan, position).id !== lockedRegionId
      );
    },
  );
}

export function createNavigationGuidance(
  context: NavigationGuidanceContext,
  state: NavigationGuidanceState,
): GameSnapshot["navigationGuidance"] {
  const objective = guidanceObjective(context);
  const path = objective ? guidanceRoute(context, objective.target) : [];
  const next = path[1];
  const direction = !next
    ? null
    : next.x > context.player.x ? "east"
    : next.x < context.player.x ? "west"
    : next.y > context.player.y ? "south"
    : "north";
  return {
    objectiveRoomId: objective?.roomNodeId ?? objective?.id ?? null,
    objectiveTitle: objective?.title ?? null,
    steps: state.steps,
    level: state.level,
    direction,
    distance: path.length > 0 ? path.length - 1 : null,
    route: state.level >= 2
      ? path
          .slice(1, NAVIGATION_RUNTIME_CONFIG.maxHighlightedCells + 1)
          .map((position) => ({ ...position }))
      : [],
  };
}

export function advanceNavigationGuidance(
  context: NavigationGuidanceContext,
  current: NavigationGuidanceState,
): NavigationGuidanceProgress {
  const objective = guidanceObjective(context);
  if (!objective) {
    return {
      state: { objectiveId: null, steps: 0, level: 0 },
      raised: false,
      banner: null,
    };
  }
  const objectiveChanged = current.objectiveId !== objective.id;
  const base: NavigationGuidanceState = objectiveChanged
    ? { objectiveId: objective.id, steps: 0, level: 0 }
    : { ...current };
  if (
    (objective.roomNodeId !== null && context.currentRoomId === objective.roomNodeId) ||
    (objective.roomNodeId === null && distance(context.player, objective.target) <= 1)
  ) {
    return {
      state: { ...base, steps: 0, level: 0 },
      raised: false,
      banner: null,
    };
  }

  const steps = base.steps + 1;
  const nextLevel: NavigationGuidanceState["level"] =
    steps >= NAVIGATION_RUNTIME_CONFIG.escortAt
      ? 3
      : steps >= NAVIGATION_RUNTIME_CONFIG.routeHighlightAt
        ? 2
        : steps >= NAVIGATION_RUNTIME_CONFIG.directionHintAt ? 1 : 0;
  const state = { ...base, steps, level: Math.max(base.level, nextLevel) as NavigationGuidanceState["level"] };
  if (nextLevel <= base.level) {
    return { state, raised: false, banner: null };
  }

  const guidance = createNavigationGuidance(context, state);
  const directionNames = {
    north: "北",
    east: "东",
    south: "南",
    west: "西",
  } as const;
  const direction = guidance.direction ? directionNames[guidance.direction] : "前";
  const banner = nextLevel === 1
    ? `余烬指路：下一个固定目标「${objective.title}」在${direction}侧，约 ${guidance.distance ?? "?"} 步。`
    : nextLevel === 2
      ? `余烬已高亮前方最多 ${NAVIGATION_RUNTIME_CONFIG.maxHighlightedCells} 格安全路线，目标「${objective.title}」。`
      : `抄写员已启动逐格路线护送，目标「${objective.title}」；按 Escape 可取消。`;
  return { state, raised: true, banner };
}
