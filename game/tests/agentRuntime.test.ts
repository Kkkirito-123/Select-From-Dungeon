import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../src/application/agent/AgentRuntime";
import type { AgentGatewayPort, AgentResponse, AgentView } from "../src/contracts/agent/main";
import type { AnswerAttemptRecord } from "../src/contracts/game/results";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import type { FloorNumber } from "../src/domain/progression/runGraph";
import { GameSession } from "../src/domain/session/GameSession";
import { stableJson } from "../src/infrastructure/agent/protocol";

function attempt(id = 1): AnswerAttemptRecord {
  return {
    id,
    battleId: id,
    floor: 1 as FloorNumber,
    monsterId: 1,
    monsterName: "史莱姆",
    lessonId: "select",
    stageId: "select-name",
    stageObjective: "读取怪物名称",
    round: 1,
    sql: "SELECT name FROM monsters",
    answerSql: "SELECT name FROM monsters WHERE id = 1",
    result: "correct",
    outcome: "hit",
    feedback: "本地反馈",
    hintLevel: 0,
  };
}

function snapshot(): GameSnapshot {
  const base = new GameSession(null, null, "agent-runtime-test").snapshot();
  return {
    ...base,
    floorReview: [attempt()],
    battleReview: [attempt()],
    monsters: base.monsters.map((monster) => (
      monster.floor === base.floor && monster.rank === "elite"
        ? { ...monster, hp: 0 }
        : monster
    )),
    campfires: [{
      ...base.campfires[0],
      x: base.player.x + 1,
      y: base.player.y,
    }],
  };
}

