import type { AnswerAttemptRecord } from "../../contracts/game/results";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type {
  ScribeAgentContent,
  ScribeDeathCause,
  ScribeLearningEvidence,
  ScribePrompt,
} from "../../contracts/agent/scribe";

const MAX_COLUMNS = 16;
const MAX_CONCEPTS = 12;

function latestAttempt(snapshot: GameSnapshot): AnswerAttemptRecord | null {
  return snapshot.floorReview
    .filter((attempt) => attempt.floor === snapshot.floor)
    .slice()
    .sort((left, right) => left.id - right.id)
    .at(-1) ?? null;
}

function submittedColumns(sql: string): string[] {
  const selectStart = sql.search(/\bselect\b/iu);
  const fromStart = sql.search(/\bfrom\b/iu);
  if (selectStart < 0 || fromStart <= selectStart) return [];
  const projection = sql.slice(selectStart + 6, fromStart)
    .replace(/^\s*distinct\s+/iu, "")
    .trim();
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < projection.length; index += 1) {
    if (projection[index] === "(") depth += 1;
    if (projection[index] === ")") depth = Math.max(0, depth - 1);
    if (projection[index] === "," && depth === 0) {
      parts.push(projection.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(projection.slice(start).trim());
  return parts.filter(Boolean).map((part) => {
    const alias = part.match(/\s+as\s+([a-z_]\w*)\s*$/iu)?.[1];
    if (alias) return alias;
    return /^[a-z_]\w*(?:\s*\.\s*[a-z_]\w*)?$/iu.test(part)
      ? part.replace(/^.*\.\s*/u, "")
      : part.slice(0, 64);
  }).slice(0, MAX_COLUMNS);
}

function columnKey(value: string): string {
  return value
    .replace(/\s+as\s+[a-z_]\w*$/iu, "")
    .replace(/^.*\.\s*/u, "")
    .trim()
    .toLocaleLowerCase();
}

function unique(values: readonly string[], maximum = MAX_COLUMNS): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = columnKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maximum);
}

export function learningEvidenceFor(
  snapshot: GameSnapshot,
  taskSnapshot: GameSnapshot = snapshot,
): ScribeLearningEvidence | null {
  const attempt = latestAttempt(snapshot);
  if (!attempt) return null;
  const requiredColumns = unique(taskSnapshot.taskBrief?.outputColumns ?? []);
  const submitted = unique(submittedColumns(attempt.sql));
  const submittedKeys = new Set(submitted.map(columnKey));
  const requiredKeys = new Set(requiredColumns.map(columnKey));
  return {
    lessonId: attempt.lessonId,
    stageId: attempt.stageId,
    objective: attempt.stageObjective.slice(0, 240),
    requiredColumns,
    submittedColumns: submitted,
    missingColumns: requiredColumns.filter((column) => !submittedKeys.has(columnKey(column))),
    unexpectedColumns: submitted.filter((column) => !requiredKeys.has(columnKey(column))),
    brokenConcepts: attempt.result === "correct" ? [] : unique(taskSnapshot.locks, MAX_CONCEPTS),
    remainingConcepts: attempt.result === "correct"
      ? []
      : unique(taskSnapshot.taskBrief?.reviewTopics ?? taskSnapshot.locks, MAX_CONCEPTS),
    resultCategory: attempt.result,
    hintLevel: Math.max(0, Math.min(4, attempt.hintLevel)),
    safeHintId: attempt.hintLevel > 0
      ? `hint:${attempt.lessonId}:${attempt.stageId}:${Math.min(4, attempt.hintLevel)}`
      : null,
  };
}

export function interactionPrompt(
  snapshot: GameSnapshot,
  scribeId: string,
  authoredMessage: string,
): ScribePrompt {
  return {
    floor: snapshot.floor,
    scene: "interaction",
    scribeId,
    topic: snapshot.currentRoomTitle,
    authoredMessage,
    learning: learningEvidenceFor(snapshot),
    navigation: null,
    death: null,
  };
}

function deathCause(previous: GameSnapshot): ScribeDeathCause {
  if (previous.mode === "combat") return "combat";
  if (previous.mode === "challenge") return "cipher";
  if (previous.mode === "explore") return "hazard";
  return "unknown";
}

