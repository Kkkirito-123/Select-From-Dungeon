/**
 * 题库加载器。
 * 负责内置资源、Manifest/SHA-256 校验和 IndexedDB 缓存，不决定题目抽取策略。
 */
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import {
  QuestionBankCatalog,
  type PracticeQuestion,
  type PracticeQuestionScope,
  type PracticeQuestionTier,
} from "../content/questionBank";
import {
  QUESTION_BANK_CONFIG,
  QUESTION_BANK_TIERS,
} from "../config/questionBankConfig";
import type { AuthoredLessonStageId, QueryFeature } from "../domain/types";
import type { FloorNumber, RunLessonId } from "../domain/runGraph";
import { QuestionBankCache, type CachedQuestionBank } from "../storage/questionBankCache";

interface QuestionBankManifest {
  bankVersion: string;
  schemaVersion: number;
  url: string;
  byteLength: number;
  sha256: string;
  questionCount: number;
}

function parseStringArray(value: unknown): string[] {
  // 题库字段必须是有限字符串数组，避免不可信 SQLite 行进入运行时。
  if (typeof value !== "string") return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")
    ? parsed
    : [];
}

function parseRows(value: unknown): unknown[][] {
  // 将 SQLite 查询结果限制为普通数组，供后续题目契约逐列校验。
  if (typeof value !== "string") return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((entry) => Array.isArray(entry))
    ? parsed
    : [];
}

function parseTier(value: unknown): PracticeQuestionTier | null {
  // 只允许配置文件声明的 L1/L2/L3 三个层级。
  return typeof value === "string" && QUESTION_BANK_TIERS.some((tier) => tier === value)
    ? value as PracticeQuestionTier
    : null;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  // Manifest 摘要用于完整性校验，不承担用户身份或密钥保护。
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadBundledQuestionBank(
  baseUrl = import.meta.env.BASE_URL,
  fetcher: typeof fetch = fetch,
  pinnedVersion: string | null = null,
  cache = new QuestionBankCache(),
  wasmLocation = wasmUrl,
): Promise<QuestionBankCatalog | null> {
  // 新 Run 固定一个题库版本；加载失败时不静默使用未校验内容。
  try {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const manifestResponse = await fetcher(
      `${normalizedBase}${QUESTION_BANK_CONFIG.manifestUrl}`,
      { cache: "no-store" },
    );
    if (!manifestResponse.ok) {
      const cached = pinnedVersion ? await cache.get(pinnedVersion) : null;
      return cached ? catalogFromBytes(cached, wasmLocation) : null;
    }
    const manifest = await manifestResponse.json() as QuestionBankManifest;
    if (
      manifest.schemaVersion !== QUESTION_BANK_CONFIG.schemaVersion ||
      manifest.questionCount !== QUESTION_BANK_CONFIG.totalQuestions ||
      manifest.bankVersion !== QUESTION_BANK_CONFIG.version ||
      manifest.url !== QUESTION_BANK_CONFIG.databaseUrl
    ) return null;
    if (pinnedVersion && pinnedVersion !== manifest.bankVersion) {
      const pinned = await cache.get(pinnedVersion);
      void downloadAndCache(manifest, normalizedBase, fetcher, cache);
      return pinned ? catalogFromBytes(pinned, wasmLocation) : null;
    }
    const cached = await cache.get(manifest.bankVersion);
    if (
      cached &&
      cached.sha256 === manifest.sha256 &&
      cached.byteLength === manifest.byteLength
    ) return catalogFromBytes(cached, wasmLocation);
    const downloaded = await downloadAndCache(manifest, normalizedBase, fetcher, cache);
    return downloaded ? catalogFromBytes(downloaded, wasmLocation) : null;
  } catch {
    const cached = pinnedVersion ? await cache.get(pinnedVersion) : null;
    return cached ? catalogFromBytes(cached, wasmLocation) : null;
  }
}

async function downloadAndCache(
  manifest: QuestionBankManifest,
  normalizedBase: string,
  fetcher: typeof fetch,
  cache: QuestionBankCache,
): Promise<CachedQuestionBank | null> {
  // 先读取内置资源，成功校验后再写入缓存；缓存失败不阻塞当前加载。
  try {
    const databaseResponse = await fetcher(`${normalizedBase}${manifest.url}`, {
      cache: "no-store",
    });
    if (!databaseResponse.ok) return null;
    const bytes = await databaseResponse.arrayBuffer();
    if (bytes.byteLength !== manifest.byteLength || await sha256(bytes) !== manifest.sha256) {
      return null;
    }
    const cached: CachedQuestionBank = {
      bankVersion: manifest.bankVersion,
      schemaVersion: manifest.schemaVersion,
      sha256: manifest.sha256,
      byteLength: manifest.byteLength,
      bytes,
      storedAt: Date.now(),
    };
    await cache.put(cached);
    return cached;
  } catch {
    return null;
  }
}

async function catalogFromBytes(
  cached: CachedQuestionBank,
  wasmLocation: string,
): Promise<QuestionBankCatalog | null> {
  // 使用独立 SQLite WASM 读取只读题库，并映射为运行时目录对象。
  try {
    if (cached.schemaVersion !== QUESTION_BANK_CONFIG.schemaVersion) return null;
    const SQL = await initSqlJs({ locateFile: () => wasmLocation });
    const database = new SQL.Database(new Uint8Array(cached.bytes));
    try {
      const result = database.exec(`
        SELECT question_id, bank_version, floor, scope, tier, template_id,
               variant_index, primary_lesson_id, base_stage_id, objective,
               answer_sql, hints_json, required_features_json,
               expected_columns_json, expected_rows_json, rows_ordered,
               plan_include_json, plan_exclude_json
          FROM questions
         WHERE enabled = 1
         ORDER BY floor, scope, template_id, variant_index
      `)[0];
      if (!result || result.values.length !== QUESTION_BANK_CONFIG.totalQuestions) return null;
      const questions = result.values.map((row): PracticeQuestion => {
        const tier = parseTier(row[4]);
        if (!tier) throw new Error("题库包含无效 tier");
        return {
          questionId: String(row[0]),
          bankVersion: String(row[1]),
          floor: Number(row[2]) as FloorNumber,
          scope: String(row[3]) as PracticeQuestionScope,
          tier,
          templateId: String(row[5]),
          variantIndex: Number(row[6]),
          lessonId: String(row[7]) as RunLessonId,
          baseStageId: String(row[8]) as AuthoredLessonStageId,
          objective: String(row[9]),
          answerSql: String(row[10]),
          hints: parseStringArray(row[11]),
          requiredFeatures: parseStringArray(row[12]) as QueryFeature[],
          expectedColumns: parseStringArray(row[13]),
          expectedRows: parseRows(row[14]),
          rowsOrdered: Number(row[15]) === 1,
          planInclude: parseStringArray(row[16]),
          planExclude: parseStringArray(row[17]),
        };
      });
      return new QuestionBankCatalog(cached.bankVersion, questions);
    } finally {
      database.close();
    }
  } catch {
    return null;
  }
}
