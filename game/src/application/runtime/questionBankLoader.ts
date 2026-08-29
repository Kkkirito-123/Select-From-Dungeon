/**
 * 题库资源加载协调器。
 *
 * 负责校验 manifest、复用 IndexedDB 缓存、下载并解析 SQLite 题库；失败
 * 时返回 null 交给上层降级。它不修改 Run，也不参与 SQL 判题。
 */
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import {
  QuestionBankCatalog,
  type PracticeQuestion,
  type PracticeQuestionScope,
  type PracticeQuestionTier,
} from "../../content/curriculum/questionBank";
import {
  QUESTION_BANK_CONFIG,
  QUESTION_BANK_TIERS,
} from "../config/questionBankConfig";
import type { AuthoredLessonStageId, QueryFeature } from "../../domain/shared/types";
import type { FloorNumber, RunLessonId } from "../../domain/progression/runGraph";
import { QuestionBankCache, type CachedQuestionBank } from "../../infrastructure/storage/questionBankCache";
import { initSqlRuntime } from "../../infrastructure/sql/initSqlRuntime";

interface QuestionBankManifest {
  /** 题库内容版本；与 Run 一起保存，用于刷新后继续使用原题库。 */
  bankVersion: string;
  /** SQLite questions 表的结构版本，防止新旧字段错配。 */
  schemaVersion: number;
  /** 相对于 Vite BASE_URL 的数据库路径，例如 data/question-bank-v1.sqlite。 */
  url: string;
  /** 下载字节数；和 sha256 一起校验资源是否完整。 */
  byteLength: number;
  /** 十六进制 SHA-256；避免 CDN 返回截断或替换后的数据库。 */
  sha256: string;
  /** 启用题目总数；用于确认数据库不是缺表或缺行的半成品。 */
  questionCount: number;
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  // SQLite 将 JSON 数组存为 TEXT。解析失败会由外层 catch 接住，
  // 解析成功但不是“字符串数组”时则按空数组处理，避免把未知结构带入判题器。
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")
    ? parsed
    : [];
}

function parseRows(value: unknown): unknown[][] {
  if (typeof value !== "string") return [];
  // expected_rows 的形状示例：[[1, "slime"], [2, "hound"]]。
  // 这里只验证每一行是数组，列的具体类型由题目结果比较逻辑负责。
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((entry) => Array.isArray(entry))
    ? parsed
    : [];
}

function parseTier(value: unknown): PracticeQuestionTier | null {
  // tier 是受限联合类型，不能只靠字符串断言，否则拼写错误会绕过题阶分流。
  return typeof value === "string" && QUESTION_BANK_TIERS.some((tier) => tier === value)
    ? value as PracticeQuestionTier
    : null;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  // Web Crypto 返回二进制摘要；转成固定两位小写十六进制后，才能和 manifest 比较。
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
    // BASE_URL 可能没有末尾斜杠，统一后再拼接 manifest/database 路径。
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const manifestResponse = await fetcher(
      `${normalizedBase}${QUESTION_BANK_CONFIG.manifestUrl}`,
      { cache: "no-store" },
    );
    if (!manifestResponse.ok) {
      // 网络不可用时只允许回退到当前 Run 明确绑定的 pinnedVersion，避免悄悄换题。
      const cached = pinnedVersion ? await cache.get(pinnedVersion) : null;
      return cached ? catalogFromBytes(cached, wasmLocation) : null;
    }
    const manifest = await manifestResponse.json() as QuestionBankManifest;
    // manifest 是资源入口的公开元数据；版本、路径、数量和结构必须全部匹配
    // contracts/config/questionBank.ts，任一项不符都不能把数据库交给游戏。
    if (
      manifest.schemaVersion !== QUESTION_BANK_CONFIG.schemaVersion ||
      manifest.questionCount !== QUESTION_BANK_CONFIG.totalQuestions ||
      manifest.bankVersion !== QUESTION_BANK_CONFIG.version ||
      manifest.url !== QUESTION_BANK_CONFIG.databaseUrl
    ) return null;
    if (pinnedVersion && pinnedVersion !== manifest.bankVersion) {
      // 当前 Run 继续使用已绑定的题库，同时在后台缓存最新资源，下一局再使用新版本。
      const pinned = await cache.get(pinnedVersion);
      void downloadAndCache(manifest, normalizedBase, fetcher, cache);
      return pinned ? catalogFromBytes(pinned, wasmLocation) : null;
    }
    const cached = await cache.get(manifest.bankVersion);
    if (
      cached &&
      cached.sha256 === manifest.sha256 &&
      cached.byteLength === manifest.byteLength
    ) {
      // 缓存命中仍需做摘要和长度校验，防止 IndexedDB 中残留损坏字节。
      return catalogFromBytes(cached, wasmLocation);
    }
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
    // manifest 校验通过只说明“应该下载哪个文件”，这里还要校验实际响应体。
    const databaseResponse = await fetcher(`${normalizedBase}${manifest.url}`, {
      cache: "no-store",
    });
    if (!databaseResponse.ok) return null;
    const bytes = await databaseResponse.arrayBuffer();
    // 长度检查能快速发现截断；摘要检查能发现内容替换，两者缺一不可。
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
    if (cached.schemaVersion !== QUESTION_BANK_CONFIG.schemaVersion) return null;
    const SQL = await initSqlRuntime(wasmLocation);
    // sql.js 接收 Uint8Array 并在内存中打开数据库；该数据库只用于读取题库，
    // 不会写回题库文件，也不会与战斗 SQL 使用的运行时数据库共享连接。
    const database = new SQL.Database(new Uint8Array(cached.bytes));
    try {
      // 只选择判题所需字段，并按稳定顺序读取，确保相同题库版本的索引一致。
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
        // SQL 行以 unknown[] 形式返回；此处集中完成类型收窄和 JSON 字段解析，
        // 下游 QuestionBankCatalog 因而只接收已经规范化的领域对象。
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
