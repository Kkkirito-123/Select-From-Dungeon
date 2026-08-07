import { describe, expect, it } from "vitest";
import {
  MONSTER_ACTOR_PROFILES,
  assertActorVisualCatalog,
  monsterActorProfile,
  playerActorProfile,
} from "../src/content/world/actorVisuals";
import { ARMORS, WEAPONS } from "../src/content/inventory/inventoryCatalog";
import { INITIAL_MONSTERS } from "../src/content/curriculum/mvpLevel";
import { MONSTER_KIND_VISUALS } from "../src/content/world/monsterVisuals";

describe("MVP 2.0 actor visual catalog", () => {
  it("covers every monster archetype without falling back to a wall-like placeholder", () => {
    expect(assertActorVisualCatalog()).toEqual([]);
    const supported = new Set(Object.keys(MONSTER_ACTOR_PROFILES));
    Object.values(MONSTER_KIND_VISUALS).forEach((archetype) => {
      expect(supported.has(archetype)).toBe(true);
    });
    expect(INITIAL_MONSTERS.every((monster) => (
      Boolean(monsterActorProfile(monster))
    ))).toBe(true);
  });

  it("renders frogs as amphibians and bosses with a readable crown marker", () => {
    const frog = monsterActorProfile({
      kind: "goblin",
      species: "poison_frog_boss",
      isBoss: true,
    });
    expect(frog.id).toBe("frog");
    expect(frog.silhouette).toBe("amphibian");
    expect(frog.hasCrown).toBe(true);
  });

  it("只让 Boss 戴王冠，普通 dragon 与 lich 不继承王冠", () => {
    const crownedNonBosses = INITIAL_MONSTERS
      .filter((monster) => !monster.isBoss && monsterActorProfile(monster).hasCrown)
      .map((monster) => `${monster.id}:${monster.name}`);
    const areaBosses = INITIAL_MONSTERS.filter((monster) => (
      [21, 22, 33, 44, 55, 66, 77, 89].includes(monster.id)
    ));

    expect(crownedNonBosses).toEqual([]);
    expect(areaBosses.every((monster) => (
      monsterActorProfile(monster).hasCrown
    ))).toBe(true);
  });

  it("雷兽、枝妖与魔将使用符合名称的独立身体", () => {
    const cases = [
      ["storm_beast", "storm-beast", "quadruped"],
      ["branch_imp", "branch-imp", "treant"],
      ["demon_general", "demon-general", "humanoid"],
    ] as const;

    cases.forEach(([species, archetype, silhouette]) => {
      const monster = INITIAL_MONSTERS.find((entry) => entry.species === species);
      expect(monster, `缺少物种 ${species}`).toBeDefined();
      if (!monster) return;
      expect(monsterActorProfile(monster)).toMatchObject({
        id: archetype,
        silhouette,
        hasCrown: false,
      });
    });
  });

  it("evolves the player through four visible ascent stages", () => {
    const loadout = { weapon: WEAPONS["data-blade"], armor: null };
    expect(playerActorProfile(1, loadout).stage).toBe("keyless");
    expect(playerActorProfile(3, loadout).stage).toBe("archivist");
    expect(playerActorProfile(5, loadout).stage).toBe("migrator");
    expect(playerActorProfile(8, loadout).stage).toBe("history-set");
  });

  it("projects equipped weapon and armor into the runtime palette", () => {
    const basic = playerActorProfile(1, {
      weapon: WEAPONS["data-blade"],
      armor: null,
    });
    const royal = playerActorProfile(8, {
      weapon: WEAPONS["royal-sword"],
      armor: ARMORS["royal-armor"],
    });
    expect(royal.weapon).not.toBe(basic.weapon);
    expect(royal.armor).toBe(0xc7a74f);
    expect(royal.hasLongCoat).toBe(true);
  });

  it("回燃衣使用专属轮廓与余烬配色，而不是普通符文甲换色", () => {
    const echo = playerActorProfile(4, {
      weapon: WEAPONS["rune-staff"],
      armor: ARMORS["ember-echo-robe"],
    });
    expect(echo).toMatchObject({
      armorStyle: "ember-echo",
      hasMantle: true,
      hasLongCoat: true,
      trim: 0xe0b65d,
    });
    expect(echo.armor).toBe(0x9d533d);
  });
});
