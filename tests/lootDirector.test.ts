import { describe, expect, it } from "vitest";
import {
  ARMORS,
  CONSUMABLES,
  lootCandidatesForBiome,
  lootCandidatesForFloor,
  type LootCandidate,
} from "../src/content/inventoryCatalog";
import { FILTER_BOW } from "../src/content/mvpLevel";
import { rollLootItems } from "../src/domain/lootDirector";
import type { LootItem, Monster } from "../src/domain/types";

function monster(rank: Monster["rank"]): Monster {
  return {
    floor: 1,
    id: rank === "normal" ? 6 : rank === "elite" ? 9 : 5,
    lessonId: "select",
    roomId: 1,
    name: "史莱姆",
    species: "slime",
    kind: "projection-slime",
    x: 1,
    y: 1,
    hp: 1,
    maxHp: 1,
    armor: 0,
    damage: 1,
    attackName: "撞击",
    status: "idle",
    weakness: "slash",
    masterId: null,
    isBoss: rank === "boss",
    rank,
    encounterType: "ambush",
  };
}

function candidate(
  item: LootCandidate["item"],
  probability: number,
): LootCandidate {
  return { item, probability };
}

const gelCandidate = candidate({
  itemId: "slime-gel",
  kind: "consumable",
  name: "凝胶",
  description: "恢复生命",
  protected: false,
  consumable: { ...CONSUMABLES["slime-gel"] },
}, 0);

const armorCandidate = candidate({
  itemId: "slime-vest",
  kind: "armor",
  name: "软泥甲",
  description: "提供护甲",
  protected: false,
  armor: { ...ARMORS["slime-vest"] },
}, 0);

const weaponCandidate = candidate({
  itemId: "filter-bow",
  kind: "weapon",
  name: "过滤弓",
  description: "过滤武器",
  protected: false,
  weapon: { ...FILTER_BOW },
}, 0);

describe("rollLootItems", () => {
  it("生态池只给出 2% 的自动恢复品候选，不再随机掉装备", () => {
    expect(lootCandidatesForBiome(1, "slime-pool", "normal")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          probability: 0.02,
          item: expect.objectContaining({ itemId: "slime-gel" }),
        }),
      ]),
    );
    expect(lootCandidatesForBiome(2, "swamp", "normal")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          probability: 0.02,
          item: expect.objectContaining({ itemId: "frog-potion" }),
        }),
      ]),
    );
    expect(lootCandidatesForBiome(2, "forest", "normal").every(
      (entry) => entry.item.kind === "consumable",
    )).toBe(true);
  });

  it("八层旧楼层入口也只返回当前生态恢复品", () => {
    expect(lootCandidatesForFloor(3).map((entry) => entry.item.itemId)).toEqual([
      "holy-water",
    ]);
    const floorFourIds = lootCandidatesForFloor(4).map((entry) => entry.item.itemId);
    expect(floorFourIds).toEqual(["fire-crystal"]);
  });

  it("普通怪、精英和层主都允许空随机掉落，固定课程奖励另行注入", () => {
    const base = {
      seed: "drop-minimum",
      floor: 1 as const,
      candidates: [gelCandidate, armorCandidate, weaponCandidate],
      fixedItems: [] as LootItem[],
      acquiredUniqueItemIds: new Set<string>(),
    };
    expect(rollLootItems({ ...base, monster: monster("normal") })).toEqual([]);
    expect(rollLootItems({ ...base, monster: monster("elite") })).toEqual([]);
    expect(rollLootItems({ ...base, monster: monster("boss") })).toEqual([]);
  });

  it("显式要求最低掉落时仍可稳定补足，默认战斗不再调用该保底", () => {
    const items = rollLootItems({
      seed: "area-boss-minimum",
      floor: 2,
      monster: { ...monster("elite"), floor: 2, id: 21 },
      candidates: [gelCandidate, armorCandidate, weaponCandidate],
      fixedItems: [],
      acquiredUniqueItemIds: new Set(),
      minimumNonKeyDrops: 2,
    });
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.itemId)).size).toBe(2);
  });

  it("每项独立命中后同场去重，非关键物品最多三件", () => {
    const always = [gelCandidate, armorCandidate, weaponCandidate].map((entry) => ({
      ...entry,
      probability: 1,
    }));
    const duplicated = [...always, { ...always[0] }];
    const items = rollLootItems({
      seed: "all-hit",
      floor: 1,
      monster: monster("normal"),
      candidates: duplicated,
      fixedItems: [],
      acquiredUniqueItemIds: new Set(),
    });
    expect(items).toHaveLength(3);
    expect(new Set(items.map((item) => item.itemId)).size).toBe(3);
  });

  it("已获得的唯一武器会稳定转化为磨刀石", () => {
    const items = rollLootItems({
      seed: "duplicate-conversion",
      floor: 1,
      monster: monster("normal"),
      candidates: [{ ...weaponCandidate, probability: 1 }],
      fixedItems: [],
      acquiredUniqueItemIds: new Set(["filter-bow"]),
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemId: "whetstone",
      kind: "consumable",
      name: "磨刀石",
    });
    expect(items[0].description).toContain("过滤弓");
  });

  it("楼层钥匙不占三件上限且相同输入不会重抽", () => {
    const key: LootItem = {
      dropId: "5:floor-key",
      itemId: "floor-key",
      kind: "reward",
      name: "楼层钥匙",
      description: "进入下一层",
      guaranteed: true,
      probability: 1,
      protected: true,
      rewardId: "floor-key",
    };
    const input = {
      seed: "key-extra",
      floor: 1 as const,
      monster: monster("normal"),
      candidates: [gelCandidate, armorCandidate, weaponCandidate].map((entry) => ({
        ...entry,
        probability: 1,
      })),
      fixedItems: [key],
      acquiredUniqueItemIds: new Set<string>(),
    };
    const first = rollLootItems(input);
    expect(first).toHaveLength(4);
    expect(first.at(-1)?.rewardId).toBe("floor-key");
    expect(rollLootItems(input)).toEqual(first);
  });
});
