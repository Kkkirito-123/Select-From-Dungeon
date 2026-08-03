/** 验证八层战斗数值、经验阈值和课程内容之间的平衡契约。 */
import { describe, expect, it } from "vitest";
import {
  MINI_ELITE_PERCENT_BY_FLOOR,
} from "../src/content/biomeContent";
import {
  lootCandidatesForFloor,
} from "../src/content/inventoryCatalog";
import {
  AGGREGATE_HAMMER,
  INITIAL_MONSTERS,
} from "../src/content/mvpLevel";
import { JOIN_CHAIN } from "../src/content/floor2Level";
import { BONE_BLADE } from "../src/content/floor3Level";
import { RUNE_STAFF } from "../src/content/floor4Level";
import { IRON_AXE } from "../src/content/floor5Level";
import { DRAGON_SPEAR } from "../src/content/floor6Level";
import { CRYSTAL_BLADE } from "../src/content/floor7Level";
import { ROYAL_SWORD } from "../src/content/floor8Level";
import {
  GameSession,
  LEVEL_XP_THRESHOLDS,
} from "../src/domain/GameSession";
import {
  AMBUSH_CHANCE,
  AMBUSH_GUARANTEE_AT,
} from "../src/domain/encounterDirector";
import type { FloorNumber } from "../src/domain/runGraph";
import { createEmptyProfile } from "../src/storage/localProgress";

const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly FloorNumber[];

describe("v0.11 balance contract", () => {
  it("两心开局、2/4/6/8 升级与 2% 遭遇保底保持稳定", () => {
    const snapshot = new GameSession(null, createEmptyProfile(), "balance").snapshot();
    expect(snapshot.player.hp).toBe(2);
    expect(snapshot.player.maxHp).toBe(2);
    expect(LEVEL_XP_THRESHOLDS).toEqual([0, 2, 4, 6, 8, 14, 22, 32, 44, 58, 74, 92, 112]);
    expect(AMBUSH_CHANCE).toBe(0.02);
    expect(AMBUSH_GUARANTEE_AT).toBe(30);
  });

  it("八层小型精英权重只按 5% 到 19% 逐层增长", () => {
    expect(FLOORS.map((floor) => MINI_ELITE_PERCENT_BY_FLOOR[floor])).toEqual(
      [5, 7, 9, 11, 13, 15, 17, 19],
    );
  });

  it("普通怪只有 2% 恢复品候选，不再随机掉装备", () => {
    FLOORS.forEach((floor) => {
      const candidates = lootCandidatesForFloor(floor);
      expect(candidates).toHaveLength(1);
      candidates.forEach((candidate) => {
        expect(candidate.item.kind).toBe("consumable");
        expect(candidate.probability).toBe(0.02);
      });
    });
  });

  it("必修主武器伤害逐层增长，层主反击不会在后层倒退", () => {
    const weapons = [
      AGGREGATE_HAMMER,
      JOIN_CHAIN,
      BONE_BLADE,
      RUNE_STAFF,
      IRON_AXE,
      DRAGON_SPEAR,
      CRYSTAL_BLADE,
      ROYAL_SWORD,
    ];
    expect(weapons.map((weapon) => weapon.damage)).toEqual(
      [...weapons].map((weapon) => weapon.damage).sort((left, right) => left - right),
    );
    const bossDamage = FLOORS.map((floor) => (
      INITIAL_MONSTERS.find((monster) => monster.floor === floor && monster.isBoss)?.damage
    ));
    expect(bossDamage.every((damage): damage is number => damage !== undefined)).toBe(true);
    expect(bossDamage).toEqual(
      [...bossDamage].sort((left, right) => (left ?? 0) - (right ?? 0)),
    );
  });
});
