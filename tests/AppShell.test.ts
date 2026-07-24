import { describe, expect, it } from "vitest";
import { COMPLETE_SCHEMA_LINES } from "../src/content/sqlSchema";
import type { AnswerAttemptRecord, ExperienceSettlement } from "../src/domain/types";
import { answerReviewSummary } from "../src/ui/AnswerReviewView";
import {
  canOpenCombatTerminal,
  combatSettlementCopy,
  schemaRenderSignature,
  schemaTaskTableRoles,
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

describe("schemaTaskTableRoles", () => {
  const base = {
    focusMonsterId: 1200,
    lessonIntro: "",
    missionBody: "",
    schema: [...COMPLETE_SCHEMA_LINES],
  };

  it("单查明细表时不会把 monsters 误标成本题主表", () => {
    const roles = schemaTaskTableRoles({
      ...base,
      lessonStageId: "order-peak",
    });
    expect(roles.get("monster_signals")).toBe("primary");
    expect(roles.has("monsters")).toBe(false);
  });

  it("INNER JOIN 题按真实 FROM/JOIN 顺序标记主表和关联表", () => {
    const roles = schemaTaskTableRoles({
      ...base,
      focusMonsterId: 1400,
      lessonStageId: "inner-join-room",
    });
    expect(roles.get("monsters")).toBe("primary");
    expect(roles.get("rooms")).toBe("related");
  });

  it("专用事故表也按关卡答案标记本题主表", () => {
    const roles = schemaTaskTableRoles({
      ...base,
      focusMonsterId: 56,
      lessonStageId: "f8-mvcc-visible",
      schema: [
        "tx_versions(id, row_id, value, created_tx, expired_tx)",
        "lock_waits(id, waiter_tx, blocker_tx, resource)",
      ],
    });
    expect(roles.get("tx_versions")).toBe("primary");
    expect(roles.has("lock_waits")).toBe(false);
  });
});

describe("schemaRenderSignature", () => {
  const base = {
    focusMonsterId: 1200,
    lessonIntro: "聚合训练",
    lessonStageId: "practice-group" as const,
    locks: ["COUNT", "GROUP BY"],
    missionBody: "读取信号分组。",
    schema: [...COMPLETE_SCHEMA_LINES],
  };

  it("同一 schema 切换阶段或关键词时仍触发表角色与补全刷新", () => {
    const signature = schemaRenderSignature(base);
    expect(schemaRenderSignature({
      ...base,
      lessonStageId: "practice-group-core",
      missionBody: "读取怪物主表。",
    })).not.toBe(signature);
    expect(schemaRenderSignature({
      ...base,
      locks: ["SELECT", "FROM", "WHERE"],
    })).not.toBe(signature);
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
    monsterName: "史莱姆",
    gained: 1,
    previousXp: 0,
    currentXp: 1,
    previousLevel: 1,
    currentLevel: 1,
    previousMaxHp: 2,
    currentMaxHp: 2,
  };

  it("明确显示经验变化与战利品包", () => {
    expect(combatSettlementCopy(base, true)).toEqual({
      title: "击败 史莱姆",
      xp: "+1 XP",
      progress: "LV.1 · 0 → 1 / 2 XP",
      levelUp: "距离下一等级又近了一步",
      reward: "固定奖励包已出现在怪物位置 · 靠近后按 E 打开",
    });
  });

  it("随机恢复品直接使用并明确不占背包", () => {
    expect(combatSettlementCopy(base, false, "树果（生命 1→2）").reward)
      .toBe("树果（生命 1→2） 已自动使用 · 不占背包");
    expect(combatSettlementCopy(base, true, "树果（生命 1→2）").reward)
      .toBe(
        "树果（生命 1→2） 已自动使用 · 不占背包；固定奖励包已出现在怪物位置",
      );
  });

  it("升级时显示等级和生命上限变化，无掉落时给出直接反馈", () => {
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
      reward: "本次没有物品掉落 · 经验已正常结算",
    });
  });
});
