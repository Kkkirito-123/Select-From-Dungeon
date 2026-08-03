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
  if (!request.campfireUnlocked) {
    return {
      available: false,
      headline: "篝火尚未收录本层复盘",
      facts: ["击败本层精英后，篝火才会整理当前楼层的作答记录。"],
      focusConcept: null,
      nextAction: "沿抄写员指引的路线寻找本层精英。",
    };
  }
  if (request.attempts.length === 0) {
    return {
      available: true,
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
    available: true,
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
): ScribeOutput {
  if (request.trigger.phase === "opening") {
    return {
      greeting: "你来了。",
      observation: "这一层的记录还没有写满，路会先替你保留方向。",
      guidance: routeGuidance(request),
      relationshipLine: null,
      sourceBeatId: request.story?.beatId ?? null,
      evidenceRefs: [],
    };
  }
  if (request.trigger.phase === "ending") {
    return {
      greeting: "这一层的路已经走完。",
      observation: request.campfireUnlocked
        ? "精英战斗留下的记录已经交给篝火，下一层会从这些页边继续。"
        : "这一层已经结束，但篝火还没有收到精英战斗的记录。",
      guidance: request.campfireUnlocked
        ? "回到篝火查看本层复盘，再进入下一层。"
        : "进入下一层，沿新的路线继续记录。",
      relationshipLine: "路有尽头，记录不会替你遗忘。",
      sourceBeatId: request.story?.beatId ?? null,
      evidenceRefs: request.attempts.slice(-2).map((attempt) => `attempt:${attempt.attemptId}`),
    };
  }
  const latest = request.attempts.at(-1);
  let greeting: string;
  let observation: string;
  let evidenceRefs: readonly string[];
  if (!latest) {
    greeting = "沿这条路走。";
    observation = routeGuidance(request);
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
    guidance: routeGuidance(request),
    relationshipLine: request.attempts.length >= 3
      ? "你留下的页数渐渐多了，我已能从墨迹认出你的归途。"
      : null,
    sourceBeatId: request.story?.beatId ?? null,
    evidenceRefs,
  };
}

function routeGuidance(request: AgentPrepareRequest): string {
  const navigation = request.navigation;
  const direction = {
    north: "北",
    east: "东",
    south: "南",
    west: "西",
  }[navigation.direction ?? "north"] ?? "前方";
  if (navigation.objectiveTitle && navigation.distance !== null) {
    return `朝${direction}前进，目标「${navigation.objectiveTitle}」约 ${navigation.distance} 步。`;
  }
  if (navigation.objectiveTitle) return `沿当前道路前进，目标是「${navigation.objectiveTitle}」。`;
  return "沿已经显现的道路前进；路线会在需要时再次显形。";
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
    scribe: buildLocalScribeOutput(request),
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
