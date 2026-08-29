/** 窄 Context 的练习战斗抽题；不提交战斗模式或快照。 */
import { biomeEncounterFor } from "../../../content/world/biomeContent";
import {
  QuestionBankCatalog,
  type PracticeDrawState,
  type PracticeQuestionTier,
} from "../../../content/curriculum/questionBank";
import type {
  LessonId,
  Monster,
} from "../../shared/types";
import type {
  FloorNumber,
  RoomGraph,
  RoomNode,
} from "../../progression/runGraph";

export type PracticeDrawStates = Record<PracticeQuestionTier, PracticeDrawState>;

export interface PracticeBattleContext {
  questionBank: QuestionBankCatalog | null;
  floor: FloorNumber;
  runInstanceId: string;
  monster: Monster;
  practiceDrawStates: Readonly<PracticeDrawStates>;
  masteredLessons: ReadonlySet<LessonId>;
  completedLessons: ReadonlySet<LessonId>;
  graph: Pick<RoomGraph, "nodes">;
  roomAccessMessage: (room: RoomNode) => string | null;
}

export interface PracticeBattlePreparation {
  activePracticeMonsterId: number | null;
  activePracticeQuestionIds: string[];
  practiceDrawStates: PracticeDrawStates;
}

function copyDrawStates(states: Readonly<PracticeDrawStates>): PracticeDrawStates {
  return {
    L1: { ...states.L1 },
    L2: { ...states.L2 },
    L3: { ...states.L3 },
  };
}

function questionBankRole(monster: Monster): "normal" | "mini-elite" | "area-boss" | null {
  if (monster.encounterType !== "ambush") return null;
  const role = biomeEncounterFor(monster.id)?.role;
  return role === "normal" || role === "mini-elite" || role === "area-boss"
    ? role
    : null;
}

/** Draw deterministic practice questions and return the complete state patch. */
export function preparePracticeBattle(
  context: PracticeBattleContext,
): PracticeBattlePreparation {
  const preparation: PracticeBattlePreparation = {
    activePracticeMonsterId: null,
    activePracticeQuestionIds: [],
    practiceDrawStates: copyDrawStates(context.practiceDrawStates),
  };
  const role = questionBankRole(context.monster);
  if (!context.questionBank || !role) return preparation;

  const unlockedLessons = new Set<LessonId>([
    ...context.masteredLessons,
    ...context.completedLessons,
    ...context.graph.nodes
      .filter((room) => room.lessonId && context.roomAccessMessage(room) === null)
      .map((room) => room.lessonId as LessonId),
  ]);
  const count = role === "area-boss" ? 3 : role === "mini-elite" ? 2 : 1;
  const tier: PracticeQuestionTier = role === "area-boss"
    ? "L3"
    : role === "mini-elite" ? "L2" : "L1";
  const draw = context.questionBank.draw(
    context.floor,
    context.runInstanceId,
    context.practiceDrawStates[tier],
    unlockedLessons,
    count,
    tier,
  );
  if (draw.questions.length === 0) return preparation;
  preparation.practiceDrawStates[tier] = { ...draw.state };
  preparation.activePracticeMonsterId = context.monster.id;
  preparation.activePracticeQuestionIds = draw.questions.map((question) => question.questionId);
  return preparation;
}
