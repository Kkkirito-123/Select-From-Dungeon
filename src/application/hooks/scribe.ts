/**
 * 抄写员 Hook：把游戏快照投影为场景证据，并管理本地文案与远程文案的替换。
 *
 * 本模块不把原始 SQL、参考 SQL、地图或存档交给 Agent。远程结果失效时，
 * 本地文案仍然立即可用，且 Hook 不会修改 GameSession。
 */
import type {
  ScribeAgentContent,
  ScribeAgentOutput,
  ScribeAgentPort,
  ScribeDeathCause,
  ScribeLearningEvidence,
  ScribePrompt,
} from "../../contracts/agent/scribe";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { AnswerAttemptRecord } from "../../contracts/game/results";
import type { Trigger } from "../triggers/events";
import type { Hook } from "./registry";
import { scribeEvidenceKey } from "../../infrastructure/agent/ScribeAgentClient";

const MAX_COLUMNS = 16;
const MAX_CONCEPTS = 12;

export type ScribeHookStatus = "idle" | "requesting" | "ready" | "fallback";

export interface ScribeHookState {
  status: ScribeHookStatus;
  scene: ScribePrompt["scene"] | null;
  requestKey: string | null;
  output: ScribeAgentContent | null;
}

function latestAttempt(snapshot: GameSnapshot): AnswerAttemptRecord | null {
  return snapshot.floorReview
    .filter((attempt) => attempt.floor === snapshot.floor)
    .slice()
    .sort((left, right) => left.id - right.id)
    .at(-1) ?? null;
}

function splitProjection(value: string): string[] {
  const expressions: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      expressions.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  expressions.push(value.slice(start).trim());
  return expressions.filter(Boolean);
}

function projectionLabel(expression: string): string {
  const aliased = expression.match(/\s+as\s+([a-z_]\w*)\s*$/iu);
  if (aliased?.[1]) return aliased[1];
  if (/^[a-z_]\w*(?:\s*\.\s*[a-z_]\w*)?$/iu.test(expression)) {
    return expression.replace(/^.*\.\s*/u, "");
  }
  return expression.slice(0, 64);
}

function submittedColumns(sql: string): string[] {
  const selectStart = sql.search(/\bselect\b/iu);
  if (selectStart < 0) return [];
  const fromStart = sql.search(/\bfrom\b/iu);
  if (fromStart <= selectStart) return [];
  const projection = sql.slice(selectStart + 6, fromStart)
    .replace(/^\s*distinct\s+/iu, "")
    .trim();
  return splitProjection(projection)
    .map(projectionLabel)
    .filter(Boolean)
    .slice(0, MAX_COLUMNS);
}

function columnKey(value: string): string {
  return value
    .replace(/\s+as\s+[a-z_]\w*$/iu, "")
    .replace(/^.*\.\s*/u, "")
    .trim()
    .toLocaleLowerCase();
}

function uniqueColumns(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = columnKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_COLUMNS);
}

function learningEvidenceFor(
  snapshot: GameSnapshot,
  taskSnapshot: GameSnapshot = snapshot,
): ScribeLearningEvidence | null {
  const attempt = latestAttempt(snapshot);
  if (!attempt) return null;
  const requiredColumns = uniqueColumns(taskSnapshot.taskBrief?.outputColumns ?? []);
  const submitted = uniqueColumns(submittedColumns(attempt.sql));
  const submittedKeys = new Set(submitted.map(columnKey));
  const requiredKeys = new Set(requiredColumns.map(columnKey));
  const missingColumns = requiredColumns
    .filter((column) => !submittedKeys.has(columnKey(column)));
  const unexpectedColumns = submitted
    .filter((column) => !requiredKeys.has(columnKey(column)));
  const unresolvedConcepts = uniqueColumns(
    taskSnapshot.taskBrief?.reviewTopics ?? taskSnapshot.locks,
  ).slice(0, MAX_CONCEPTS);
  const brokenConcepts = attempt.result === "correct"
    ? []
    : uniqueColumns(taskSnapshot.locks).slice(0, MAX_CONCEPTS);
  return {
    lessonId: attempt.lessonId,
    stageId: attempt.stageId,
    objective: attempt.stageObjective.slice(0, 240),
    requiredColumns,
    submittedColumns: submitted,
    missingColumns,
    unexpectedColumns,
    brokenConcepts,
    remainingConcepts: attempt.result === "correct" ? [] : unresolvedConcepts,
    resultCategory: attempt.result,
    hintLevel: Math.max(0, Math.min(4, attempt.hintLevel)),
    safeHintId: attempt.hintLevel > 0
      ? `hint:${attempt.lessonId}:${attempt.stageId}:${Math.min(4, attempt.hintLevel)}`
      : null,
  };
}

