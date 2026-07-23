import { describe, expect, it } from "vitest";
import {
  ARMORS,
  BONE_BLADE,
  CONSUMABLES,
} from "../src/content/inventoryCatalog";
import { GameSession } from "../src/domain/GameSession";
import { detectQueryFeatures } from "../src/domain/lessonEvaluator";
import { isSavedRun } from "../src/storage/localProgress";
import type {
  EquipmentItem,
  LootItem,
  SavedRun,
  SqlQueryResult,
} from "../src/domain/types";

function armorLoot(dropId = "fixture:slime-vest"): LootItem {
  const armor = ARMORS["slime-vest"];
  return {
    dropId,
    itemId: armor.id,
    kind: "armor",
    name: armor.name,
    description: armor.description,
    guaranteed: true,
    probability: 1,
    protected: false,
    armor: { ...armor },
    armorHp: armor.maxArmor,
  };
}

function floorKeyLoot(): LootItem {
  return {
    dropId: "fixture:floor-key",
    itemId: "floor-key",
    kind: "reward",
    name: "第一层钥匙",
    description: "进入下一层。",
    guaranteed: true,
    probability: 1,
    protected: true,
    rewardId: "floor-key",
  };
}

function runWithOpenLoot(
  item: LootItem,
  equipmentInventory: EquipmentItem[] = [],
): SavedRun {
  const base = new GameSession(null, null, "inventory-fixture").toSavedRun();
  const bundleId = "loot:fixture";
  return {
    ...base,
    mode: "loot",
    activeLootBundleId: bundleId,
    equipmentInventory,
    acquiredUniqueItemIds: [...new Set([
      ...base.acquiredUniqueItemIds,
      ...equipmentInventory.flatMap((equipment) => (
        equipment.weapon ? [equipment.weapon.id] : equipment.armor ? [equipment.armor.id] : []
      )),
    ])],
    lootBundles: [{
      id: bundleId,
      sourceMonsterId: null,
      sourceRoomId: base.currentRoomId,
      floor: base.floor,
      x: base.player.x,
      y: base.player.y,
      items: [item],
    }],
  };
}

function wrongSelect(): SqlQueryResult {
  const sql = "SELECT name FROM monsters";
  return {
    sql,
    columns: ["name"],
    rows: [{ name: "史莱姆" }, { name: "猎犬" }],
    targetIds: [],
    plan: ["SCAN fixture"],
    baseHeat: 3,
    features: detectQueryFeatures(sql),
  };
}

function enterSelectBattle(session: GameSession): void {
  const room = session.snapshot().roomGraph.nodes.find((entry) => entry.lessonId === "select");
  if (!room) throw new Error("缺少 SELECT 课程房");
  expect(session.travelToRoom(room.id).ok).toBe(true);
  const actor = session.snapshot().worldActors.find((entry) => entry.roomNodeId === room.id);
  if (!actor) throw new Error("缺少 SELECT 课程怪物");
  expect(session.setPlayerPosition(actor.x, actor.y)).toBe(true);
  expect(session.snapshot().mode).toBe("combat");
}

