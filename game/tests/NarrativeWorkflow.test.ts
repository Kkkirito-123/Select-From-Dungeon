import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeState } from "../src/application/agent/AgentRuntime";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import type { FloorStoryMoment } from "../src/domain/progression/floorStory";
import {
  NarrativeWorkflow,
  type NarrativeWorkflowPorts,
} from "../src/features/app-shell/workflows/NarrativeWorkflow";
import type { NarrativeCoordinator } from "../src/features/narrative/NarrativeCoordinator";
import type { NarrativePanel } from "../src/presentation/dom/panels/NarrativePanel";
import type { RecordPanel, RecordPanelKind } from "../src/presentation/dom/panels/RecordPanel";
import { GameSession } from "../src/features/game-session/GameSession";

function moment(): FloorStoryMoment {
  return {
    id: "moment:test-workflow",
    floor: 1,
    kind: "scribe",
    presentation: "blocking",
    kicker: "SCRIBE",
    title: "测试记录",
    lines: ["line"],
    archiveLine: "archive",
    actions: [],
    unlock: { type: "floor-entered" },
    sourceId: "source:test-workflow",
    inspectLandmarkId: "npc-scribe-f1",
    query: null,
  } as FloorStoryMoment;
}

function ports(snapshot: GameSnapshot) {
  const recordPanel = {
    kind: undefined as RecordPanelKind | undefined,
    requestKey: undefined as string | undefined,
    render: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  };
  const showNotice = vi.fn();
  const narrativeCoordinator = {
    executeStoryMomentActions: vi.fn(),
  };
  const value: NarrativeWorkflowPorts = {
    root: { querySelector: () => null } as unknown as HTMLElement,
    recordPanel: recordPanel as unknown as RecordPanel,
    narrativeCodex: { render: vi.fn() } as unknown as NarrativePanel,
    narrativeCoordinator: narrativeCoordinator as unknown as NarrativeCoordinator,
    showNotice,
    getSnapshot: () => snapshot,
    isInspectionOpen: () => recordPanel.kind !== undefined,
    isBusy: () => false,
    hasBlockingOverlay: () => false,
    isCombatSettlementVisible: () => false,
    recordMigrationStep: () => true,
    refreshFloorTransition: vi.fn(),
  };
  return { value, recordPanel, showNotice, narrativeCoordinator };
}

describe("NarrativeWorkflow", () => {
  it("交互场景只刷新同一个抄写员记录框，其他场景按请求阶段去重提示", () => {
    const snapshot = new GameSession(null, null, "narrative-workflow").snapshot();
    const { value, recordPanel, showNotice } = ports(snapshot);
    const workflow = new NarrativeWorkflow(value);
    const content = {
      headline: "抄写员提示",
      facts: [],
      nextAction: "继续探索。",
      safeHintId: null,
      message: "先检查当前记录。",
    };

    recordPanel.kind = "scribe";
    recordPanel.requestKey = "scribe:1";
    workflow.renderScribeState({
      phases: { campfire: "idle", scribe: "ready", main: "idle" },
      floor: 1,
      event: "scribe-interaction",
      source: "scribe",
      requestKey: "scribe:1",
      guidance: "",
      streamKey: null,
      campfire: { requestKey: null, content: null },
      scribe: { requestKey: "scribe:1", scene: "interaction", content },
      usage: { mode: "LOCAL", input: 0, output: 0, total: 0, pageInput: 0, pageOutput: 0, pageTotal: 0 },
      logs: [],
    } as unknown as AgentRuntimeState);
    expect(recordPanel.render).toHaveBeenCalledWith({
      kicker: "SCRIBE / 抄写员",
      title: content.headline,
      body: content.message,
    });
    expect(showNotice).not.toHaveBeenCalled();

    recordPanel.kind = undefined;
    workflow.renderScribeState({
      phases: { campfire: "idle", scribe: "local", main: "idle" },
      floor: 1,
      event: "navigation",
      source: "scribe",
      requestKey: "scribe:2",
      guidance: "",
      streamKey: null,
      campfire: { requestKey: null, content: null },
      scribe: { requestKey: "scribe:2", scene: "death-review", content },
      usage: { mode: "LOCAL", input: 0, output: 0, total: 0, pageInput: 0, pageOutput: 0, pageTotal: 0 },
      logs: [],
    } as unknown as AgentRuntimeState);
    workflow.renderScribeState({
      phases: { campfire: "idle", scribe: "local", main: "idle" },
      floor: 1,
      event: "navigation",
      source: "scribe",
      requestKey: "scribe:2",
      guidance: "",
      streamKey: null,
      campfire: { requestKey: null, content: null },
      scribe: { requestKey: "scribe:2", scene: "death-review", content },
      usage: { mode: "LOCAL", input: 0, output: 0, total: 0, pageInput: 0, pageOutput: 0, pageTotal: 0 },
      logs: [],
    } as unknown as AgentRuntimeState);
    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenCalledWith({
      message: content.message,
      tone: "danger",
    });
  });

  it("调查剧情通过工作流设置 active moment，并把抄写员输出路由到记录框", () => {
    const snapshot = new GameSession(null, null, "narrative-workflow-inspection").snapshot();
    const { value, recordPanel } = ports(snapshot);
    const workflow = new NarrativeWorkflow(value);
    const story = moment();
    const content = {
      headline: "抄写员",
      facts: [],
      nextAction: "继续前进。",
      safeHintId: null,
      message: "继续前进。",
    };

    workflow.presentInspection(story, snapshot, "现场证据", content, "scribe:3");

    expect(workflow.activeNarrativeMoment?.id).toBe(story.id);
    expect(recordPanel.open).toHaveBeenCalledWith({
      kicker: "SCRIBE / 抄写员",
      title: content.headline,
      body: content.message,
      closeLabel: "E · 继续探索",
      kind: "scribe",
    });
    expect(recordPanel.requestKey).toBe("scribe:3");
  });
});
