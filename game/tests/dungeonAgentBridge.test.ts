import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/session/GameSession";
import { detectQueryFeatures } from "../src/domain/learning/lessonEvaluator";
import { createEmptyProfile } from "../src/infrastructure/storage/localProgress";
import {
  dungeonAgentInteractionFingerprint,
  installDungeonAgentBridge,
} from "../src/devtools/dungeon-agent/bridge";
import { readDungeonAgentOverlay } from "../src/devtools/dungeon-agent/actions";
import {
  dungeonAgentMoveStopReason,
  findDungeonAgentFrontier,
  findDungeonAgentObjective,
} from "../src/devtools/dungeon-agent/navigation";
import { buildDungeonAgentView } from "../src/devtools/dungeon-agent/projection";
import { SqlEngine } from "../src/infrastructure/sql/SqlEngine";

describe("Dungeon Agent 玩家投影", () => {
  it("Benchmark 起点只接受游戏登记的管理员预设并返回隐藏裁判摘要", () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-prepare");
    session.enableAgentPlaytestMode();
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    let removeBridge: (() => void) | null = null;
    try {
      removeBridge = installDungeonAgentBridge({
        root: { querySelector: () => null } as unknown as HTMLElement,
        session,
        launch: { mode: "agent", floor: 1 },
        checkpointStorage: null,
        checkpointRestored: false,
        resetSql: () => undefined,
      });
      expect(window.__DUNGEON_PLAYTEST__?.prepare("../escape")).toBe(false);
      expect(window.__DUNGEON_PLAYTEST__?.prepare("f1-admin-boss")).toBe(true);
      expect(window.__DUNGEON_PLAYTEST__?.judge(1)).toMatchObject({
        floor: 1,
        lessons: 4,
        stageIndex: 0,
        victories: 0,
      });
      expect(session.snapshot().completedRoomIds).not.toContain(session.snapshot().currentRoomId);
      expect(session.snapshot().claimableReward).toBeNull();
      expect(session.snapshot().groundItems).toContainEqual(expect.objectContaining({
        sourceRoomId: session.snapshot().currentRoomId,
        rewardId: "floor-key",
      }));
    } finally {
      removeBridge?.();
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("管理员预设后 SQL 引擎读取最新怪物 HP", async () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-sql-reset");
    session.enableAgentPlaytestMode();
    const sql = await SqlEngine.create(
      session.snapshot().monsters,
      resolve("node_modules/sql.js/dist/sql-wasm.wasm"),
    );
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    let removeBridge: (() => void) | null = null;
    try {
      removeBridge = installDungeonAgentBridge({
        root: { querySelector: () => null } as unknown as HTMLElement,
        session,
        launch: { mode: "agent", floor: 1 },
        checkpointStorage: null,
        checkpointRestored: false,
        resetSql: (monsters) => sql.reset([...monsters]),
      });
      expect(window.__DUNGEON_PLAYTEST__?.prepare("f1-admin-boss")).toBe(true);
      const defeated = session.snapshot().monsters.find((monster) => monster.hp === 0);
      expect(defeated).toBeDefined();
      expect(sql.executeSelect(
        `SELECT hp FROM monsters WHERE id = ${defeated!.id}`,
      ).rows).toEqual([{ hp: 0 }]);
    } finally {
      removeBridge?.();
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("交互指纹覆盖模式、房间、课程、门、地面物与可见覆盖层", () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-fingerprint");
    const snapshot = session.snapshot();
    const overlay = {
      inspectionOpen: false,
      reviewOpen: false,
      record: null,
      terminal: null,
    };
    const baseline = dungeonAgentInteractionFingerprint(snapshot, overlay);
    const extraGroundItem = {
      id: "fingerprint-ground-item",
      sourceRoomId: snapshot.currentRoomId,
      name: "可见测试物品",
      description: "仅用于指纹测试",
      kind: "event" as const,
      collection: "interact" as const,
      rewardId: null,
      x: snapshot.player.x,
      y: snapshot.player.y,
    };

    [
      { ...snapshot, mode: "campfire" as const },
      { ...snapshot, currentRoomId: `${snapshot.currentRoomId}:next` },
      { ...snapshot, lessonStageIndex: snapshot.lessonStageIndex + 1 },
      { ...snapshot, openedGateIds: [...snapshot.openedGateIds, "gate:fingerprint"] },
      { ...snapshot, groundItems: [...snapshot.groundItems, extraGroundItem] },
    ].forEach((changed) => {
      expect(dungeonAgentInteractionFingerprint(changed, overlay)).not.toBe(baseline);
    });
    expect(dungeonAgentInteractionFingerprint(snapshot, {
      inspectionOpen: true,
      reviewOpen: false,
      record: {
        kicker: "现场记录",
        title: "可见标题",
        body: "可见正文",
      },
      terminal: null,
    })).not.toBe(baseline);
  });

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
    expect(view.terminal).toBeNull();
    if (snapshot.adminAnswerSql) expect(encoded).not.toContain(snapshot.adminAnswerSql);
    expect(view.actions.some((entry) => entry.id === "objective")).toBe(true);
  });

  it("只投影当前打开终端的题面、可见 SQL、状态、证据和已解锁提示", () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-terminal-view");
    session.enableAgentPlaytestMode();
    expect(session.adminApplyPreset("f1-admin-dormitory")).toMatchObject({ ok: true });
    const mimic = session.snapshot().groundItems.find(
      (item) => item.id === "chest:f1:mimic",
    );
    expect(mimic).toBeDefined();
    expect(session.setPlayerPosition(mimic!.x, mimic!.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "combat" });

    const original = session.snapshot();
    expect(original.taskBrief).not.toBeNull();
    const visibleHint = original.taskBrief!.hints[0];
    const hiddenAnswerHint = original.taskBrief!.hints.at(-1)!;
    const snapshot = { ...original, hints: [visibleHint] };
    const view = buildDungeonAgentView(snapshot, {
      inspectionOpen: false,
      reviewOpen: false,
      record: null,
      terminal: {
        kind: "combat",
        title: "SELECT · 阶段 1 · 回合 1",
        inputSql: "SELECT id FROM monsters WHERE status = 'guarding';",
        status: {
          kind: "warning",
          text: "结果列、行值或顺序与目标不一致。",
        },
        result: "id\n3",
        plan: ["01 SCAN monsters"],
      },
    });

    expect(view.actions).not.toContainEqual(expect.objectContaining({ id: "terminal" }));
    expect(view.terminal).toMatchObject({
      kind: "combat",
      lessonId: snapshot.lessonId,
      stageId: snapshot.lessonStageId,
      stageIndex: snapshot.lessonStageIndex,
      objective: snapshot.missionBody,
      task: {
        tier: snapshot.taskBrief!.tierLabel,
        situation: snapshot.taskBrief!.situation,
        goal: snapshot.taskBrief!.queryGoal,
        outputs: snapshot.taskBrief!.outputColumns,
      },
      schema: snapshot.schema,
      locks: snapshot.locks,
      hints: [visibleHint],
      inputSql: "SELECT id FROM monsters WHERE status = 'guarding';",
      status: { kind: "warning" },
      result: "id\n3",
      plan: ["01 SCAN monsters"],
    });
    expect(JSON.stringify(view.terminal).slice(0, 1024)).toContain(
      '"inputSql":"SELECT id FROM monsters WHERE status = \'guarding\';"',
    );
    expect(JSON.stringify(view)).not.toContain(hiddenAnswerHint);

    const closed = buildDungeonAgentView(snapshot);
    expect(closed.terminal).toBeNull();
    expect(closed.actions).toContainEqual(expect.objectContaining({ id: "terminal" }));
    if (original.adminAnswerSql) {
      expect(JSON.stringify(closed)).not.toContain(original.adminAnswerSql);
    }
  });

  it("DOM 只在终端可见时读取 textarea 当前值和查询证据", () => {
    let terminalOpen = false;
    const terminal = {
      hidden: false,
      getAttribute: (name: string) => name === "aria-hidden"
        ? terminalOpen ? "false" : "true"
        : null,
    };
    const plain = (textContent: string) => ({
      textContent,
      dataset: {},
      querySelectorAll: () => [],
    });
    const status = {
      textContent: "结果不匹配",
      dataset: { kind: "warning" },
    };
    const root = {
      querySelector: (selector: string) => ({
        "#combat-terminal": terminal,
        "#terminal-title": plain("SELECT · 阶段 1"),
        "#sql-editor": { value: "SELECT visible_sql FROM monsters" },
        "#query-status": status,
        "#query-result": plain("查询返回 0 行。"),
        "#query-plan": plain("等待 EXPLAIN QUERY PLAN。"),
      } as Record<string, unknown>)[selector] ?? null,
    } as unknown as HTMLElement;

    expect(readDungeonAgentOverlay(root).terminal).toBeNull();
    terminalOpen = true;
    expect(readDungeonAgentOverlay(root).terminal).toEqual({
      kind: "combat",
      title: "SELECT · 阶段 1",
      inputSql: "SELECT visible_sql FROM monsters",
      status: { kind: "warning", text: "结果不匹配" },
      result: "查询返回 0 行。",
      plan: ["等待 EXPLAIN QUERY PLAN。"],
    });
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

  it("课程完成后 objective 先指向待领取的课程宝箱", () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-course-reward");
    session.enableAgentPlaytestMode();
    const selectRoom = session.snapshot().roomGraph.nodes.find(
      (room) => room.lessonId === "select",
    );
    expect(selectRoom).toBeDefined();
    expect(session.travelToRoom(selectRoom!.id).ok).toBe(true);
    const actor = session.snapshot().worldActors.find(
      (entry) => entry.roomNodeId === selectRoom!.id,
    );
    expect(actor).toBeDefined();
    expect(session.setPlayerPosition(actor!.x, actor!.y)).toBe(true);

    expect(session.resolveQuery({
      sql: "SELECT weakness FROM monsters WHERE id = 1",
      columns: ["weakness"],
      rows: [{ weakness: "slash" }],
      targetIds: [],
      plan: ["SEARCH teaching fixture"],
      baseHeat: 3,
      features: detectQueryFeatures("SELECT weakness FROM monsters WHERE id = 1"),
    }).accepted).toBe(true);
    expect(session.resolveQuery({
      sql: "SELECT id, status FROM monsters WHERE id = 1",
      columns: ["id", "status"],
      rows: [{ id: 1, status: "idle" }],
      targetIds: [1],
      plan: ["SEARCH teaching fixture"],
      baseHeat: 3,
      features: detectQueryFeatures("SELECT id, status FROM monsters WHERE id = 1"),
    }).lessonCompleted).toBe("select");

    const snapshot = session.snapshot();
    const reward = snapshot.groundItems.find(
      (item) => item.sourceRoomId === selectRoom!.id && item.collection === "interact",
    );
    expect(reward).toBeDefined();
    expect(snapshot.claimableReward?.id).toBe(reward!.rewardId);
    expect(snapshot.navigationGuidance.objectiveRoomId).not.toBe(selectRoom!.id);
    expect(findDungeonAgentObjective(snapshot)).toEqual({ x: reward!.x, y: reward!.y });

    expect(session.setPlayerPosition(reward!.x, reward!.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "reward" });
    const nextSnapshot = session.snapshot();
    const nextActor = nextSnapshot.worldActors.find((entry) => (
      entry.roomNodeId === nextSnapshot.navigationGuidance.objectiveRoomId
      && nextSnapshot.monsters.some(
        (monster) => monster.id === entry.monsterId && monster.hp > 0,
      )
    ));
    expect(nextActor).toBeDefined();
    expect(findDungeonAgentObjective(nextSnapshot)).toEqual({
      x: nextActor!.x,
      y: nextActor!.y,
    });
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

  it("inputSql 写入当前 textarea 后，query 走真实终端按钮且规则拒绝时返回 ok=false", async () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-query-result");
    session.enableAgentPlaytestMode();
    expect(session.adminApplyPreset("f1-admin-dormitory")).toMatchObject({ ok: true });
    const mimic = session.snapshot().groundItems.find(
      (item) => item.id === "chest:f1:mimic",
    );
    expect(mimic).toBeDefined();
    expect(session.setPlayerPosition(mimic!.x, mimic!.y)).toBe(true);
    expect(session.interact()).toMatchObject({ ok: true, kind: "combat" });

    const stage = { classList: { contains: () => false } };
    const terminal = {
      hidden: false,
      getAttribute: (name: string) => name === "aria-hidden" ? "false" : null,
    };
    const editor = {
      value: "",
      dispatchEvent: () => true,
      disabled: false,
      hidden: false,
    };
    const status = {
      textContent: "管理员模式：当前题目的正确 SQL 已填入，可直接执行。",
      dataset: { kind: "success" },
    };
    const plain = (textContent: string) => ({
      textContent,
      dataset: {},
      querySelectorAll: () => [],
    });
    const executeButton = {
      disabled: false,
      hidden: false,
      click: () => {
        const resolution = session.registerQueryError("受控 SQL 失败", editor.value);
        status.textContent = resolution.message;
        status.dataset.kind = "warning";
      },
    };
    const root = {
      querySelector: (selector: string) => ({
        ".game-stage": stage,
        "#combat-terminal": terminal,
        "#terminal-title": plain("SELECT · 阶段 1 · 回合 1"),
        "#sql-editor": editor,
        "#query-status": status,
        "#query-result": plain("查询已执行 · 结果值与行数已封存"),
        "#query-plan": plain("01 SCAN monsters"),
        "#execute-query": executeButton,
      } as Record<string, unknown>)[selector] ?? null,
    } as unknown as HTMLElement;
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const testWindow = { setTimeout } as unknown as Window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: testWindow,
    });
    let removeBridge: (() => void) | null = null;
    try {
      removeBridge = installDungeonAgentBridge({
        root,
        session,
        launch: { mode: "agent", floor: 1 },
        checkpointStorage: null,
        checkpointRestored: false,
        resetSql: () => undefined,
      });

      const sql = "SELECT id FROM monsters WHERE id = -1";
      await expect(window.__DUNGEON_PLAYTEST__?.inputSql(sql)).resolves.toMatchObject({
        ok: true,
        event: "input-accepted",
        view: { terminal: { inputSql: sql } },
      });
      await expect(window.__DUNGEON_PLAYTEST__?.query()).resolves.toMatchObject({
        ok: false,
        event: "query-rejected",
        view: {
          terminal: {
            inputSql: editor.value,
            status: { kind: "warning" },
          },
        },
      });
      const inputEvent = window.__DUNGEON_PLAYTEST__?.events(0).find(
        (entry) => entry.type === "input-sql",
      );
      expect(inputEvent?.summary).toContain("length=");
      expect(inputEvent?.summary).not.toContain(sql);
    } finally {
      removeBridge?.();
      if (previousWindow) {
        Object.defineProperty(globalThis, "window", previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  it("未生效的交互不会被去重", async () => {
    const session = new GameSession(null, createEmptyProfile(), "agent-use-settlement");
    session.enableAgentPlaytestMode();
    const selectRoom = session.snapshot().roomGraph.nodes.find(
      (room) => room.lessonId === "select",
    );
    expect(selectRoom).toBeDefined();
    expect(session.travelToRoom(selectRoom!.id).ok).toBe(true);
    const actor = session.snapshot().worldActors.find(
      (entry) => entry.roomNodeId === selectRoom!.id,
    );
    expect(actor).toBeDefined();
    expect(session.setPlayerPosition(actor!.x, actor!.y)).toBe(true);
    expect(session.resolveQuery({
      sql: "SELECT weakness FROM monsters WHERE id = 1",
      columns: ["weakness"],
      rows: [{ weakness: "slash" }],
      targetIds: [],
      plan: ["SEARCH teaching fixture"],
      baseHeat: 3,
      features: detectQueryFeatures("SELECT weakness FROM monsters WHERE id = 1"),
    }).accepted).toBe(true);
    expect(session.resolveQuery({
      sql: "SELECT id, status FROM monsters WHERE id = 1",
      columns: ["id", "status"],
      rows: [{ id: 1, status: "idle" }],
      targetIds: [1],
      plan: ["SEARCH teaching fixture"],
      baseHeat: 3,
      features: detectQueryFeatures("SELECT id, status FROM monsters WHERE id = 1"),
    }).lessonCompleted).toBe("select");

    const reward = session.snapshot().groundItems.find(
      (item) => item.sourceRoomId === selectRoom!.id && item.collection === "interact",
    );
    expect(reward).toBeDefined();
    expect(session.setPlayerPosition(reward!.x, reward!.y)).toBe(true);

    let interactionDelay: number | null = null;
    const stage = { classList: { contains: () => false } };
    const button = {
      disabled: false,
      hidden: false,
      click: () => {
        if (interactionDelay !== null) {
          window.setTimeout(() => session.interact(), interactionDelay);
        }
      },
    };
    const root = {
      querySelector: (selector: string) => (
        selector === ".game-stage" ? stage
        : selector === "#interact" ? button
        : null
      ),
    } as unknown as HTMLElement;
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const testWindow = { setTimeout } as unknown as Window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: testWindow,
    });
    let removeBridge: (() => void) | null = null;
    try {
      removeBridge = installDungeonAgentBridge({
        root,
        session,
        launch: { mode: "agent", floor: 1 },
        checkpointStorage: null,
        checkpointRestored: false,
        resetSql: () => undefined,
      });
      await expect(window.__DUNGEON_PLAYTEST__?.use("interact")).resolves.toMatchObject({
        ok: false,
        event: "action-not-applied",
      });
      expect(window.__DUNGEON_PLAYTEST__?.look().actions).toContainEqual(
        expect.objectContaining({ id: "interact" }),
      );

      interactionDelay = 72;
      await expect(window.__DUNGEON_PLAYTEST__?.use("interact")).resolves.toMatchObject({
        ok: true,
        event: "action:interact",
      });
      expect(session.snapshot().groundItems.some((item) => item.id === reward!.id)).toBe(false);
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
  it("协议不接收 SQL 参数、选择器或脚本，只读取已打开 textarea", async () => {
    const protocolSource = await readFile(
      new URL("../src/devtools/dungeon-agent/protocol.ts", import.meta.url),
      "utf8",
    );
    const bridgeSource = await readFile(
      new URL("../src/devtools/dungeon-agent/bridge.ts", import.meta.url),
      "utf8",
    );
    const actionsSource = await readFile(
      new URL("../src/devtools/dungeon-agent/actions.ts", import.meta.url),
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

    expect(protocolSource).toContain("readonly version: 3");
    expect(protocolSource).toContain("inputSql(sql: string): Promise<DungeonAgentResult>");
    expect(protocolSource).toContain("query(): Promise<DungeonAgentResult>");
    expect(protocolSource).toContain("events(afterSequence: number)");
    expect(protocolSource).not.toContain("query(sql");
    expect(protocolSource).not.toContain("evaluate(script");
    expect(protocolSource).toContain("inputSql: string");
    expect(actionsSource).toContain('"#sql-editor"');
    expect(actionsSource).toContain("?.value ?? \"\"");
    expect(actionsSource).toContain("writeDungeonAgentSql");
    expect(bridgeSource).toContain("executeDungeonAgentQuery");
    expect(querySource).toContain("COMBAT_EXECUTE_SELECTOR");
    expect(querySource).toContain("clickDungeonAgentAction");
    expect(querySource).not.toContain("adminAnswerSql");
    expect(querySource).not.toContain("answerSql");
    expect(querySource).not.toContain("SqlEngine");
    expect(bridgeSource).toContain("writeDungeonAgentSql");
    expect(navigationSource).toContain("findGridPath");
    expect(projectionSource).toContain("export function buildDungeonAgentView");
    expect(projectionSource).not.toContain("adminAnswerSql");
    expect(projectionSource).not.toContain("taskBrief.hints");
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
