import { describe, expect, it } from "vitest";
import {
  detectQueryFeatures,
  evaluateLesson,
  evaluateStage,
  evaluateUnrevealedIdentityQuery,
  unrevealedIdentityQueryMessage,
} from "../src/domain/lessonEvaluator";
import {
  INITIAL_MONSTERS,
  LESSONS,
  lessonById,
  practiceStageFor,
  practiceStagesFor,
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
    expect(stages).toHaveLength(119);
    stages.forEach((stage) => {
      expect(stage.answerSql).toMatch(/^(?:SELECT|WITH|INSERT|UPDATE|DELETE|BEGIN)\b/i);
      expect(stage.answerSql.endsWith(";")).toBe(true);
    });
  });

  it("所有怪物使用不带装饰后缀的短名称", () => {
    expect(Object.fromEntries(
      INITIAL_MONSTERS.map((monster) => [monster.id, monster.name]),
    )).toEqual({
      1: "史莱姆",
      6: "小水怪",
      2: "水史莱姆",
      7: "小史莱姆",
      3: "毒史莱姆",
      8: "灰史莱姆",
      4: "铁史莱姆",
      9: "宝箱怪",
      5: "登记官",
      10: "猎犬",
      15: "水怪",
      11: "水蛇",
      16: "镜蛇",
      12: "树妖",
      17: "青蛙",
      13: "毒蛙",
      18: "沼蛙",
      19: "林犬",
      20: "古树精",
      21: "湖兽",
      14: "灯塔守卫",
      22: "蛙王",
      23: "骷髅",
      24: "僵尸",
      25: "幽灵",
      26: "铠骷髅",
      27: "骨骑士",
      29: "碎骨",
      30: "腐尸",
      31: "鬼火",
      32: "游魂",
      33: "墓主",
      28: "死灵王",
      34: "火灵",
      35: "冰灵",
      36: "雷灵",
      37: "石巨人",
      38: "炎王",
      40: "火苗",
      41: "冰晶",
      42: "雷兽",
      43: "电球",
      44: "霜炉主",
      39: "元素王",
      45: "哥布林",
      46: "兽人",
      47: "骑士",
      48: "铁骑",
      49: "巨魔",
      50: "城主",
      51: "小妖",
      52: "战兽",
      53: "铁卫",
      54: "石魔",
      55: "堡主",
      56: "幼龙",
      57: "飞龙",
      58: "雷龙",
      59: "晶龙",
      60: "巨龙",
      61: "龙王",
      62: "小龙",
      63: "翼龙",
      64: "电龙",
      65: "矿龙",
      66: "古龙",
      67: "树卫",
      68: "根兽",
      69: "镜灵",
      70: "藤巫",
      71: "眼魔",
      72: "古树",
      73: "枝妖",
      74: "藤兽",
      75: "晶灵",
      76: "树魔",
      77: "林王",
      78: "幽魂",
      79: "锁骑",
      80: "巫妖",
      81: "魔像",
      82: "双子",
      83: "巨兽",
      84: "档案王",
      85: "魔兵",
      86: "黑骑",
      87: "魔将",
      88: "石像",
      89: "王兽",
    });
    expect(INITIAL_MONSTERS.every(
      (monster) => !monster.name.includes("·") && monster.name.length <= 4,
    )).toBe(true);
  });

  it("第三到八层面向玩家的怪物编号从 23 连续到 89", () => {
    const advancedIds = INITIAL_MONSTERS
      .filter((monster) => monster.floor >= 3)
      .map((monster) => monster.id)
      .sort((left, right) => left - right);

    expect(advancedIds).toEqual(
      Array.from({ length: 67 }, (_, index) => index + 23),
    );
  });

  it("WHERE 使用短怪物名，并按信息量从短提示推进到完整 SQL", () => {
    const monster = INITIAL_MONSTERS.find((candidate) => candidate.id === 2);
    const lesson = LESSONS.find((candidate) => candidate.id === "where");
    const secondStage = lesson?.stages[1];

    expect(monster?.name).toBe("水史莱姆");
    expect(lesson?.stages.map((stage) => stage.hints.length)).toEqual([5, 5]);
    expect(secondStage?.objective).toBe(
      "第二击：按 id = 2 与 status = 'escaped' 返回 weakness。",
    );
    expect(secondStage?.hints).toEqual([
      "返回列：weakness。",
      "数据表：monsters。",
      "过滤字段：id 与 status，用 AND 连接。",
      "精确值：id = 2，status = 'escaped'。",
      "完整写法：SELECT weakness FROM monsters WHERE id = 2 AND status = 'escaped';",
    ]);
  });

  it("F1 与 F2 标准答案始终只用 ID 定位，主表 id 不改名为 monster_id", () => {
    const select = LESSONS.find((lesson) => lesson.id === "select");
    const innerJoin = LESSONS.find((lesson) => lesson.id === "inner-join");

    expect(select?.stages.map((stage) => stage.answerSql)).toEqual([
      "SELECT weakness FROM monsters WHERE id = 1;",
      "SELECT id, status FROM monsters WHERE id = 1;",
    ]);
    expect(innerJoin?.stages.map((stage) => stage.answerSql)).toEqual([
      "SELECT m.id, r.sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 12;",
      "SELECT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 12;",
    ]);
    expect(innerJoin?.stages[0]?.answerSql).not.toMatch(/\bas\s+monster_id\b/i);
  });
});