function deathCause(previous: GameSnapshot): ScribeDeathCause {
  if (previous.mode === "combat") return "combat";
  if (previous.mode === "challenge") return "cipher";
  if (previous.mode === "explore") return "hazard";
  return "unknown";
}

function interactionPrompt(
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

function deathPrompt(snapshot: GameSnapshot, previous: GameSnapshot): ScribePrompt {
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

function navigationPrompt(snapshot: GameSnapshot): ScribePrompt | null {
  const guidance = snapshot.navigationGuidance;
  if (
    guidance.level === 0 ||
    !guidance.objectiveRoomId ||
    !guidance.objectiveTitle ||
    !guidance.direction ||
    guidance.distance === null
  ) return null;
  return {
    floor: snapshot.floor,
    scene: "navigation",
    scribeId: `npc-scribe-f${snapshot.floor}`,
    topic: guidance.objectiveTitle,
    authoredMessage: snapshot.banner,
    learning: null,
    navigation: {
      targetId: guidance.objectiveRoomId,
      targetLabel: guidance.objectiveTitle,
      direction: guidance.direction,
      distance: Math.max(0, Math.min(999, guidance.distance)),
      guidanceLevel: guidance.level,
    },
    death: null,
  };
}

function localContent(prompt: ScribePrompt): ScribeAgentContent {
  const facts: string[] = [];
  let message = prompt.authoredMessage;
  let nextAction = "先确认当前目标，再继续手动探索。";

  if (prompt.learning) {
    const learning = prompt.learning;
    if (learning.missingColumns.length > 0) {
      facts.push(`缺少字段：${learning.missingColumns.join(", ")}`);
    }
    if (learning.unexpectedColumns.length > 0) {
      facts.push(`多余字段：${learning.unexpectedColumns.join(", ")}`);
    }
    if (learning.remainingConcepts.length > 0) {
      facts.push(`尚未落实：${learning.remainingConcepts.join("、")}`);
    }
    if (learning.resultCategory === "syntax-error") {
      message = "先定位语句结构中的错误，再逐项检查字段、逗号和条件。不要一次改动太多地方。";
      nextAction = "从报错位置附近开始做最小修改，然后重新提交。";
    } else if (learning.missingColumns.length > 0 || learning.unexpectedColumns.length > 0) {
      message = "结果已经接近目标。先核对 SELECT 后的字段列表，再继续检查筛选或连接条件。";
      nextAction = "补齐题目要求的字段，并移除当前不需要的字段。";
    } else if (learning.remainingConcepts.length > 0) {
      message = "结果方向已经出现线索，但还有一个关键概念没有落实。先围绕剩余概念检查查询结构。";
      nextAction = `下一次优先检查：${learning.remainingConcepts[0]}。`;
    } else if (learning.resultCategory === "wrong-result") {
      message = "查询已经执行，但结果含义还没有对齐题目。先比较返回行数、筛选范围和字段含义。";
      nextAction = "先确认返回行数和筛选范围，再检查字段含义。";
    } else {
      message = "这一步已经通过。记住刚才的判断顺序，再把它应用到下一道题。";
      nextAction = "继续下一道题，提交前复核字段、条件和结果含义。";
    }
  }

  if (prompt.navigation) {
    const directionLabels = {
      north: "北方",
      east: "东方",
      south: "南方",
      west: "西方",
    } as const;
    const navigation = prompt.navigation;
    facts.push(`目标：${navigation.targetLabel}，在${directionLabels[navigation.direction]}，约 ${navigation.distance} 步`);
    message = prompt.authoredMessage;
    nextAction = `沿当前可行通道向${directionLabels[navigation.direction]}前进，优先寻找${navigation.targetLabel}。`;
  }

  if (prompt.death) {
    const causes: Record<ScribeDeathCause, string> = {
      combat: "战斗反击",
      hazard: "物理陷阱",
      cipher: "SQL 密文机关",
      unknown: "本轮事件",
    };
    facts.unshift(`本轮结束原因：${causes[prompt.death.cause]}`);
    message = "这次失败会保留为一条可复盘的记录。先看清最值得修正的地方，再重新开始。";
    if (prompt.learning && (
      prompt.learning.missingColumns.length > 0 ||
      prompt.learning.unexpectedColumns.length > 0 ||
      prompt.learning.remainingConcepts.length > 0
    )) {
      message += "先修正记录中最明确的字段或概念问题。";
    }
    nextAction = "回到复活点后，先确认当前目标，再继续前进。";
  }

  return {
    headline: {
      interaction: "抄写员记录",
      "death-review": "抄写员复盘本轮",
      navigation: "抄写员指出方向",
    }[prompt.scene],
    facts: facts.slice(0, 3),
    nextAction,
    safeHintId: prompt.learning?.safeHintId ?? null,
    message,
  };
}

function contentFromOutput(output: ScribeAgentOutput): ScribeAgentContent {
  return {
    headline: output.headline,
    facts: output.facts,
    nextAction: output.nextAction,
    safeHintId: output.safeHintId,
    message: output.message,
  };
}

export class ScribeHook implements Hook {
  private readonly cache = new Map<string, ScribeAgentOutput | null>();
  private readonly listeners = new Set<(state: ScribeHookState) => void>();
  private generation = 0;
  private state: ScribeHookState = {
    status: "idle",
    scene: null,
    requestKey: null,
    output: null,
  };

  constructor(private readonly client: ScribeAgentPort | null) {}

  subscribe(listener: (state: ScribeHookState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): ScribeHookState {
    return this.state;
  }

  interact(
    snapshot: GameSnapshot,
    scribeId: string,
    authoredMessage: string,
  ): ScribeAgentContent {
    return this.request(interactionPrompt(snapshot, scribeId, authoredMessage));
  }

  handle(event: Trigger): void {
    if (event.type === "floor") {
      this.generation += 1;
      this.setState({ status: "idle", scene: null, requestKey: null, output: null });
      return;
    }
    if (event.type === "death") {
      this.request(deathPrompt(event.snapshot, event.previous));
      return;
    }
    if (event.type === "navigation") {
      const prompt = navigationPrompt(event.snapshot);
      if (prompt) this.request(prompt);
    }
  }

  destroy(): void {
    this.generation += 1;
    this.cache.clear();
    this.listeners.clear();
    this.setState({ status: "idle", scene: null, requestKey: null, output: null });
  }

  private request(prompt: ScribePrompt): ScribeAgentContent {
    const key = scribeEvidenceKey(prompt);
    const local = localContent(prompt);
    const generation = ++this.generation;
    const cached = this.cache.get(key);
    if (this.cache.has(key)) {
      const output = cached ? contentFromOutput(cached) : local;
      this.setState({
        status: cached ? "ready" : "fallback",
        scene: prompt.scene,
        requestKey: key,
        output,
      });
      return output;
    }

    if (!this.client) {
      this.setState({
        status: "fallback",
        scene: prompt.scene,
        requestKey: key,
        output: local,
      });
      return local;
    }

    this.setState({
      status: "requesting",
      scene: prompt.scene,
      requestKey: key,
      output: local,
    });
    void this.client.respond(prompt)
      .then((output) => {
        this.cache.set(key, output);
        if (generation !== this.generation || this.state.requestKey !== key) return;
        this.setState({
          status: output ? "ready" : "fallback",
          scene: prompt.scene,
          requestKey: key,
          output: output ? contentFromOutput(output) : local,
        });
      })
      .catch(() => {
        this.cache.set(key, null);
        if (generation !== this.generation || this.state.requestKey !== key) return;
        this.setState({
          status: "fallback",
          scene: prompt.scene,
          requestKey: key,
          output: local,
        });
      });
    return local;
  }

  private setState(state: ScribeHookState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}

export { interactionPrompt, learningEvidenceFor, localContent, navigationPrompt };
