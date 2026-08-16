import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/session/GameSession";
import { createEmptyProfile } from "../src/infrastructure/storage/localProgress";
import {
  buildPlaytestView,
  findPlaytestFrontier,
  moveShouldStop,
} from "../src/application/playtest/view";

describe("playtest view", () => {
  it("玩家投影不包含地图、答案、身份、存档或完整快照", () => {
    const session = new GameSession(null, createEmptyProfile(), "playtest-redaction");
    const snapshot = session.snapshot();
    const view = buildPlaytestView(snapshot, "agent", {
      inspectionOpen: false,
      reviewOpen: false,
    });
    const encoded = JSON.stringify(view);

    expect(view.floor).toBe(1);
    expect(view.assist).toBe(false);
    expect(encoded).not.toContain("mazeFloor");
    expect(encoded).not.toContain("adminAnswerSql");
    expect(encoded).not.toContain("runInstanceId");
    expect(encoded).not.toContain("profile");
    expect(encoded).not.toContain(snapshot.runSeed);
    expect(encoded).not.toContain("answerSql");
    expect(view.actions.some((action) => action.id === "objective")).toBe(true);
    expect(view.actions.some((action) => action.id === "frontier")).toBe(false);
    expect(view.record).toBeNull();
  });

  it("Agent 投影不返回答案正文，答案只在桥内部提交", () => {
    const session = new GameSession(null, createEmptyProfile(), "playtest-smoke");
    expect(session.enableAdminMode().ok).toBe(true);
    const snapshot = session.snapshot();
    const view = buildPlaytestView(snapshot, "agent", {
      inspectionOpen: false,
      reviewOpen: false,
    });

    expect(view.assist).toBe(false);
    expect(view.answerReady).toBe(false);
    expect(JSON.stringify(view)).not.toContain("adminAnswerSql");
    expect(view.actions.every((action) => !action.id.includes("preset"))).toBe(true);
    expect(view.actions.every((action) => !action.id.includes("floor"))).toBe(true);
    expect(view.actions.some((action) => action.id === "objective")).toBe(true);
    expect(view.actions.some((action) => action.id === "frontier")).toBe(false);
  });

  it("Smoke 密文只暴露答案可用性，不暴露答案正文", () => {
    const session = new GameSession(null, createEmptyProfile(), "playtest-gate");
    expect(session.enableAdminMode().ok).toBe(true);
    const snapshot = { ...session.snapshot(), mode: "challenge" as const };
    const view = buildPlaytestView(snapshot, "agent", {
      inspectionOpen: false,
      reviewOpen: false,
    }, true);

    expect(view.answerReady).toBe(true);
    expect(JSON.stringify(view)).not.toContain("UNION ALL");
    expect(JSON.stringify(view)).not.toContain("answerSql");
  });

  it("记录打开时允许继续或让 go 先关闭记录再移动", () => {
    const session = new GameSession(null, createEmptyProfile(), "playtest-overlay");
    const view = buildPlaytestView(session.snapshot(), "agent", {
      inspectionOpen: true,
      reviewOpen: false,
      record: { kicker: "STORY", title: "可见标题", body: "可见正文" },
    });

    expect(view.actions).toEqual([
      { id: "continue", label: "继续当前记录" },
      { id: "objective", label: "沿真实路线前往SELECT 排水石碑" },
    ]);
    expect(view.record).toEqual({ kicker: "STORY", title: "可见标题", body: "可见正文" });
  });

  it("战斗结算可见时只等待正式 UI 收口，不抢先点击 MIGRATE", () => {
    const session = new GameSession(null, createEmptyProfile(), "playtest-settlement");
    const snapshot = { ...session.snapshot(), mode: "victory" as const };
    const view = buildPlaytestView(snapshot, "agent", {
      inspectionOpen: false,
      reviewOpen: false,
      settlementOpen: true,
    });

    expect(view.actions).toEqual([{ id: "wait", label: "等待战斗结算完成" }]);
  });

  it("普通战斗结算由真实移动收口，不让执行器原地等待", () => {
    const session = new GameSession(null, createEmptyProfile(), "playtest-moving-settlement");
    const view = buildPlaytestView(session.snapshot(), "agent", {
      inspectionOpen: false,
      reviewOpen: false,
      settlementOpen: true,
    });

    expect(view.actions.some((action) => action.id === "objective")).toBe(true);
    expect(view.actions.some((action) => action.id === "wait")).toBe(false);
  });

  it("前沿只选择已发现区域旁的未知格，不泄露远处地图", () => {
    const session = new GameSession(null, createEmptyProfile(), "playtest-frontier");
    const snapshot = session.snapshot();
    const discovered = new Set(snapshot.discoveredCells);
    const frontier = findPlaytestFrontier(snapshot, discovered);

    expect(frontier).not.toBeNull();
    expect(discovered.has(`${frontier?.x}:${frontier?.y}`)).toBe(false);
    const adjacent = [
      `${(frontier?.x ?? 0) + 1}:${frontier?.y}`,
      `${(frontier?.x ?? 0) - 1}:${frontier?.y}`,
      `${frontier?.x}:${(frontier?.y ?? 0) + 1}`,
      `${frontier?.x}:${(frontier?.y ?? 0) - 1}`,
    ];
    expect(adjacent.some((key) => discovered.has(key))).toBe(true);
  });

  it("生命、模式、楼层、任务和可交互提示变化都会中止宏移动", () => {
    const session = new GameSession(null, createEmptyProfile(), "playtest-stop");
    const before = session.snapshot();

    expect(moveShouldStop(before, { ...before, mode: "combat" })).toBe("mode");
    expect(moveShouldStop(before, {
      ...before,
      player: { ...before.player, hp: before.player.hp - 1 },
    })).toBe("health");
    expect(moveShouldStop(before, { ...before, floor: 2 })).toBe("floor");
    expect(moveShouldStop(before, { ...before, missionTitle: "new" })).toBe("task");
    expect(moveShouldStop(before, { ...before, interactionPrompt: "E" })).toBe("action");
  });
});

describe("playtest bridge v2 contract", () => {
  it("桥只接受固定目标，query 不再接收 SQL 参数", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => (
      readFile(new URL("../src/application/playtest/bridge.ts", import.meta.url), "utf8")
    ));

    expect(source).toContain("readonly version: 2");
    expect(source).toContain("readonly checkpointRestored: boolean");
    expect(source).toContain("checkpoint(): boolean");
    expect(source).toContain("savePlaytestCheckpoint(");
    expect(source).toContain('target: "objective" | "frontier"');
    expect(source).toContain("query(): Promise<PlaytestToolResult>");
    expect(source).not.toContain("query(sql:");
    expect(source).toContain('return result(false, "answer-not-ready")');
    expect(source).toContain('if (snapshot.mode === "transition") options.session.disableAdminMode();');
    expect(source).toContain('if (ready && currentSnapshot().mode === "transition")');
    expect(source).toContain('const beforeKey = actionId === "interact" ? interactionKey() : null;');
    expect(source).toContain("usedInteractions.add(beforeKey)");
    expect(source).toContain("settlementOpen:");
    expect(source).toContain("finalMigrationProgress(snapshot.openedGateIds)");
    expect(source).not.toContain("ending:migrate:");
  });
});
