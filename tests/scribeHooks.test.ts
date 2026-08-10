import { describe, expect, it } from "vitest";
import type {
  ScribeAgentOutput,
  ScribeAgentPort,
  ScribePrompt,
} from "../src/contracts/agent/scribe";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import type { AnswerAttemptRecord } from "../src/contracts/game/results";
import { ScribeHook } from "../src/application/hooks/scribe";
import { TriggerBus } from "../src/application/triggers/bus";
import { GameSession } from "../src/domain/session/GameSession";
import type { FloorNumber } from "../src/domain/progression/runGraph";

function attempt(): AnswerAttemptRecord {
  return {
    id: 1,
    battleId: 1,
    floor: 1 as FloorNumber,
    monsterId: 1,
    monsterName: "史莱姆",
    lessonId: "select",
    stageId: "select-name",
    stageObjective: "读取目标记录",
    round: 1,
    sql: "SELECT id FROM monsters WHERE id = 1",
    answerSql: "SELECT id, status FROM monsters WHERE id = 1",
    result: "missing-concept",
    outcome: "countered",
    feedback: "字段不完整",
    hintLevel: 1,
  };
}

function snapshotWithEvidence(): GameSnapshot {
  const snapshot = new GameSession(null, null, "scribe-hook-test").snapshot();
  return {
    ...snapshot,
    taskBrief: {
      tier: "foundation",
      tierLabel: "基础",
      situation: "读取记录",
      queryGoal: "返回目标字段",
      outputColumns: ["id", "status"],
      fieldGuide: [],
      relations: [],
      constraints: [],
      successEffect: "记录通过",
      primaryTable: "monsters",
      relatedTables: [],
      focusTopics: ["SELECT"],
      reviewTopics: ["字段投影"],
      hints: [],
    },
    floorReview: [attempt()],
    battleReview: [attempt()],
  };
}

function remoteOutput(prompt: ScribePrompt): ScribeAgentOutput {
  return {
    schemaVersion: 1,
    requestId: "remote-request",
    evidenceHash: "c".repeat(64),
    headline: `远程${prompt.scene}`,
    facts: ["远程文案已校验"],
    nextAction: "继续当前目标。",
    safeHintId: prompt.learning?.safeHintId ?? null,
    message: "远程结果只替换展示文字。",
  };
}

describe("抄写员 Hook", () => {
  it("主动交互立即返回本地详细提示，并只向 Agent 发送投影字段", async () => {
    const received: ScribePrompt[] = [];
    const client: ScribeAgentPort = {
      respond: async (prompt) => {
        received.push(prompt);
        return remoteOutput(prompt);
      },
    };
    const hook = new ScribeHook(client);
    const snapshot = snapshotWithEvidence();

    const local = hook.interact(
      snapshot,
      "npc-scribe-f1",
      "抄写员：先核对当前目标。",
    );

    expect(local.facts).toContain("缺少字段：status");
    expect(local.nextAction).toContain("补齐题目要求的字段");
    expect(hook.getState().status).toBe("requesting");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hook.getState().status).toBe("ready");
    expect(hook.getState().output?.headline).toBe("远程interaction");
    expect(received[0]?.learning?.safeHintId).toBe("hint:select:select-name:1");
    expect(JSON.stringify(received)).not.toContain("answerSql");
    expect(JSON.stringify(received)).not.toContain("SELECT id FROM");
  });

  it("死亡与导航使用独立场景证据", () => {
    const hook = new ScribeHook(null);
    const snapshot = snapshotWithEvidence();
    const previous = { ...snapshot, mode: "combat" } as GameSnapshot;
    const deathSnapshot = { ...snapshot, mode: "defeat" } as GameSnapshot;

    hook.handle({ type: "death", snapshot: deathSnapshot, previous });
    expect(hook.getState().scene).toBe("death-review");
    expect(hook.getState().output?.facts[0]).toContain("战斗反击");

    const navigation = {
      ...snapshot,
      navigationGuidance: {
        ...snapshot.navigationGuidance,
        objectiveRoomId: "room-boss",
        objectiveTitle: "王座门",
        level: 1,
        direction: "east",
        distance: 12,
      },
    } as GameSnapshot;
    hook.handle({ type: "navigation", snapshot: navigation, previous: snapshot });
    expect(hook.getState().scene).toBe("navigation");
    expect(hook.getState().output?.facts[0]).toContain("东方");
  });

  it("导航只在引导等级上升时触发", () => {
    const initial = new GameSession(null, null, "scribe-trigger-test").snapshot();
    const events: string[] = [];
    const bus = new TriggerBus();
    bus.subscribe((event) => events.push(event.type));
    const source = {
      listener: (_snapshot: GameSnapshot): void => undefined,
      subscribe(listener: (snapshot: GameSnapshot) => void): (() => void) {
        this.listener = listener;
        listener(initial);
        return () => undefined;
      },
    };
    bus.connect(source);

    const levelOne = {
      ...initial,
      navigationGuidance: {
        ...initial.navigationGuidance,
        objectiveRoomId: "room-boss",
        objectiveTitle: "王座门",
        level: 1,
        direction: "east",
        distance: 12,
      },
    } as GameSnapshot;
    source.listener(levelOne);
    source.listener({
      ...levelOne,
      navigationGuidance: { ...levelOne.navigationGuidance, distance: 11 },
    });
    source.listener({
      ...levelOne,
      navigationGuidance: { ...levelOne.navigationGuidance, level: 2, distance: 10 },
    });

    expect(events).toEqual(["navigation", "navigation"]);
  });
});
