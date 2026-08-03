import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QuestionBankCatalog,
  practiceStageForQuestion,
} from "../src/content/questionBank";
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
  if (url.endsWith("question-bank-v1.sqlite")) {
    return new Response(await readFile(resolve("public/data/question-bank-v1.sqlite")));
  }
  return new Response(null, { status: 404 });
}

const wasmLocation = resolve("node_modules/sql.js/dist/sql-wasm.wasm");

describe("question bank v1", () => {
  it("loads one verified read-only catalog with 120 questions per floor", async () => {
    const catalog = await loadBundledQuestionBank(
      "/",
      fixtureFetcher as typeof fetch,
      null,
      undefined,
      wasmLocation,
    );
    expect(catalog).toBeInstanceOf(QuestionBankCatalog);
    expect(catalog?.questions).toHaveLength(960);
    for (let floor = 1; floor <= 8; floor += 1) {
      const questions = catalog?.questionsForFloor(floor as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) ?? [];
      expect(questions).toHaveLength(120);
      expect(new Set(questions.map((question) => question.questionId)).size).toBe(120);
      expect(questions.every((question) => (
        /^question-bank-v1:f[1-8]:(?:current|review):t\d{2}:v[1-8]$/u.test(question.questionId)
      ))).toBe(true);
      if (floor === 1) {
        expect(questions.every((question) => question.scope === "current")).toBe(true);
      } else {
        expect(questions.filter((question) => question.scope === "current")).toHaveLength(96);
        expect(questions.filter((question) => question.scope === "review")).toHaveLength(24);
      }
      expect(questions.filter((question) => question.tier === "normal")).toHaveLength(96);
      expect(questions.filter((question) => question.tier === "elite")).toHaveLength(24);
      expect(new Set(questions.map((question) => (
        `${question.objective}\u0000${question.answerSql}`
      ))).size).toBe(120);
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

  it("draws a deterministic 4 current + 1 review deck without repeats", async () => {
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
    const deck = catalog?.deck(2, "bank-deck-test", 0) ?? [];
    expect(deck).toHaveLength(120);
    for (let index = 0; index < deck.length; index += 5) {
      expect(deck.slice(index, index + 4).every((question) => question.scope === "current")).toBe(true);
      expect(deck[index + 4]?.scope).toBe("review");
    }
    const draw = catalog?.draw(
      2,
      "bank-deck-test",
      { cursor: 0, cycle: 0 },
      unlocked,
      96,
      "normal",
    );
    expect(draw?.questions).toHaveLength(96);
    expect(new Set(draw?.questions.map((question) => question.questionId)).size).toBe(96);
    expect(draw?.questions.every((question) => question.tier === "normal")).toBe(true);

    const eliteDraw = catalog?.draw(
      2,
      "bank-elite-test",
      { cursor: 0, cycle: 0 },
      unlocked,
      2,
      "elite",
    );
    expect(eliteDraw?.questions).toHaveLength(2);
    expect(eliteDraw?.questions.every((question) => question.tier === "elite")).toBe(true);
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
