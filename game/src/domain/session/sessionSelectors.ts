/**
 * GameSession 的只读派生查询服务。
 *
 * 每个查询只接收完成计算所需的显式上下文，不持有 GameSession 引用，
 * 也不修改集合、玩家状态或快照。状态提交和通知仍由 GameSession 负责。
 */
import type { FloorHiddenAreaDefinition } from "../../content/world/floorExperience/types";
import {
  lessonById,
  practiceStagesFor,
} from "../../content/curriculum/mvpLevel";
import {
  practiceStageForQuestion,
  type PracticeQuestionTier,
  type QuestionBankCatalog,
} from "../../content/curriculum/questionBank";
import { generateFloorHazards, type FloorHazard } from "../exploration/floorLabyrinth";
import type { BiomePlan } from "../exploration/biome";
import type { Campfire } from "../shared/types";
import type { GuidedMapPlan } from "../exploration/guidedMap";
import { distance } from "./sessionState";
import { stagesForEncounter } from "../combat/combatBalance";
import {
  lessonsForFloor,
  type FloorNumber,
  type RoomGraph,
  type RoomNode,
} from "../progression/runGraph";
import type {
  CombatState,
  LessonDefinition,
  LessonId,
  LessonStageDefinition,
  Monster,
  Position,
} from "../shared/types";
import type { WorldActor } from "../exploration/monsterRoaming";
import type { MazeFloor } from "../exploration/mazeGenerator";

export interface RoomSelectionContext {
  graph: RoomGraph;
  currentRoomId: string;
}

export function selectCurrentRoom(context: RoomSelectionContext): RoomNode {
  return context.graph.nodes.find((node) => node.id === context.currentRoomId)
    ?? context.graph.nodes[0]!;
}

export interface LessonSelectionContext extends RoomSelectionContext {
  floor: FloorNumber;
  combat: CombatState | null;
  monsters: readonly Monster[];
  questionBank: QuestionBankCatalog | null;
  activePracticeQuestionIds: readonly string[];
  completedLessons: ReadonlySet<LessonId>;
}

/** 选择当前课程；伏击题库优先，其次是战斗目标、房间课程和楼层下一课。 */
export function selectCurrentLesson(context: LessonSelectionContext): LessonDefinition {
  const practiceLessonId = context.activePracticeQuestionIds
    .map((questionId) => context.questionBank?.question(questionId)?.lessonId)
    .find((lessonId): lessonId is LessonId => lessonId !== undefined);
  if (context.combat?.kind === "ambush" && practiceLessonId) {
    return lessonById(practiceLessonId);
  }
  const combatMonster = context.combat
    ? context.monsters.find((monster) => monster.id === context.combat?.targetId)
    : null;
  if (combatMonster) return lessonById(combatMonster.lessonId);
  const roomLesson = selectCurrentRoom(context).lessonId as LessonId | undefined;
  if (roomLesson) return lessonById(roomLesson);
  const floorLessons = lessonsForFloor(context.floor);
  const nextLesson = floorLessons.find((id) => !context.completedLessons.has(id))
    ?? floorLessons[floorLessons.length - 1];
  return lessonById(nextLesson);
}

export interface CombatStageSelectionContext extends LessonSelectionContext {
  activePracticeMonsterId: number | null;
  worldActors: readonly WorldActor[];
}

export function selectCurrentCombatStages(
  context: CombatStageSelectionContext,
): readonly LessonStageDefinition[] {
  const roomActor = selectActorForRoom({
    worldActors: context.worldActors,
    roomId: context.currentRoomId,
  });
  const targetId = context.combat?.targetId
    ?? (roomActor ? context.monsters.find((monster) => monster.id === roomActor.monsterId)?.id : undefined);
  const monster = targetId === undefined
    ? undefined
    : context.monsters.find((entry) => entry.id === targetId);
  return monster
    ? selectCombatStagesForMonster(context, monster)
    : selectCurrentLesson(context).stages;
}

export interface CombatStagesForMonsterContext extends CombatStageSelectionContext {
  activePracticeQuestionIds: readonly string[];
}

export function selectCombatStagesForMonster(
  context: CombatStagesForMonsterContext,
  monster: Monster,
): readonly LessonStageDefinition[] {
  if (
    context.questionBank &&
    context.activePracticeMonsterId === monster.id &&
    context.activePracticeQuestionIds.length > 0
  ) {
    const stages = context.activePracticeQuestionIds
      .map((questionId) => context.questionBank?.question(questionId))
      .filter((question) => question !== null && question !== undefined)
      .map((question) => practiceStageForQuestion(question, monster.id));
    if (stages.length > 0) return stages;
  }
  const authored = monster.encounterType === "ambush"
    ? practiceStagesFor(monster.id)
    : lessonById(monster.lessonId).stages;
  const floorLessons = lessonsForFloor(monster.floor);
  const lessonIndex = floorLessons.indexOf(monster.lessonId);
  const reviewStages = floorLessons
    .slice(0, Math.max(0, lessonIndex))
    .flatMap((lessonId) => lessonById(lessonId).stages);
  return stagesForEncounter(monster, authored, reviewStages);
}

