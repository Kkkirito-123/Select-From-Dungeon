import { describe, expect, it } from "vitest";
import { COMPLETE_SCHEMA_LINES } from "../src/content/sqlSchema";
import { GameSession } from "../src/domain/GameSession";
import type { AnswerAttemptRecord, ExperienceSettlement } from "../src/domain/types";
import { answerReviewSummary } from "../src/ui/AnswerReviewView";
import {
  canPresentQueuedNarrativeMoment,
  canOpenCombatTerminal,
  combatSettlementCopy,
  inspectionDialogCopy,
  narrativeProgressForSnapshot,
  schemaRenderSignature,
  schemaTaskTableRoles,
  shapeOnlyQueryResultCopy,
  shouldDismissTransientCard,
} from "../src/ui/AppShell";

describe("inspectionDialogCopy", () => {
  it("把角色署名从正文拆到主框标题", () => {
    expect(inspectionDialogCopy("抄写员：先去档案水轮。找出 ID #001 的记录。")).toEqual({
      title: "抄写员",
      body: "先去档案水轮。找出 ID #001 的记录。",
    });
  });

  it("为无署名地标提供明确标题且保留完整指导", () => {
    expect(inspectionDialogCopy("档案水轮正在转动，但排水记录仍未筛准。")).toEqual({
      title: "档案水轮",
      body: "档案水轮正在转动，但排水记录仍未筛准。",
    });
  });
});

describe("shape-only 查询结果", () => {
  it("封存提示不包含实际行数", () => {
    const oneRow = shapeOnlyQueryResultCopy({
      sql: "SELECT name FROM monsters WHERE id = 1",
      columns: ["name"],
      rows: [{ name: "史莱姆" }],
      targetIds: [1],
      plan: [],
      baseHeat: 1,
      features: ["select", "from", "where"],
    });
    const zeroRows = shapeOnlyQueryResultCopy({
      sql: "SELECT name FROM monsters WHERE id = 999",
      columns: ["name"],
      rows: [],
      targetIds: [],
      plan: [],
      baseHeat: 1,
      features: ["select", "from", "where"],
    });

    expect(oneRow).toEqual(zeroRows);
    expect(oneRow.title).not.toMatch(/\b[01]\s*行\b/);
    expect(oneRow.detail).toContain("行数已封存");
  });
});

