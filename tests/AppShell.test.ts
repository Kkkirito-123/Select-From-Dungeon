import { describe, expect, it } from "vitest";
import type { AnswerAttemptRecord, ExperienceSettlement } from "../src/domain/types";
import { answerReviewSummary } from "../src/ui/AnswerReviewView";
import {
  canOpenCombatTerminal,
  combatSettlementCopy,
  shouldDismissTransientCard,
} from "../src/ui/AppShell";

describe("canOpenCombatTerminal", () => {
  it("只在战斗且没有回合结算时允许打开终端", () => {
    expect(canOpenCombatTerminal("combat", false)).toBe(true);
    expect(canOpenCombatTerminal("combat", true)).toBe(false);
    expect(canOpenCombatTerminal("explore", false)).toBe(false);
    expect(canOpenCombatTerminal(undefined, false)).toBe(false);
  });
});

describe("shouldDismissTransientCard", () => {
  it("只在展示后的第 3 次成功移动关闭，碰墙不会改变 totalMoves", () => {
    expect(shouldDismissTransientCard(null, 9)).toBe(false);
    expect(shouldDismissTransientCard(9, 9)).toBe(false);
    expect(shouldDismissTransientCard(9, 10)).toBe(false);
    expect(shouldDismissTransientCard(9, 11)).toBe(false);
    expect(shouldDismissTransientCard(9, 12)).toBe(true);
  });
});

describe("answerReviewSummary", () => {
  const base: AnswerAttemptRecord = {
    id: 1,
    battleId: 1,
    floor: 1,
    monsterId: 101,
    monsterName: "史莱姆",
    lessonId: "select",
    stageId: "select-name",
    stageObjective: "查询史莱姆名字",
    round: 1,
    sql: "SELECT name FROM monsters WHERE id = 101",
    answerSql: "SELECT name FROM monsters WHERE id = 101;",
    result: "correct",
    outcome: "hit",
    feedback: "查询正确",
    hintLevel: 0,
  };

  it("汇总正确率、错误数和使用提示的作答次数", () => {
    expect(answerReviewSummary([
      base,
      {
        ...base,
        id: 2,
        result: "wrong-result",
        outcome: "countered",
        hintLevel: 2,
      },
      {
        ...base,
        id: 3,
        result: "syntax-error",
        outcome: "defeat",
        hintLevel: 1,
      },
    ])).toEqual({
      total: 3,
      correct: 1,
      errors: 2,
      hintUses: 2,
      accuracy: 33,
    });
    expect(answerReviewSummary([])).toEqual({
      total: 0,
      correct: 0,
      errors: 0,
      hintUses: 0,
      accuracy: 0,
    });
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
