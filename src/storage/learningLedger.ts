/**
 * 浏览器本地学习账本。
 * 完整作答和永久聚合只进入独立 IndexedDB，不上传服务器，也不记录移动或按键。
 */
/**
 * 浏览器本地学习账本。
 * 完整作答和永久聚合只进入独立 IndexedDB，不上传服务器，也不记录移动或按键。
 */
import type {
  AnswerAttemptRecord,
  GameSnapshot,
  LessonId,
} from "../domain/types";
import { STORAGE_RUNTIME_CONFIG } from "../config/runtimeConfig";

export const LEARNING_DATABASE_NAME = "select-from-dungeon-learning";
export const LEARNING_DATABASE_VERSION = 1;
export const MAX_FULL_LEARNING_ATTEMPTS = STORAGE_RUNTIME_CONFIG.maxLearningAttempts;

export interface HintSourceCounts {
  /** 按提示来源聚合的次数。 */
  /** 按提示来源聚合的次数。 */
  manual: number;
  schemaEye: number;
  agent: number;
}

export interface LearningAttempt {
  /** 可导出的单条学习记录，保留判题证据但不保留控制输入。 */
  /** 可导出的单条学习记录，保留判题证据但不保留控制输入。 */
  attemptId: string;
  schemaVersion: 1;
  runInstanceId: string;
  bankVersion: string;
  localSequence: number;
  floor: number;
  battleId: number;
  encounterKind: "curriculum" | "ambush";
  monsterId: number;
  questionId: string | null;
  stageId: string;
  lessonId: LessonId;
  objective: string;
  submittedSql: string;
  referenceSql: string;
  result: AnswerAttemptRecord["result"];
  outcome: AnswerAttemptRecord["outcome"];
  firstAttempt: boolean;
  hintCount: number;
  hintSourceCounts: HintSourceCounts;
  feedback: string;
  recordedAt: number;
}

export interface LearningAggregate {
  /** 永久保留的题目/知识点聚合统计。 */
  /** 永久保留的题目/知识点聚合统计。 */
  key: string;
  attempts: number;
  correct: number;
  firstTryCorrect: number;
  syntaxErrors: number;
  hintUses: number;
  lastSeenSequence: number;
  lastSeenAt: number;
}

interface LearningExport {
  schemaVersion: 1;
  exportedAt: string;
  attempts: LearningAttempt[];
  questionStats: LearningAggregate[];
  lessonStats: LearningAggregate[];
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  // 将 IndexedDB 事件接口统一包装成 Promise。
  // 将 IndexedDB 事件接口统一包装成 Promise。
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  // 只有 complete 事件发生后才认为写入真正成功。
  // 只有 complete 事件发生后才认为写入真正成功。
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function openLearningDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  // 学习账本单独建库，避免与 Run 存档和题库缓存互相污染。
  // 学习账本单独建库，避免与 Run 存档和题库缓存互相污染。
  const request = factory.open(LEARNING_DATABASE_NAME, LEARNING_DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains("attempts")) {
      const attempts = database.createObjectStore("attempts", { keyPath: "attemptId" });
      attempts.createIndex("recordedAt", "recordedAt");
    }
    if (!database.objectStoreNames.contains("question_stats")) {
      database.createObjectStore("question_stats", { keyPath: "key" });
    }
    if (!database.objectStoreNames.contains("lesson_stats")) {
      database.createObjectStore("lesson_stats", { keyPath: "key" });
    }
  };
  return requestResult(request);
}

