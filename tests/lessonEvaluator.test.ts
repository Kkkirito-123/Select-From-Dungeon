import { describe, expect, it } from "vitest";
import {
  detectQueryFeatures,
  evaluateLesson,
  evaluateStage,
} from "../src/domain/lessonEvaluator";
import {
  INITIAL_MONSTERS,
  LESSONS,
  practiceStageFor,
} from "../src/content/mvpLevel";
import { BIOME_ENCOUNTERS } from "../src/content/biomeContent";
import type { SqlQueryResult } from "../src/domain/types";

function makeResult(
  sql: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  targetIds: number[] = [],
): SqlQueryResult {
  return {
    sql,
    columns,
    rows,
    targetIds,
    plan: [],
    baseHeat: 2,
    features: detectQueryFeatures(sql),
  };
}

describe("detectQueryFeatures", () => {
  it("忽略字符串和注释中的伪关键字", () => {
    const features = detectQueryFeatures(
      "SELECT 'GROUP BY' AS note FROM monsters /* HAVING */ WHERE master_id IS NULL",
    );
    expect(features).toEqual(["select", "from", "where", "is-null"]);
  });

  it("识别第二层排序、去重与连接锁", () => {
    expect(detectQueryFeatures(
      "SELECT DISTINCT m.name FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE g.monster_id IS NULL ORDER BY m.name LIMIT 1",
    )).toEqual([
      "select",
      "from",
      "where",
      "is-null",
      "order-by",
      "limit",
      "distinct",
      "left-join",
      "on",
    ]);
  });
});

describe("课程文案", () => {
  it("每个课程与突发练习都提供独立参考 SQL", () => {
    const stages = [
      ...LESSONS.flatMap((lesson) => lesson.stages),
      ...BIOME_ENCOUNTERS.flatMap((encounter) => encounter.stages),
    ];
    expect(stages).toHaveLength(118);
    stages.forEach((stage) => {
      expect(stage.answerSql).toMatch(/^(?:SELECT|WITH|INSERT|UPDATE|DELETE|BEGIN)\b/i);
      expect(stage.answerSql.endsWith(";")).toBe(true);
    });
  });

  it("所有怪物使用不带装饰后缀的二到三字名称", () => {
    expect(Object.fromEntries(
      INITIAL_MONSTERS.map((monster) => [monster.id, monster.name]),
    )).toEqual({
      101: "史莱姆",
      111: "软泥怪",
      201: "水胶怪",
      211: "水胶怪",
      301: "毒胶怪",
      311: "毒胶怪",
      800: "铁胶怪",
      810: "铁胶怪",
      900: "泥王",
      1200: "猎犬",
      1210: "水怪",
      1300: "水蛇",
      1310: "水蛇",
      1400: "树妖",
      1410: "青蛙",
      1500: "毒蛙",
      1510: "毒蛙",
      1610: "猎犬",
      1710: "树妖",
      1810: "湖怪",
      1900: "丛林王",
      1911: "蛙王",
      1: "骷髅",
      2: "僵尸",
      3: "幽灵",
      4: "铠骷髅",
      5: "骨骑士",
      7: "碎骨",
      8: "腐尸",
      9: "鬼火",
      10: "游魂",
      11: "墓主",
      6: "死灵王",
      12: "火灵",
      13: "冰灵",
      14: "雷灵",
      15: "石巨人",
      16: "炎王",
      18: "火苗",
      19: "冰晶",
      20: "雷兽",
      21: "电球",
      22: "炉主",
      17: "元素王",
      23: "哥布林",
      24: "兽人",
      25: "骑士",
      26: "铁骑",
      27: "巨魔",
      28: "城主",
      29: "小妖",
      30: "战兽",
      31: "铁卫",
      32: "巨魔",
      33: "堡主",
      34: "幼龙",
      35: "飞龙",
      36: "雷龙",
      37: "晶龙",
      38: "巨龙",
      39: "龙王",
      40: "小龙",
      41: "翼龙",
      42: "雷龙",
      43: "晶龙",
      44: "古龙",
      45: "树卫",
      46: "根兽",
      47: "镜灵",
      48: "藤巫",
      49: "眼魔",
      50: "古树",
      51: "枝妖",
      52: "根兽",
      53: "晶灵",
      54: "树魔",
      55: "林王",
      56: "幽魂",
      57: "锁骑",
      58: "巫妖",
      59: "魔像",
      60: "双子",
      61: "巨兽",
      62: "魔王",
      63: "魔兵",
      64: "黑骑",
      65: "魔将",
      66: "石像",
      67: "王兽",
    });
    expect(INITIAL_MONSTERS.every(
      (monster) => !monster.name.includes("·") && monster.name.length <= 3,
    )).toBe(true);
  });

  it("第三到八层面向玩家的怪物编号从 1 连续到 67", () => {
    const advancedIds = INITIAL_MONSTERS
      .filter((monster) => monster.floor >= 3)
      .map((monster) => monster.id)
      .sort((left, right) => left - right);

    expect(advancedIds).toEqual(
      Array.from({ length: 67 }, (_, index) => index + 1),
    );
  });

  it("WHERE 使用短怪物名，并按信息量从短提示推进到完整 SQL", () => {
    const monster = INITIAL_MONSTERS.find((candidate) => candidate.id === 201);
    const lesson = LESSONS.find((candidate) => candidate.id === "where");
    const secondStage = lesson?.stages[1];

    expect(monster?.name).toBe("水胶怪");
    expect(lesson?.stages.map((stage) => stage.hints.length)).toEqual([5, 5]);
    expect(secondStage?.objective).toBe(
      "第二击：返回 name = '水胶怪' 且 status = 'escaped' 的 weakness。",
    );
    expect(secondStage?.hints).toEqual([
      "返回列：weakness。",
      "数据表：monsters。",
      "过滤字段：name 与 status，用 AND 连接。",
      "精确值：name = '水胶怪'，status = 'escaped'。",
      "完整写法：SELECT weakness FROM monsters WHERE name = '水胶怪' AND status = 'escaped';",
    ]);
  });
});

