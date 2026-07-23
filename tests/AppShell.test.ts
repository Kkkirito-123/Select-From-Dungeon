import { describe, expect, it } from "vitest";
import type { ExperienceSettlement } from "../src/domain/types";
import {
  canOpenCombatTerminal,
  combatSettlementCopy,
} from "../src/ui/AppShell";

describe("canOpenCombatTerminal", () => {
  it("只在战斗且没有回合结算时允许打开终端", () => {
    expect(canOpenCombatTerminal("combat", false)).toBe(true);
    expect(canOpenCombatTerminal("combat", true)).toBe(false);
    expect(canOpenCombatTerminal("explore", false)).toBe(false);
    expect(canOpenCombatTerminal(undefined, false)).toBe(false);
  });
});

describe("combatSettlementCopy", () => {
  const base: ExperienceSettlement = {
    monsterId: 101,
    monsterName: "投影史莱姆 · 青页",
    gained: 1,
    previousXp: 0,
    currentXp: 1,
    previousLevel: 1,
    currentLevel: 1,
    previousMaxHp: 2,
    currentMaxHp: 2,
  };

  it("明确显示经验变化与课程宝箱", () => {
    expect(combatSettlementCopy(base, true)).toEqual({
      title: "击败 投影史莱姆 · 青页",
      xp: "+1 XP",
      progress: "LV.1 · 0 → 1 / 2 XP",
      levelUp: "距离下一等级又近了一步",
      reward: "战利品宝箱已出现在怪物位置 · 靠近后按 E 打开",
    });
  });

  it("升级时显示等级和生命上限变化，随机遭遇不伪造宝箱", () => {
    expect(combatSettlementCopy({
      ...base,
      previousXp: 1,
      currentXp: 2,
      previousLevel: 1,
      currentLevel: 2,
      previousMaxHp: 2,
      currentMaxHp: 3,
    }, false)).toMatchObject({
      progress: "LV.2 · 1 → 2 / 4 XP",
      levelUp: "LEVEL UP · LV.1 → LV.2 · 生命上限 2 → 3",
      reward: "随机遭遇只结算经验 · 不会掉落课程宝箱",
    });
  });
});