describe("evaluateLesson stages", () => {
  it("第一至八层全部官方答案都通过未揭名身份防火墙", () => {
    const curriculumStages = LESSONS
      .flatMap((lesson) => lesson.stages.map((stage) => ({
        floor: INITIAL_MONSTERS.find(
          (monster) => monster.id === lesson.primaryMonsterId,
        )?.floor ?? 1,
        stage,
      })));
    const encounterStages = BIOME_ENCOUNTERS
      .flatMap((encounter) => encounter.stages.map((stage) => ({
        floor: encounter.floor,
        stage,
      })));

    for (const { floor, stage } of [...curriculumStages, ...encounterStages]) {
      expect(
        evaluateUnrevealedIdentityQuery(
          floor,
          stage,
          stage.answerSql,
          false,
        ),
        `${stage.id}: ${stage.answerSql}`,
      ).toBeNull();
    }
  });

  it("F1–F8 未揭名阶段拒绝 name/species 及其派生查询", () => {
    const select = LESSONS.find((lesson) => lesson.id === "select");
    if (!select) throw new Error("缺少 SELECT 课程");
    const stage = select.stages[0];
    const probes = [
      "SELECT name FROM monsters WHERE id = 1",
      "SELECT species FROM monsters WHERE id = 1",
      "SELECT weakness FROM monsters WHERE id = 1 AND name LIKE '史%'",
      "SELECT weakness FROM monsters WHERE id = 1 AND substr(name, 1, 1) = '史'",
      "SELECT weakness FROM monsters WHERE id = 1 AND length(species) = 5",
      "SELECT CASE WHEN name = '史莱姆' THEN weakness END FROM monsters WHERE id = 1",
      "SELECT COUNT(name) FROM monsters WHERE id = 1",
      "SELECT weakness FROM main.monsters WHERE id = 1 AND name = '史莱姆'",
      "SELECT m.weakness FROM \"main\".\"monsters\" AS m WHERE m.id = 1 AND m.species = 'projection_slime'",
    ];

    probes.forEach((sql) => {
      for (let floor = 1; floor <= 8; floor += 1) {
        expect(evaluateUnrevealedIdentityQuery(floor, stage, sql, false)).toMatchObject({
          accepted: false,
          kind: "wrong-result",
          attackTargetIds: [],
        });
      }
    });
  });

  it("身份防火墙不区分名字猜测，最终阶段也由击杀结算揭名", () => {
    const select = LESSONS.find((lesson) => lesson.id === "select");
    const innerJoin = LESSONS.find((lesson) => lesson.id === "inner-join");
    if (!select || !innerJoin) throw new Error("缺少 F1/F2 身份课程");

    const correctGuess = evaluateUnrevealedIdentityQuery(
      1,
      select.stages[0],
      "SELECT weakness FROM monsters WHERE id = 1 AND name = '史莱姆'",
      false,
    );
    const wrongGuess = evaluateUnrevealedIdentityQuery(
      1,
      select.stages[0],
      "SELECT weakness FROM monsters WHERE id = 1 AND name = '猎犬'",
      false,
    );
    expect(correctGuess).toEqual(wrongGuess);
    expect(evaluateUnrevealedIdentityQuery(
      1,
      select.stages[1],
      "SELECT id, status FROM monsters WHERE id = 1",
      false,
    )).toBeNull();
    const finalCorrectGuess = evaluateUnrevealedIdentityQuery(
      1,
      select.stages[1],
      "SELECT name FROM monsters WHERE id = 1 AND name = '史莱姆'",
      false,
    );
    const finalWrongGuess = evaluateUnrevealedIdentityQuery(
      1,
      select.stages[1],
      "SELECT name FROM monsters WHERE id = 1 AND name = '猎犬'",
      false,
    );
    expect(finalCorrectGuess).toEqual(finalWrongGuess);
    expect(finalCorrectGuess).not.toBeNull();
    expect(evaluateUnrevealedIdentityQuery(
      1,
      select.stages[1],
      "SELECT length(name) FROM monsters WHERE id = 1",
      false,
    )).not.toBeNull();
    expect(evaluateUnrevealedIdentityQuery(
      1,
      select.stages[1],
      "SELECT name, species FROM monsters WHERE id = 1",
      false,
    )).not.toBeNull();
    expect(evaluateUnrevealedIdentityQuery(
      2,
      innerJoin.stages[0],
      "SELECT r.name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 12",
      false,
    )).toBeNull();
  });

  it("房间名和装备名只允许直接投影，不能作为跨记录身份预言机", () => {
    const select = LESSONS.find((lesson) => lesson.id === "select");
    if (!select) throw new Error("缺少 SELECT 课程");
    const stage = select.stages[0];
    const gearGuess = (
      value: string,
    ) => `SELECT m.id, r.name AS room_name FROM monsters m
      INNER JOIN rooms r ON m.room_id = r.id
      INNER JOIN monster_gear secret
        ON secret.monster_id = 33 AND secret.gear_name = '${value}'
      WHERE m.id = 23`;
    const roomGuess = (
      value: string,
    ) => `SELECT m.id FROM monsters m INNER JOIN rooms r ON m.room_id = r.id
      WHERE m.id = 23 AND r.name = '${value}'`;

    expect(evaluateUnrevealedIdentityQuery(
      3,
      stage,
      "SELECT m.id, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 23",
      false,
    )).toBeNull();
    expect(evaluateUnrevealedIdentityQuery(
      3,
      stage,
      "SELECT g.gear_name FROM monster_gear g WHERE g.monster_id = 33",
      false,
    )).toBeNull();

    const correctGear = evaluateUnrevealedIdentityQuery(
      3,
      stage,
      gearGuess("墓主印"),
      false,
    );
    const wrongGear = evaluateUnrevealedIdentityQuery(
      3,
      stage,
      gearGuess("不存在"),
      false,
    );
    expect(correctGear).toEqual(wrongGear);
    expect(correctGear).not.toBeNull();

    const correctRoom = evaluateUnrevealedIdentityQuery(
      3,
      stage,
      roomGuess("墓主祭坛"),
      false,
    );
    const wrongRoom = evaluateUnrevealedIdentityQuery(
      3,
      stage,
      roomGuess("不存在"),
      false,
    );
    expect(correctRoom).toEqual(wrongRoom);
    expect(correctRoom).not.toBeNull();
    expect(evaluateUnrevealedIdentityQuery(
      3,
      stage,
      "SELECT r.name || '!' AS room_name FROM rooms r WHERE r.id = 50",
      false,
    )).not.toBeNull();
  });

  it("拒绝用 CTE 通配符重命名身份列，同时保留 COUNT(*)", () => {
    const select = LESSONS.find((lesson) => lesson.id === "select");
    if (!select) throw new Error("缺少 SELECT 课程");
    const stage = select.stages[0];
    const monsterWildcard = `WITH secret(
      id, room_id, hidden_name, hidden_species, hp, armor,
      status, weakness, master_id, is_boss
    ) AS (SELECT * FROM monsters)
    SELECT id FROM secret WHERE id = 1 AND hidden_name = '史莱姆'`;
    const gearWildcard = `WITH secret(id, monster_id, hidden_label, power) AS (
      SELECT g.* FROM monster_gear g
    ) SELECT id FROM secret WHERE monster_id = 33 AND hidden_label = '墓主印'`;

    expect(evaluateUnrevealedIdentityQuery(
      4,
      stage,
      monsterWildcard,
      false,
    )).not.toBeNull();
    expect(evaluateUnrevealedIdentityQuery(
      4,
      stage,
      gearWildcard,
      false,
    )).not.toBeNull();
    expect(evaluateUnrevealedIdentityQuery(
      1,
      stage,
      "SELECT COUNT(*) AS total FROM monsters",
      false,
    )).toBeNull();
  });

  it("前两层越级门同样拒绝用身份字段构造布尔预言机", () => {
    const gateAnswer = "SELECT m.id FROM monsters m INNER JOIN monster_signals s ON m.id = s.monster_id GROUP BY m.id";
    const correctGuess = unrevealedIdentityQueryMessage(
      1,
      gateAnswer,
      "SELECT m.id FROM monsters m WHERE m.name = '史莱姆'",
      false,
    );
    const wrongGuess = unrevealedIdentityQueryMessage(
      1,
      gateAnswer,
      "SELECT m.id FROM monsters m WHERE m.name = '猎犬'",
      false,
    );
    expect(correctGuess).toBeTruthy();
    expect(correctGuess).toBe(wrongGuess);
  });

  it("突发遭遇题仍检查真实结果与对应 SQL 核心", () => {
    const stage = practiceStageFor(7);
    if (!stage) throw new Error("缺少 WHERE 突发遭遇题");
    const exact = makeResult(
      "SELECT id FROM monsters WHERE room_id = 12 AND status = 'wet'",
      ["id"],
      [{ id: 7 }],
      [7],
    );
    const bypass = makeResult(
      "SELECT id FROM monsters WHERE id = 7",
      ["id"],
      [{ id: 7 }],
      [7],
    );
    expect(evaluateStage(stage, exact).accepted).toBe(true);
    expect(evaluateStage(stage, bypass).accepted).toBe(false);
  });
  it("SELECT 两阶段先读弱点，再用公开字段完成致命一击", () => {
    const identity = makeResult(
      "select id, status from monsters where id=1",
      ["id", "status"],
      [{ id: 1, status: "idle" }],
      [1],
    );
    const weakness = makeResult(
      "SELECT weakness FROM monsters WHERE id = 1",
      ["weakness"],
      [{ weakness: "slash" }],
    );
    expect(evaluateLesson("select", 0, weakness).accepted).toBe(true);
    expect(evaluateLesson("select", 1, identity).accepted).toBe(true);
    expect(evaluateLesson("select", 1, weakness).accepted).toBe(false);
  });

  it("SELECT 接受表别名限定的等价列引用", () => {
    const actual = makeResult(
      "SELECT m.weakness FROM monsters AS m WHERE m.id = 1",
      ["weakness"],
      [{ weakness: "slash" }],
    );
    expect(evaluateLesson("select", 0, actual).accepted).toBe(true);
  });

  it("硬编码结果缺少来源表时不能通过 SELECT", () => {
    const actual = makeResult(
      "SELECT 'slash' AS weakness",
      ["weakness"],
      [{ weakness: "slash" }],
    );
    expect(evaluateLesson("select", 0, actual).accepted).toBe(false);
  });

  it("WHERE 第一阶段拒绝多余行", () => {
    const actual = makeResult(
      "SELECT id FROM monsters WHERE room_id >= 1 AND status = 'escaped'",
      ["id"],
      [{ id: 2 }, { id: 3 }],
      [2, 3],
    );
    expect(evaluateLesson("where", 0, actual).kind).toBe("wrong-result");
  });

  it("WHERE 与 IS NULL 拒绝 OR + 直接 id 的伪条件绕过", () => {
    const whereBypass = makeResult(
      "SELECT id FROM monsters WHERE id=2 OR (room_id=2 AND status='bogus')",
      ["id"],
      [{ id: 2 }],
      [2],
    );
    const nullBypass = makeResult(
      "SELECT id FROM monsters WHERE id=3 OR (room_id=3 AND master_id IS NULL AND 0)",
      ["id"],
      [{ id: 3 }],
      [3],
    );
    expect(evaluateLesson("where", 0, whereBypass).accepted).toBe(false);
    expect(evaluateLesson("is-null", 0, nullBypass).accepted).toBe(false);
  });

  it("WHERE 第二阶段拒绝额外投影与恒真条件伪装", () => {
    const actual = makeResult(
      "SELECT weakness, name, status FROM monsters WHERE id = 2 AND 1 = 1",
      ["weakness", "name", "status"],
      [{ weakness: "focus", name: "水史莱姆", status: "escaped" }],
      [2],
    );
    expect(evaluateLesson("where", 1, actual).accepted).toBe(false);
  });

  it("WHERE 第二阶段接受按 id 与状态返回 weakness", () => {
    const actual = makeResult(
      "SELECT weakness FROM monsters WHERE id = 2 AND status = 'escaped'",
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

  it("IS NULL 第二阶段必须返回无主诅咒怪物的 id", () => {
    const actual = makeResult(
      "SELECT id FROM monsters WHERE master_id IS NULL AND status = 'cursed'",
      ["id"],
      [{ id: 3 }],
      [3],
    );
    expect(evaluateLesson("is-null", 1, actual).accepted).toBe(true);
  });

  it("GROUP BY 接受调换列顺序且忽略结果行顺序", () => {
    const actual = makeResult(
      "SELECT COUNT(*) AS total, channel FROM monster_signals WHERE monster_id=4 GROUP BY channel",
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
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id=5 GROUP BY channel HAVING COUNT(*) >= 2",
      ["channel", "total"],
      [
        { channel: "echo", total: 3 },
        { channel: "ward", total: 2 },
      ],
    );
    const core = makeResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id=5 GROUP BY channel HAVING COUNT(*) >= 3",
      ["channel", "total"],
      [{ channel: "echo", total: 3 }],
    );
    expect(evaluateLesson("having", 0, shield).accepted).toBe(true);
    expect(evaluateLesson("having", 1, core).accepted).toBe(true);
    expect(evaluateLesson("having", 1, shield).accepted).toBe(false);
  });

  it("HAVING 接受使用题目要求的 total 别名过滤", () => {
    const shield = makeResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id=5 GROUP BY channel HAVING total >= 2",
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
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id=5 AND channel='echo' GROUP BY channel HAVING 1 = 1",
      ["channel", "total"],
      [{ channel: "echo", total: 3 }],
    );
    expect(evaluateLesson("having", 1, actual).accepted).toBe(false);
  });

  it("第二层 ORDER BY / LIMIT 同时校验顺序与返回行", () => {
    const peak = makeResult(
      "SELECT channel FROM monster_signals WHERE monster_id = 10 ORDER BY charge DESC LIMIT 1",
      ["channel"],
      [{ channel: "surge" }],
    );
    const wrongDirection = makeResult(
      "SELECT channel FROM monster_signals WHERE monster_id = 10 ORDER BY charge ASC LIMIT 1",
      ["channel"],
      [{ channel: "surge" }],
    );
    expect(evaluateLesson("order-by", 0, peak).accepted).toBe(true);
    expect(evaluateLesson("order-by", 0, wrongDirection).accepted).toBe(false);
  });

  it("第二层 DISTINCT 必须真正去重并按要求排序", () => {
    const exact = makeResult(
      "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 11 ORDER BY channel",
      ["channel"],
      [{ channel: "echo" }, { channel: "mirror" }],
    );
    const withoutDistinct = makeResult(
      "SELECT channel FROM monster_signals WHERE monster_id = 11 ORDER BY channel",
      ["channel"],
      [{ channel: "echo" }, { channel: "mirror" }],
    );
    expect(evaluateLesson("distinct", 0, exact).accepted).toBe(true);
    expect(evaluateLesson("distinct", 0, withoutDistinct).accepted).toBe(false);
  });

  it("第二层 INNER JOIN 必须使用真实表关系，不能用恒真 ON 绕过", () => {
    const exact = makeResult(
      "SELECT m.id, r.sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 12",
      ["id", "sector"],
      [{ id: 12, sector: "forest" }],
    );
    const bypass = makeResult(
      "SELECT m.id, r.sector FROM monsters m INNER JOIN rooms r ON 1 = 1 WHERE m.id = 12 AND r.id = 23",
      ["id", "sector"],
      [{ id: 12, sector: "forest" }],
    );
    expect(evaluateLesson("inner-join", 0, exact).accepted).toBe(true);
    expect(evaluateLesson("inner-join", 0, bypass).accepted).toBe(false);
  });

  it("第二层 INNER JOIN 写成 m.id = r.id 时明确指出正确连接键", () => {
    const wrongRelation = makeResult(
      "SELECT m.id, r.sector FROM monsters m INNER JOIN rooms r ON m.id = r.id WHERE m.id = 12",
      ["id", "sector"],
      [{ id: 12, sector: "archive" }],
    );
    const evaluation = evaluateLesson("inner-join", 0, wrongRelation);
    expect(evaluation.accepted).toBe(false);
    expect(evaluation.message).toContain("ON m.room_id = r.id");
    expect(evaluation.message).not.toContain("改名为 monster_id");
  });

  it("第二层 INNER JOIN 拒绝把 monsters.id 改名为 monster_id，并明确房间 name 的别名", () => {
    const misleadingAlias = makeResult(
      "SELECT m.id AS monster_id, r.sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 12",
      ["monster_id", "sector"],
      [{ monster_id: 12, sector: "forest" }],
    );
    const finalIdentity = makeResult(
      "SELECT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 12",
      ["id", "room_name"],
      [{ id: 12, room_name: "古树桥" }],
      [12],
    );

    expect(evaluateLesson("inner-join", 0, misleadingAlias).accepted).toBe(false);
    expect(evaluateLesson("inner-join", 1, finalIdentity).accepted).toBe(true);
  });

  it("第二层 LEFT JOIN 使用右表 NULL 找出未装备怪物", () => {
    const exact = makeResult(
      "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 24 AND g.monster_id IS NULL",
      ["id"],
      [{ id: 13 }],
      [13],
    );
    expect(evaluateLesson("left-join", 0, exact).accepted).toBe(true);
  });

  it("第二层 Boss 第一击只检查明确的房间连接，第二击才进入复合题", () => {
    const exact = makeResult(
      "SELECT m.id, r.sector FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 14",
      ["id", "sector"],
      [{ id: 14, sector: "lighthouse" }],
    );
    expect(evaluateLesson("join-boss", 0, exact).accepted).toBe(true);
    expect(lessonById("join-boss").stages[0].requiredFeatures).toEqual(["join", "on"]);
    expect(lessonById("join-boss").stages[1].requiredFeatures).toEqual([
      "join",
      "order-by",
      "limit",
    ]);
  });

  it("第二层区域 Boss 使用信号复合题，并在最终阶段返回 ID 与房间名", () => {
    const lakeStages = practiceStagesFor(21);
    const frogStages = practiceStagesFor(22);
    const lakeScan = makeResult(
      "SELECT channel, charge FROM monster_signals WHERE monster_id = 21 ORDER BY charge DESC LIMIT 2",
      ["channel", "charge"],
      [{ channel: "surge", charge: 14 }, { channel: "surge", charge: 13 }],
    );
    const lakeChannels = makeResult(
      "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 21 ORDER BY channel",
      ["channel"],
      [{ channel: "deep" }, { channel: "surge" }, { channel: "wake" }],
    );
    const frogIdentity = makeResult(
      "SELECT DISTINCT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE r.floor = 2 AND m.id = 22 ORDER BY m.id",
      ["id", "room_name"],
      [{ id: 22, room_name: "泥冠宫" }],
      [22],
    );

    expect(evaluateStage(lakeStages[0], lakeScan).accepted).toBe(true);
    expect(evaluateStage(lakeStages[1], lakeChannels).accepted).toBe(true);
    expect(evaluateStage(frogStages[1], frogIdentity).accepted).toBe(true);
  });
});
