import { describe, expect, it } from "vitest";
import { INITIAL_MONSTERS } from "../src/content/mvpLevel";
import {
  monsterIdLabel,
  monsterIdentityPresentation,
  recoverMonsterIdentity,
} from "../src/domain/monsterIdentity";
import { createEmptyProfile } from "../src/storage/localProgress";
import { buildMonsterCodexModel } from "../src/ui/MonsterCodexView";

describe("monster identity archive", () => {
  it("未确认时只公开补零 ID，确认后才公开名字与物种", () => {
    const monster = INITIAL_MONSTERS.find((entry) => entry.id === 1);
    if (!monster) throw new Error("缺少 ID #001 测试怪物");

    expect(monsterIdLabel(monster.id)).toBe("ID #001");
    expect(monsterIdentityPresentation(monster, [])).toEqual({
      discovered: false,
      idLabel: "ID #001",
      nameLabel: "ID #001",
      worldLabel: "ID #001",
      speciesLabel: "species = 未识别",
    });
    expect(monsterIdentityPresentation(monster, [1])).toMatchObject({
      discovered: true,
      nameLabel: "史莱姆",
      worldLabel: "史莱姆 · ID #001",
      speciesLabel: "species = 'projection_slime'",
    });
  });

  it("身份写入去重并保持稳定排序", () => {
    const profile = createEmptyProfile();
    expect(recoverMonsterIdentity(profile, 3)).toBe(true);
    expect(recoverMonsterIdentity(profile, 1)).toBe(true);
    expect(recoverMonsterIdentity(profile, 3)).toBe(false);
    expect(profile.discoveredMonsterIds).toEqual([1, 3]);
  });

  it("图鉴不会从未击败条目泄露名字、物种或课程概念", () => {
    const model = buildMonsterCodexModel({
      floor: 1,
      discoveredMonsterIds: [1],
    });
    const known = model.entries.find((entry) => entry.id === 1);
    const unknown = model.entries.find((entry) => entry.id === 2);

    expect(known).toMatchObject({
      discovered: true,
      idLabel: "ID #001",
      name: "史莱姆",
      concept: "SELECT / FROM",
    });
    expect(unknown).toMatchObject({
      discovered: false,
      idLabel: "ID #002",
      name: "尚未获得名字",
      species: null,
      rank: null,
      concept: null,
    });
    expect(unknown?.lore).not.toContain(INITIAL_MONSTERS.find(
      (entry) => entry.id === 2,
    )?.name ?? "水胶怪");
  });
});
