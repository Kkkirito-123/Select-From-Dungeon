/**
 * 题库内容模型和确定性抽题逻辑。
 *
 * 题目正文来自静态 SQLite 题库；本模块负责题目类型、版本和抽题结果
 * 的内容转换，不负责浏览器缓存、不负责存档，也不改变战斗状态。
 */
import type {
  AuthoredLessonStageId,
  LessonStageDefinition,
  QueryFeature,
} from "../../domain/shared/types";
import {
  createSeededRandom,
  type FloorNumber,
  type RunLessonId,
} from "../../domain/progression/runGraph";
import {
  QUESTION_BANK_CONFIG,
  type PracticeQuestionTier,
} from "../../contracts/config/questionBank";

export const QUESTION_BANK_VERSION = QUESTION_BANK_CONFIG.version;
export const QUESTIONS_PER_FLOOR = QUESTION_BANK_CONFIG.questionsPerFloor;
export type { PracticeQuestionTier } from "../../contracts/config/questionBank";

export type PracticeQuestionScope = "current" | "review";

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

function interleaveScopeDeck(
  current: readonly PracticeQuestion[],
  review: readonly PracticeQuestion[],
): PracticeQuestion[] {
  if (review.length === 0) return [...current];
  const deck: PracticeQuestion[] = [];
  let currentIndex = 0;
  let reviewIndex = 0;
  const total = current.length + review.length;
  for (let position = 0; position < total; position += 1) {
    const expectedReviewCount = Math.floor(((position + 1) * review.length) / total);
    if (reviewIndex < expectedReviewCount) {
      deck.push(review[reviewIndex++]);
    } else if (currentIndex < current.length) {
      deck.push(current[currentIndex++]);
    } else {
      deck.push(review[reviewIndex++]);
    }
  }
  return deck;
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

  deck(
    floor: FloorNumber,
    runSeed: string,
    cycle: number,
    tier: PracticeQuestionTier,
  ): PracticeQuestion[] {
    const floorQuestions = this.questionsForFloor(floor)
      .filter((question) => question.tier === tier);
    const current = shuffled(
      floorQuestions.filter((question) => question.scope === "current"),
      `${this.version}:${runSeed}:f${floor}:${tier}:current:${cycle}`,
    );
    const review = shuffled(
      floorQuestions.filter((question) => question.scope === "review"),
      `${this.version}:${runSeed}:f${floor}:${tier}:review:${cycle}`,
    );
    return interleaveScopeDeck(current, review);
  }

  draw(
    floor: FloorNumber,
    runSeed: string,
    state: PracticeDrawState,
    unlockedLessons: ReadonlySet<RunLessonId>,
    count: number,
    tier: PracticeQuestionTier,
  ): PracticeDrawResult {
    const questions: PracticeQuestion[] = [];
    let cursor = Math.max(0, state.cursor);
    let cycle = Math.max(0, state.cycle);
    let inspected = 0;
    const tierQuestionCount = this.questionsForFloor(floor)
      .filter((question) => question.tier === tier).length;
    const maximumInspections = Math.max(
      tierQuestionCount * QUESTION_BANK_CONFIG.drawInspectionMultiplier,
      count * QUESTION_BANK_CONFIG.drawCountInspectionMultiplier,
    );
    while (questions.length < count && inspected < maximumInspections) {
      const deck = this.deck(floor, runSeed, cycle, tier);
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
      flatSelect: question.floor === QUESTION_BANK_CONFIG.firstFloor,
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
