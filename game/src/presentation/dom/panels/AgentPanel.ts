import type { AgentPhase, AgentRuntimeState } from "../../../application/agent/AgentRuntime";
import type { AppShellDom } from "../appShellDom";

const STATUS: Record<AgentPhase, string> = {
  idle: "IDLE",
  dirty: "DIRTY",
  running: "RUNNING",
  ready: "READY",
  local: "LOCAL",
};

export class AgentPanel {
  private frame: number | null = null;
  private renderId = 0;
  private lastKey: string | null = null;

  constructor(private readonly dom: Pick<
    AppShellDom,
    | "agentPanel"
    | "mainStatus"
    | "mainGuidance"
    | "agentWorkMode"
    | "agentWorkCampfire"
    | "agentWorkScribe"
    | "agentWorkMain"
    | "agentWorkAction"
    | "agentWorkCurrent"
    | "agentWorkPage"
    | "agentWorkLog"
    | "mainLive"
  >) {}

  render(state: AgentRuntimeState): void {
    const phase = state.phases.main;
    this.dom.agentPanel.dataset.state = phase;
    this.dom.mainStatus.textContent = STATUS[phase];
    this.renderWork(state);

    if (phase === "running") {
      this.cancelTyping();
      return;
    }
    const key = state.requestKey;
    if ((phase === "ready" || phase === "local") && key) {
      if (key === this.lastKey) return;
      this.lastKey = key;
      if (phase === "ready" && state.streamKey === key && !this.reducedMotion()) {
        this.startTyping(state);
      } else {
        this.showAll(state);
      }
      return;
    }
    this.cancelTyping();
    this.dom.mainGuidance.textContent = state.guidance;
  }

  destroy(): void {
    this.cancelTyping();
  }

  private startTyping(state: AgentRuntimeState): void {
    this.cancelTyping();
    const id = ++this.renderId;
    const guidance = Array.from(state.guidance);
    const started = performance.now();
    this.dom.mainGuidance.textContent = "";
    this.dom.agentPanel.dataset.state = "running";
    this.dom.mainStatus.textContent = "STREAM";
    const tick = (now: number): void => {
      if (id !== this.renderId) return;
      const count = Math.min(guidance.length, Math.max(1, Math.floor((now - started) / 24) + 1));
      this.dom.mainGuidance.textContent = guidance.slice(0, count).join("");
      if (count >= guidance.length) {
        this.complete(state);
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private showAll(state: AgentRuntimeState): void {
    this.cancelTyping();
    this.dom.mainGuidance.textContent = state.guidance;
    this.complete(state);
  }

  private complete(state: AgentRuntimeState): void {
    this.frame = null;
    this.dom.agentPanel.dataset.state = state.phases.main;
    this.dom.mainStatus.textContent = STATUS[state.phases.main];
    this.dom.mainLive.textContent = state.guidance;
  }

  private cancelTyping(): void {
    this.renderId += 1;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private reducedMotion(): boolean {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  private renderWork(state: AgentRuntimeState): void {
    const running = Object.values(state.phases).includes("running");
    this.dom.agentWorkMode.textContent = running ? "ACTIVE" : state.usage.mode;
    this.setRoleState(this.dom.agentWorkCampfire, state.phases.campfire);
    this.setRoleState(this.dom.agentWorkScribe, state.phases.scribe);
    this.setRoleState(this.dom.agentWorkMain, state.phases.main);
    this.dom.agentWorkAction.textContent = this.currentAction(state);
    this.dom.agentWorkCurrent.textContent = this.usageLine(
      `THIS ${state.usage.mode}`,
      state.usage.input,
      state.usage.output,
      state.usage.total,
    );
    this.dom.agentWorkPage.textContent = this.usageLine(
      "PAGE",
      state.usage.pageInput,
      state.usage.pageOutput,
      state.usage.pageTotal,
    );
    this.dom.agentWorkLog.textContent = state.logs.length > 0
      ? state.logs.slice(-3).map((log) => this.readableLog(log)).join("\n")
      : "000 RUNTIME READY";
    this.dom.agentWorkLog.scrollTop = this.dom.agentWorkLog.scrollHeight;
  }

  private setRoleState(node: HTMLElement, phase: AgentPhase): void {
    node.textContent = {
      idle: "待命",
      dirty: "待复盘",
      running: "处理中",
      ready: "已完成",
      local: "本地完成",
    }[phase];
    node.parentElement?.setAttribute("data-state", phase);
  }

  private currentAction(state: AgentRuntimeState): string {
    if (state.phases.campfire === "running") return "篝火正在整理本层复盘。";
    if (state.phases.scribe === "running") return "抄写员正在整理剧情与陪伴。";
    if (state.phases.main === "running") return "主 Agent 正在综合下一步计划。";
    const latest = state.logs.at(-1);
    return latest ? this.readableLog(latest) : "等待新的 Agent 任务。";
  }

  private readableLog(log: string): string {
    const message = log.replace(/^\d{3}\s+/, "");
    if (message === "RUNTIME READY") return "系统 · Agent 已启动";
    if (message === "CACHE HIT / 0 TOKENS") return "缓存 · 直接读取，未消耗 Token";
    if (message.includes("SKIP / PRIORITY")) return "调度 · 低优先级任务暂缓";
    if (message.endsWith(" RUN")) {
      const name = message.split(" ")[0];
      return `${this.agentName(name)} · 开始处理`;
    }
    const call = message.match(/^(CAMPFIRE|SCRIBE|MAIN) (READY|FALLBACK) · (\d+)MS · (.+) TOKENS$/);
    if (call) {
      const [, name, status, ms, tokens] = call;
      return `${this.agentName(name)} · ${status === "READY" ? "完成" : "本地回退"} · ${ms}ms · ${tokens} Token`;
    }
    const floor = message.match(/^FLOOR (\d+) RESET$/);
    if (floor) return `系统 · 已进入第 ${floor[1]} 层`;
    return message;
  }

  private agentName(name: string): string {
    return { CAMPFIRE: "篝火", SCRIBE: "抄写员", MAIN: "主 Agent" }[name] ?? name;
  }

  private usageLine(label: string, input: number | null, output: number | null, total: number | null): string {
    const token = (value: number | null): string => value === null ? "N/A" : String(value);
    return `${label} · I ${token(input)} · O ${token(output)} · T ${token(total)}`;
  }
}
