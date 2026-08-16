/**
 * 开发态 Harness 与 Dashboard 实时控制台。
 *
 * 本模块只渲染维护器发送的脱敏事件，并把三个固定按钮映射到 Playwright 预先注入的
 * 无参数函数。它不接收路径、Prompt、SQL、命令或批准 token，也不读取游戏快照和
 * 浏览器存储。所有外部文字都经限长后写入 `textContent`；事件格式错误时直接忽略。
 */

type AgentLogEvent = {
  schemaVersion?: unknown;
  type?: unknown;
  phase?: unknown;
  status?: unknown;
  turn?: unknown;
  action?: unknown;
  state?: unknown;
  scope?: unknown;
  level?: unknown;
  message?: unknown;
  input?: unknown;
  output?: unknown;
  cacheRead?: unknown;
  cacheWrite?: unknown;
  total?: unknown;
  canCheck?: unknown;
  canFix?: unknown;
  canApply?: unknown;
  diagnosis?: unknown;
};

type CommandAck = {
  schemaVersion: 1;
  accepted: boolean;
  reason: "started" | "busy" | "closed" | "invalid_state";
};

type Diagnosis = {
  result: "fault" | "healthy" | "blocked";
  issue: string;
  cause: string;
  evidence: string[];
  fix: string;
  paths: string[];
  risk: "low" | "medium" | "high";
};

const PHASES = ["observe", "plan", "act", "verify", "finding", "fix", "check"] as const;
type Phase = typeof PHASES[number];

const DASHBOARD_STATES = [
  "idle",
  "diagnosing",
  "diagnosed",
  "fixing",
  "needs_approval",
  "verifying",
  "ready_to_apply",
  "applied",
  "failed",
] as const;
type DashboardState = typeof DASHBOARD_STATES[number];

const DASHBOARD_LABELS: Record<DashboardState, string> = {
  idle: "待命",
  diagnosing: "排查中",
  diagnosed: "已诊断",
  fixing: "修复中",
  needs_approval: "待核心批准",
  verifying: "验证中",
  ready_to_apply: "待应用",
  applied: "已应用",
  failed: "失败",
};

declare global {
  interface Window {
    __DUNGEON_QUICK_CHECK__?: () => Promise<unknown>;
    __DUNGEON_QUICK_FIX__?: () => Promise<unknown>;
    __DUNGEON_APPLY_FIX__?: () => Promise<unknown>;
  }
}

function text(value: unknown, limit = 120): string {
  if (typeof value !== "string") return "";
  return value.replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim().slice(0, limit);
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function phase(value: unknown): Phase | null {
  return typeof value === "string" && (PHASES as readonly string[]).includes(value)
    ? value as Phase
    : null;
}

function dashboardState(value: unknown): DashboardState | null {
  return typeof value === "string" && (DASHBOARD_STATES as readonly string[]).includes(value)
    ? value as DashboardState
    : null;
}

function detail(event: Event): AgentLogEvent | null {
  const value = (event as CustomEvent<unknown>).detail;
  if (!value || typeof value !== "object") return null;
  const record = value as AgentLogEvent;
  return record.schemaVersion === 1 ? record : null;
}

function diagnosis(value: unknown): Diagnosis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const result = record.result;
  const risk = record.risk;
  if (result !== "fault" && result !== "healthy" && result !== "blocked") return null;
  if (risk !== "low" && risk !== "medium" && risk !== "high") return null;
  const evidence = Array.isArray(record.evidence)
    ? record.evidence.map((item) => text(item, 160)).filter(Boolean).slice(0, 6)
    : [];
  const paths = Array.isArray(record.paths)
    ? record.paths.map((item) => text(item, 300)).filter(Boolean).slice(0, 3)
    : [];
  return {
    result,
    issue: text(record.issue, 160),
    cause: text(record.cause, 400),
    evidence,
    fix: text(record.fix, 600),
    paths,
    risk,
  };
}

function commandAck(value: unknown): CommandAck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const reason = record.reason;
  if (record.schemaVersion !== 1 || typeof record.accepted !== "boolean") return null;
  if (reason !== "started" && reason !== "busy" && reason !== "closed" && reason !== "invalid_state") {
    return null;
  }
  return { schemaVersion: 1, accepted: record.accepted, reason };
}

/**
 * 安装开发态 Harness 控制台。
 * @param root 当前游戏根节点；稳定节点由 AppShell 静态模板提供。
 * @returns 卸载监听器、按钮处理器并隐藏面板的函数；生产页面不会调用本模块。
 */