export interface ActorSelectionContext {
  worldActors: readonly WorldActor[];
}

export function selectActorForRoom(
  context: ActorSelectionContext & { roomId: string },
): WorldActor | undefined {
  return context.worldActors.find((actor) => actor.roomNodeId === context.roomId);
}

export function selectMonsterForCurrentRoom(
  context: ActorSelectionContext & { monsters: readonly Monster[]; roomId: string },
): Monster | undefined {
  const actor = selectActorForRoom(context);
  return actor
    ? context.monsters.find((monster) => monster.id === actor.monsterId)
    : undefined;
}

export function selectLivingActorAt(
  context: ActorSelectionContext & { monsters: readonly Monster[]; position: Position },
): WorldActor | undefined {
  return context.worldActors.find((actor) => {
    const monster = context.monsters.find((entry) => entry.id === actor.monsterId);
    return monster && monster.hp > 0 && actor.x === context.position.x && actor.y === context.position.y;
  });
}

export interface RoomAccessContext {
  graph: RoomGraph;
  completedLessons: ReadonlySet<LessonId>;
  completedRoomIds: ReadonlySet<string>;
  openedGateIds: ReadonlySet<string>;
  hiddenAreas: readonly FloorHiddenAreaDefinition[];
}

export function selectRequiredCompletedRoomIds(
  context: Pick<RoomAccessContext, "graph">,
  room: RoomNode,
): string[] {
  return context.graph.nodes
    .filter((candidate) => (
      candidate.reward === "aggregate-hammer" && candidate.next.includes(room.id)
    ))
    .map((candidate) => candidate.id);
}

export function selectRoomAccessMessage(
  context: RoomAccessContext,
  room: RoomNode,
): string | null {
  const hiddenArea = context.hiddenAreas.find((area) => area.roomNodeId === room.id);
  if (hiddenArea && !context.openedGateIds.has(hiddenArea.gateId)) {
    return `${hiddenArea.title}没有出现在当前路线中。留意附近不自然的墙缝或船体裂口。`;
  }
  if (context.openedGateIds.has(`gate:${room.id}`)) return null;
  const missingLessons = room.prerequisiteLessons.filter(
    (lesson) => !context.completedLessons.has(lesson),
  );
  if (missingLessons.length > 0) {
    return `知识门仍需要：${missingLessons.map((lesson) => lessonById(lesson).concept).join("、")}。`;
  }
  const missingRooms = selectRequiredCompletedRoomIds(context, room).filter(
    (roomId) => !context.completedRoomIds.has(roomId),
  );
  if (missingRooms.length > 0) {
    const shrine = context.graph.nodes.find((candidate) => candidate.id === missingRooms[0]);
    return `聚合门仍锁定：先在「${shrine?.title ?? "聚合战锤祭坛"}」调查核心并领取聚合战锤。`;
  }
  return null;
}

export function selectAvailableRoomIds(
  context: RoomAccessContext,
): string[] {
  return context.graph.nodes
    .filter((room) => selectRoomAccessMessage(context, room) === null)
    .map((room) => room.id);
}

export function selectChallengeGateId(graph: Pick<RoomGraph, "bossId">): string {
  return `gate:${graph.bossId}`;
}

export interface NearbyChallengeGateContext extends RoomAccessContext {
  mazeFloor: MazeFloor;
  player: Position;
}

export function selectNearbyLockedChallengeGate(
  context: NearbyChallengeGateContext,
): MazeFloor["gates"][number] | null {
  const gateId = selectChallengeGateId(context.graph);
  const gate = context.mazeFloor.gates.find((entry) => entry.id === gateId);
  if (!gate || context.openedGateIds.has(gate.id) || distance(gate, context.player) > 1) {
    return null;
  }
  const room = context.graph.nodes.find((entry) => entry.id === gate.roomNodeId);
  return room && selectRoomAccessMessage(context, room) !== null ? gate : null;
}

export interface FloorHazardSelectionContext {
  floor: FloorNumber;
  mazeFloor: MazeFloor;
  campfires: readonly Campfire[];
  guidedMap: GuidedMapPlan;
  biomePlan: BiomePlan;
}

export function selectFloorHazards(
  context: FloorHazardSelectionContext,
): FloorHazard[] {
  return generateFloorHazards(
    context.floor,
    context.mazeFloor,
    context.campfires,
    context.guidedMap,
    context.biomePlan,
  );
}

/** 保持题阶类型在模块边界可见，避免调用方重新声明题库联合类型。 */
export type { PracticeQuestionTier };