describe("v0.4 背包、护甲与战利品包", () => {
  it("防具先承受错误反击，护甲耗尽后才扣基础生命", () => {
    const run = runWithOpenLoot(armorLoot());
    expect(isSavedRun(run)).toBe(true);
    const session = new GameSession(run);
    expect(session.takeLootItem("loot:fixture", "fixture:slime-vest", "equip").ok).toBe(true);
    expect(session.snapshot().player).toMatchObject({
      hp: 2,
      armorHp: 1,
      armor: { id: "slime-vest", maxArmor: 1 },
    });

    enterSelectBattle(session);
    const absorbed = session.resolveQuery(wrongSelect());
    expect(absorbed).toMatchObject({ accepted: false, armorDamage: 1, playerDamage: 0 });
    expect(session.snapshot().player).toMatchObject({ hp: 2, armorHp: 0 });
    const wounded = session.resolveQuery(wrongSelect());
    expect(wounded).toMatchObject({ accepted: false, armorDamage: 0, playerDamage: 1 });
    expect(session.snapshot().player.hp).toBe(1);
  });

  it("12 格装备背包满时不会吞物品，必须显式选择普通装备替换", () => {
    const equipmentInventory: EquipmentItem[] = Array.from({ length: 12 }, (_, index) => ({
      instanceId: `bone:${index}`,
      kind: "weapon",
      protected: false,
      weapon: { ...BONE_BLADE },
    }));
    const run = runWithOpenLoot(armorLoot(), equipmentInventory);
    expect(isSavedRun(run)).toBe(true);
    const session = new GameSession(run);
    const blocked = session.takeLootItem("loot:fixture", "fixture:slime-vest", "store");
    expect(blocked.ok).toBe(false);
    expect(session.snapshot().lootBundles[0].items).toHaveLength(1);

    const replaced = session.takeLootItem(
      "loot:fixture",
      "fixture:slime-vest",
      "store",
      "bone:0",
    );
    expect(replaced.ok).toBe(true);
    expect(session.snapshot().equipmentInventory).toHaveLength(12);
    expect(session.snapshot().equipmentInventory.some(
      (item) => item.armor?.id === "slime-vest",
    )).toBe(true);
    expect(session.snapshot().lootBundles[0].items.some(
      (item) => item.weapon?.id === "bone-blade",
    )).toBe(true);
  });

  it("打开背包会暂停移动与巡逻；丢弃恢复品后可在本层脚下重新拾取", () => {
    const base = new GameSession(null, null, "inventory-pause").toSavedRun();
    base.consumables = [{
      item: { ...CONSUMABLES["slime-gel"] },
      quantity: 2,
    }];
    const session = new GameSession(base);
    expect(session.openInventory()).toBe(true);
    expect(session.attemptPlayerMove(1, 0)).toMatchObject({
      ok: false,
      blockedBy: "mode",
    });
    expect(session.advanceMonsterPatrols()).toEqual({ moves: [], encounterId: null });
    expect(session.discardConsumable("slime-gel").ok).toBe(true);
    expect(session.snapshot().consumables[0].quantity).toBe(1);
    expect(session.snapshot().lootBundles).toEqual([
      expect.objectContaining({
        x: session.snapshot().player.x,
        y: session.snapshot().player.y,
        items: [expect.objectContaining({ itemId: "slime-gel" })],
      }),
    ]);
    expect(session.discardConsumable("slime-gel").ok).toBe(true);
    expect(session.snapshot().lootBundles.map((bundle) => bundle.id)).toEqual([
      "discard:1:slime-gel:0",
      "discard:1:slime-gel:0:2",
    ]);
    expect(isSavedRun(session.toSavedRun())).toBe(true);
  });

  it("未处理的掉落随 v8 Run 原样保存，刷新与死亡不会重新抽取", () => {
    const run = runWithOpenLoot(armorLoot("stable-drop"));
    const first = new GameSession(run);
    first.closeLootBundle();
    const persisted = first.toSavedRun();
    expect(isSavedRun(persisted)).toBe(true);
    const restored = new GameSession(persisted);
    expect(restored.snapshot().lootBundles).toEqual(first.snapshot().lootBundles);
    expect(restored.snapshot().lootBundles[0].items[0].dropId).toBe("stable-drop");
  });

  it("满包时领取楼层钥匙会退出战利品界面，并让未收装备留在地图", () => {
    const equipmentInventory: EquipmentItem[] = Array.from({ length: 12 }, (_, index) => ({
      instanceId: `bone:${index}`,
      kind: "weapon",
      protected: false,
      weapon: { ...BONE_BLADE },
    }));
    const run = runWithOpenLoot(armorLoot(), equipmentInventory);
    run.lootBundles[0].items.push(floorKeyLoot());
    expect(isSavedRun(run)).toBe(true);
    const session = new GameSession(run);

    const resolution = session.takeLootItem(
      "loot:fixture",
      "fixture:floor-key",
      "claim",
    );
    expect(resolution.ok).toBe(true);
    expect(session.snapshot()).toMatchObject({
      mode: "transition",
      activeLootBundleId: null,
      keyItems: ["floor-1-key"],
      lootBundles: [{
        id: "loot:fixture",
        items: [{ dropId: "fixture:slime-vest" }],
      }],
    });
    expect(isSavedRun(session.toSavedRun())).toBe(true);
  });
});
