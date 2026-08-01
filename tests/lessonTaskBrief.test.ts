import { describe, expect, it } from "vitest";
import { BIOME_ENCOUNTERS } from "../src/content/biomeContent";
import {
  lessonTaskBriefFor,
  topicGroupsForStage,
} from "../src/content/lessonTaskBrief";
import {
  INITIAL_MONSTERS,
  LESSONS,
  lessonById,
  practiceStagesFor,
} from "../src/content/mvpLevel";

describe("SQL 战斗任务契约", () => {
  it("把 ID #017 的三个易混字段和真实连接键完整说清", () => {
    const monster = INITIAL_MONSTERS.find((entry) => entry.id === 17)!;
    const stage = practiceStagesFor(17)[0];
    const brief = lessonTaskBriefFor({
      floor: 2,
      lesson: lessonById(monster.lessonId),
      stage,
      monster,
      stageIndex: 0,
    });

    expect(brief.queryGoal).toContain("怪物主键 m.id");
    expect(brief.queryGoal).toContain("m.room_id = r.id");
    expect(brief.relations).toEqual([
      "m.room_id = r.id（怪物所在房间）",
    ]);
    expect(brief.fieldGuide.map((field) => field.expression)).toEqual(
      expect.arrayContaining(["m.id", "m.room_id", "r.id", "r.name"]),
    );
    expect(brief.outputColumns).toEqual(["m.id", "r.name AS room_name"]);
    expect(brief.successEffect).toContain("根桥");
  });

  it("所有八层任务都提供剧情、输出、结果反馈与由浅入深的四级提示", () => {
    LESSONS.forEach((lesson) => {
      const monster = INITIAL_MONSTERS.find((entry) => entry.id === lesson.primaryMonsterId)!;
      lesson.stages.forEach((stage, stageIndex) => {
        const brief = lessonTaskBriefFor({
          floor: monster.floor,
          lesson,
          stage,
          monster,
          stageIndex,
        });
        expect(brief.situation, stage.id).not.toBe("");
        expect(brief.queryGoal, stage.id).not.toBe("");
        expect(brief.outputColumns.length, stage.id).toBeGreaterThan(0);
        expect(brief.successEffect, stage.id).not.toBe("");
        expect(brief.hints, stage.id).toHaveLength(4);
        expect(brief.hints[0], stage.id).not.toContain(stage.answerSql);
        expect(brief.hints[1], stage.id).not.toContain(stage.answerSql);
        expect(brief.hints[2], stage.id).not.toContain(stage.answerSql);
        expect(brief.hints[3], stage.id).toContain(stage.answerSql);
      });
    });
  });

  it("只把顶层 SELECT、WHERE 与 ORDER BY 展示为任务结构", () => {
    const scalarLesson = lessonById("f4-scalar");
    const scalarMonster = INITIAL_MONSTERS.find((entry) => entry.id === 34)!;
    const scalarBrief = lessonTaskBriefFor({
      floor: 4,
      lesson: scalarLesson,
      stage: scalarLesson.stages[0],
      monster: scalarMonster,
      stageIndex: 0,
    });
    expect(scalarBrief.outputColumns).toEqual(["id"]);
    expect(scalarBrief.constraints).toEqual([
      "WHERE id = (SELECT MIN(id) FROM monsters WHERE room_id = 51)",
    ]);

    const windowLesson = lessonById("f5-row-number");
    const windowMonster = INITIAL_MONSTERS.find((entry) => entry.id === 46)!;
    const windowBrief = lessonTaskBriefFor({
      floor: 5,
      lesson: windowLesson,
      stage: windowLesson.stages[0],
      monster: windowMonster,
      stageIndex: 0,
    });
    expect(windowBrief.constraints).toEqual([
      "WHERE m.id BETWEEN 45 AND 48",
      "ORDER BY r.sector, pos",
    ]);
  });

  it("第六至八层专用表也提供完整字段含义", () => {
    const updateLesson = lessonById("f6-update");
    const updateBrief = lessonTaskBriefFor({
      floor: 6,
      lesson: updateLesson,
      stage: updateLesson.stages[0],
      monster: INITIAL_MONSTERS.find((entry) => entry.id === 57)!,
      stageIndex: 0,
    });
    expect(updateBrief.primaryTable).toBe("repair_queue");
    expect(updateBrief.outputColumns).toEqual(["更新后的目标记录"]);
    expect(updateBrief.fieldGuide).toEqual(expect.arrayContaining([
      { expression: "repair_queue.status", meaning: "repair_queue.status：记录当前状态" },
      { expression: "repair_queue.id", meaning: "repair_queue.id：当前表的记录主键" },
    ]));

    const mvccLesson = lessonById("f8-mvcc");
    const mvccBrief = lessonTaskBriefFor({
      floor: 8,
      lesson: mvccLesson,
      stage: mvccLesson.stages[0],
      monster: INITIAL_MONSTERS.find((entry) => entry.id === 78)!,
      stageIndex: 0,
    });
    expect(mvccBrief.fieldGuide).toEqual(expect.arrayContaining([
      { expression: "tx_versions.row_id", meaning: "tx_versions.row_id：业务记录编号" },
      { expression: "tx_versions.created_tx", meaning: "tx_versions.created_tx：创建该版本的事务编号" },
      { expression: "tx_versions.expired_tx", meaning: "tx_versions.expired_tx：使该版本失效的事务编号；仍有效时为空" },
    ]));
  });

  it("首领插入复习阶段时按当前阶段显示知识点，而不是沿用首领标题", () => {
    const bossLesson = lessonById("f4-recursive");
    const reviewStage = lessonById("f4-cte").stages[0];
    const brief = lessonTaskBriefFor({
      floor: 4,
      lesson: bossLesson,
      stage: reviewStage,
      monster: INITIAL_MONSTERS.find((entry) => entry.id === 39)!,
      stageIndex: 1,
    });
    expect(brief.focusTopics).toEqual(["WITH / CTE", "INNER JOIN / ON"]);
    expect(brief.reviewTopics).toEqual(["WITH / CTE", "INNER JOIN / ON"]);
    expect(brief.hints[1]).toContain("WITH / CTE");
    expect(brief.hints[1]).not.toContain("WITH RECURSIVE");
  });

  it("普通生态怪第一击只练一个章节，精英复合内容只能出现在第二击以后", () => {
    BIOME_ENCOUNTERS.forEach((encounter) => {
      const firstTopics = topicGroupsForStage(encounter.stages[0]);
      if (encounter.role === "normal") {
        expect(firstTopics, `ID #${encounter.monsterId}`).toHaveLength(1);
      }
      if (encounter.role === "mini-elite") {
        expect(firstTopics, `ID #${encounter.monsterId} 第一击`).toHaveLength(1);
        encounter.stages.slice(1).forEach((stage) => {
          expect(topicGroupsForStage(stage).length, stage.id).toBeLessThanOrEqual(2);
        });
      }
    });
  });

  it("第二、三层楼层首领按基础连接到复合审计逐步升难", () => {
    expect(lessonById("join-boss").stages.map(topicGroupsForStage)).toEqual([
      ["INNER JOIN / ON"],
      ["INNER JOIN / ON", "ORDER BY / LIMIT"],
    ]);
    expect(lessonById("f3-audit").stages.map(topicGroupsForStage)).toEqual([
      ["INNER JOIN / ON"],
      ["INNER JOIN / ON", "ORDER BY / LIMIT"],
      ["INNER JOIN / ON", "COUNT / GROUP BY / HAVING", "ORDER BY / LIMIT"],
    ]);
  });
});
