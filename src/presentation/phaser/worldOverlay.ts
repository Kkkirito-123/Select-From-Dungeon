/**
 * 探索场景上的文字/标记覆盖层数据转换。
 * 展示内容由快照和静态内容决定，覆盖层不拥有交互规则或持久化状态。
 */
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { LessonId, Position } from "../../domain/shared/types";
import { WORLD_UI_RUNTIME_CONFIG } from "../../application/config/runtimeConfig";

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
 * 每次渲染都必须根据角色当前位置解析教学标记。世界角色可以在快照之间移动，
 * 房间锚点则保持不变。
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
