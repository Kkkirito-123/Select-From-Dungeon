/**
 * 分级练习题库运行时目录。
 * 题目来自校验过的 SQLite 题库，运行时只负责查询、分层抽取和确定性洗牌。
 */
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
import {
  QUESTION_BANK_CONFIG,
  type PracticeQuestionTier,
} from "../config/questionBankConfig";

export const QUESTION_BANK_VERSION = QUESTION_BANK_CONFIG.version;
export const QUESTIONS_PER_FLOOR = QUESTION_BANK_CONFIG.questionsPerFloor;
export type { PracticeQuestionTier } from "../config/questionBankConfig";

export type PracticeQuestionScope = "current" | "review";

export interface PracticeQuestion {
  /** 一道可执行、可判定且绑定课程契约的练习题。 */
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
  /** 某楼层/层级牌组的游标和循环编号。 */
  cursor: number;
  cycle: number;
}

export interface PracticeDrawResult {
  /** 一次抽题结果及更新后的牌组状态。 */
  questions: PracticeQuestion[];
  state: PracticeDrawState;
}

function shuffled<T>(values: readonly T[], seed: string): T[] {
  // 固定内部世界身份生成确定性顺序，避免刷新后改变题目牌组。
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
  // 交错当前题与复习题，避免跨层复习挤占本层题目。
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
  /** 提供题目查询、楼层过滤和无重复牌组抽取。 */
  private readonly byId: ReadonlyMap<string, PracticeQuestion>;

  constructor(
    readonly version: string,
    readonly questions: readonly PracticeQuestion[],
  ) {
    this.byId = new Map(questions.map((question) => [question.questionId, question]));
  }

  question(questionId: string): PracticeQuestion | null {
    // 按稳定题目 ID 查找，不修改题库内容。
    return this.byId.get(questionId) ?? null;
  }

  questionsForFloor(floor: FloorNumber): PracticeQuestion[] {
    // 返回该楼层全部题目，具体抽取由 deck/draw 控制。
    return this.questions.filter((question) => question.floor === floor);
  }

  deck(
    floor: FloorNumber,
    runSeed: string,
    cycle: number,
    tier: PracticeQuestionTier,
  ): PracticeQuestion[] {
    // 构造一个确定性、按层级隔离的抽取牌组。
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
    // 消费当前游标；耗尽后递增循环编号并重新洗牌。
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
  // 把题库题目映射回现有判题阶段，防止题库绕过课程契约。
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
