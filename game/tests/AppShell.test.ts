import { describe, expect, it } from "vitest";
import { COMPLETE_SCHEMA_LINES } from "../src/content/sql/sqlSchema";
import { GameSession } from "../src/features/game-session/GameSession";
import { migrationStepMarkerIds } from "../src/domain/progression/finalMigration";
import type { AnswerAttemptRecord, ExperienceSettlement } from "../src/domain/shared/types";
import { answerReviewSummary } from "../src/presentation/dom/AnswerReviewView";
import {
  canPresentQueuedNarrativeMoment,
  canPresentFinalMigrationStoryMoment,
  canOpenCombatTerminal,
  combatSettlementCopy,
  finalMigrationArgumentCopy,
  finalMigrationRecordCopy,
  finalVictoryPortalReady,
  inspectionDialogCopy,
  inspectionEscapeCanClose,
  isInspectionPrimaryKey,
  narrativeProgressForSnapshot,
  narrativeMomentUsesRecordOverlay,
  redactSnapshotMonsterIdentity,
  storyMomentRecordBody,
  schemaRenderSignature,
  schemaTaskTableRoles,
  shapeOnlyQueryResultCopy,
  shouldDismissTransientCard,
} from "../src/features/app-shell/AppShell";
import {
  adminAnswerForInput,
  shouldAutofillAdminAnswer,
} from "../src/presentation/dom/adminAnswer";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import {
  FloorTransitionCoordinator,
  floorTransitionPolicy,
  type FloorTransitionClock,
} from "../src/presentation/dom/FloorTransitionCoordinator";

describe("楼层自动传送策略", () => {
  it("第一至第七层的结算卡、钥匙卡或剧情队列只能遮住演出，不能阻止 transition 定时器", () => {
    for (let floor = 1; floor <= 7; floor += 1) {
      expect(floorTransitionPolicy({
        mode: "transition",
        floor,
        finalVictoryReady: false,
        presentationBlocked: true,
      })).toEqual({
        transitionVisible: false,
        victoryVisible: false,
        shouldScheduleAdvance: true,
      });
    }
  });

  it("没有临时卡片时仍显示传送演出并启动同一个定时器", () => {
    expect(floorTransitionPolicy({
      mode: "transition",
      floor: 1,
      finalVictoryReady: false,
      presentationBlocked: false,
    })).toEqual({
      transitionVisible: true,
      victoryVisible: false,
      shouldScheduleAdvance: true,
    });
  });

  it("普通探索和第八层胜利不会误触发下一层定时器", () => {
    expect(floorTransitionPolicy({
      mode: "explore",
      floor: 1,
      finalVictoryReady: false,
      presentationBlocked: false,
    }).shouldScheduleAdvance).toBe(false);
    expect(floorTransitionPolicy({
      mode: "victory",
      floor: 8,
      finalVictoryReady: true,
      presentationBlocked: false,
    })).toEqual({
      transitionVisible: false,
      victoryVisible: true,
      shouldScheduleAdvance: false,
    });
  });
});

describe("楼层传送协调器", () => {
  function fakeClock(): FloorTransitionClock & {
    callbacks: Map<number, () => void>;
    cleared: number[];
  } {
    let sequence = 0;
    const callbacks = new Map<number, () => void>();
    const cleared: number[] = [];
    return {
      callbacks,
      cleared,
      setTimeout(callback) {
        sequence += 1;
        callbacks.set(sequence, callback);
        return sequence;
      },
      clearTimeout(timerId) {
        callbacks.delete(timerId);
        cleared.push(timerId);
      },
    };
  }

  it("重复 render 只保留一个切层时钟，触发后仅推进一次", () => {
    const clock = fakeClock();
    let advances = 0;
    const coordinator = new FloorTransitionCoordinator(
      clock,
      () => { advances += 1; },
    );

    coordinator.sync(true, 1_500);
    coordinator.sync(true, 1_500);
    expect(clock.callbacks.size).toBe(1);

    const [timerId, callback] = [...clock.callbacks.entries()][0];
    clock.callbacks.delete(timerId);
    callback();
    expect(advances).toBe(1);
    coordinator.sync(true, 1_500);
    expect(clock.callbacks.size).toBe(1);
  });

  it("离开 transition 或销毁界面时会取消尚未触发的时钟", () => {
    const clock = fakeClock();
    const coordinator = new FloorTransitionCoordinator(clock, () => undefined);

    coordinator.sync(true, 1_500);
    coordinator.sync(false, 1_500);
    expect(clock.callbacks.size).toBe(0);
    expect(clock.cleared).toEqual([1]);

    coordinator.sync(true, 1_500);
    coordinator.destroy();
    expect(clock.callbacks.size).toBe(0);
    expect(clock.cleared).toEqual([1, 2]);
  });
});

