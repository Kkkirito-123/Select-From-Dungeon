import { describe, expect, it } from "vitest";
import { BIOME_ENCOUNTERS } from "../src/content/world/biomeContent";
import { INITIAL_MONSTERS, LESSONS } from "../src/content/curriculum/mvpLevel";
import { GameSession } from "../src/domain/session/GameSession";
import { detectQueryFeatures } from "../src/domain/learning/lessonEvaluator";
import { redactUndiscoveredQueryIdentities } from "../src/domain/learning/queryDisclosure";
import type { LessonId, SqlQueryResult } from "../src/domain/shared/types";
import { createEmptyProfile } from "../src/infrastructure/storage/localProgress";

function result(
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
    plan: ["SEARCH teaching fixture"],
    baseHeat: 3,
    features: detectQueryFeatures(sql),
  };
}

function roomIdForLesson(session: GameSession, lessonId: LessonId): string {
  const room = session.snapshot().roomGraph.nodes.find(
    (node) => node.lessonId === lessonId,
  );
  if (!room) throw new Error(`缺少课程房：${lessonId}`);
  return room.id;
}

function enterLesson(session: GameSession, lessonId: LessonId): void {
  const roomId = roomIdForLesson(session, lessonId);
  expect(session.travelToRoom(roomId).ok).toBe(true);
  const actor = session.snapshot().worldActors.find(
    (entry) => entry.roomNodeId === roomId,
  );
  if (!actor) throw new Error(`缺少课程怪物：${lessonId}`);
  expect(session.setPlayerPosition(actor.x, actor.y)).toBe(true);
  expect(session.snapshot().mode).toBe("combat");
}

describe("查询结果披露等级", () => {
  it("所有课程与区域战文案在击杀前只使用 ID，不提前写出对应怪物名字", () => {
    const violations: string[] = [];
    LESSONS.forEach((lesson) => {
      const monster = INITIAL_MONSTERS.find(
        (entry) => entry.id === lesson.primaryMonsterId,
      );
      if (!monster) return;
      const copy = [
        lesson.title,
        lesson.intro,
        ...lesson.stages.flatMap((stage) => [
          stage.objective,
          ...stage.hints,
        ]),
      ].join("\n");
      if (copy.includes(monster.name)) {
        violations.push(`${lesson.id}:${monster.name}`);
      }
    });
    BIOME_ENCOUNTERS.forEach((encounter) => {
      const monster = INITIAL_MONSTERS.find(
        (entry) => entry.id === encounter.monsterId,
      );
      if (!monster) return;
      const copy = encounter.stages.flatMap((stage) => [
        stage.objective,
        ...stage.hints,
      ]).join("\n");
      if (copy.includes(monster.name)) {
        violations.push(`biome:${encounter.monsterId}:${monster.name}`);
      }
    });
    expect(violations).toEqual([]);
  });

  it("SQLite 执行前封存身份预言机，致命一击也由结算揭名", () => {
    const session = new GameSession(null, null, "identity-query-preflight");
    enterLesson(session, "select");

    const firstCorrectGuess = session.validateCombatQuery(
      "SELECT weakness FROM monsters WHERE id = 1 AND name = '史莱姆'",
    );
    const firstWrongGuess = session.validateCombatQuery(
      "SELECT weakness FROM monsters WHERE id = 1 AND name = '猎犬'",
    );
    expect(firstCorrectGuess).toEqual(firstWrongGuess);
    expect(firstCorrectGuess).toMatchObject({ ok: false });
    expect(session.validateCombatQuery(
      "SELECT weakness FROM monsters WHERE id = 1",
    )).toEqual({ ok: true });

    session.resolveQuery(result(
      "SELECT weakness FROM monsters WHERE id = 1",
      ["weakness"],
      [{ weakness: "slash" }],
    ));
    expect(session.validateCombatQuery(
      "SELECT id, status FROM monsters WHERE id = 1",
    )).toEqual({ ok: true });
    expect(session.validateCombatQuery(
      "SELECT name FROM monsters WHERE id = 1 AND name LIKE '史%'",
    )).toMatchObject({ ok: false });
    expect(session.validateCombatQuery(
      "SELECT CASE WHEN species = 'projection_slime' THEN name END FROM monsters WHERE id = 1",
    )).toMatchObject({ ok: false });
    expect(session.validateCombatQuery(
      "SELECT weakness FROM main.monsters WHERE id = 1 AND name = '史莱姆'",
    )).toMatchObject({ ok: false });
    expect(session.validateCombatQuery(
      "SELECT m.weakness FROM \"main\".\"monsters\" AS m WHERE m.id = 1 AND m.species = 'projection_slime'",
    )).toMatchObject({ ok: false });
  });

  it("未揭名身份猜测无论命中与否都得到相同封存反馈", () => {
    const probe = (guess: string, matched: boolean) => {
      const session = new GameSession(null, null, "identity-oracle-closed");
      enterLesson(session, "select");
      return session.resolveQuery(result(
        `SELECT weakness FROM monsters WHERE id = 1 AND name = '${guess}'`,
        ["weakness"],
        matched ? [{ weakness: "slash" }] : [],
        matched ? [1] : [],
      ));
    };

    const correctGuess = probe("史莱姆", true);
    const wrongGuess = probe("猎犬", false);

    expect(correctGuess).toEqual(wrongGuess);
    expect(correctGuess).toMatchObject({
      accepted: false,
      resultDisclosure: "shape-only",
      queryTargetIds: [],
      attackTargetIds: [],
      playerDamage: 1,
      stageAdvanced: false,
    });
  });

  it("当前目标已揭名时仍不能借子查询猜测本层其他未揭名记录", () => {
    const profile = createEmptyProfile();
    profile.discoveredMonsterIds = [1];
    const session = new GameSession(null, profile, "identity-cross-record-oracle");
    enterLesson(session, "select");

    const correctGuess = session.validateCombatQuery(
      "SELECT weakness FROM monsters WHERE id = 1 AND EXISTS (SELECT 1 FROM monsters WHERE id = 2 AND name = '水史莱姆')",
    );
    const wrongGuess = session.validateCombatQuery(
      "SELECT weakness FROM monsters WHERE id = 1 AND EXISTS (SELECT 1 FROM monsters WHERE id = 2 AND name = '不存在')",
    );

    expect(correctGuess).toEqual(wrongGuess);
    expect(correctGuess).toMatchObject({ ok: false });
  });

  it("错误查询只披露结构，非最终正确查询披露安全值，致命一击才披露完整值", () => {
    const session = new GameSession(null, null, "query-disclosure-levels");
    enterLesson(session, "select");

    const wrong = session.resolveQuery(result(
      "SELECT name FROM monsters",
      ["name"],
      [{ name: "史莱姆" }, { name: "猎犬" }],
    ));
    expect(wrong).toMatchObject({
      accepted: false,
      resultDisclosure: "shape-only",
      experience: null,
    });

    const firstHit = session.resolveQuery(result(
      "SELECT weakness FROM monsters WHERE id = 1",
      ["weakness"],
      [{ weakness: "slash" }],
    ));
    expect(firstHit).toMatchObject({
      accepted: true,
      resultDisclosure: "safe-values",
      lessonCompleted: null,
      experience: null,
    });
    expect(session.snapshot().profile.discoveredMonsterIds).not.toContain(1);

    const finishingBlow = session.resolveQuery(result(
      "SELECT id, status FROM monsters WHERE id = 1",
      ["id", "status"],
      [{ id: 1, status: "idle" }],
      [1],
    ));
    expect(finishingBlow).toMatchObject({
      accepted: true,
      resultDisclosure: "full-values",
      lessonCompleted: "select",
      experience: { monsterId: 1 },
    });
    expect(session.snapshot().profile.discoveredMonsterIds).toContain(1);
  });
});