export function installPlaytestAgentPanel(root: HTMLElement): () => void {
  const panel = root.querySelector<HTMLElement>("#playtest-agent-console");
  const status = root.querySelector<HTMLElement>("#playtest-agent-status");
  const turn = root.querySelector<HTMLElement>("#playtest-agent-turn");
  const currentPhase = root.querySelector<HTMLElement>("#playtest-agent-phase");
  const tool = root.querySelector<HTMLElement>("#playtest-agent-tool");
  const log = root.querySelector<HTMLElement>("#playtest-agent-log");
  const usage = root.querySelector<HTMLElement>("#playtest-agent-usage");
  const phaseNodes = [...root.querySelectorAll<HTMLElement>("[data-agent-phase]")];
  if (!panel || !status || !turn || !currentPhase || !tool || !log || !usage) return () => undefined;

  const controls = root.querySelector<HTMLElement>("#playtest-dashboard-controls");
  const checkButton = root.querySelector<HTMLButtonElement>("#playtest-quick-check");
  const fixButton = root.querySelector<HTMLButtonElement>("#playtest-quick-fix");
  const applyButton = root.querySelector<HTMLButtonElement>("#playtest-apply-fix");
  const diagnosisPanel = root.querySelector<HTMLElement>("#playtest-diagnosis");
  const diagnosisResult = root.querySelector<HTMLElement>("#playtest-diagnosis-result");
  const diagnosisIssue = root.querySelector<HTMLElement>("#playtest-diagnosis-issue");
  const diagnosisCause = root.querySelector<HTMLElement>("#playtest-diagnosis-cause");
  const diagnosisEvidence = root.querySelector<HTMLElement>("#playtest-diagnosis-evidence");
  const diagnosisFix = root.querySelector<HTMLElement>("#playtest-diagnosis-fix");
  const diagnosisPaths = root.querySelector<HTMLElement>("#playtest-diagnosis-paths");
  const diagnosisRisk = root.querySelector<HTMLElement>("#playtest-diagnosis-risk");
  const dashboard = Boolean(
    controls && checkButton && fixButton && applyButton
    && typeof window.__DUNGEON_QUICK_CHECK__ === "function"
    && typeof window.__DUNGEON_QUICK_FIX__ === "function"
    && typeof window.__DUNGEON_APPLY_FIX__ === "function",
  );

  panel.hidden = false;
  if (controls) controls.hidden = !dashboard;
  const lines: string[] = ["000 BOOT / 等待 Agent"];
  const seen = new Set<Phase>();
  let input = 0;
  let output = 0;
  let providerCache = 0;
  let total = 0;
  let next = 1;
  let commandRunning = false;
  let allowed = { check: dashboard, fix: false, apply: false };

  const render = (): void => {
    log.textContent = lines.join("\n");
    log.scrollTop = log.scrollHeight;
    usage.textContent = `TOKEN I ${String(input)} / O ${String(output)} / C ${String(providerCache)} / T ${String(total)}`;
  };
  const push = (line: string): void => {
    lines.push(`${String(next).padStart(3, "0")} ${line}`);
    if (lines.length > 40) lines.splice(0, lines.length - 40);
    next += 1;
    render();
  };
  const showPhase = (value: Phase): void => {
    seen.add(value);
    currentPhase.textContent = value.toUpperCase();
    panel.dataset.phase = value;
    for (const node of phaseNodes) {
      const nodePhase = node.dataset.agentPhase as Phase | undefined;
      node.dataset.state = nodePhase === value ? "active" : nodePhase && seen.has(nodePhase) ? "done" : "idle";
    }
  };
  const updateButtons = (): void => {
    if (!dashboard || !checkButton || !fixButton || !applyButton) return;
    checkButton.disabled = commandRunning || !allowed.check;
    fixButton.disabled = commandRunning || !allowed.fix;
    applyButton.disabled = commandRunning || !allowed.apply;
  };
  const showDiagnosis = (value: Diagnosis): void => {
    if (!diagnosisPanel || !diagnosisResult || !diagnosisIssue || !diagnosisCause
      || !diagnosisEvidence || !diagnosisFix || !diagnosisPaths || !diagnosisRisk) return;
    const resultLabels = { fault: "发现故障", healthy: "运行正常", blocked: "诊断受阻" } as const;
    const riskLabels = { low: "低", medium: "中", high: "高" } as const;
    diagnosisPanel.hidden = false;
    diagnosisPanel.dataset.result = value.result;
    diagnosisResult.textContent = resultLabels[value.result];
    diagnosisIssue.textContent = value.issue || "--";
    diagnosisCause.textContent = value.cause || "--";
    diagnosisEvidence.textContent = value.evidence.length > 0
      ? value.evidence.map((item, index) => `${String(index + 1)}. ${item}`).join("\n")
      : "--";
    diagnosisFix.textContent = value.fix || "--";
    diagnosisPaths.textContent = value.paths.length > 0 ? value.paths.join("\n") : "--";
    diagnosisRisk.textContent = riskLabels[value.risk];
  };
  const setControl = (value: DashboardState, event: AgentLogEvent): void => {
    status.textContent = DASHBOARD_LABELS[value];
    panel.dataset.state = value;
    allowed = {
      check: event.canCheck === true,
      fix: event.canFix === true,
      apply: event.canApply === true,
    };
    commandRunning = false;
    if (fixButton) fixButton.textContent = value === "diagnosed" ? "现场修复" : "继续修复";
    updateButtons();
    const phaseByState: Partial<Record<DashboardState, Phase>> = {
      diagnosing: "observe",
      diagnosed: "finding",
      fixing: "fix",
      needs_approval: "fix",
      verifying: "check",
      ready_to_apply: "verify",
    };
    const nextPhase = phaseByState[value];
    if (nextPhase) showPhase(nextPhase);
    push(`CONTROL / ${DASHBOARD_LABELS[value]} · ${text(event.message, 100)}`);
  };

  showPhase("observe");
  updateButtons();

  const onEvent = (event: Event): void => {
    const value = detail(event);
    if (!value) return;
    const kind = text(value.type, 16);
    const eventPhase = phase(value.phase);
    const currentTurn = number(value.turn);
    if (currentTurn !== null) turn.textContent = `TURN ${String(currentTurn)}`;
    if (eventPhase) showPhase(eventPhase);

    if (kind === "usage") {
      const currentInput = number(value.input) ?? 0;
      const currentOutput = number(value.output) ?? 0;
      const currentCache = (number(value.cacheRead) ?? 0) + (number(value.cacheWrite) ?? 0);
      input += currentInput;
      output += currentOutput;
      providerCache += currentCache;
      total += number(value.total) ?? currentInput + currentOutput + currentCache;
      push(`USAGE / I ${String(input)} O ${String(output)} C ${String(providerCache)} T ${String(total)}`);
      return;
    }
    if (kind === "control") {
      const state = dashboardState(value.state);
      if (state) setControl(state, value);
      return;
    }
    if (kind === "diagnosis") {
      const parsed = diagnosis(value.diagnosis);
      if (!parsed) return;
      showPhase("finding");
      showDiagnosis(parsed);
      push(`DIAGNOSIS / ${parsed.result.toUpperCase()} · ${parsed.issue}`);
      return;
    }
    if (kind === "phase" && eventPhase) {
      push(`${eventPhase.toUpperCase()} / ${text(value.message) || "RUN"}`);
      return;
    }
    if (kind === "action") {
      const action = text(value.action, 32) || "TOOL";
      const state = text(value.state, 16) || "RUN";
      tool.textContent = action.toUpperCase();
      push(`${(eventPhase ?? "act").toUpperCase()} ${action.toUpperCase()} / ${state.toUpperCase()} · ${text(value.message, 72)}`);
      return;
    }
    if (kind === "cache") {
      tool.textContent = "CACHE";
      push(`CACHE ${text(value.state, 12).toUpperCase()} / ${text(value.scope, 16).toUpperCase()} · ${text(value.message, 72)}`);
      return;
    }
    if (kind === "finding") {
      showPhase("finding");
      push(`FINDING ${text(value.level, 12).toUpperCase()} / ${text(value.message, 88)}`);
      return;
    }
    if (kind === "status") {
      const currentStatus = text(value.status, 20) || "READY";
      if (!dashboard) {
        status.textContent = currentStatus;
        panel.dataset.state = currentStatus.toLowerCase();
      }
      push(`STATUS / ${currentStatus} · ${text(value.message, 72)}`);
    }
  };

  const invoke = async (
    label: string,
    runningState: DashboardState,
    command: (() => Promise<unknown>) | undefined,
  ): Promise<void> => {
    if (!dashboard || commandRunning || !command) return;
    commandRunning = true;
    status.textContent = DASHBOARD_LABELS[runningState];
    panel.dataset.state = runningState;
    updateButtons();
    push(`COMMAND / ${label}`);
    try {
      const response = commandAck(await command());
      if (!response) throw new Error("控制响应格式错误");
      if (!response.accepted) {
        commandRunning = false;
        updateButtons();
        push(`COMMAND REJECTED / ${response.reason.toUpperCase()}`);
      }
    } catch {
      commandRunning = false;
      status.textContent = DASHBOARD_LABELS.failed;
      panel.dataset.state = "failed";
      updateButtons();
      push("COMMAND ERROR / 本地控制通道失败");
    }
  };

  const onCheck = (): void => { void invoke("快速排查", "diagnosing", window.__DUNGEON_QUICK_CHECK__); };
  const onFix = (): void => { void invoke("现场修复", "fixing", window.__DUNGEON_QUICK_FIX__); };
  const onApply = (): void => { void invoke("应用到项目", "ready_to_apply", window.__DUNGEON_APPLY_FIX__); };
  checkButton?.addEventListener("click", onCheck);
  fixButton?.addEventListener("click", onFix);
  applyButton?.addEventListener("click", onApply);
  window.addEventListener("dungeon:agent-log", onEvent);
  render();
  return () => {
    window.removeEventListener("dungeon:agent-log", onEvent);
    checkButton?.removeEventListener("click", onCheck);
    fixButton?.removeEventListener("click", onFix);
    applyButton?.removeEventListener("click", onApply);
    panel.hidden = true;
  };
}