describe("玩家可见文本身份边界", () => {
  it("剧情、调查与管理员文本在身份恢复后仍只显示稳定 ID", () => {
    const snapshot = new GameSession(null, null, "app-shell-identity-boundary").snapshot();
    expect(redactSnapshotMonsterIdentity(
      "史莱姆发动数据喷射，内部类型 projection_slime。",
      snapshot,
    )).toBe("ID #001发动数据喷射，内部类型 未识别类型。");

    snapshot.profile.discoveredMonsterIds = [1];
    expect(redactSnapshotMonsterIdentity(
      "史莱姆发动数据喷射，内部类型 projection_slime。",
      snapshot,
    )).toBe("ID #001发动数据喷射，内部类型 未识别类型。");
  });
});

describe("主框确认键", () => {
  it("E、不同键盘布局的 e/E 与 Enter 都能确认，长按不会重复触发", () => {
    expect(isInspectionPrimaryKey({ code: "KeyE", key: "Process", repeat: false })).toBe(true);
    expect(isInspectionPrimaryKey({ code: "", key: "e", repeat: false })).toBe(true);
    expect(isInspectionPrimaryKey({ code: "", key: "E", repeat: false })).toBe(true);
    expect(isInspectionPrimaryKey({ code: "Enter", key: "Enter", repeat: false })).toBe(true);
    expect(isInspectionPrimaryKey({ code: "KeyE", key: "e", repeat: true })).toBe(false);
    expect(isInspectionPrimaryKey({ code: "Escape", key: "Escape", repeat: false })).toBe(false);
  });

  it("ESC 不能确认 MIGRATE 页或其他 blocking 剧情", () => {
    expect(inspectionEscapeCanClose("migration", "blocking")).toBe(false);
    expect(inspectionEscapeCanClose("story", "blocking")).toBe(false);
    expect(inspectionEscapeCanClose("inspection", "inspect")).toBe(true);
  });
});

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
    expect(entry.storyMomentTotal).toBe(10);
    expect(entry.latestMoment?.query?.expectedRowCount).toBe(0);
    expect(storyMomentRecordBody(entry.latestMoment!)).toContain(
      "SQL 证据 · 当前居民查询",
    );
    expect(storyMomentRecordBody(entry.latestMoment!)).toContain(
      "真实结果 · 0 行 · 无返回字段",
    );

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
    expect(midpoint.discoveredEvidenceIds).not.toContain(
      "lost-name:f1:current-record",
    );
    const inspectedMidpoint = narrativeProgressForSnapshot({
      ...snapshot,
      completedLessons: ["select", "where", "is-null"],
      openedGateIds: ["story:evidence:lost-name:f1:current-record"],
      respawnCampfireId: snapshot.campfires[0]?.id ?? null,
    });
    expect(inspectedMidpoint.discoveredEvidenceIds).toContain(
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
    expect(bossReached.discoveredEvidenceIds).not.toContain(
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

  it("第八层 victory 从 Run marker 推导 MIGRATE 进度而不再自动全完成", () => {
    const snapshot = new GameSession(null, null, "migration-marker-progress").snapshot();
    const progress = narrativeProgressForSnapshot({
      ...snapshot,
      floor: 8,
      mode: "victory",
      openedGateIds: migrationStepMarkerIds().slice(0, 2),
    });
    expect(progress.completedMigrationStepIds).toEqual(["snapshot", "audit"]);
  });
});

