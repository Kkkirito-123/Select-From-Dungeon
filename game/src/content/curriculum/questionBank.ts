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
  /** 题库中的稳定主键；同一 bankVersion 内不能重复。 */
  questionId: string;
  /** 题目所属内容版本，和 Run 保存的版本一起决定可复现性。 */
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
  /** 当前题阶牌堆中的游标；抽到末尾后从 0 开始新 cycle。 */
  cursor: number;
  /** 牌堆轮次，用于 seed 洗牌，防止刷新后顺序改变。 */
  cycle: number;
}

export interface PracticeDrawResult {
  questions: PracticeQuestion[];
  state: PracticeDrawState;
}

function shuffled<T>(values: readonly T[], seed: string): T[] {
  // Fisher-Yates 洗牌配合确定性随机源：同一个 seed 得到同一顺序，
  // 但不同 Run 或不同轮次仍能改变题目排列。
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
  // current 是本阶段题，review 是复习题；按比例交错而不是一次性堆在末尾，
  // 让牌堆既覆盖新知识，也持续回看已完成内容。
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
    // Map 只做 questionId -> 题目的索引；原始 questions 顺序仍用于稳定遍历。
    this.byId = new Map(questions.map((question) => [question.questionId, question]));
  }

  /** 按稳定 ID 查找一题；找不到时返回 null，不抛出影响整局的异常。 */
  question(questionId: string): PracticeQuestion | null {
    return this.byId.get(questionId) ?? null;
  }

  /** 过滤出某层题目，供 deck/draw 继续按题阶和 scope 分组。 */
  questionsForFloor(floor: FloorNumber): PracticeQuestion[] {
    return this.questions.filter((question) => question.floor === floor);
  }

  deck(
    floor: FloorNumber,
    runSeed: string,
    cycle: number,
    tier: PracticeQuestionTier,
  ): PracticeQuestion[] {
    // 先按楼层和题阶切片，再分别洗 current/review，最后交错合并。
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
    // draw 只推进内存中的 cursor/cycle；调用方负责把新状态写回 GameSession 存档。
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
