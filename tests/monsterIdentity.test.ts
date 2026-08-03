import { describe, expect, it } from "vitest";
import { INITIAL_MONSTERS } from "../src/content/mvpLevel";
import {
  monsterIdLabel,
  monsterIdentityPresentation,
  monsterIntentName,
  redactUndiscoveredMonsterIdentityText,
  recoverMonsterIdentity,
} from "../src/domain/monsterIdentity";
import { createEmptyProfile } from "../src/storage/localProgress";
import { buildMonsterCodexModel } from "../src/ui/MonsterCodexView";

describe("monster identity archive", () => {
  it("活体始终只公开补零 ID，已恢复名字只进入图鉴", () => {
    const monster = INITIAL_MONSTERS.find((entry) => entry.id === 1);
    if (!monster) throw new Error("缺少 ID #001 测试怪物");

    expect(monsterIdLabel(monster.id)).toBe("ID #001");
    expect(monsterIdentityPresentation(monster, [])).toEqual({
      discovered: false,
      idLabel: "ID #001",
      nameLabel: "ID #001",
      worldLabel: "ID #001",
      speciesLabel: "类型 = 未识别",
    });
    expect(monsterIntentName(monster, [])).toBe("攻击正在蓄力");
    expect(monsterIdentityPresentation(monster, [1])).toMatchObject({
      discovered: true,
      nameLabel: "ID #001",
      worldLabel: "ID #001",
      speciesLabel: "类型 = 未识别",
    });
    expect(monsterIntentName(monster, [1])).toBe("攻击正在蓄力");
  });

  it("身份写入去重并保持稳定排序", () => {
    const profile = createEmptyProfile();
    expect(recoverMonsterIdentity(profile, 3)).toBe(true);
    expect(recoverMonsterIdentity(profile, 1)).toBe(true);
    expect(recoverMonsterIdentity(profile, 3)).toBe(false);
    expect(profile.discoveredMonsterIds).toEqual([1, 3]);
  });

  it("自由文本无论身份是否恢复都收敛为稳定 ID", () => {
    const monster = INITIAL_MONSTERS.find((entry) => entry.id === 84);
    if (!monster) throw new Error("缺少 ID #084 测试怪物");
    const text = `目标是${monster.name}，内部类型 ${monster.species}。`;
    expect(redactUndiscoveredMonsterIdentityText(text, [monster], []))
      .toBe("目标是ID #084，内部类型 未识别类型。");
    expect(redactUndiscoveredMonsterIdentityText(text, [monster], [84]))
      .toBe("目标是ID #084，内部类型 未识别类型。");
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
      species: "软体记录",
      concept: "SELECT / FROM",
      habitat: "青石排水渠",
      worldEffect: "铜轮连续转动，宿舍栈桥放下",
    });
    expect(unknown).toMatchObject({
      discovered: false,
      idLabel: "ID #002",
      name: "尚未获得名字",
      species: null,
      rank: null,
      concept: null,
      habitat: null,
      worldEffect: null,
    });
    expect(known?.species).not.toContain("projection_slime");
    expect(unknown?.lore).not.toContain(INITIAL_MONSTERS.find(
      (entry) => entry.id === 2,
    )?.name ?? "水史莱姆");
  });

  it("未发现的 89 个图鉴条目均不泄露 canonical 名称或 species", () => {
    for (let floor = 1; floor <= 8; floor += 1) {
      const model = buildMonsterCodexModel({
        floor: floor as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
        discoveredMonsterIds: [],
      });
      model.entries.forEach((entry) => {
        const monster = INITIAL_MONSTERS.find((candidate) => candidate.id === entry.id);
        if (!monster) throw new Error(`缺少 ID #${entry.id} 测试怪物`);
        expect(JSON.stringify(entry)).not.toContain(monster.name);
        expect(JSON.stringify(entry)).not.toContain(monster.species);
      });
    }
  });
});