describe("MIGRATE 七页主框", () => {
  const migrationMoment = {
    floor: 8 as const,
    sourceId: "f8-story-migrate",
  };

  it("档案王击败后仍等待第八层 victory，不能在探索态提前展示", () => {
    expect(canPresentFinalMigrationStoryMoment(
      migrationMoment,
      { floor: 8, mode: "explore" },
    )).toBe(false);
    expect(canPresentFinalMigrationStoryMoment(
      migrationMoment,
      { floor: 8, mode: "victory" },
    )).toBe(true);
  });

  it("刷新后从首个未完成页继续，七步完成后不再生成主框页", () => {
    const first = finalMigrationRecordCopy([]);
    expect(first).toMatchObject({
      title: "1 / 7 · 保存只读快照",
      stepIndex: 0,
      stepTotal: 7,
    });
    expect(first?.body).not.toContain("众名第一次共同拥有了明天");

    const resumed = finalMigrationRecordCopy(
      migrationStepMarkerIds().slice(0, 3),
    );
    expect(resumed).toMatchObject({
      title: "4 / 7 · 隔离构建新结构",
      stepIndex: 3,
      stepTotal: 7,
    });
    expect(finalMigrationRecordCopy(migrationStepMarkerIds())).toBeNull();
  });

  it("第七步落盘前最终 portal 始终不可用", () => {
    const markers = migrationStepMarkerIds();
    expect(finalVictoryPortalReady({
      floor: 8,
      mode: "victory",
      openedGateIds: markers.slice(0, 6),
    })).toBe(false);
    expect(finalVictoryPortalReady({
      floor: 8,
      mode: "victory",
      openedGateIds: markers,
    })).toBe(true);
  });

  it("只在 #084 的 f8-security 五阶段显示论点、证据与玩家结论", () => {
    const hiddenIdentityArgument = finalMigrationArgumentCopy({
      lessonId: "f8-security",
      lessonStageId: "f8-final-snapshot",
      combat: { targetId: 84 },
    });
    expect(hiddenIdentityArgument).toMatchObject({
      argument: expect.stringContaining("ID #084："),
      evidence: expect.stringContaining("恢复权限"),
      conclusion: expect.stringContaining("玩家结论："),
    });
    expect(hiddenIdentityArgument?.argument).not.toContain("档案王");
    expect(finalMigrationArgumentCopy({
      lessonId: "f8-security",
      lessonStageId: "f8-final-snapshot",
      combat: { targetId: 83 },
    })).toBeNull();
  });
});

describe("剧情节点呈现层级", () => {
  it("关键剧情占据主画面，机关变化继续使用三步短反馈", () => {
    expect(narrativeMomentUsesRecordOverlay("blocking")).toBe(true);
    expect(narrativeMomentUsesRecordOverlay("inspect")).toBe(true);
    expect(narrativeMomentUsesRecordOverlay("ambient")).toBe(false);
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
      .toBe(true);
    expect(canPresentQueuedNarrativeMoment("victory", false, false, false))
      .toBe(true);
    expect(canPresentQueuedNarrativeMoment("defeat", false, false, false))
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

describe("管理员 SQL 自动填题", () => {
  const baseSnapshot = new GameSession(null, null, "admin-answer-ui").snapshot();
  const combatSnapshot = {
    ...baseSnapshot,
    adminMode: true,
    mode: "combat" as const,
    lessonStageId: "select-weakness" as const,
    adminAnswerSql: "SELECT weakness FROM monsters WHERE id = 1;",
    combat: {
      targetId: 1,
      kind: "curriculum" as const,
      round: 1,
      successStep: 0,
      intent: {
        name: "ID #001",
        damage: 1,
        locks: [],
      },
    },
  } as GameSnapshot;

  it("只在进入战斗或进入下一题时填入答案", () => {
    expect(shouldAutofillAdminAnswer(null, combatSnapshot)).toBe(true);
    expect(adminAnswerForInput(combatSnapshot)).toBe(
      "SELECT weakness FROM monsters WHERE id = 1;",
    );
    expect(shouldAutofillAdminAnswer(combatSnapshot, {
      ...combatSnapshot,
      banner: "普通刷新",
    })).toBe(false);
    expect(shouldAutofillAdminAnswer(combatSnapshot, {
      ...combatSnapshot,
      lessonStageId: "select-name" as const,
      adminAnswerSql: "SELECT id, status FROM monsters WHERE id = 1;",
    })).toBe(true);
  });

  it("普通模式和非战斗状态不提供管理员答案", () => {
    expect(adminAnswerForInput({
      ...combatSnapshot,
      adminMode: false,
      adminAnswerSql: null,
    })).toBeNull();
    expect(adminAnswerForInput({
      ...combatSnapshot,
      mode: "explore",
      adminAnswerSql: null,
    })).toBeNull();
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