export function buildLearningAttempt(
  snapshot: Pick<
    GameSnapshot,
    "runInstanceId" | "questionBankVersion" | "monsters" | "relics"
  >,
  record: AnswerAttemptRecord,
  recordedAt = Date.now(),
  firstAttempt = record.round === 1,
): LearningAttempt {
  // 从战斗记录构建稳定学习事件；不把移动或按键混入统计。
  // 从战斗记录构建稳定学习事件；不把移动或按键混入统计。
  const monster = snapshot.monsters.find((entry) => entry.id === record.monsterId);
  const schemaEye = snapshot.relics.some((relic) => relic.id === "schema-eye") &&
    record.hintLevel > 0 ? 1 : 0;
  return {
    attemptId: `${snapshot.runInstanceId}:${record.id}`,
    schemaVersion: 1,
    runInstanceId: snapshot.runInstanceId,
    bankVersion: snapshot.questionBankVersion,
    localSequence: record.id,
    floor: record.floor,
    battleId: record.battleId,
    encounterKind: monster?.encounterType ?? "curriculum",
    monsterId: record.monsterId,
    questionId: record.questionId ?? null,
    stageId: record.stageId,
    lessonId: record.lessonId,
    objective: record.stageObjective,
    submittedSql: record.sql,
    referenceSql: record.answerSql,
    result: record.result,
    outcome: record.outcome,
    firstAttempt,
    hintCount: record.hintLevel,
    hintSourceCounts: {
      manual: Math.max(0, record.hintLevel - schemaEye),
      schemaEye,
      agent: 0,
    },
    feedback: record.feedback,
    recordedAt,
  };
}

export function nextLearningAggregate(
  key: string,
  attempt: LearningAttempt,
  current?: LearningAggregate,
): LearningAggregate {
  // 以不可变方式更新永久聚合，保证重复写入可以被上层去重。
  // 以不可变方式更新永久聚合，保证重复写入可以被上层去重。
  const correct = attempt.result === "correct";
  return {
    key,
    attempts: (current?.attempts ?? 0) + 1,
    correct: (current?.correct ?? 0) + (correct ? 1 : 0),
    firstTryCorrect: (current?.firstTryCorrect ?? 0) + (
      correct && attempt.firstAttempt && attempt.hintCount === 0 ? 1 : 0
    ),
    syntaxErrors: (current?.syntaxErrors ?? 0) + (
      attempt.result === "syntax-error" ? 1 : 0
    ),
    hintUses: (current?.hintUses ?? 0) + attempt.hintCount,
    lastSeenSequence: attempt.localSequence,
    lastSeenAt: attempt.recordedAt,
  };
}

