import {
  AGENT_OUTPUT_VERSION,
  type AgentPrepareRequest,
  type CampfireOutput,
  type PreparedAgentOutput,
  type ScribeOutput,
} from "./contracts";

const ERROR_LABELS = {
  "missing-concept": "关键概念缺失",
  "wrong-result": "结果集合不符",
  "syntax-error": "SQL 语法错误",
} as const;

const ERROR_ACTIONS = {
  "missing-concept": "下一次先圈出题目要求的 SQL 结构，再检查它是否真的出现在查询中。",
  "wrong-result": "对照目标字段与筛选条件，先解释多了哪些行、少了哪些行，再改查询。",
  "syntax-error": "先从报错位置向前检查关键字、逗号、括号和别名，再提交下一次查询。",
} as const;

function shortLabel(value: string, maximum = 24): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function hintFact(attempts: AgentPrepareRequest["attempts"]): string | null {
  const hinted = attempts.filter((attempt) => attempt.hintLevel > 0);
  if (hinted.length === 0) return null;
  const byStage = new Map<string, {
    objective: string;
    count: number;
    latestAttemptId: number;
  }>();
  hinted.forEach((attempt) => {
    const current = byStage.get(attempt.stageId);
    byStage.set(attempt.stageId, {
      objective: attempt.objective,
      count: (current?.count ?? 0) + 1,
      latestAttemptId: Math.max(current?.latestAttemptId ?? 0, attempt.attemptId),
    });
  });
  const stages = [...byStage.entries()].sort((left, right) => (
    right[1].count - left[1].count ||
    right[1].latestAttemptId - left[1].latestAttemptId ||
    left[0].localeCompare(right[0])
  ));
  const visible = stages.slice(0, 2).map(([, stage]) => (
    `${shortLabel(stage.objective)} ×${stage.count}`
  ));
  const remaining = stages.length - visible.length;
  return `提示作答：${visible.join("、")}${
    remaining > 0 ? `，另 ${remaining} 题` : ""
  }；共 ${hinted.length} 次，最高等级 ${Math.max(...hinted.map((entry) => entry.hintLevel))}。`;
}

export function buildLocalCampfireOutput(request: AgentPrepareRequest): CampfireOutput {
  if (request.attempts.length === 0) {
    return {
      headline: "本层还没有可复盘的作答",
      facts: ["完成一次 SQL 作答后，篝火会在这里整理事实。"],
      focusConcept: null,
      nextAction: "沿当前课程路线完成一次查询，再回来查看学习记录。",
    };
  }
  const correct = request.attempts.filter((attempt) => attempt.result === "correct").length;
  const accuracy = Math.round((correct / request.attempts.length) * 100);
  const errorCounts = new Map<Exclude<(typeof request.attempts)[number]["result"], "correct">, number>();
  const latestByLesson = new Map<string, (typeof request.attempts)[number]>();
  request.attempts.forEach((attempt) => {
    latestByLesson.set(attempt.lessonId, attempt);
    if (attempt.result !== "correct") {
      errorCounts.set(attempt.result, (errorCounts.get(attempt.result) ?? 0) + 1);
    }
  });
  const unresolved = [...latestByLesson.values()].filter(
    (attempt) => attempt.result !== "correct",
  );
  const focus = unresolved.sort(
    (left, right) => left.attemptId - right.attemptId,
  ).at(-1) ?? null;
  const facts: string[] = [
    `最近 ${request.attempts.length} 次作答中，${correct} 次正确，正确率 ${accuracy}%。`,
  ];
  const hinted = hintFact(request.attempts);
  if (hinted) facts.push(hinted);
  const errorOrder = ["missing-concept", "wrong-result", "syntax-error"] as const;
  const commonError = [...errorCounts.entries()].sort((left, right) => (
    right[1] - left[1] || errorOrder.indexOf(left[0]) - errorOrder.indexOf(right[0])
  ))[0];
  if (commonError) {
    facts.push(`最常见问题是${ERROR_LABELS[commonError[0]]}，出现 ${commonError[1]} 次。`);
  } else if (request.worldChanges.length > 0) {
    facts.push(`本层已有 ${request.worldChanges.length} 项环境变化被记录。`);
  }
  return {
    headline: `本层作答：${correct}/${request.attempts.length} 次正确`,
    facts: facts.slice(0, 3),
    focusConcept: focus ? shortLabel(focus.objective, 80) : null,
    nextAction: focus && focus.result !== "correct"
      ? ERROR_ACTIONS[focus.result]
      : "当前记录均已答对；继续下一课，并保持结果与题意同时成立。",
  };
}

export function buildLocalScribeOutput(
  request: AgentPrepareRequest,
  campfire: CampfireOutput,
): ScribeOutput {
  const latest = request.attempts.at(-1);
  let greeting: string;
  let observation: string;
  let evidenceRefs: readonly string[];
  if (!latest) {
    greeting = "旅人，火还记得你来过。";
    observation = "你的答题页仍是空白，我暂时只替你守住这一层的路。";
    evidenceRefs = [];
  } else if (latest.result === "correct") {
    greeting = "你回来了，我已经把新的一页压平。";
    observation = `最近一次 ${latest.lessonId} 作答已经成立；这不是运气，而是一条可复查的记录。`;
    evidenceRefs = [`attempt:${latest.attemptId}`];
  } else {
    greeting = "你回来了。失败的那一页没有被烧掉。";
    observation = `最近一次 ${latest.lessonId} 仍未成立，但错误已经被留成可以追查的证据。`;
    evidenceRefs = [`attempt:${latest.attemptId}`];
  }
  if (request.worldChanges.length > 0) {
    observation = `${observation} 本层的环境变化也已收入记录。`;
  } else if (request.relics.length > 0) {
    observation = `${observation} ${request.relics.at(-1)?.name ?? "遗物"}仍在你的记录中。`;
  }
  return {
    greeting,
    observation: observation.slice(0, 180),
    guidance: campfire.nextAction,
    relationshipLine: request.attempts.length >= 3
      ? "你留下的页数渐渐多了，我已能从墨迹认出你的归途。"
      : null,
    sourceBeatId: request.story?.beatId ?? null,
    evidenceRefs,
  };
}

export function buildLocalPreparedOutput(
  request: AgentPrepareRequest,
): PreparedAgentOutput {
  const campfire = buildLocalCampfireOutput(request);
  return {
    version: AGENT_OUTPUT_VERSION,
    runId: request.runId,
    floor: request.floor,
    evidenceHash: request.evidenceHash,
    source: "local",
    campfire,
    scribe: buildLocalScribeOutput(request, campfire),
  };
}

export function scribeInspectionMessage(output: ScribeOutput): string {
  return [
    `抄写员：${output.greeting}`,
    output.observation,
    output.guidance,
    output.relationshipLine,
  ].filter((line): line is string => typeof line === "string" && line.length > 0).join("\n\n");
}
