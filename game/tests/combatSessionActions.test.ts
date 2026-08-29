import { describe, expect, it } from "vitest";
import {
  appendAnswerRecord,
  applyPlayerDamage,
  awardExperience,
  beginBattleReview,
  describeExperience,
  preparePracticeBattle,
  recentEncounterMonsterIds,
  type PracticeDrawStates,
} from "../src/domain/session/combat";
import { DATA_BLADE } from "../src/content/curriculum/mvpLevel";
import type {
  AnswerAttemptRecord,
  Monster,
  PlayerState,
} from "../src/domain/shared/types";

function player(): PlayerState {
  return {
    x: 0,
    y: 0,
    hp: 1,
    maxHp: 2,
    level: 1,
    xp: 1,
    heat: 0,
    weapon: { ...DATA_BLADE },
    armor: null,
    armorHp: 0,
  };
}

function monster(rank: Monster["rank"] = "elite"): Monster {
  return {
    floor: 1,
    id: 42,
    lessonId: "select",
    roomId: 1,
    name: "测试怪物",
    species: "fixture",
    kind: "projection-slime",
    x: 0,
    y: 0,
    hp: 10,
    maxHp: 10,
    armor: 0,
    damage: 1,
    attackName: "测试反击",
    status: "idle",
    weakness: null,
    masterId: null,
    isBoss: false,
    rank,
    encounterType: "ambush",
  };
}

function answer(battleId: number, monsterId: number): AnswerAttemptRecord {
  return {
    id: battleId,
    battleId,
    floor: 1,
    monsterId,
    monsterName: `ID #${monsterId}`,
    lessonId: "select",
    stageId: "question:fixture",
    stageObjective: "fixture",
    round: 1,
    sql: "SELECT 1",
    answerSql: "SELECT 1",
    result: "correct",
    outcome: "hit",
    feedback: "ok",
    hintLevel: 0,
  };
}

describe("session combat package", () => {
  it("absorbs armor before player health", () => {
    const state = { hp: 2, armorHp: 1 };
    expect(applyPlayerDamage(state, 2)).toEqual({ playerDamage: 1, armorDamage: 1 });
    expect(state).toEqual({ hp: 1, armorHp: 0 });
  });

  it("settles XP and describes a level-up without owning session mode", () => {
    const state = player();
    const settlement = awardExperience(monster("elite"), state);
    expect(settlement).toMatchObject({
      gained: 3,
      previousXp: 1,
      currentXp: 4,
      previousLevel: 1,
      currentLevel: 3,
      currentMaxHp: 3,
    });
    expect(state).toMatchObject({ xp: 4, level: 3, maxHp: 3, hp: 2 });
    expect(describeExperience(settlement)).toContain("升至 LV.3");
  });

  it("advances review ids, clones records, and returns distinct recent encounters", () => {
    const review = { battleSequence: 0, reviewBattleId: null };
    expect(beginBattleReview(review)).toBe(1);
    expect(review).toEqual({ battleSequence: 1, reviewBattleId: 1 });
    const records: AnswerAttemptRecord[] = [];
    const first = answer(1, 42);
    appendAnswerRecord(records, first);
    appendAnswerRecord(records, answer(1, 43));
    appendAnswerRecord(records, answer(2, 44));
    first.feedback = "mutated";
    expect(records[0].feedback).toBe("ok");
    expect(recentEncounterMonsterIds(records, 2)).toEqual([44, 43]);
  });

  it("returns a reset practice state when no question bank is configured", () => {
    const states: PracticeDrawStates = {
      L1: { cursor: 4, cycle: 1 },
      L2: { cursor: 2, cycle: 3 },
      L3: { cursor: 1, cycle: 5 },
    };
    const preparation = preparePracticeBattle({
      questionBank: null,
      floor: 1,
      runInstanceId: "fixture",
      monster: monster("normal"),
      practiceDrawStates: states,
      masteredLessons: new Set(),
      completedLessons: new Set(),
      graph: { nodes: [] },
      roomAccessMessage: () => null,
    });
    expect(preparation).toEqual({
      activePracticeMonsterId: null,
      activePracticeQuestionIds: [],
      practiceDrawStates: states,
    });
  });
});