describe("evaluateLesson stages", () => {
  it("突发遭遇题仍检查真实结果与对应 SQL 核心", () => {
    const stage = practiceStageFor(211);
    if (!stage) throw new Error("缺少 WHERE 突发遭遇题");
    const exact = makeResult(
      "SELECT id FROM monsters WHERE room_id = 12 AND status = 'wet'",
      ["id"],
      [{ id: 211 }],
      [211],
    );
    const bypass = makeResult(
      "SELECT id FROM monsters WHERE id = 211",
      ["id"],
      [{ id: 211 }],
      [211],
    );
    expect(evaluateStage(stage, exact).accepted).toBe(true);
    expect(evaluateStage(stage, bypass).accepted).toBe(false);
  });
  it("SELECT 两阶段必须分别读出怪物名字与弱点", () => {
    const name = makeResult(
      "select name from monsters where id=101",
      ["name"],
      [{ name: "史莱姆" }],
    );
    const weakness = makeResult(
      "SELECT weakness FROM monsters WHERE id = 101",
      ["weakness"],
      [{ weakness: "slash" }],
    );
    expect(evaluateLesson("select", 0, name).accepted).toBe(true);
    expect(evaluateLesson("select", 1, weakness).accepted).toBe(true);
    expect(evaluateLesson("select", 1, name).accepted).toBe(false);
  });

  it("SELECT 接受表别名限定的等价列引用", () => {
    const actual = makeResult(
      "SELECT m.name FROM monsters AS m WHERE m.id = 101",
      ["name"],
      [{ name: "史莱姆" }],
    );
    expect(evaluateLesson("select", 0, actual).accepted).toBe(true);
  });

  it("硬编码结果缺少来源表时不能通过 SELECT", () => {
    const actual = makeResult(
      "SELECT '史莱姆' AS name",
      ["name"],
      [{ name: "史莱姆" }],
    );
    expect(evaluateLesson("select", 0, actual).accepted).toBe(false);
  });

  it("WHERE 第一阶段拒绝多余行", () => {
    const actual = makeResult(
      "SELECT id FROM monsters WHERE room_id >= 1 AND status = 'escaped'",
      ["id"],
      [{ id: 201 }, { id: 301 }],
      [201, 301],
    );
    expect(evaluateLesson("where", 0, actual).kind).toBe("wrong-result");
  });

  it("WHERE 与 IS NULL 拒绝 OR + 直接 id 的伪条件绕过", () => {
    const whereBypass = makeResult(
      "SELECT id FROM monsters WHERE id=201 OR (room_id=2 AND status='bogus')",
      ["id"],
      [{ id: 201 }],
      [201],
    );
    const nullBypass = makeResult(
      "SELECT id FROM monsters WHERE id=301 OR (room_id=3 AND master_id IS NULL AND 0)",
      ["id"],
      [{ id: 301 }],
      [301],
    );
    expect(evaluateLesson("where", 0, whereBypass).accepted).toBe(false);
    expect(evaluateLesson("is-null", 0, nullBypass).accepted).toBe(false);
  });

  it("WHERE 第二阶段不能只用 id 与恒真条件绕过名字过滤", () => {
    const actual = makeResult(
      "SELECT weakness, name, status FROM monsters WHERE id = 201 AND 1 = 1",
      ["weakness", "name", "status"],
      [{ weakness: "focus", name: "水胶怪", status: "escaped" }],
      [201],
    );
    expect(evaluateLesson("where", 1, actual).accepted).toBe(false);
  });

  it("WHERE 第二阶段接受按怪物名与状态返回 weakness", () => {
    const actual = makeResult(
      "SELECT weakness FROM monsters WHERE name = '水胶怪' AND status = 'escaped'",
      ["weakness"],
      [{ weakness: "focus" }],
    );
    expect(evaluateLesson("where", 1, actual).accepted).toBe(true);
  });

  it("= NULL 会提示缺少 IS NULL", () => {
    const actual = makeResult(
      "SELECT id FROM monsters WHERE room_id = 3 AND master_id = NULL",
      ["id"],
      [],
    );
    const evaluation = evaluateLesson("is-null", 0, actual);
    expect(evaluation.kind).toBe("missing-concept");
    expect(evaluation.locksRemaining).toContain("IS NULL");
  });

  it("IS NULL 第二阶段必须返回无主诅咒毒胶怪的名字", () => {
    const actual = makeResult(
      "SELECT name FROM monsters WHERE master_id IS NULL AND status = 'cursed'",
      ["name"],
      [{ name: "毒胶怪" }],
    );
    expect(evaluateLesson("is-null", 1, actual).accepted).toBe(true);
  });

  it("GROUP BY 接受调换列顺序且忽略结果行顺序", () => {
    const actual = makeResult(
      "SELECT COUNT(*) AS total, channel FROM monster_signals WHERE monster_id=800 GROUP BY channel",
      ["total", "channel"],
      [
        { total: 1, channel: "noise" },
        { total: 3, channel: "echo" },
      ],
    );
    expect(evaluateLesson("group-by", 0, actual).accepted).toBe(true);
  });

  it("HAVING 护盾与核心使用不同阈值", () => {
    const shield = makeResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id=900 GROUP BY channel HAVING COUNT(*) >= 2",
      ["channel", "total"],
      [
        { channel: "echo", total: 3 },
        { channel: "ward", total: 2 },
      ],
    );
    const core = makeResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id=900 GROUP BY channel HAVING COUNT(*) >= 3",
      ["channel", "total"],
      [{ channel: "echo", total: 3 }],
    );
    expect(evaluateLesson("having", 0, shield).accepted).toBe(true);
    expect(evaluateLesson("having", 1, core).accepted).toBe(true);
    expect(evaluateLesson("having", 1, shield).accepted).toBe(false);
  });

  it("HAVING 接受使用题目要求的 total 别名过滤", () => {
    const shield = makeResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id=900 GROUP BY channel HAVING total >= 2",
      ["channel", "total"],
      [
        { channel: "echo", total: 3 },
        { channel: "ward", total: 2 },
      ],
    );
    expect(evaluateLesson("having", 0, shield).accepted).toBe(true);
  });

  it("HAVING 1 = 1 即使结果碰巧正确也不能击破核心", () => {
    const actual = makeResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id=900 AND channel='echo' GROUP BY channel HAVING 1 = 1",
      ["channel", "total"],
      [{ channel: "echo", total: 3 }],
    );
    expect(evaluateLesson("having", 1, actual).accepted).toBe(false);
  });

  it("第二层 ORDER BY / LIMIT 同时校验顺序与返回行", () => {
    const peak = makeResult(
      "SELECT channel FROM monster_signals WHERE monster_id = 1200 ORDER BY charge DESC LIMIT 1",
      ["channel"],
      [{ channel: "surge" }],
    );
    const wrongDirection = makeResult(
      "SELECT channel FROM monster_signals WHERE monster_id = 1200 ORDER BY charge ASC LIMIT 1",
      ["channel"],
      [{ channel: "surge" }],
    );
    expect(evaluateLesson("order-by", 0, peak).accepted).toBe(true);
    expect(evaluateLesson("order-by", 0, wrongDirection).accepted).toBe(false);
  });

  it("第二层 DISTINCT 必须真正去重并按要求排序", () => {
    const exact = makeResult(
      "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 1300 ORDER BY channel",
      ["channel"],
      [{ channel: "echo" }, { channel: "mirror" }],
    );
    const withoutDistinct = makeResult(
      "SELECT channel FROM monster_signals WHERE monster_id = 1300 ORDER BY channel",
      ["channel"],
      [{ channel: "echo" }, { channel: "mirror" }],
    );
    expect(evaluateLesson("distinct", 0, exact).accepted).toBe(true);
    expect(evaluateLesson("distinct", 0, withoutDistinct).accepted).toBe(false);
  });

  it("第二层 INNER JOIN 必须使用真实表关系，不能用恒真 ON 绕过", () => {
    const exact = makeResult(
      "SELECT m.name, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 1400",
      ["name", "room_name"],
      [{ name: "树妖", room_name: "古树桥" }],
    );
    const bypass = makeResult(
      "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON 1 = 1 WHERE m.id = 1400 AND r.id = 23",
      ["name", "room_name"],
      [{ name: "树妖", room_name: "古树桥" }],
    );
    expect(evaluateLesson("inner-join", 0, exact).accepted).toBe(true);
    expect(evaluateLesson("inner-join", 0, bypass).accepted).toBe(false);
  });

  it("第二层 LEFT JOIN 使用右表 NULL 找出未装备怪物", () => {
    const exact = makeResult(
      "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 24 AND g.monster_id IS NULL",
      ["id"],
      [{ id: 1500 }],
      [1500],
    );
    expect(evaluateLesson("left-join", 0, exact).accepted).toBe(true);
  });

  it("第二层综合 Boss 要求 JOIN、GROUP BY、HAVING 与 ORDER BY 同时成立", () => {
    const exact = makeResult(
      "SELECT r.sector, COUNT(*) AS total FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE r.floor = 2 GROUP BY r.sector HAVING COUNT(*) >= 2 ORDER BY total DESC",
      ["sector", "total"],
      [{ sector: "ambush", total: 4 }, { sector: "storm", total: 2 }],
    );
    expect(evaluateLesson("join-boss", 0, exact).accepted).toBe(true);
  });
});
