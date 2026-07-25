import { legacyMonsterIdForCurrent } from "../content/monsterIds";
import type { LessonId, Position } from "./types";
import { createSeededRandom } from "./runGraph";
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
 * Patrol actors stay inside the walkable interior of their authored room.
 * The one-tile boundary contains the room gate, while anything outside it is
 * shared maze corridor, so excluding both keeps monsters away from gates and
 * chokepoints without coupling patrol behavior to a particular gate direction.
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
      legacyMonsterIdForCurrent(actor.monsterId)
    }:${nextTick}`,
  );
  // An explicit idle choice keeps patrols readable and avoids relentless pursuit.
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
