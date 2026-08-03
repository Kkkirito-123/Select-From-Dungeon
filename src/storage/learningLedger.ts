import type {
  AnswerAttemptRecord,
  GameSnapshot,
  LessonId,
} from "../domain/types";

export const LEARNING_DATABASE_NAME = "select-from-dungeon-learning";
export const LEARNING_DATABASE_VERSION = 1;
export const MAX_FULL_LEARNING_ATTEMPTS = 5_000;

export interface HintSourceCounts {
  manual: number;
  schemaEye: number;
  agent: number;
}

export interface LearningAttempt {
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
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function openLearningDatabase(factory: IDBFactory): Promise<IDBDatabase> {
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
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | null = globalThis.indexedDB ?? null) {}

  get available(): boolean {
    return this.factory !== null;
  }

  async record(attempt: LearningAttempt): Promise<boolean> {
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
    void this.databasePromise?.then((database) => database.close()).catch(() => undefined);
    this.databasePromise = null;
  }

  private database(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error("IndexedDB unavailable"));
    this.databasePromise ??= openLearningDatabase(this.factory);
    return this.databasePromise;
  }

  private async prune(database: IDBDatabase): Promise<void> {
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
  subscribe(listener: (snapshot: GameSnapshot) => void): () => void;
}

export class LearningProgressRecorder {
  private readonly seen = new Set<string>();
  private readonly pending = new Set<string>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly source: LearningSnapshotSource,
    private readonly ledger: LearningLedger,
  ) {}

  start(): void {
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
