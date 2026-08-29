import { describe, expect, it } from "vitest";
import {
  DATA_BLADE,
  FILTER_BOW,
} from "../src/content/curriculum/mvpLevel";
import { rewardDetails, RELICS } from "../src/content/world/runContent";
import {
  addRelic,
  applyReward,
  availableWeaponLoot,
  claimableRoomReward,
  type InventoryQueryContext,
  type RewardContext,
} from "../src/domain/session/inventory";
import type { RoomGraph, RoomNode } from "../src/domain/progression/runGraph";
import type {
  GroundItem,
  PlayerState,
} from "../src/domain/shared/types";

function player(): PlayerState {
  return {
    x: 0,
    y: 0,
    hp: 1,
    maxHp: 2,
    level: 1,
    xp: 0,
    heat: 10,
    weapon: { ...DATA_BLADE },
    armor: null,
    armorHp: 0,
  };
}

function rewardContext(): RewardContext {
  return {
    player: player(),
    relics: [],
    acquiredUniqueItemIds: new Set([DATA_BLADE.id]),
  };
}

function rewardItem(): GroundItem {
  return {
    id: "room-reward:fixture",
    sourceRoomId: "room-1",
    x: 4,
    y: 5,
    name: "Schema 之眼",
    description: "获得一件确定奖励。",
    kind: "relic",
    collection: "interact",
    rewardId: "hint-token",
  };
}

function graphWithLesson(): RoomGraph {
  const room: RoomNode = {
    id: "room-1",
    type: "lesson",
    title: "课程房",
    depth: 1,
    lane: 0,
    required: true,
    lessonId: "select",
    prerequisiteLessons: [],
    reward: "hint-token",
    next: [],
  };
  return {
    version: 2,
    floor: 1,
    seed: "inventory-actions",
    entryId: room.id,
    bossId: room.id,
    nodes: [room],
  };
}

describe("inventory package actions and queries", () => {
  it("applies healing/cooling rewards through the narrow reward context", () => {
    const context = rewardContext();

    applyReward(context, "restore-12-hp");
    expect(context.player.hp).toBe(2);
    applyReward(context, "cool-12-heat");
    expect(context.player.heat).toBe(0);
  });

  it("adds a relic once and upgrades weapons while recording unique ids", () => {
    const context = rewardContext();

    expect(addRelic(context, RELICS["schema-eye"])).toBe(true);
    expect(addRelic(context, RELICS["schema-eye"])).toBe(false);
    applyReward(context, "filter-rune");
    expect(context.player.weapon).toEqual(FILTER_BOW);
    expect(context.acquiredUniqueItemIds.has(FILTER_BOW.id)).toBe(true);
    expect(context.relics).toHaveLength(1);
  });

  it("returns a defensive loose-weapon projection", () => {
    const groundItems: GroundItem[] = [{
      ...rewardItem(),
      id: "weapon:fixture",
      name: FILTER_BOW.name,
      description: FILTER_BOW.description,
      kind: "weapon",
      collection: "touch",
      rewardId: null,
      weapon: { ...FILTER_BOW },
    }];

    const loot = availableWeaponLoot(groundItems);
    expect(loot).toMatchObject({ x: 4, y: 5, weapon: FILTER_BOW });
    if (!loot) throw new Error("weapon projection missing");
    loot.weapon.damage = 999;
    expect(groundItems[0].weapon?.damage).toBe(FILTER_BOW.damage);
  });

  it("gates room rewards on lesson completion", () => {
    const context: InventoryQueryContext = {
      groundItems: [rewardItem()],
      currentRoomId: "room-1",
      graph: graphWithLesson(),
      completedLessons: new Set(),
    };
    expect(claimableRoomReward(context)).toBeNull();

    context.completedLessons = new Set(["select"]);
    expect(claimableRoomReward(context)).toEqual(rewardDetails("hint-token"));
  });
});