export function deathPrompt(snapshot: GameSnapshot, previous: GameSnapshot): ScribePrompt {
  const attempt = latestAttempt(snapshot);
  return {
    floor: snapshot.floor,
    scene: "death-review",
    scribeId: `npc-scribe-f${snapshot.floor}`,
    topic: snapshot.currentRoomTitle,
    authoredMessage: snapshot.banner,
    learning: learningEvidenceFor(snapshot, previous),
    navigation: null,
    death: {
      cause: deathCause(previous),
      battleAttempts: snapshot.battleReview.length,
      lastOutcome: attempt?.outcome ?? "defeat",
    },
  };
}

export function navigationPrompt(snapshot: GameSnapshot): ScribePrompt | null {
  const value = snapshot.navigationGuidance;
  if (
    value.level === 0 || !value.objectiveRoomId || !value.objectiveTitle ||
    !value.direction || value.distance === null
  ) return null;
  return {
    floor: snapshot.floor,
    scene: "navigation",
    scribeId: `npc-scribe-f${snapshot.floor}`,
    topic: value.objectiveTitle,
    authoredMessage: snapshot.banner,
    learning: null,
    navigation: {
      targetId: value.objectiveRoomId,
      targetLabel: value.objectiveTitle,
      direction: value.direction,
      distance: Math.max(0, Math.min(999, value.distance)),
      guidanceLevel: value.level,
    },
    death: null,
  };
}

export function localScribeContent(prompt: ScribePrompt): ScribeAgentContent {
  const facts: string[] = [];
  let message = prompt.authoredMessage;
  let nextAction = "先确认当前目标，再继续手动探索。";
  const learning = prompt.learning;
  if (learning) {
    if (learning.missingColumns.length) facts.push(`缺少字段：${learning.missingColumns.join(", ")}`);
    if (learning.unexpectedColumns.length) facts.push(`多余字段：${learning.unexpectedColumns.join(", ")}`);
    if (learning.remainingConcepts.length) facts.push(`尚未落实：${learning.remainingConcepts.join("、")}`);
    if (learning.resultCategory === "syntax-error") {
      message = "先定位语句结构中的错误，再逐项检查字段、逗号和条件。不要一次改动太多地方。";
      nextAction = "从报错位置附近开始做最小修改，然后重新提交。";
    } else if (learning.missingColumns.length || learning.unexpectedColumns.length) {
      message = "结果已经接近目标。先核对 SELECT 后的字段列表，再继续检查筛选或连接条件。";
      nextAction = "补齐题目要求的字段，并移除当前不需要的字段。";
    } else if (learning.remainingConcepts.length) {
      message = "结果方向已经出现线索，但还有一个关键概念没有落实。";
      nextAction = `下一次优先检查：${learning.remainingConcepts[0]}。`;
    } else if (learning.resultCategory === "wrong-result") {
      message = "查询已经执行，但结果含义还没有对齐题目。";
      nextAction = "先确认返回行数和筛选范围，再检查字段含义。";
    } else {
      message = "这一步已经通过。记住刚才的判断顺序，再把它应用到下一道题。";
      nextAction = "继续下一道题，提交前复核字段、条件和结果含义。";
    }
  }
  if (prompt.navigation) {
    const direction = { north: "北方", east: "东方", south: "南方", west: "西方" }[prompt.navigation.direction];
    facts.push(`目标：${prompt.navigation.targetLabel}，在${direction}，约 ${prompt.navigation.distance} 步`);
    nextAction = `沿当前可行通道向${direction}前进，优先寻找${prompt.navigation.targetLabel}。`;
  }
  if (prompt.death) {
    const cause = { combat: "战斗反击", hazard: "物理陷阱", cipher: "SQL 密文机关", unknown: "本轮事件" }[prompt.death.cause];
    facts.unshift(`本轮结束原因：${cause}`);
    message = "这次失败会保留为一条可复盘的记录。先看清最值得修正的地方，再重新开始。";
    nextAction = "回到复活点后，先确认当前目标，再继续前进。";
  }
  return {
    headline: { interaction: "抄写员记录", "death-review": "抄写员复盘本轮", navigation: "路线记录" }[prompt.scene],
    facts: facts.slice(0, 3),
    nextAction,
    safeHintId: learning?.safeHintId ?? null,
    message,
  };
}
