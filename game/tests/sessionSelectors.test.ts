import { describe, expect, it } from "vitest";
import {
  selectActorForRoom,
  selectAvailableRoomIds,
  selectCurrentLesson,
  selectCurrentRoom,
  selectLivingActorAt,
  selectMonsterForCurrentRoom,
  selectRequiredCompletedRoomIds,
  selectRoomAccessMessage,
} from "../src/domain/session/sessionSelectors";
import type { RoomGraph, RoomNode } from "../src/domain/progression/runGraph";
import type { Monster } from "../src/domain/shared/types";

const rooms: RoomNode[] = [
  {
    id: "entry",
    type: "entry",
    title: "入口",
    depth: 0,
    lane: 0,
    required: true,
    prerequisiteLessons: [],
    reward: null,
    next: ["select"],
  },
  {
    id: "select",
    type: "lesson",
    title: "SELECT",
    depth: 1,
    lane: 0,
    required: true,
    lessonId: "select",
    prerequisiteLessons: [],
    reward: "data-blade",
    next: ["boss"],
  },
  {
    id: "boss",
    type: "boss",
    title: "层主",
    depth: 2,
    lane: 0,
    required: true,
    prerequisiteLessons: ["select"],
    reward: null,
    next: [],
  },
];

const graph: RoomGraph = {
  version: 2,
  floor: 1,
  seed: "selector-test",
  entryId: "entry",
  bossId: "boss",
  nodes: rooms,
};

const monster = {
  id: 1,
  floor: 1,
  lessonId: "select",
  roomId: 1,
  name: "史莱姆",
  species: "slime",
  kind: "projection-slime",
  hp: 3,
  maxHp: 3,
  armor: 0,
  damage: 1,
  attackName: "撞击",
  status: "idle",
  weakness: null,
  masterId: null,
  isBoss: false,
  rank: "normal",
  encounterType: "curriculum",
  x: 3,
  y: 4,
} as Monster;

const actor = {
  monsterId: monster.id,
  roomNodeId: "select",
  x: 3,
  y: 4,
  home: { x: 3, y: 4 },
  behavior: "guard",
  roamRadius: 0,
  moveTick: 0,
} as const;

describe("session selectors", () => {
  it("只按 ID 选择房间，并在缺失时使用稳定入口", () => {
    expect(selectCurrentRoom({ graph, currentRoomId: "select" }).id).toBe("select");
    expect(selectCurrentRoom({ graph, currentRoomId: "missing" }).id).toBe("entry");
  });

  it("从显式角色上下文派生当前怪物和存活角色", () => {
    const context = { worldActors: [actor], monsters: [monster] };
    expect(selectActorForRoom({ ...context, roomId: "select" })).toBe(actor);
    expect(selectMonsterForCurrentRoom({ ...context, roomId: "select" })).toBe(monster);
    expect(selectLivingActorAt({ ...context, position: { x: 3, y: 4 } })).toBe(actor);
    expect(selectLivingActorAt({ ...context, position: { x: 9, y: 9 } })).toBeUndefined();
  });

  it("门禁查询保持隐藏区域、知识门和已开门的优先级", () => {
    const hiddenArea = {
      id: "hidden",
      title: "隐藏室",
      roomNodeId: "boss",
      gateId: "hidden-gate",
      landmarkId: "hidden-landmark",
      requiredLessonIds: ["select"] as const,
      sealedPrompt: "sealed",
      sealedMessage: "sealed",
      openPrompt: "open",
      openedMessage: "opened",
      discoveryEventId: "discover",
    };
    const context = {
      graph,
      completedLessons: new Set<"select">(),
      completedRoomIds: new Set<string>(["entry"]),
      openedGateIds: new Set<string>(),
      hiddenAreas: [hiddenArea],
    };
    expect(selectRoomAccessMessage(context, rooms[2])).toContain("隐藏室");
    expect(selectRoomAccessMessage(context, rooms[1])).toBeNull();
    expect(selectAvailableRoomIds(context)).toEqual(["entry", "select"]);
    expect(selectRequiredCompletedRoomIds({ graph }, rooms[2])).toEqual([]);

    const opened = {
      ...context,
      openedGateIds: new Set(["hidden-gate", "gate:boss"]),
      completedLessons: new Set(["select"] as const),
    };
    expect(selectRoomAccessMessage(opened, rooms[2])).toBeNull();
  });

  it("课程选择只读输入，不持有 GameSession", () => {
    const completedLessons = new Set<"select">();
    const context = {
      floor: 1 as const,
      graph,
      currentRoomId: "select",
      combat: null,
      monsters: [monster],
      questionBank: null,
      activePracticeQuestionIds: [],
      completedLessons,
    };
    const before = new Set(completedLessons);
    expect(selectCurrentLesson(context).id).toBe("select");
    expect(completedLessons).toEqual(before);
  });
});