export class LearningLedger {
  /** 管理完整作答上限、永久聚合、导出和显式清除。 */
  /** 管理完整作答上限、永久聚合、导出和显式清除。 */
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | null = globalThis.indexedDB ?? null) {}

  get available(): boolean {
    return this.factory !== null;
  }

  async record(attempt: LearningAttempt): Promise<boolean> {
    // 单条记录和聚合必须在同一 IndexedDB 事务内完成。
    // 单条记录和聚合必须在同一 IndexedDB 事务内完成。
    if (!this.factory) return false;
    try {
      const database = await this.database();
      const transaction = database.transaction(
        ["attempts", "question_stats", "lesson_stats"],
        "readwrite",
      );
      const attempts = transaction.objectStore("attempts");
      if (await requestResult(attempts.get(attempt.attemptId))) {
        transaction.abort();
        return true;
      }
      attempts.add(attempt);
      const lessonStats = transaction.objectStore("lesson_stats");
      const lessonCurrent = await requestResult<LearningAggregate | undefined>(
        lessonStats.get(attempt.lessonId),
      );
      lessonStats.put(nextLearningAggregate(attempt.lessonId, attempt, lessonCurrent));
      if (attempt.questionId) {
        const questionStats = transaction.objectStore("question_stats");
        const questionKey = `${attempt.bankVersion}:${attempt.questionId}`;
        const questionCurrent = await requestResult<LearningAggregate | undefined>(
          questionStats.get(questionKey),
        );
        questionStats.put(nextLearningAggregate(questionKey, attempt, questionCurrent));
      }
      await transactionComplete(transaction);
      await this.prune(database);
      return true;
    } catch {
      return false;
    }
  }

  async exportJson(): Promise<string | null> {
    // 导出只包含学习数据；API Key 从未进入账本。
    // 导出只包含学习数据；API Key 从未进入账本。
    if (!this.factory) return null;
    try {
      const database = await this.database();
      const transaction = database.transaction(
        ["attempts", "question_stats", "lesson_stats"],
        "readonly",
      );
      const value: LearningExport = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        attempts: await requestResult(transaction.objectStore("attempts").getAll()),
        questionStats: await requestResult(transaction.objectStore("question_stats").getAll()),
        lessonStats: await requestResult(transaction.objectStore("lesson_stats").getAll()),
      };
      await transactionComplete(transaction);
      return `${JSON.stringify(value, null, 2)}\n`;
    } catch {
      return null;
    }
  }

  async clear(): Promise<boolean> {
    // 清除学习库不会触碰 Run、Profile 或 Agent 配置。
    // 清除学习库不会触碰 Run、Profile 或 Agent 配置。
    if (!this.factory) return false;
    try {
      const database = await this.database();
      const transaction = database.transaction(
        ["attempts", "question_stats", "lesson_stats"],
        "readwrite",
      );
      transaction.objectStore("attempts").clear();
      transaction.objectStore("question_stats").clear();
      transaction.objectStore("lesson_stats").clear();
      await transactionComplete(transaction);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    // 页面销毁时主动关闭连接，避免持久化事务悬挂。
    // 页面销毁时主动关闭连接，避免持久化事务悬挂。
    void this.databasePromise?.then((database) => database.close()).catch(() => undefined);
    this.databasePromise = null;
  }

  private database(): Promise<IDBDatabase> {
    // 延迟初始化 IndexedDB，使无存储环境仍可正常游玩。
    // 延迟初始化 IndexedDB，使无存储环境仍可正常游玩。
    if (!this.factory) return Promise.reject(new Error("IndexedDB unavailable"));
    this.databasePromise ??= openLearningDatabase(this.factory);
    return this.databasePromise;
  }

  private async prune(database: IDBDatabase): Promise<void> {
    // 只裁剪完整作答，永久聚合不受最近记录上限影响。
    // 只裁剪完整作答，永久聚合不受最近记录上限影响。
    const countTransaction = database.transaction("attempts", "readonly");
    const count = await requestResult(countTransaction.objectStore("attempts").count());
    await transactionComplete(countTransaction);
    let remaining = count - MAX_FULL_LEARNING_ATTEMPTS;
    if (remaining <= 0) return;
    const transaction = database.transaction("attempts", "readwrite");
    const cursorRequest = transaction.objectStore("attempts").index("recordedAt").openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || remaining <= 0) return;
      cursor.delete();
      remaining -= 1;
      cursor.continue();
    };
    await transactionComplete(transaction);
  }
}

export interface LearningSnapshotSource {
  /** 提供只读快照，供记录器识别新的作答记录。 */
  /** 提供只读快照，供记录器识别新的作答记录。 */
  subscribe(listener: (snapshot: GameSnapshot) => void): () => void;
}

export class LearningProgressRecorder {
  /** 把 GameSnapshot 中新增的作答记录同步到本地学习账本。 */
  /** 把 GameSnapshot 中新增的作答记录同步到本地学习账本。 */
  private readonly seen = new Set<string>();
  private readonly pending = new Set<string>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly source: LearningSnapshotSource,
    private readonly ledger: LearningLedger,
  ) {}

  start(): void {
    // 记录器订阅一次即可；重复启动不能重复写入同一条记录。
    // 记录器订阅一次即可；重复启动不能重复写入同一条记录。
    if (this.unsubscribe) return;
    this.unsubscribe = this.source.subscribe((snapshot) => {
      const records = [...snapshot.floorReview, ...snapshot.battleReview];
      const unique = [...new Map(records.map((record) => [record.id, record])).values()]
        .sort((left, right) => left.id - right.id);
      const encounteredStages = new Set<string>();
      unique.forEach((record) => {
        const stageKey = `${record.battleId}:${record.questionId ?? record.stageId}`;
        const firstAttempt = !encounteredStages.has(stageKey);
        encounteredStages.add(stageKey);
        const attempt = buildLearningAttempt(snapshot, record, Date.now(), firstAttempt);
        if (this.seen.has(attempt.attemptId) || this.pending.has(attempt.attemptId)) return;
        this.pending.add(attempt.attemptId);
        void this.ledger.record(attempt).then((recorded) => {
          if (recorded) this.seen.add(attempt.attemptId);
        }).finally(() => this.pending.delete(attempt.attemptId));
      });
    });
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pending.clear();
    this.ledger.close();
  }
}
