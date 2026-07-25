import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/GameSession";
import {
  INTERACTION_LABEL_DISTANCE,
  MONSTER_LABEL_DISTANCE,
  OBJECTIVE_HIDE_DISTANCE,
  gridDistance,
  isNearPlayer,
  tutorialObjective,
} from "../src/game/worldOverlay";

describe("world overlay presentation", () => {
  it("首课史莱姆固定在出生位置，玩家撞上它会进入 SELECT 战斗", () => {
    const session = new GameSession(null, null, "select-target-contract");
    const tutorialRoom = session.snapshot().roomGraph.nodes.find(
      (room) => room.type === "tutorial",
    );
    if (!tutorialRoom) throw new Error("首层缺少教程房间");

    session.travelToRoom(tutorialRoom.id);
    const before = session.snapshot();
    const objective = tutorialObjective(before);
    if (!objective) throw new Error("首层缺少教程目标");
    const actor = before.worldActors.find(
      (entry) => entry.monsterId === objective.monsterId,
    );
    if (!actor) throw new Error("首层缺少教程怪物 Actor");

    expect(actor.behavior).toBe("anchored");
    const origin = { x: actor.x, y: actor.y };
    for (let index = 0; index < 6; index += 1) {
      session.advanceMonsterPatrols();
    }
    const afterPatrol = session.snapshot().worldActors.find(
      (entry) => entry.monsterId === objective.monsterId,
    );
    expect(afterPatrol).toMatchObject(origin);

    const player = session.snapshot().player;
    const dx = actor.x - player.x;
    const dy = actor.y - player.y;
    expect(Math.abs(dx) + Math.abs(dy)).toBe(1);
    const move = session.attemptPlayerMove(dx, dy);
    expect(move.encounterId).toBe(actor.monsterId);
    expect(session.snapshot().mode).toBe("combat");
  });

  it("首课信标每次都读取当前怪物位置，完成课程后消失", () => {
    const snapshot = new GameSession(null, null, "objective-live-position").snapshot();
    const initial = tutorialObjective(snapshot);
    expect(initial).not.toBeNull();
    if (!initial) throw new Error("首层缺少教程目标");

    const actor = snapshot.worldActors.find((entry) => entry.monsterId === initial.monsterId);
    if (!actor) throw new Error("首层缺少教程怪物 Actor");
    actor.x += 2;
    actor.y += 1;

    expect(tutorialObjective(snapshot)?.position).toEqual({ x: actor.x, y: actor.y });
    snapshot.completedLessons.push(initial.lessonId);
    expect(tutorialObjective(snapshot)).toBeNull();
  });

  it("交互标签只在相邻格出现，怪物名允许多一格识别距离", () => {
    const player = { x: 4, y: 4 };
    expect(gridDistance(player, { x: 5, y: 5 })).toBe(2);
    expect(isNearPlayer(player, { x: 5, y: 4 }, INTERACTION_LABEL_DISTANCE)).toBe(true);
    expect(isNearPlayer(player, { x: 5, y: 5 }, INTERACTION_LABEL_DISTANCE)).toBe(false);
    expect(isNearPlayer(player, { x: 5, y: 5 }, MONSTER_LABEL_DISTANCE)).toBe(true);
    expect(isNearPlayer(player, { x: 6, y: 5 }, OBJECTIVE_HIDE_DISTANCE)).toBe(false);
  });
});
