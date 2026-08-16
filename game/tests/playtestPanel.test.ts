import { afterEach, describe, expect, it, vi } from "vitest";
import { installPlaytestAgentPanel } from "../src/application/playtest/panel";

function node(dataset: Record<string, string> = {}): HTMLElement {
  const value = new EventTarget() as HTMLElement;
  Object.assign(value, {
    dataset,
    hidden: false,
    disabled: false,
    textContent: "",
    scrollHeight: 80,
    scrollTop: 0,
  });
  return value;
}

function fixture(): { dom: HTMLElement; nodes: Map<string, HTMLElement>; phases: HTMLElement[] } {
  const nodes = new Map([
    ["#playtest-agent-console", node()],
    ["#playtest-agent-status", node()],
    ["#playtest-agent-turn", node()],
    ["#playtest-agent-phase", node()],
    ["#playtest-agent-tool", node()],
    ["#playtest-agent-log", node()],
    ["#playtest-agent-usage", node()],
    ["#playtest-dashboard-controls", node()],
    ["#playtest-quick-check", node()],
    ["#playtest-quick-fix", node()],
    ["#playtest-apply-fix", node()],
    ["#playtest-diagnosis", node()],
    ["#playtest-diagnosis-result", node()],
    ["#playtest-diagnosis-issue", node()],
    ["#playtest-diagnosis-cause", node()],
    ["#playtest-diagnosis-evidence", node()],
    ["#playtest-diagnosis-fix", node()],
    ["#playtest-diagnosis-paths", node()],
    ["#playtest-diagnosis-risk", node()],
  ]);
  const phases = ["observe", "plan", "act", "verify", "finding", "fix", "check"]
    .map((value) => node({ agentPhase: value }));
  const dom = {
    querySelector: <T extends Element>(selector: string): T | null => (
      nodes.get(selector) as T | undefined ?? null
    ),
    querySelectorAll: <T extends Element>(selector: string): NodeListOf<T> => (
      (selector === "[data-agent-phase]" ? phases : []) as unknown as NodeListOf<T>
    ),
  } as unknown as HTMLElement;
  return { dom, nodes, phases };
}

