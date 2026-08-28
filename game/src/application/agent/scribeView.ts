import type { AnswerAttemptRecord } from "../../contracts/game/results";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type {
  ScribeAgentContent,
  ScribeDeathCause,
  ScribeLearningEvidence,
  ScribePrompt,
} from "../../contracts/agent/scribe";

/** 将当前快照压缩成抄写员可接收的最小证据投影；不会携带完整存档或参考答案。 */
const MAX_COLUMNS = 16;
const MAX_CONCEPTS = 12;

function latestAttempt(snapshot: GameSnapshot): AnswerAttemptRecord | null {
  // 只看当前楼层记录，并按 id 排序确保“最近一次”与写入顺序一致。
  return snapshot.floorReview
    .filter((attempt) => attempt.floor === snapshot.floor)
    .slice()
    .sort((left, right) => left.id - right.id)
    .at(-1) ?? null;
}

function submittedColumns(sql: string): string[] {
  // 轻量解析 SELECT 投影，去掉别名后只保留有限字段，避免把整段 SQL 发送给 Agent。
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
  // 规范化 a.id、id AS value 等写法，便于比较“要求字段”和“实际提交字段”。
  return value
    .replace(/\s+as\s+[a-z_]\w*$/iu, "")
    .replace(/^.*\.\s*/u, "")
    .trim()
    .toLocaleLowerCase();
}

function unique(values: readonly string[], maximum = MAX_COLUMNS): string[] {
  // 保留首次出现顺序并限制数量，既稳定又避免恶意输入撑大请求。
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
  // 将最近答题转换成缺失/多余字段与待复习概念，Agent 只接收这些摘要。
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
  // 调查场景携带作者原文和可选学习证据，不带导航/死亡信息。
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
  // 根据死亡前模式分类，供本地文案和远程提示选择不同语气。
  if (previous.mode === "combat") return "combat";
  if (previous.mode === "challenge") return "cipher";
  if (previous.mode === "explore") return "hazard";
  return "unknown";
}

export function deathPrompt(snapshot: GameSnapshot, previous: GameSnapshot): ScribePrompt {
  // 死亡复盘引用上一快照判断原因，当前快照提供最终答题与楼层信息。
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
  // 导航等级为 0 或目标信息不完整时不触发 Agent，避免生成无方向的空提示。
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
  // 本地回退按“字段 -> 概念 -> 结果 -> 下一步”优先级组装最多三条事实。
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
