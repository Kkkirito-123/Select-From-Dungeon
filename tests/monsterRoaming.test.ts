import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/GameSession";
import { generateMazeFloor } from "../src/domain/mazeGenerator";
import {
  advanceMonsterPatrol,
  isActorPatrolPosition,
  type PatrolContext,
  type WorldActor,
} from "../src/domain/monsterRoaming";
import { generateRoomGraph } from "../src/domain/runGraph";

function fixture(): { actor: WorldActor; context: PatrolContext } {
  const graph = generateRoomGraph("patrol");
  const floor = generateMazeFloor(graph);
  const zone = floor.zones.find((entry) => entry.lessonId === "where") ?? floor.zones[1];
  const actor: WorldActor = {
    monsterId: 201,
    roomNodeId: zone.roomNodeId,
    ...zone.center,
    home: { ...zone.center },
    behavior: "wander",
    roamRadius: 4,
    moveTick: 0,
  };
  return {
    actor,
    context: {
      floor,
      completedLessons: new Set(["select"]),
      player: floor.spawn,
      occupied: new Set([`${actor.x}:${actor.y}`]),
      blocked: new Set(),
    },
  };
}

describe("advanceMonsterPatrol", () => {
  it("同 Seed 与 tick 产生相同的一格移动或停留", () => {
    const { actor, context } = fixture();
    const first = advanceMonsterPatrol(actor, context);
    const second = advanceMonsterPatrol(actor, context);
    expect(first).toEqual(second);
    expect(Math.abs(first.actor.x - actor.x) + Math.abs(first.actor.y - actor.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(first.actor.x - actor.home.x) + Math.abs(first.actor.y - actor.home.y)).toBeLessThanOrEqual(4);
  });

  it("Boss/anchored 永不移动", () => {
    const { actor, context } = fixture();
    const anchored = { ...actor, monsterId: 900, behavior: "anchored" as const };
    const result = advanceMonsterPatrol(anchored, context);
    expect({ x: result.actor.x, y: result.actor.y }).toEqual({ x: anchored.x, y: anchored.y });
    expect(result.moved).toBe(false);
  });

  it("怪物尝试进入玩家格时只报告遭遇，不与玩家重叠", () => {
    const { actor, context } = fixture();
    let current = actor;
    let encountered = false;
    for (let tick = 0; tick < 50 && !encountered; tick += 1) {
      const localContext = {
        ...context,
        player: { x: current.x + 1, y: current.y },
        occupied: new Set([`${current.x}:${current.y}`]),
        blocked: new Set([
          `${current.x - 1}:${current.y}`,
          `${current.x}:${current.y - 1}`,
          `${current.x}:${current.y + 1}`,
          `${current.x}:${current.y}`,
        ]),
      };
      const result = advanceMonsterPatrol(current, localContext);
      current = result.actor;
      encountered = result.encounter;
    }
    expect(encountered).toBe(true);
    expect({ x: current.x, y: current.y }).not.toEqual(context.player);
  });

  it("500 个 Seed 连续巡逻 80 tick 仍留在所属房间和活动半径内，永不占门或走廊", () => {
    let checkedPositions = 0;
    for (let seedIndex = 0; seedIndex < 500; seedIndex += 1) {
      const snapshot = new GameSession(null, null, `patrol-invariant-${seedIndex}`).snapshot();
      const actors = snapshot.worldActors.map((actor) => ({
        ...actor,
        home: { ...actor.home },
      }));
      const blocked = new Set(snapshot.groundItems.map((item) => `${item.x}:${item.y}`));
      for (let tick = 0; tick < 80; tick += 1) {
        const occupied = new Set(actors.map((actor) => `${actor.x}:${actor.y}`));
        for (let actorIndex = 0; actorIndex < actors.length; actorIndex += 1) {
          const actor = actors[actorIndex];
          occupied.delete(`${actor.x}:${actor.y}`);
          const resolution = advanceMonsterPatrol(actor, {
            floor: snapshot.mazeFloor,
            completedLessons: new Set(["select", "where", "is-null", "group-by", "having"]),
            player: snapshot.mazeFloor.spawn,
            occupied,
            blocked,
          });
          actors[actorIndex] = resolution.actor;
          occupied.add(`${resolution.actor.x}:${resolution.actor.y}`);
          checkedPositions += 1;

          const movedDistance = Math.abs(resolution.actor.x - actor.x) +
            Math.abs(resolution.actor.y - actor.y);
          const homeDistance = Math.abs(resolution.actor.x - resolution.actor.home.x) +
            Math.abs(resolution.actor.y - resolution.actor.home.y);
          const isGate = snapshot.mazeFloor.gates.some((gate) => (
            gate.x === resolution.actor.x && gate.y === resolution.actor.y
          ));
          if (
            movedDistance > 1 ||
            homeDistance > resolution.actor.roamRadius ||
            !isActorPatrolPosition(resolution.actor, snapshot.mazeFloor, resolution.actor) ||
            isGate
          ) {
            throw new Error(
              `巡逻越界：seed=${seedIndex}, monster=${actor.monsterId}, tick=${tick}`,
            );
          }
        }
      }
    }
    expect(checkedPositions).toBe(500 * 80 * 5);
  // 这里验证的是拓扑不变量，而不是性能指标。保留全部 200,000 个位置，
  // 同时为 CPU 资源受限的较慢执行环境预留足够时间。
  }, 120_000);
});
