/**
 * 世界怪物巡逻的确定性规则。
 * 只计算单个 actor 的下一步和是否接触玩家，GameSession 负责批量应用
 * 结果并决定是否开始战斗。
 */
import { monsterRandomSeedId } from "../../content/world/monsterIds";
import type { LessonId, Position } from "../shared/types";
import { createSeededRandom } from "../progression/runGraph";
import { isMazeWalkable, type MazeFloor } from "./mazeGenerator";

export interface WorldActor extends Position {
  monsterId: number;
  roomNodeId: string;
  home: Position;
  behavior: "wander" | "guard" | "anchored";
  roamRadius: number;
  moveTick: number;
}

export interface PatrolContext {
  floor: MazeFloor;
  completedLessons: ReadonlySet<LessonId>;
  player: Position;
  occupied: ReadonlySet<string>;
  blocked: ReadonlySet<string>;
}

export interface PatrolResolution {
  actor: WorldActor;
  moved: boolean;
  encounter: boolean;
}

const DIRECTIONS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

function key(position: Position): string {
  return `${position.x}:${position.y}`;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * 巡逻角色只能停留在设计房间的可行走内部。外侧一格边界包含房门，
 * 再向外则是共享迷宫走廊；同时排除两者可以让怪物远离门口和咽喉点，
 * 又不会让巡逻规则依赖某个具体的门方向。
 */
export function isActorPatrolPosition(
  actor: Pick<WorldActor, "roomNodeId">,
  floor: MazeFloor,
  position: Position,
): boolean {
  const zone = floor.zones.find((entry) => entry.roomNodeId === actor.roomNodeId);
  if (!zone) return false;
  const insideRoomInterior =
    position.x > zone.x &&
    position.x < zone.x + zone.width - 1 &&
    position.y > zone.y &&
    position.y < zone.y + zone.height - 1;
  if (!insideRoomInterior) return false;
  return !floor.gates.some((gate) => samePosition(gate, position));
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function advanceMonsterPatrol(
  actor: WorldActor,
  context: PatrolContext,
): PatrolResolution {
  const nextTick = actor.moveTick + 1;
  if (actor.behavior === "anchored") {
    return { actor: { ...actor, home: { ...actor.home }, moveTick: nextTick }, moved: false, encounter: false };
  }
  const random = createSeededRandom(
    `select-from-dungeon:patrol:v1:${context.floor.seed}:${
      monsterRandomSeedId(actor.monsterId)
    }:${nextTick}`,
  );
  // 显式加入原地等待，使巡逻节奏清晰，也避免怪物持续追赶玩家。
  const directions = shuffled(DIRECTIONS, random);
  for (const direction of directions) {
    const target = { x: actor.x + direction.x, y: actor.y + direction.y };
    const targetKey = key(target);
    if (manhattan(target, actor.home) > actor.roamRadius) continue;
    if (!isActorPatrolPosition(actor, context.floor, target)) continue;
    if (!isMazeWalkable(context.floor, target.x, target.y, context.completedLessons)) continue;
    if (context.blocked.has(targetKey)) continue;
    if (context.occupied.has(targetKey) && targetKey !== key(actor)) continue;
    if (samePosition(target, context.player)) {
      return {
        actor: { ...actor, home: { ...actor.home }, moveTick: nextTick },
        moved: false,
        encounter: true,
      };
    }
    return {
      actor: { ...actor, ...target, home: { ...actor.home }, moveTick: nextTick },
      moved: direction.x !== 0 || direction.y !== 0,
      encounter: false,
    };
  }
  return { actor: { ...actor, home: { ...actor.home }, moveTick: nextTick }, moved: false, encounter: false };
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function cloneWorldActor(actor: WorldActor): WorldActor {
  return { ...actor, home: { ...actor.home } };
}
