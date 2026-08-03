import type {
  AuthoredLessonStageId,
  LessonStageDefinition,
  QueryFeature,
} from "../domain/types";
import {
  createSeededRandom,
  type FloorNumber,
  type RunLessonId,
} from "../domain/runGraph";

export const QUESTION_BANK_VERSION = "question-bank-v1" as const;
export const QUESTIONS_PER_FLOOR = 120;

export type PracticeQuestionScope = "current" | "review";
export type PracticeQuestionTier = "normal" | "elite";

export interface PracticeQuestion {
  questionId: string;
  bankVersion: string;
  floor: FloorNumber;
  scope: PracticeQuestionScope;
  tier: PracticeQuestionTier;
  templateId: string;
  variantIndex: number;
  lessonId: RunLessonId;
  baseStageId: AuthoredLessonStageId;
  objective: string;
  answerSql: string;
  hints: readonly string[];
  requiredFeatures: readonly QueryFeature[];
  expectedColumns: readonly string[];
  expectedRows: readonly unknown[][];
  rowsOrdered: boolean;
  planInclude: readonly string[];
  planExclude: readonly string[];
}

export interface PracticeDrawState {
  cursor: number;
  cycle: number;
}

export interface PracticeDrawResult {
  questions: PracticeQuestion[];
  state: PracticeDrawState;
}

function shuffled<T>(values: readonly T[], seed: string): T[] {
  const random = createSeededRandom(seed);
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function interleaveFloorDeck(
  floor: FloorNumber,
  current: readonly PracticeQuestion[],
  review: readonly PracticeQuestion[],
): PracticeQuestion[] {
  if (floor === 1) return [...current];
  const deck: PracticeQuestion[] = [];
  let currentIndex = 0;
  let reviewIndex = 0;
  while (currentIndex < current.length || reviewIndex < review.length) {
    deck.push(...current.slice(currentIndex, currentIndex + 4));
    currentIndex += 4;
    if (reviewIndex < review.length) deck.push(review[reviewIndex++]);
  }
  return deck;
}

export function practiceQuestionTier(templateId: string): PracticeQuestionTier {
  return templateId.includes("-elite-") ? "elite" : "normal";
}

export class QuestionBankCatalog {
  private readonly byId: ReadonlyMap<string, PracticeQuestion>;

  constructor(
    readonly version: string,
    readonly questions: readonly PracticeQuestion[],
  ) {
    this.byId = new Map(questions.map((question) => [question.questionId, question]));
  }

  question(questionId: string): PracticeQuestion | null {
    return this.byId.get(questionId) ?? null;
  }

  questionsForFloor(floor: FloorNumber): PracticeQuestion[] {
    return this.questions.filter((question) => question.floor === floor);
  }

  deck(floor: FloorNumber, runSeed: string, cycle: number): PracticeQuestion[] {
    const floorQuestions = this.questionsForFloor(floor);
    const current = shuffled(
      floorQuestions.filter((question) => question.scope === "current"),
      `${this.version}:${runSeed}:f${floor}:current:${cycle}`,
    );
    const review = shuffled(
      floorQuestions.filter((question) => question.scope === "review"),
      `${this.version}:${runSeed}:f${floor}:review:${cycle}`,
    );
    return interleaveFloorDeck(floor, current, review);
  }

  draw(
    floor: FloorNumber,
    runSeed: string,
    state: PracticeDrawState,
    unlockedLessons: ReadonlySet<RunLessonId>,
    count: number,
    tier: PracticeQuestionTier = "normal",
  ): PracticeDrawResult {
    const questions: PracticeQuestion[] = [];
    let cursor = Math.max(0, state.cursor);
    let cycle = Math.max(0, state.cycle);
    let inspected = 0;
    const maximumInspections = Math.max(QUESTIONS_PER_FLOOR * 4, count * 8);
    while (questions.length < count && inspected < maximumInspections) {
      const deck = this.deck(floor, runSeed, cycle);
      if (deck.length === 0) break;
      if (cursor >= deck.length) {
        cursor = 0;
        cycle += 1;
        continue;
      }
      const candidate = deck[cursor++];
      inspected += 1;
      if (
        candidate.tier === tier &&
        unlockedLessons.has(candidate.lessonId) &&
        !questions.some((question) => question.questionId === candidate.questionId)
      ) questions.push(candidate);
    }
    return { questions, state: { cursor, cycle } };
  }
}

export function practiceStageForQuestion(
  question: PracticeQuestion,
  targetMonsterId: number,
): LessonStageDefinition {
  return {
    id: `question:${question.questionId}`,
    evaluationStageId: question.baseStageId,
    questionId: question.questionId,
    questionLessonId: question.lessonId,
    questionExpectation: {
      columns: [...question.expectedColumns],
      rows: question.expectedRows.map((row) => [...row]),
      rowsOrdered: question.rowsOrdered,
      planInclude: [...question.planInclude],
      planExclude: [...question.planExclude],
      flatSelect: question.floor === 1,
    },
    objective: question.objective,
    queryTemplate: "",
    answerSql: question.answerSql,
    hints: [...question.hints],
    locks: question.requiredFeatures.map((feature) => feature.toUpperCase()),
    requiredFeatures: [...question.requiredFeatures],
    attackTargetIds: [targetMonsterId],
  };
}
