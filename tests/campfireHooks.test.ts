import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/session/GameSession";
import type { CampfireAgentOutput, CampfireAgentPort } from "../src/contracts/agent/campfireReview";
import type { AnswerAttemptRecord } from "../src/contracts/game/results";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import type { FloorNumber } from "../src/domain/progression/runGraph";
import { AnswerHook } from "../src/application/hooks/answer";
import { CampfireHook } from "../src/application/hooks/campfire";
import { HookRegistry } from "../src/application/hooks/registry";
import { TriggerBus } from "../src/application/triggers/bus";

function answer(id: number): AnswerAttemptRecord {
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
    result: id === 1 ? "correct" : "wrong-result",
    outcome: id === 1 ? "hit" : "countered",
    feedback: "本地反馈",
    hintLevel: id === 1 ? 0 : 1,
  };
}

function output(): CampfireAgentOutput {
  return {
    schemaVersion: 1,
    requestId: "request-1",
    evidenceHash: "a".repeat(64),
    headline: "本层 SQL 复盘",
    facts: ["当前层记录"],
    focusConcept: null,
    nextAction: "继续练习",
    message: "先读题再写查询。",
  };
}

function readySnapshot(): GameSnapshot {
  const snapshot = new GameSession(null, null, "campfire-hook-test").snapshot();
  return {
    ...snapshot,
    monsters: snapshot.monsters.map((monster) => (
      monster.floor === snapshot.floor && monster.rank === "elite"
        ? { ...monster, hp: 0 }
        : monster
    )),
    campfires: [{
      ...snapshot.campfires[0],
      x: snapshot.player.x + 3,
      y: snapshot.player.y,
    }],
  };
}

describe("篝火 Hook", () => {
  it("进入篝火两格范围时请求一次，离开再进入不会重复请求", async () => {
    const initial = readySnapshot();
    let requestCount = 0;
    const client: CampfireAgentPort = {
      review: async () => {
        requestCount += 1;
        return output();
      },
    };
    const answers = new AnswerHook();
    const hook = new CampfireHook(answers, client);
    const bus = new TriggerBus();
    const registry = new HookRegistry(bus).add(answers).add(hook);
    const source = {
      listener: (_snapshot: GameSnapshot): void => undefined,
      subscribe(listener: (snapshot: GameSnapshot) => void): (() => void) {
        this.listener = listener;
        listener(initial);
        return () => undefined;
      },
    };
    registry.start(source);

    const attemptSnapshot = {
      ...initial,
      floorReview: [answer(1)],
      campfires: [{ ...initial.campfires[0], x: initial.player.x + 2 }],
    };
    source.listener(attemptSnapshot);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestCount).toBe(1);
    expect(hook.getState().status).toBe("ready");
    expect(hook.outputFor(attemptSnapshot)?.headline).toBe("本层 SQL 复盘");

    source.listener({
      ...attemptSnapshot,
      player: { ...attemptSnapshot.player, x: attemptSnapshot.player.x + 5 },
    });
    source.listener(attemptSnapshot);
    expect(requestCount).toBe(1);
    registry.stop();
  });

  it("新作答会让证据变脏，并允许下一次靠近时重新请求", async () => {
    const initial = readySnapshot();
    let requestCount = 0;
    const client: CampfireAgentPort = {
      review: async () => {
        requestCount += 1;
        return output();
      },
    };
    const answers = new AnswerHook();
    const hook = new CampfireHook(answers, client);
    const bus = new TriggerBus();
    const registry = new HookRegistry(bus).add(answers).add(hook);
    const source = {
      listener: (_snapshot: GameSnapshot): void => undefined,
      subscribe(listener: (snapshot: GameSnapshot) => void): (() => void) {
        this.listener = listener;
        listener(initial);
        return () => undefined;
      },
    };
    registry.start(source);

    const first = {
      ...initial,
      floorReview: [answer(1)],
      campfires: [{ ...initial.campfires[0], x: initial.player.x + 2 }],
    };
    source.listener(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const away = {
      ...first,
      player: { ...first.player, x: first.player.x + 5 },
    };
    source.listener(away);
    source.listener({ ...away, floorReview: [answer(1), answer(2)] });
    source.listener({ ...away, floorReview: [answer(1), answer(2)], player: first.player });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestCount).toBe(2);
    expect(hook.getState().status).toBe("ready");
    registry.stop();
  });

  it("Agent 失败时只记录 fallback，不阻塞本地复盘", async () => {
    const initial = readySnapshot();
    let requestCount = 0;
    const answers = new AnswerHook();
    const hook = new CampfireHook(answers, {
      review: async () => {
        requestCount += 1;
        return null;
      },
    });
    const bus = new TriggerBus();
    const registry = new HookRegistry(bus).add(answers).add(hook);
    const source = {
      listener: (_snapshot: GameSnapshot): void => undefined,
      subscribe(listener: (snapshot: GameSnapshot) => void): (() => void) {
        this.listener = listener;
        listener(initial);
        return () => undefined;
      },
    };
    registry.start(source);
    const current = {
      ...initial,
      floorReview: [answer(1)],
      campfires: [{ ...initial.campfires[0], x: initial.player.x + 2 }],
    };
    source.listener(current);
    await new Promise((resolve) => setTimeout(resolve, 0));
    source.listener({ ...current, player: { ...current.player, x: current.player.x + 5 } });
    source.listener(current);
    expect(requestCount).toBe(1);
    expect(hook.getState().status).toBe("fallback");
    registry.stop();
  });
});