describe("未发现身份的查询结果脱敏", () => {
  it("隐藏 name、species 与嵌入文本，同时保留数字且不修改原始判题结果", () => {
    const session = new GameSession(null, null, "query-disclosure-redaction");
    const monsters = session.snapshot().monsters;
    const monster = monsters.find((entry) => entry.id === 1);
    if (!monster) throw new Error("缺少 ID #001 测试怪物");

    const source = result(
      "SELECT name, species, location, gear, hp FROM monsters WHERE id = 1",
      ["name", "species", "location", "gear", "hp"],
      [{
        name: monster.name,
        species: monster.species,
        location: `${monster.name}之巢`,
        gear: `${monster.species}核心`,
        hp: 12,
      }],
      [monster.id],
    );

    const redacted = redactUndiscoveredQueryIdentities(source, monsters, []);

    expect(redacted.rows).toEqual([{
      name: "ID #001",
      species: "未识别类型",
      location: "未识别记录之巢",
      gear: "未识别类型核心",
      hp: 12,
    }]);
    expect(redacted.targetIds).toEqual([1]);
    expect(redacted).not.toBe(source);
    expect(redacted.rows).not.toBe(source.rows);
    expect(source.rows).toEqual([{
      name: monster.name,
      species: monster.species,
      location: `${monster.name}之巢`,
      gear: `${monster.species}核心`,
      hp: 12,
    }]);
  });

  it("身份已发现后保留 name、species 与嵌入文本", () => {
    const session = new GameSession(null, null, "query-disclosure-known");
    const monsters = session.snapshot().monsters;
    const monster = monsters.find((entry) => entry.id === 1);
    if (!monster) throw new Error("缺少 ID #001 测试怪物");

    const source = result(
      "SELECT name, species, note, hp FROM monsters WHERE id = 1",
      ["name", "species", "note", "hp"],
      [{
        name: monster.name,
        species: monster.species,
        note: `${monster.name} / ${monster.species}`,
        hp: 12,
      }],
      [monster.id],
    );

    const visible = redactUndiscoveredQueryIdentities(
      source,
      monsters,
      [monster.id],
    );

    expect(visible.rows).toEqual(source.rows);
    expect(visible.rows[0]?.hp).toBe(12);
  });

  it("嵌入文本优先替换较长名称，避免水史莱姆被拆成水加未识别记录", () => {
    const session = new GameSession(null, null, "query-disclosure-overlap");
    const monsters = session.snapshot().monsters;
    const source = result(
      "SELECT note FROM monsters WHERE id = 2",
      ["note"],
      [{ note: "水史莱姆巢穴" }],
      [2],
    );

    expect(redactUndiscoveredQueryIdentities(source, monsters, []).rows)
      .toEqual([{ note: "未识别记录巢穴" }]);
  });
});