describe("narrativeProgressForSnapshot", () => {
  it("入层先显示第一拍，中段、篝火与层主按真实进度逐步解锁", () => {
    const snapshot = new GameSession(null, null, "narrative-runtime").snapshot();
    const entry = narrativeProgressForSnapshot(snapshot);
    expect(entry.seenBeatIds).toEqual(["narrative:f1:floor-entry"]);
    expect(entry.latestBeat?.kind).toBe("floor-entry");
    expect(entry.seenMomentIds).toEqual([
      "story:f1-story-fire-remembers",
    ]);
    expect(entry.storyMomentTotal).toBe(8);
    expect(entry.latestMoment?.query?.expectedRowCount).toBe(0);

    const midpoint = narrativeProgressForSnapshot({
      ...snapshot,
      completedLessons: ["select", "where", "is-null"],
      respawnCampfireId: snapshot.campfires[0]?.id ?? null,
    });
    expect(midpoint.seenBeatIds).toEqual([
      "narrative:f1:floor-entry",
      "narrative:f1:midpoint-evidence",
      "narrative:f1:campfire",
    ]);
    expect(midpoint.discoveredEvidenceIds).toContain(
      "lost-name:f1:current-record",
    );
    expect(midpoint.seenMomentIds).toEqual(expect.arrayContaining([
      "story:f1-wheel-turning",
      "story:f1-water-low",
      "story:f1-beds-revealed",
    ]));

    const boss = snapshot.monsters.find(
      (monster) =>
        monster.isBoss &&
        monster.rank === "boss",
    );
    if (!boss) throw new Error("第一层缺少层主");
    const bossReached = narrativeProgressForSnapshot({
      ...snapshot,
      mode: "combat",
      focusMonsterId: boss.id,
      completedLessons: ["select", "where", "is-null", "group-by"],
    });
    expect(bossReached.latestBeat?.kind).toBe("boss");
    expect(bossReached.discoveredEvidenceIds).toContain(
      "lost-name:f1:restore-permission",
    );
  });

  it("区域首领不会提前解锁本层层主剧情", () => {
    const snapshot = new GameSession(null, null, "narrative-area-boss").snapshot();
    const ordinaryMonster = snapshot.monsters.find((monster) => !monster.isBoss);
    if (!ordinaryMonster) throw new Error("第一层缺少普通怪物");
    const areaBoss = {
      ...ordinaryMonster,
      id: 99_001,
      roomId: 99_001,
      isBoss: true,
      rank: "elite" as const,
    };

    const progress = narrativeProgressForSnapshot({
      ...snapshot,
      mode: "combat",
      monsters: [...snapshot.monsters, areaBoss],
      focusMonsterId: areaBoss.id,
      completedLessons: ["select", "where", "is-null", "group-by"],
    });

    expect(progress.seenBeatIds).not.toContain("narrative:f1:boss");
    expect(progress.latestBeat?.kind).not.toBe("boss");
  });

  it("层末结算实体上升路线，不把 MIGRATE 提前当作普通结局", () => {
    const snapshot = new GameSession(null, null, "narrative-ascent").snapshot();
    const progress = narrativeProgressForSnapshot({
      ...snapshot,
      mode: "transition",
      completedLessons: ["select", "where", "is-null", "group-by", "having"],
      completedRoomIds: [
        ...snapshot.completedRoomIds,
        snapshot.roomGraph.bossId,
      ],
    });
    expect(progress.latestBeat?.kind).toBe("floor-end");
    expect(progress.latestMoment?.kind).toBe("ascent");
    expect(progress.completedAscentIds).toEqual(["ascent:f1:f2"]);
    expect(progress.completedMigrationStepIds).toEqual([]);
  });
});

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

describe("canPresentQueuedNarrativeMoment", () => {
  it("战斗结算卡关闭前保留队列，关闭后才允许展示", () => {
    expect(canPresentQueuedNarrativeMoment("explore", false, true, false))
      .toBe(false);
    expect(canPresentQueuedNarrativeMoment("explore", false, false, false))
      .toBe(true);
    expect(canPresentQueuedNarrativeMoment("explore", true, false, false))
      .toBe(false);
    expect(canPresentQueuedNarrativeMoment("transition", false, false, false))
      .toBe(false);
  });
});

describe("schemaTaskTableRoles", () => {
  const base = {
    focusMonsterId: 10,
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
      focusMonsterId: 12,
      lessonStageId: "inner-join-room",
    });
    expect(roles.get("monsters")).toBe("primary");
    expect(roles.get("rooms")).toBe("related");
  });

  it("专用事故表也按关卡答案标记本题主表", () => {
    const roles = schemaTaskTableRoles({
      ...base,
      focusMonsterId: 78,
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
    focusMonsterId: 10,
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
    monsterId: 1,
    monsterName: "史莱姆",
    lessonId: "select",
    stageId: "select-name",
    stageObjective: "查询史莱姆名字",
    round: 1,
    sql: "SELECT name FROM monsters WHERE id = 1",
    answerSql: "SELECT name FROM monsters WHERE id = 1;",
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
    monsterId: 1,
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
      reward: "战利品包已留在战场 · 靠近后按 E 打开",
    });
  });

  it("随机恢复品直接使用并明确不占背包", () => {
    expect(combatSettlementCopy(base, false, "树果（生命 1→2）").reward)
      .toBe("树果（生命 1→2） 已自动使用 · 不占背包");
    expect(combatSettlementCopy(base, true, "树果（生命 1→2）").reward)
      .toBe(
        "树果（生命 1→2） 已自动使用 · 不占背包；另有战利品包留在战场",
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
