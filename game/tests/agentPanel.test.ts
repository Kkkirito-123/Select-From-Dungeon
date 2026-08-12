import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeState } from "../src/application/agent/AgentRuntime";
import type { AppShellDom } from "../src/presentation/dom/appShellDom";
import { AgentPanel } from "../src/presentation/dom/panels/AgentPanel";

function node(): HTMLElement {
  return { dataset: {}, textContent: "", scrollHeight: 80, scrollTop: 0 } as unknown as HTMLElement;
}

type PanelDom = ParentNode & Pick<
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
>;

function root(): PanelDom {
  const nodes = new Map([
    ["#agent-panel", node()],
    ["#main-status", node()],
    ["#main-guidance", node()],
    ["#agent-work-mode", node()],
    ["#agent-work-campfire", node()],
    ["#agent-work-scribe", node()],
    ["#agent-work-main", node()],
    ["#agent-work-action", node()],
    ["#agent-work-current", node()],
    ["#agent-work-page", node()],
    ["#agent-work-log", node()],
    ["#main-live", node()],
  ]);
  return {
    querySelector: <T extends Element>(selector: string): T | null => (
      nodes.get(selector) as T | undefined ?? null
    ),
    agentPanel: nodes.get("#agent-panel")!,
    mainStatus: nodes.get("#main-status")!,
    mainGuidance: nodes.get("#main-guidance")!,
    agentWorkMode: nodes.get("#agent-work-mode")!,
    agentWorkCampfire: nodes.get("#agent-work-campfire")!,
    agentWorkScribe: nodes.get("#agent-work-scribe")!,
    agentWorkMain: nodes.get("#agent-work-main")!,
    agentWorkAction: nodes.get("#agent-work-action")!,
    agentWorkCurrent: nodes.get("#agent-work-current")!,
    agentWorkPage: nodes.get("#agent-work-page")!,
    agentWorkLog: nodes.get("#agent-work-log")!,
    mainLive: nodes.get("#main-live")!,
  } as unknown as PanelDom;
}

function state(overrides: Partial<AgentRuntimeState> = {}): AgentRuntimeState {
  return {
    phases: { campfire: "ready", scribe: "ready", main: "ready" },
    floor: 1,
    event: "scribe-interaction",
    source: "scribe",
    requestKey: "main-key",
    guidance: "下一步内容",
    streamKey: "main-key",
    campfire: { requestKey: null, content: null },
    scribe: {
      requestKey: "scribe-key",
      scene: "interaction",
      content: {
        headline: "抄写员记录",
        facts: ["确定性事实"],
        nextAction: "不应出现在抄写员分区",
        safeHintId: null,
        message: "只显示剧情陪伴。",
      },
    },
    usage: {
      mode: "MODEL",
      input: 18,
      output: 7,
      total: 25,
      pageInput: 18,
      pageOutput: 7,
      pageTotal: 25,
    },
    logs: ["001 SCRIBE RUN", "002 SCRIBE READY · 4MS · 14 TOKENS"],
    ...overrides,
  };
}

describe("AgentPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("左侧只显示 Main 的下一步计划", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const dom = root();
    const panel = new AgentPanel(dom);

    panel.render(state());

    expect(dom.querySelector<HTMLElement>("#main-guidance")?.textContent).toBe("下一步内容");
    expect(dom.querySelector<HTMLElement>("#main-live")?.textContent).toBe("下一步内容");
  });

  it("下方独立显示三 Agent 状态、Token 和内存日志", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const dom = root();
    const panel = new AgentPanel(dom);

    panel.render(state({ phases: { campfire: "ready", scribe: "running", main: "running" } }));

    expect(dom.querySelector<HTMLElement>("#agent-work-mode")?.textContent).toBe("ACTIVE");
    expect(dom.querySelector<HTMLElement>("#agent-work-campfire")?.textContent).toBe("已完成");
    expect(dom.querySelector<HTMLElement>("#agent-work-scribe")?.textContent).toBe("处理中");
    expect(dom.querySelector<HTMLElement>("#agent-work-main")?.textContent).toBe("处理中");
    expect(dom.querySelector<HTMLElement>("#agent-work-action")?.textContent).toBe(
      "抄写员正在整理剧情与陪伴。",
    );
    expect(dom.querySelector<HTMLElement>("#agent-work-current")?.textContent).toBe(
      "THIS MODEL · I 18 · O 7 · T 25",
    );
    expect(dom.querySelector<HTMLElement>("#agent-work-page")?.textContent).toBe(
      "PAGE · I 18 · O 7 · T 25",
    );
    expect(dom.querySelector<HTMLElement>("#agent-work-log")?.textContent).toBe(
      "抄写员 · 开始处理\n抄写员 · 完成 · 4ms · 14 Token",
    );
    expect(dom.querySelector<HTMLElement>("#agent-work-log")?.scrollTop).toBe(80);
  });

  it("只对新远程 Main 结果使用单个 RAF，缓存结果直接显示且不重播", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const frames: FrameRequestCallback[] = [];
    const raf = vi.fn((next: FrameRequestCallback) => {
      frames.push(next);
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockReturnValue(0);
    const dom = root();
    const panel = new AgentPanel(dom);

    panel.render(state());
    expect(raf).toHaveBeenCalledTimes(1);
    expect(dom.querySelector<HTMLElement>("#main-guidance")?.textContent).toBe("");
    frames[0]?.(24);
    expect(dom.querySelector<HTMLElement>("#main-guidance")?.textContent).toBe("下一");

    panel.render(state({ requestKey: "cache-key", streamKey: null }));
    expect(dom.querySelector<HTMLElement>("#main-guidance")?.textContent).toBe("下一步内容");
    const calls = raf.mock.calls.length;
    panel.render(state({ requestKey: "cache-key", streamKey: null }));
    expect(raf).toHaveBeenCalledTimes(calls);
    panel.destroy();
  });

  it("Reduced Motion 直接显示全文，销毁会取消未完成 RAF", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 2));
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const dom = root();
    const panel = new AgentPanel(dom);
    panel.render(state());
    expect(dom.querySelector<HTMLElement>("#main-guidance")?.textContent).toBe("下一步内容");

    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    panel.render(state({ requestKey: "second", streamKey: "second" }));
    panel.destroy();
    expect(cancel).toHaveBeenCalledWith(2);
  });
});
