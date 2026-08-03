import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
/** 验证题库完整性、分级牌组、参数化变体和现有判题契约。 */
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import {
  QuestionBankCatalog,
  practiceStageForQuestion,
  type PracticeQuestionTier,
} from "../src/content/questionBank";
import { QUESTION_BANK_CONFIG } from "../src/config/questionBankConfig";
import { BIOME_ENCOUNTERS } from "../src/content/biomeContent";
import { INITIAL_MONSTERS, LESSONS } from "../src/content/mvpLevel";
import { evaluateStage } from "../src/domain/lessonEvaluator";
import { lessonsForFloor } from "../src/domain/runGraph";
import { loadBundledQuestionBank } from "../src/runtime/questionBankLoader";
import { SqlEngine } from "../src/sql/SqlEngine";

async function fixtureFetcher(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.endsWith("question-bank-manifest.json")) {
    return new Response(await readFile(resolve("public/data/question-bank-manifest.json")));
  }
  if (url.endsWith("question-bank-v2.sqlite")) {
    return new Response(await readFile(resolve("public/data/question-bank-v2.sqlite")));
  }
  return new Response(null, { status: 404 });
}

const wasmLocation = resolve("node_modules/sql.js/dist/sql-wasm.wasm");

describe("question bank v2", () => {
  it("loads one verified read-only catalog with 120 questions per floor", async () => {
    const catalog = await loadBundledQuestionBank(
      "/",
      fixtureFetcher as typeof fetch,
      null,
      undefined,
      wasmLocation,
    );
    expect(catalog).toBeInstanceOf(QuestionBankCatalog);
    expect(catalog?.questions).toHaveLength(QUESTION_BANK_CONFIG.totalQuestions);
    const lastFloor = QUESTION_BANK_CONFIG.firstFloor + QUESTION_BANK_CONFIG.floorCount - 1;
    for (let floor = QUESTION_BANK_CONFIG.firstFloor; floor <= lastFloor; floor += 1) {
      const questions = catalog?.questionsForFloor(floor as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) ?? [];
      expect(questions).toHaveLength(QUESTION_BANK_CONFIG.questionsPerFloor);
      expect(new Set(questions.map((question) => question.questionId)).size)
        .toBe(QUESTION_BANK_CONFIG.questionsPerFloor);
      expect(questions.every((question) => (
        /^question-bank-v2:f[1-8]:(?:current|review):t\d{2}:v[1-8]$/u.test(question.questionId)
      ))).toBe(true);
      if (floor === QUESTION_BANK_CONFIG.firstFloor) {
        expect(questions.every((question) => question.scope === "current")).toBe(true);
      } else {
        expect(questions.filter((question) => question.scope === "current")).toHaveLength(96);
        expect(questions.filter((question) => question.scope === "review")).toHaveLength(24);
      }
      expect(questions.filter((question) => question.tier === "L1")).toHaveLength(
        QUESTION_BANK_CONFIG.familiesPerTier.L1 * QUESTION_BANK_CONFIG.variantsPerFamily,
      );
      expect(questions.filter((question) => question.tier === "L2")).toHaveLength(
        QUESTION_BANK_CONFIG.familiesPerTier.L2 * QUESTION_BANK_CONFIG.variantsPerFamily,
      );
      expect(questions.filter((question) => question.tier === "L3")).toHaveLength(
        QUESTION_BANK_CONFIG.familiesPerTier.L3 * QUESTION_BANK_CONFIG.variantsPerFamily,
      );
      expect(questions.filter((question) => question.tier !== "L1" && question.scope === "review"))
        .toHaveLength(0);
      if (floor >= QUESTION_BANK_CONFIG.reviewStartsAtFloor) {
        expect(questions.filter((question) => question.tier === "L1" && question.scope === "current"))
          .toHaveLength(
            (QUESTION_BANK_CONFIG.familiesPerTier.L1 - QUESTION_BANK_CONFIG.reviewFamiliesPerFloor) *
              QUESTION_BANK_CONFIG.variantsPerFamily,
          );
        expect(questions.filter((question) => question.tier === "L1" && question.scope === "review"))
          .toHaveLength(
            QUESTION_BANK_CONFIG.reviewFamiliesPerFloor *
              QUESTION_BANK_CONFIG.variantsPerFamily,
          );
      }
      expect(new Set(questions.map((question) => (
        `${question.objective}\u0000${question.answerSql}`
      ))).size).toBe(120);
    }
  });

  it("stores tier as an explicit constrained SQLite column", async () => {
    const SQL = await initSqlJs({ locateFile: () => wasmLocation });
    const bytes = await readFile(resolve("public/data/question-bank-v2.sqlite"));
    const database = new SQL.Database(bytes);
    try {
      const columns = database.exec("PRAGMA table_info(questions)")[0]?.values ?? [];
      expect(columns.some((column) => column[1] === "tier")).toBe(true);
      const counts = database.exec(`
        SELECT floor, tier, COUNT(*)
          FROM questions
         GROUP BY floor, tier
         ORDER BY floor, tier
      `)[0]?.values ?? [];
      expect(counts).toHaveLength(24);
      const lastFloor = QUESTION_BANK_CONFIG.firstFloor + QUESTION_BANK_CONFIG.floorCount - 1;
      for (let floor = QUESTION_BANK_CONFIG.firstFloor; floor <= lastFloor; floor += 1) {
        expect(counts.filter((row) => row[0] === floor)).toEqual([
          [floor, "L1", 64],
          [floor, "L2", 40],
          [floor, "L3", 16],
        ]);
      }
    } finally {
      database.close();
    }
  });

  it("does not expose worksheet labels and gives every family eight material SQL variants", async () => {
    const catalog = await loadBundledQuestionBank(
      "/",
      fixtureFetcher as typeof fetch,
      null,
      undefined,
      wasmLocation,
    );
    expect(catalog).not.toBeNull();
    expect(catalog?.questions.every((question) => !question.objective.includes("练习卷"))).toBe(true);
    expect(catalog?.questions.every((question) => (
      question.expectedRows.length > 0 || question.objective.includes("应返回空结果")
    ))).toBe(true);
    const families = new Map<string, NonNullable<typeof catalog>["questions"][number][]>();
    (catalog?.questions ?? []).forEach((question) => {
      families.set(question.templateId, [
        ...(families.get(question.templateId) ?? []),
        question,
      ]);
    });
    expect(families.size).toBe(8 * 15);
    families.forEach((questions) => {
      expect(questions).toHaveLength(8);
      expect(new Set(questions.map((question) => question.baseStageId)).size).toBe(1);
      expect(new Set(questions.map((question) => (
        `${question.objective}\u0000${question.answerSql}`
      ))).size).toBe(8);
    });
  });

  it("filters and shuffles each tier independently without repeats before exhaustion", async () => {
    const catalog = await loadBundledQuestionBank(
      "/",
      fixtureFetcher as typeof fetch,
      null,
      undefined,
      wasmLocation,
    );
    expect(catalog).not.toBeNull();
    const unlocked = new Set([
      ...lessonsForFloor(1),
      ...lessonsForFloor(2),
    ]);
    const tierCounts: Record<PracticeQuestionTier, number> = Object.fromEntries(
      Object.entries(QUESTION_BANK_CONFIG.familiesPerTier).map(([tier, families]) => (
        [tier, families * QUESTION_BANK_CONFIG.variantsPerFamily]
      )),
    ) as Record<PracticeQuestionTier, number>;
    const drawn = new Map<PracticeQuestionTier, string[]>([
      ["L1", []],
      ["L2", []],
      ["L3", []],
    ]);
    const states: Record<PracticeQuestionTier, { cursor: number; cycle: number }> = {
      L1: { cursor: 0, cycle: 0 },
      L2: { cursor: 0, cycle: 0 },
      L3: { cursor: 0, cycle: 0 },
    };
    for (let round = 0; round < 64; round += 1) {
      for (const tier of ["L1", "L2", "L3"] as const) {
        if ((drawn.get(tier)?.length ?? 0) >= tierCounts[tier]) continue;
        const draw = catalog?.draw(2, "bank-deck-test", states[tier], unlocked, 1, tier);
        expect(draw?.questions).toHaveLength(1);
        expect(draw?.questions[0]?.tier).toBe(tier);
        drawn.get(tier)?.push(draw?.questions[0]?.questionId ?? "");
        states[tier] = draw?.state ?? states[tier];
      }
    }
    for (const tier of ["L1", "L2", "L3"] as const) {
      const deck = catalog?.deck(2, "bank-deck-test", 0, tier) ?? [];
      expect(deck).toHaveLength(tierCounts[tier]);
      expect(deck.every((question) => question.tier === tier)).toBe(true);
      expect(new Set(drawn.get(tier)).size).toBe(tierCounts[tier]);
    }
  });

  it("rejects a bank whose bytes do not match the manifest hash", async () => {
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      if (String(input).endsWith("question-bank-manifest.json")) {
        return fixtureFetcher(input);
      }
      return new Response(new Uint8Array([1, 2, 3]));
    };
    await expect(loadBundledQuestionBank("/", fetcher as typeof fetch)).resolves.toBeNull();
  });

  it("960 题都绑定现有判题契约，跨层复习只使用可在目标层执行的只读 SQL", async () => {
    const catalog = await loadBundledQuestionBank(
      "/",
      fixtureFetcher as typeof fetch,
      null,
      undefined,
      wasmLocation,
    );
    const stages = new Set([
      ...LESSONS.flatMap((lesson) => lesson.stages.map((stage) => stage.id)),
      ...BIOME_ENCOUNTERS.flatMap((encounter) => encounter.stages.map((stage) => stage.id)),
    ]);
    expect(catalog?.questions.every((question) => (
      stages.has(question.baseStageId) &&
      question.answerSql.trim().length > 0 &&
      (question.scope !== "review" || /^\s*(?:SELECT|WITH)\b/iu.test(question.answerSql))
    ))).toBe(true);
  });

  it("960 题的参考 SQL 均可执行并通过对应语义判题契约", async () => {
    const catalog = await loadBundledQuestionBank(
      "/",
      fixtureFetcher as typeof fetch,
      null,
      undefined,
      wasmLocation,
    );
    const engine = await SqlEngine.create([...INITIAL_MONSTERS], wasmLocation);
    const stages = new Map([
      ...LESSONS.flatMap((lesson) => lesson.stages.map((stage) => [stage.id, stage] as const)),
      ...BIOME_ENCOUNTERS.flatMap((encounter) => (
        encounter.stages.map((stage) => [stage.id, stage] as const)
      )),
    ]);
    expect(catalog).not.toBeNull();
    for (const question of catalog?.questions ?? []) {
      if (!stages.has(question.baseStageId)) {
        throw new Error(`${question.questionId} 缺少基础判题阶段`);
      }
      const result = engine.execute(question.answerSql, question.floor, question.lessonId);
      expect(
        evaluateStage(practiceStageForQuestion(question, 1), result).accepted,
        `${question.questionId} 未通过 ${question.baseStageId}`,
      ).toBe(true);
    }
  });
});
