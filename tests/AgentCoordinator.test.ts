/** 验证 Agent 协调器按触发时机预处理、缓存和取消后台请求。 */
import { describe, expect, it } from "vitest";
import { AgentCache } from "../agent/runtime/AgentCache";
import type { AgentPreparationClient } from "../agent/runtime/AgentClient";
import {
  AgentCoordinator,
  type AgentSnapshotSource,
} from "../agent/runtime/AgentCoordinator";
import { buildAgentPrepareRequest } from "../agent/runtime/context";
import type { AgentPrepareRequest, PreparedAgentOutput } from "../agent/runtime/contracts";
import { buildLocalPreparedOutput } from "../agent/runtime/localFallback";
import { GameSession } from "../src/domain/GameSession";
import type { AnswerAttemptRecord, GameSnapshot } from "../src/domain/types";
import type { StorageLike } from "../src/storage/localProgress";

class SnapshotSource implements AgentSnapshotSource {
  private listener: ((snapshot: GameSnapshot) => void) | null = null;

  subscribe(listener: (snapshot: GameSnapshot) => void): () => void {
    this.listener = listener;
    return () => { this.listener = null; };
  }

  emit(snapshot: GameSnapshot): void {
    this.listener?.(snapshot);
  }
}

class FakeClock {
  private sequence = 0;
  readonly callbacks = new Map<number, () => void>();

  setTimeout(callback: () => void): number {
    this.sequence += 1;
    this.callbacks.set(this.sequence, callback);
    return this.sequence;
  }

  clearTimeout(timerId: number): void {
    this.callbacks.delete(timerId);
  }

  runAll(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback());
  }
}

class FakeClient implements AgentPreparationClient {
  readonly enabled = true;
  readonly calls: AgentPrepareRequest[] = [];

  async prepare(request: AgentPrepareRequest): Promise<PreparedAgentOutput> {
    this.calls.push(request);
    return { ...buildLocalPreparedOutput(request), source: "openzl" };
  }
}

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function attempt(id: number): AnswerAttemptRecord {
  return {
    id,
    battleId: 1,
    floor: 1,
    monsterId: 1,
    monsterName: "史莱姆",
    lessonId: "select",
    stageId: "select-name",
    stageObjective: "读取名字",
    round: id,
    sql: "SELECT name FROM monsters",
    answerSql: "SELECT name FROM monsters WHERE id = 1",
    result: "wrong-result",
    outcome: "countered",
    feedback: "结果不符",
    hintLevel: 1,
  };
}

describe("AgentCoordinator", () => {
  it("普通作答与移动不触发请求，寻路升级后只准备一次", async () => {
    const source = new SnapshotSource();
    const clock = new FakeClock();
    const client = new FakeClient();
    const coordinator = new AgentCoordinator(
      source,
      new AgentCache(memoryStorage()),
      client,
      0,
      clock,
    );
    coordinator.start();
    const base = new GameSession(null, null, "agent-coordinator-test").snapshot();
    source.emit(base);
    source.emit({ ...base, mode: "combat", floorReview: [attempt(1)] });
    source.emit({ ...base, mode: "combat", floorReview: [attempt(1), attempt(2)] });
    expect(clock.callbacks.size).toBe(0);

    const exploring = {
      ...base,
      mode: "explore" as const,
      floorReview: [attempt(1), attempt(2)],
      navigationGuidance: {
        ...base.navigationGuidance,
        level: 1 as const,
        objectiveRoomId: "floor-1-lesson-1",
        objectiveTitle: "筛选门",
        direction: "east" as const,
        distance: 10,
      },
    };
    source.emit(exploring);
    expect(clock.callbacks.size).toBe(1);
    clock.runAll();
    await Promise.resolve();
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].attempts).toHaveLength(2);
    expect(coordinator.preparedFor(exploring).source).toBe("openzl");

    source.emit({ ...exploring, totalMoves: exploring.totalMoves + 10 });
    clock.runAll();
    await Promise.resolve();
    expect(client.calls).toHaveLength(1);
    coordinator.destroy();
  });

  it("启用服务后可以把旧的本地缓存升级为经校验的模型输出", async () => {
    const source = new SnapshotSource();
    const clock = new FakeClock();
    const client = new FakeClient();
    const cache = new AgentCache(memoryStorage());
    const current = {
      ...new GameSession(null, null, "agent-cache-upgrade").snapshot(),
      floorReview: [attempt(1)],
      navigationGuidance: {
        ...new GameSession(null, null, "agent-cache-upgrade").snapshot().navigationGuidance,
        level: 1 as const,
        objectiveRoomId: "floor-1-lesson-1",
        objectiveTitle: "筛选门",
        direction: "east" as const,
        distance: 10,
      },
    };
    const request = buildAgentPrepareRequest(current);
    cache.put(buildLocalPreparedOutput(request));
    const coordinator = new AgentCoordinator(source, cache, client, 0, clock);

    coordinator.start();
    source.emit(current);
    clock.runAll();
    await Promise.resolve();

    expect(client.calls).toHaveLength(1);
    expect(coordinator.preparedFor(current).source).toBe("openzl");
    coordinator.destroy();
  });
});
