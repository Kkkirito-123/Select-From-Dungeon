import { describe, expect, it, vi } from "vitest";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import { GameSession } from "../src/features/game-session/GameSession";
import {
  ResetWorkflow,
  type ResetWorkflowPorts,
} from "../src/features/app-shell/workflows/ResetWorkflow";

function snapshot(adminMode = false): GameSnapshot {
  const session = new GameSession(null, null, "reset-workflow");
  const current = session.snapshot();
  return { ...current, adminMode };
}

function createPorts(options: { adminMode?: boolean; busy?: boolean } = {}) {
  const events: string[] = [];
  const resetSnapshot = snapshot();
  const calls = {
    setBanner: vi.fn((message: string) => events.push(`banner:${message}`)),
    setQueryStatus: vi.fn((message: string, kind: "success" | "") => {
      events.push(`query:${kind}:${message}`);
    }),
    showNotice: vi.fn((notice: { message: string; tone: string }) => {
      events.push(`notice:${notice.tone}:${notice.message}`);
    }),
    closeTerminal: vi.fn(() => events.push("close-terminal")),
    hidePickup: vi.fn(() => events.push("hide-pickup")),
    hideCombatSettlement: vi.fn(() => events.push("hide-settlement")),
    resetNarrative: vi.fn(() => events.push("reset-narrative")),
    cancelDefeat: vi.fn(() => events.push("cancel-defeat")),
    abortEncounter: vi.fn(() => events.push("abort-encounter")),
    resetSession: vi.fn(() => events.push("reset-session")),
    resetSql: vi.fn(() => events.push("reset-sql")),
    clearQueryArtifacts: vi.fn(() => events.push("clear-query")),
    setAudioScene: vi.fn(() => events.push("audio-scene")),
  };
  const ports: ResetWorkflowPorts = {
    isAdminMode: () => options.adminMode ?? false,
    isBusy: () => options.busy ?? false,
    setBanner: calls.setBanner,
    setQueryStatus: calls.setQueryStatus,
    showNotice: calls.showNotice,
    closeTerminal: calls.closeTerminal,
    hidePickup: calls.hidePickup,
    hideCombatSettlement: calls.hideCombatSettlement,
    resetNarrative: calls.resetNarrative,
    cancelDefeat: calls.cancelDefeat,
    getBattleScene: () => ({ abortEncounter: calls.abortEncounter }),
    resetSession: calls.resetSession,
    readSnapshot: () => resetSnapshot,
    resetSql: calls.resetSql,
    clearQueryArtifacts: calls.clearQueryArtifacts,
    setAudioScene: calls.setAudioScene,
  };
  return { calls, events, ports };
}

describe("ResetWorkflow", () => {
  it("管理员模式只提示，不重置正式 Run", () => {
    const { calls, events, ports } = createPorts({ adminMode: true });

    new ResetWorkflow(ports).run();

    expect(calls.setBanner).toHaveBeenCalledWith("管理员预览不会覆盖正式 Run。刷新页面后回到正式固定地图。");
    expect(calls.showNotice).toHaveBeenCalledWith({
      message: "管理员预览不会覆盖正式 Run。刷新页面后回到正式固定地图。",
      tone: "info",
    });
    expect(calls.resetSession).not.toHaveBeenCalled();
    expect(events).toHaveLength(2);
  });

  it("忙碌状态只提示，不打断当前回合", () => {
    const { calls, events, ports } = createPorts({ busy: true });

    new ResetWorkflow(ports).run();

    expect(calls.setBanner).toHaveBeenCalledWith("当前回合动画正在结算，结束后再开始新 Run。");
    expect(calls.showNotice).toHaveBeenCalledWith({
      message: "当前回合动画正在结算，结束后再开始新 Run。",
      tone: "info",
    });
    expect(calls.resetSession).not.toHaveBeenCalled();
    expect(events).toHaveLength(2);
  });

  it("成功路径按工作流顺序清理并恢复正式 Run", () => {
    const { calls, events, ports } = createPorts();

    new ResetWorkflow(ports).run();

    expect(events).toEqual([
      "close-terminal",
      "hide-pickup",
      "hide-settlement",
      "reset-narrative",
      "cancel-defeat",
      "reset-session",
      "reset-sql",
      "abort-encounter",
      "clear-query",
      "query:success:固定地图已重置；永久 SQL 图鉴没有被删除。",
      "notice:success:固定地图已重置；永久 SQL 图鉴没有被删除。",
      "audio-scene",
    ]);
    expect(calls.resetSql).toHaveBeenCalledWith(ports.readSnapshot().monsters);
    expect(calls.setAudioScene).toHaveBeenCalledWith({
      floor: ports.readSnapshot().floor,
      region: 0,
      mode: "explore",
    });
  });
});