describe("playtest agent panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("累计模型与 Provider Cache Token", () => {
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    const value = fixture();
    const remove = installPlaytestAgentPanel(value.dom);
    const send = (detail: Record<string, unknown>): void => {
      const event = new Event("dungeon:agent-log");
      Object.defineProperty(event, "detail", { value: { schemaVersion: 1, ...detail } });
      listeners.get("dungeon:agent-log")?.(event);
    };

    send({ type: "usage", input: 10, output: 4, cacheRead: 3, cacheWrite: 0, total: 17 });
    send({ type: "usage", input: 3, output: 2, cacheRead: 0, cacheWrite: 1, total: 6 });

    expect(value.nodes.get("#playtest-agent-usage")?.textContent)
      .toBe("TOKEN I 13 / O 6 / C 4 / T 23");
    remove();
  });

  it("用阶段轨道区分行动、缓存和发现", () => {
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    const value = fixture();
    installPlaytestAgentPanel(value.dom);
    const send = (detail: Record<string, unknown>): void => {
      const event = new Event("dungeon:agent-log");
      Object.defineProperty(event, "detail", { value: { schemaVersion: 1, ...detail } });
      listeners.get("dungeon:agent-log")?.(event);
    };

    send({ type: "phase", phase: "plan", turn: 2, message: "选择动作" });
    send({ type: "action", phase: "act", action: "go", state: "start", message: "开始执行" });
    send({ type: "cache", state: "hit", scope: "decision", message: "0 TOKENS" });
    send({ type: "finding", level: "review", message: "路线需要复核" });
    send({ type: "status", status: "PASS", message: "场景完成" });

    expect(value.nodes.get("#playtest-agent-turn")?.textContent).toBe("TURN 2");
    expect(value.nodes.get("#playtest-agent-phase")?.textContent).toBe("FINDING");
    expect(value.nodes.get("#playtest-agent-tool")?.textContent).toBe("CACHE");
    expect(value.nodes.get("#playtest-agent-status")?.textContent).toBe("PASS");
    expect(value.nodes.get("#playtest-agent-log")?.textContent).toMatch(/PLAN .*CACHE HIT .*FINDING REVIEW .*STATUS \/ PASS/su);
    expect(value.phases.find((item) => item.dataset.agentPhase === "finding")?.dataset.state).toBe("active");
  });

  it("非 Dashboard 试玩隐藏控制按钮", () => {
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    const value = fixture();

    installPlaytestAgentPanel(value.dom);

    expect(value.nodes.get("#playtest-dashboard-controls")?.hidden).toBe(true);
  });

  it("按控制状态启用按钮并安全渲染结构化诊断", async () => {
    const listeners = new Map<string, EventListener>();
    const check = vi.fn(async () => ({ schemaVersion: 1, accepted: true, reason: "started" }));
    vi.stubGlobal("window", {
      __DUNGEON_QUICK_CHECK__: check,
      __DUNGEON_QUICK_FIX__: vi.fn(async () => ({ schemaVersion: 1, accepted: true, reason: "started" })),
      __DUNGEON_APPLY_FIX__: vi.fn(async () => ({ schemaVersion: 1, accepted: true, reason: "started" })),
      addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    const value = fixture();
    installPlaytestAgentPanel(value.dom);
    const send = (payload: Record<string, unknown>): void => {
      const event = new Event("dungeon:agent-log");
      Object.defineProperty(event, "detail", { value: { schemaVersion: 1, ...payload } });
      listeners.get("dungeon:agent-log")?.(event);
    };

    send({ type: "control", state: "idle", canCheck: true, canFix: false, canApply: false, message: "等待排查" });
    expect(value.nodes.get("#playtest-dashboard-controls")?.hidden).toBe(false);
    expect((value.nodes.get("#playtest-quick-check") as HTMLButtonElement).disabled).toBe(false);
    expect((value.nodes.get("#playtest-quick-fix") as HTMLButtonElement).disabled).toBe(true);

    value.nodes.get("#playtest-quick-check")?.dispatchEvent(new Event("click"));
    await Promise.resolve();
    expect(check).toHaveBeenCalledTimes(1);

    send({
      type: "diagnosis",
      diagnosis: {
        result: "fault",
        issue: "<img src=x onerror=alert(1)>",
        cause: "状态更新遗漏",
        evidence: ["步骤 3 可稳定复现", "控制台出现一次错误"],
        fix: "补齐状态同步并增加回归测试",
        paths: ["game/src/presentation/dom/AppShell.ts"],
        risk: "medium",
      },
    });
    send({ type: "control", state: "diagnosed", canCheck: true, canFix: true, canApply: false, message: "发现故障" });

    expect(value.nodes.get("#playtest-diagnosis")?.hidden).toBe(false);
    expect(value.nodes.get("#playtest-diagnosis-issue")?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(value.nodes.get("#playtest-diagnosis-evidence")?.textContent).toContain("1. 步骤 3 可稳定复现");
    expect((value.nodes.get("#playtest-quick-fix") as HTMLButtonElement).disabled).toBe(false);
    expect(value.nodes.get("#playtest-quick-fix")?.textContent).toBe("现场修复");

    send({ type: "control", state: "ready_to_apply", canCheck: true, canFix: false, canApply: true, message: "验证通过" });
    expect((value.nodes.get("#playtest-apply-fix") as HTMLButtonElement).disabled).toBe(false);
    expect(value.nodes.get("#playtest-agent-status")?.textContent).toBe("待应用");
  });

  it("日志内存与可见内容都只保留最近 40 条", () => {
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    const value = fixture();
    installPlaytestAgentPanel(value.dom);
    for (let index = 0; index < 45; index += 1) {
      const event = new Event("dungeon:agent-log");
      Object.defineProperty(event, "detail", {
        value: { schemaVersion: 1, type: "phase", phase: "plan", message: `事件 ${String(index)}` },
      });
      listeners.get("dungeon:agent-log")?.(event);
    }

    const lines = value.nodes.get("#playtest-agent-log")?.textContent?.split("\n") ?? [];
    expect(lines).toHaveLength(40);
    expect(lines.join("\n")).not.toContain("等待 Agent");
    expect(lines.at(-1)).toContain("事件 44");
  });
});
