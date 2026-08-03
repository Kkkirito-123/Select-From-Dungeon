import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import {
  QuestionBankCatalog,
  practiceQuestionTier,
  type PracticeQuestion,
  type PracticeQuestionScope,
} from "../content/questionBank";
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
  if (typeof value !== "string") return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")
    ? parsed
    : [];
}

function parseRows(value: unknown): unknown[][] {
  if (typeof value !== "string") return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((entry) => Array.isArray(entry))
    ? parsed
    : [];
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
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
  try {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const manifestResponse = await fetcher(
      `${normalizedBase}data/question-bank-manifest.json`,
      { cache: "no-store" },
    );
    if (!manifestResponse.ok) {
      const cached = pinnedVersion ? await cache.get(pinnedVersion) : null;
      return cached ? catalogFromBytes(cached, wasmLocation) : null;
    }
    const manifest = await manifestResponse.json() as QuestionBankManifest;
    if (
      manifest.schemaVersion !== 1 ||
      manifest.questionCount !== 960 ||
      !/^question-bank-v\d+$/u.test(manifest.bankVersion) ||
      !/^data\/question-bank-v\d+\.sqlite$/u.test(manifest.url)
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
  try {
    const SQL = await initSqlJs({ locateFile: () => wasmLocation });
    const database = new SQL.Database(new Uint8Array(cached.bytes));
    try {
      const result = database.exec(`
        SELECT question_id, bank_version, floor, scope, template_id,
               variant_index, primary_lesson_id, base_stage_id, objective,
               answer_sql, hints_json, required_features_json,
               expected_columns_json, expected_rows_json, rows_ordered,
               plan_include_json, plan_exclude_json
          FROM questions
         WHERE enabled = 1
         ORDER BY floor, scope, template_id, variant_index
      `)[0];
      if (!result || result.values.length !== 960) return null;
      const questions = result.values.map((row): PracticeQuestion => ({
        questionId: String(row[0]),
        bankVersion: String(row[1]),
        floor: Number(row[2]) as FloorNumber,
        scope: String(row[3]) as PracticeQuestionScope,
        templateId: String(row[4]),
        tier: practiceQuestionTier(String(row[4])),
        variantIndex: Number(row[5]),
        lessonId: String(row[6]) as RunLessonId,
        baseStageId: String(row[7]) as AuthoredLessonStageId,
        objective: String(row[8]),
        answerSql: String(row[9]),
        hints: parseStringArray(row[10]),
        requiredFeatures: parseStringArray(row[11]) as QueryFeature[],
        expectedColumns: parseStringArray(row[12]),
        expectedRows: parseRows(row[13]),
        rowsOrdered: Number(row[14]) === 1,
        planInclude: parseStringArray(row[15]),
        planExclude: parseStringArray(row[16]),
      }));
      return new QuestionBankCatalog(cached.bankVersion, questions);
    } finally {
      database.close();
    }
  } catch {
    return null;
  }
}
