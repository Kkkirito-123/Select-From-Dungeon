import type { GameSnapshot, LessonId, Position } from "../domain/types";
import { WORLD_UI_RUNTIME_CONFIG } from "../config/runtimeConfig";

export const INTERACTION_LABEL_DISTANCE = WORLD_UI_RUNTIME_CONFIG.interactionLabelDistance;
export const MONSTER_LABEL_DISTANCE = WORLD_UI_RUNTIME_CONFIG.monsterLabelDistance;
export const OBJECTIVE_HIDE_DISTANCE = MONSTER_LABEL_DISTANCE;

export interface TutorialObjective {
  monsterId: number;
  lessonId: LessonId;
  position: Position;
}

export function gridDistance(left: Position, right: Position): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

export function isNearPlayer(
  player: Position,
  target: Position,
  maximumDistance: number,
): boolean {
  return gridDistance(player, target) <= maximumDistance;
}

/**
 * The tutorial marker must resolve from the current actor position on every
 * render. World actors can move between snapshots, while room anchors cannot.
 */
export function tutorialObjective(snapshot: GameSnapshot): TutorialObjective | null {
  const tutorialRoom = snapshot.roomGraph.nodes.find((room) => room.type === "tutorial");
  const lessonId = tutorialRoom?.lessonId;
  if (!lessonId || snapshot.completedLessons.includes(lessonId)) return null;

  const monster = snapshot.monsters.find((entry) => (
    entry.lessonId === lessonId &&
    entry.encounterType === "curriculum" &&
    entry.hp > 0
  ));
  const actor = snapshot.worldActors.find((entry) => entry.monsterId === monster?.id);
  if (!monster || !actor) return null;

  return {
    monsterId: monster.id,
    lessonId,
    position: { x: actor.x, y: actor.y },
  };
}

export function shouldShowTutorialBeacon(
  snapshot: GameSnapshot,
  objective: TutorialObjective,
): boolean {
  const objectiveCell = `${objective.position.x}:${objective.position.y}`;
  return (
    !snapshot.adminMode &&
    !snapshot.discoveredCells.includes(objectiveCell) &&
    !isNearPlayer(snapshot.player, objective.position, OBJECTIVE_HIDE_DISTANCE)
  );
}
