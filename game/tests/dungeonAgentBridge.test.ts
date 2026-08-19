import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/session/GameSession";
import type { SqlEngine } from "../src/infrastructure/sql/SqlEngine";
import { createEmptyProfile } from "../src/infrastructure/storage/localProgress";
import {
  buildDungeonAgentView,
  dungeonAgentMoveStopReason,
  findDungeonAgentFrontier,
  installDungeonAgentBridge,
} from "../src/devtools/dungeon-agent/bridge";

describe("Dungeon Agent 玩家投影", () => {
  it("不返回完整地图、管理员答案、身份、背包或正式存档", () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-redaction");
    session.enableAdminMode();
    const snapshot = session.snapshot();
    const view = buildDungeonAgentView(snapshot);
    const encoded = JSON.stringify(view);

    expect(view.floor).toBe(1);
    expect(encoded).not.toContain("mazeFloor");
    expect(encoded).not.toContain("adminAnswerSql");
    expect(encoded).not.toContain("runInstanceId");
    expect(encoded).not.toContain("equipmentInventory");
    expect(encoded).not.toContain("profile");
    expect(encoded).not.toContain(snapshot.runSeed);
    expect(view.actions.some((entry) => entry.id === "objective")).toBe(true);
  });

  it("frontier 只选择已发现区域相邻的未知可走格", () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-frontier");
    const snapshot = session.snapshot();
    const discovered = new Set(snapshot.discoveredCells);
    const frontier = findDungeonAgentFrontier(snapshot, discovered);

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

  it("模式、生命、楼层、任务和交互提示变化都会停止宏移动", () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-stop");
    const before = session.snapshot();

    expect(dungeonAgentMoveStopReason(before, { ...before, mode: "combat" })).toBe("mode");
    expect(dungeonAgentMoveStopReason(before, {
      ...before,
      player: { ...before.player, hp: before.player.hp - 1 },
    })).toBe("health");
    expect(dungeonAgentMoveStopReason(before, { ...before, floor: 2 })).toBe("floor");
    expect(dungeonAgentMoveStopReason(before, { ...before, missionTitle: "新任务" })).toBe("task");
    expect(dungeonAgentMoveStopReason(before, {
      ...before,
      interactionPrompt: "E  调查",
    })).toBe("action");
  });

  it("真实规则拒绝查询时向重放层返回 ok=false", async () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-query-result");
    session.enableAdminMode();
    expect(session.adminApplyPreset("f1-admin-dormitory")).toMatchObject({ ok: true });
    const mimic = session.snapshot().groundItems.find(
      (item) => item.id === "chest:f1:mimic",
    );
    expect(mimic).toBeDefined();
    expect(session.setPlayerPosition(mimic!.x, mimic!.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "combat" });

    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const testWindow = { setTimeout } as unknown as Window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: testWindow,
    });
    let removeBridge: (() => void) | null = null;
    try {
      removeBridge = installDungeonAgentBridge({
        root: { querySelector: () => null } as unknown as HTMLElement,
        session,
        sql: {
          execute: () => {
            throw new Error("受控 SQL 失败");
          },
          updateMonsterHp: () => undefined,
        } as unknown as SqlEngine,
        launch: { mode: "agent", floor: 1 },
        checkpointStorage: null,
        checkpointRestored: false,
      });

      await expect(window.__DUNGEON_PLAYTEST__?.query()).resolves.toMatchObject({
        ok: false,
        event: "query-rejected",
      });
    } finally {
      removeBridge?.();
      if (previousWindow) {
        Object.defineProperty(globalThis, "window", previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
});

describe("Dungeon Agent 桥接边界", () => {
  it("协议不接收 SQL、选择器或脚本，并提供增量语义事件", async () => {
    const protocolSource = await readFile(
      new URL("../src/devtools/dungeon-agent/protocol.ts", import.meta.url),
      "utf8",
    );
    const bridgeSource = await readFile(
      new URL("../src/devtools/dungeon-agent/bridge.ts", import.meta.url),
      "utf8",
    );
    const querySource = await readFile(
      new URL("../src/devtools/dungeon-agent/query.ts", import.meta.url),
      "utf8",
    );
    const navigationSource = await readFile(
      new URL("../src/devtools/dungeon-agent/navigation.ts", import.meta.url),
      "utf8",
    );
    const projectionSource = await readFile(
      new URL("../src/devtools/dungeon-agent/projection.ts", import.meta.url),
      "utf8",
    );

    expect(protocolSource).toContain("readonly version: 2");
    expect(protocolSource).toContain("query(): Promise<DungeonAgentResult>");
    expect(protocolSource).toContain("events(afterSequence: number)");
    expect(protocolSource).not.toContain("query(sql");
    expect(protocolSource).not.toContain("evaluate(script");
    expect(bridgeSource).toContain("executeDungeonAgentQuery");
    expect(querySource).toContain("session.validateCombatQuery(assistedSql)");
    expect(querySource).toContain("sql.execute(");
    expect(querySource).toContain("session.resolveQuery(queryResult)");
    expect(querySource).toContain("sql.updateMonsterHp(resolution.hpUpdates)");
    expect(navigationSource).toContain("findGridPath");
    expect(projectionSource).toContain("export function buildDungeonAgentView");
    expect(bridgeSource).not.toContain("adminAnswerSql");
    expect(bridgeSource).not.toContain("findGridPath");
  });

  it("应用入口只在 DEV 分支动态加载协议和桥", async () => {
    const mainSource = await readFile(
      new URL("../src/application/main.ts", import.meta.url),
      "utf8",
    );

    expect(mainSource).toContain("if (import.meta.env.DEV)");
    expect(mainSource).toContain('await import("../devtools/dungeon-agent/protocol")');
    expect(mainSource).toContain('"../devtools/dungeon-agent/bridge"');
    expect(mainSource).not.toContain("from \"../devtools/dungeon-agent/bridge\"");
  });
});