function remote(view: AgentView, serial: number): AgentResponse {
  const campfire = view.changedSource === "campfire";
  const content = campfire
    ? {
        headline: `远程篝火 ${serial}`,
        facts: ["本层作答已复盘。"],
        focusConcept: null,
        nextAction: "继续练习。",
        message: "先检查当前记录。",
      }
    : {
        headline: `远程抄写员 ${serial}`,
        facts: ["陪伴记录已更新。"],
        nextAction: "继续探索。",
        safeHintId: "learning" in view.changed.evidence
          ? view.changed.evidence.learning?.safeHintId ?? null
          : null,
        message: "你已经走到这里，先稳住节奏。",
      };
  return {
    schemaVersion: 1,
    requestId: `remote-${serial}`,
    composeHash: "b".repeat(64),
    floor: view.floor,
    event: view.event,
    changedSource: view.changedSource,
    child: {
      source: view.changedSource,
      evidenceHash: view.changed.evidenceHash,
      status: "ready",
      content,
    },
    main: {
      status: "ready",
      guidance: `远程下一步 ${serial}`,
    },
    meta: {
      traceId: "c".repeat(32),
      ms: 9,
      calls: [
        { agent: view.changedSource, mode: "model", status: "ready", ms: 4, tokens: { input: 10, output: 4, total: 14 } },
        { agent: "main", mode: "model", status: "ready", ms: 5, tokens: { input: 8, output: 3, total: 11 } },
      ],
    },
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class ImmediateGateway implements AgentGatewayPort {
  calls: AgentView[] = [];

  async evidenceHash(value: unknown): Promise<string> {
    const text = stableJson(value);
    return [...text].reduce((total, character) => total + character.charCodeAt(0), 0)
      .toString(16)
      .padStart(64, "0")
      .slice(-64);
  }

  canRequest(): boolean {
    return true;
  }

  async run(view: AgentView): Promise<AgentResponse> {
    this.calls.push(view);
    return remote(view, this.calls.length);
  }
}

interface PendingCall {
  view: AgentView;
  signal: AbortSignal;
  resolve: (response: AgentResponse) => void;
}

class DeferredGateway extends ImmediateGateway {
  pending: PendingCall[] = [];

  override run(view: AgentView, signal = new AbortController().signal): Promise<AgentResponse> {
    this.calls.push(view);
    return new Promise((resolve) => {
      this.pending.push({ view, signal, resolve });
    });
  }
}

describe("AgentRuntime", () => {
  it("命中综合缓存时不再请求、不重播，并显示 CACHE 0", async () => {
    const gateway = new ImmediateGateway();
    const runtime = new AgentRuntime(gateway);
    const current = snapshot();

    runtime.interactScribe(current, "npc-scribe-f1", "先坐一会儿。");
    await tick();
    const first = runtime.getState();
    expect(first.phases.scribe).toBe("ready");
    expect(first.usage.pageTotal).toBe(25);
    expect(first.streamKey).not.toBeNull();

    runtime.interactScribe(current, "npc-scribe-f1", "先坐一会儿。");
    await tick();
    const second = runtime.getState();
    expect(gateway.calls).toHaveLength(1);
    expect(second.usage.mode).toBe("CACHE");
    expect(second.usage.total).toBe(0);
    expect(second.usage.pageTotal).toBe(25);
    expect(second.streamKey).toBeNull();
    expect(second.logs.at(-1)).toContain("CACHE HIT / 0 TOKENS");
    runtime.destroy();
  });

  it("远程结果记录子 Agent 与 Main 的耗时和 Token", async () => {
    const gateway = new ImmediateGateway();
    const runtime = new AgentRuntime(gateway);

    runtime.interactScribe(snapshot(), "npc-scribe-f1", "记录");
    await tick();

    expect(runtime.getState().logs.some((line) => line.includes("SCRIBE READY · 4MS · 14 TOKENS"))).toBe(true);
    expect(runtime.getState().logs.some((line) => line.includes("MAIN READY · 5MS · 11 TOKENS"))).toBe(true);
    runtime.destroy();
  });

  it("缓存命中不刷新原始 TTL", async () => {
    let now = 0;
    const gateway = new ImmediateGateway();
    const runtime = new AgentRuntime(gateway, () => now);
    const current = snapshot();

    runtime.interactScribe(current, "npc-scribe-f1", "记录缓存时点。 ");
    await tick();
    now = 599_999;
    runtime.interactScribe(current, "npc-scribe-f1", "记录缓存时点。 ");
    await tick();
    expect(gateway.calls).toHaveLength(1);

    now = 600_001;
    runtime.interactScribe(current, "npc-scribe-f1", "记录缓存时点。 ");
    await tick();
    expect(gateway.calls).toHaveLength(2);
    runtime.destroy();
  });

  it("同源新证据自动取消旧 invocation，不同来源可并行", async () => {
    const gateway = new DeferredGateway();
    const runtime = new AgentRuntime(gateway);
    const current = snapshot();

    runtime.interactScribe(current, "npc-scribe-f1", "第一条陪伴。");
    await tick();
    runtime.interactScribe(current, "npc-scribe-f1", "第二条陪伴。");
    await tick();
    expect(gateway.pending).toHaveLength(2);
    expect(gateway.pending[0]?.signal.aborted).toBe(true);
    expect(gateway.pending[1]?.signal.aborted).toBe(false);

    runtime.handle({ type: "answer", snapshot: current, previous: current, record: attempt() });
    await tick();
    expect(gateway.pending.some((call) => call.view.changedSource === "campfire")).toBe(true);
    const latestScribe = gateway.pending
      .filter((call) => call.view.changedSource === "scribe")
      .at(-1);
    const campfire = gateway.pending.find((call) => call.view.changedSource === "campfire");
    expect(latestScribe?.signal.aborted).toBe(false);
    expect(campfire?.signal.aborted).toBe(false);
    runtime.destroy();
  });

  it("高优先级抄写员请求阻止未完成篝火覆盖面板，但跨源低级结果仍可缓存", async () => {
    const gateway = new DeferredGateway();
    const runtime = new AgentRuntime(gateway);
    const current = snapshot();
    runtime.handle({ type: "answer", snapshot: current, previous: current, record: attempt() });
    await tick();
    runtime.interactScribe(current, "npc-scribe-f1", "先稳住呼吸。");
    await tick();
    const low = gateway.pending.find((call) => call.view.changedSource === "campfire")!;
    const high = gateway.pending.find((call) => call.view.changedSource === "scribe")!;

    low.resolve(remote(low.view, 1));
    await tick();
    expect(runtime.getState().event).toBe("scribe-interaction");
    expect(runtime.getState().phases.main).toBe("running");

    high.resolve(remote(high.view, 2));
    await tick();
    expect(runtime.getState().event).toBe("scribe-interaction");
    expect(runtime.getState().guidance).toBe("远程下一步 2");
    runtime.destroy();
  });

  it("同源低优先级导航不会取消正在运行的抄写员交互", async () => {
    const gateway = new DeferredGateway();
    const runtime = new AgentRuntime(gateway);
    const current = snapshot();

    runtime.interactScribe(current, "npc-scribe-f1", "先记录眼前发生的事。");
    await tick();
    const interaction = gateway.pending[0]!;
    runtime.handle({
      type: "navigation",
      snapshot: {
        ...current,
        navigationGuidance: {
          level: 1,
          objectiveRoomId: "room-next",
          objectiveTitle: "下一间档案室",
          steps: 40,
          direction: "east",
          distance: 12,
          route: [],
        },
      },
      previous: current,
    });
    await tick();

    expect(gateway.pending).toHaveLength(1);
    expect(interaction.signal.aborted).toBe(false);
    expect(runtime.getState().event).toBe("scribe-interaction");
    interaction.resolve(remote(interaction.view, 1));
    await tick();
    expect(runtime.getState().guidance).toBe("远程下一步 1");
    runtime.destroy();
  });

  it("新作答不会把旧篝火结果带入抄写员背景", async () => {
    const gateway = new ImmediateGateway();
    const runtime = new AgentRuntime(gateway);
    const current = snapshot();

    runtime.handle({ type: "answer", snapshot: current, previous: current, record: attempt() });
    await tick();
    const away = {
      ...current,
      campfires: current.campfires.map((campfire) => ({
        ...campfire,
        x: current.player.x + 10,
        y: current.player.y + 10,
      })),
    };
    runtime.handle({ type: "answer", snapshot: away, previous: current, record: attempt(2) });
    runtime.interactScribe(away, "npc-scribe-f1", "记下新的作答。 ");
    await tick();

    expect(gateway.calls.at(-1)?.context.campfire).toBeNull();
    runtime.destroy();
  });

  it("过期子缓存不会作为另一来源的背景", async () => {
    let now = 0;
    const gateway = new ImmediateGateway();
    const runtime = new AgentRuntime(gateway, () => now);
    const current = snapshot();

    runtime.interactScribe(current, "npc-scribe-f1", "先保留这份记录。 ");
    await tick();
    now = 600_001;
    runtime.handle({ type: "answer", snapshot: current, previous: current, record: attempt() });
    await tick();

    expect(gateway.calls.at(-1)?.context.scribe).toBeNull();
    runtime.destroy();
  });

  it("篝火 fallback 过期后只在下一次范围事件重试", async () => {
    let now = 0;
    const gateway = new ImmediateGateway();
    gateway.canRequest = () => false;
    const runtime = new AgentRuntime(gateway, () => now);
    const current = snapshot();
    const campfireId = current.campfires[0]!.id;

    runtime.handle({ type: "answer", snapshot: current, previous: current, record: attempt() });
    await tick();
    expect(runtime.getState().logs.filter((line) => line.includes("CAMPFIRE RUN"))).toHaveLength(1);

    now = 30_001;
    runtime.handle({ type: "campfire", snapshot: current, previous: current, campfireId });
    await tick();
    expect(runtime.getState().logs.filter((line) => line.includes("CAMPFIRE RUN"))).toHaveLength(2);
    runtime.destroy();
  });

  it("换层同时中止两类请求并清除旧正文", async () => {
    const gateway = new DeferredGateway();
    const runtime = new AgentRuntime(gateway);
    const current = snapshot();

    runtime.interactScribe(current, "npc-scribe-f1", "陪伴。");
    runtime.handle({ type: "answer", snapshot: current, previous: current, record: attempt() });
    await tick();
    expect(gateway.pending).toHaveLength(2);

    runtime.handle({
      type: "floor",
      snapshot: { ...current, floor: 2 } as GameSnapshot,
      previous: current,
    });

    expect(gateway.pending.every((call) => call.signal.aborted)).toBe(true);
    const state = runtime.getState();
    expect(state.floor).toBe(2);
    expect(state.phases).toEqual({ campfire: "idle", scribe: "idle", main: "idle" });
    expect(state.guidance).toContain("第 2 层");
    expect(state.campfire.content).toBeNull();
    expect(state.scribe.content).toBeNull();
    runtime.destroy();
  });

  it("日志只保留最近 40 条，销毁后不再更新", async () => {
    const gateway = new ImmediateGateway();
    const runtime = new AgentRuntime(gateway);
    const current = snapshot();
    for (let index = 0; index < 45; index += 1) {
      runtime.interactScribe(current, "npc-scribe-f1", `记录 ${index}`);
      await tick();
    }
    expect(runtime.getState().logs).toHaveLength(40);
    const before = runtime.getState().logs;
    runtime.destroy();
    runtime.interactScribe(current, "npc-scribe-f1", "销毁后");
    expect(runtime.getState().logs).toEqual(before);
  });
});
