import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/GameSession";
import { detectQueryFeatures } from "../src/domain/lessonEvaluator";
import { isMazeWalkable } from "../src/domain/mazeGenerator";
import type {
  GroundItem,
  LessonId,
  Position,
  SqlQueryResult,
} from "../src/domain/types";

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

function key(position: Position): string {
  return `${position.x}:${position.y}`;
}

function teachingResult(
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
    plan: ["SEARCH physical run fixture"],
    baseHeat: 3,
    features: detectQueryFeatures(sql),
  };
}

const LESSON_QUERIES: Record<LessonId, SqlQueryResult[]> = {
  select: [
    teachingResult(
      "SELECT name FROM monsters WHERE id = 101",
      ["name"],
      [{ name: "史莱姆" }],
    ),
    teachingResult(
      "SELECT weakness FROM monsters WHERE id = 101",
      ["weakness"],
      [{ weakness: "slash" }],
    ),
  ],
  where: [
    teachingResult(
      "SELECT id FROM monsters WHERE room_id = 2 AND status = 'escaped'",
      ["id"],
      [{ id: 201 }],
      [201],
    ),
    teachingResult(
      "SELECT weakness FROM monsters WHERE name = '猎犬' AND status = 'escaped'",
      ["weakness"],
      [{ weakness: "focus" }],
    ),
  ],
  "is-null": [
    teachingResult(
      "SELECT id FROM monsters WHERE room_id = 3 AND master_id IS NULL",
      ["id"],
      [{ id: 301 }],
      [301],
    ),
    teachingResult(
      "SELECT name FROM monsters WHERE master_id IS NULL AND status = 'cursed'",
      ["name"],
      [{ name: "幽灵" }],
    ),
  ],
  "group-by": [
    teachingResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 800 GROUP BY channel",
      ["channel", "total"],
      [
        { channel: "echo", total: 3 },
        { channel: "noise", total: 1 },
      ],
    ),
  ],
  having: [
    teachingResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 900 GROUP BY channel HAVING COUNT(*) >= 2",
      ["channel", "total"],
      [
        { channel: "echo", total: 3 },
        { channel: "ward", total: 2 },
      ],
    ),
    teachingResult(
      "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 900 GROUP BY channel HAVING COUNT(*) >= 3",
      ["channel", "total"],
      [{ channel: "echo", total: 3 }],
    ),
  ],
  "order-by": [
    teachingResult(
      "SELECT channel FROM monster_signals WHERE monster_id = 1200 ORDER BY charge DESC LIMIT 1",
      ["channel"],
      [{ channel: "surge" }],
    ),
    teachingResult(
      "SELECT channel, charge FROM monster_signals WHERE monster_id = 1200 ORDER BY charge DESC LIMIT 2",
      ["channel", "charge"],
      [
        { channel: "surge", charge: 13 },
        { channel: "arc", charge: 11 },
      ],
    ),
  ],
  distinct: [
    teachingResult(
      "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 1300 ORDER BY channel",
      ["channel"],
      [{ channel: "echo" }, { channel: "mirror" }],
    ),
  ],
  "inner-join": [
    teachingResult(
      "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 1400",
      ["name", "room_name"],
      [{ name: "蛛后", room_name: "双表桥" }],
    ),
    teachingResult(
      "SELECT m.name, r.sector FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 1400",
      ["name", "sector"],
      [{ name: "蛛后", sector: "bridge" }],
    ),
  ],
  "left-join": [
    teachingResult(
      "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 24 AND g.monster_id IS NULL",
      ["id"],
      [{ id: 1500 }],
      [1500],
    ),
  ],
  "join-boss": [
    teachingResult(
      "SELECT r.sector, COUNT(*) AS total FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE r.floor = 2 GROUP BY r.sector HAVING COUNT(*) >= 2 ORDER BY total DESC",
      ["sector", "total"],
      [
        { sector: "ambush", total: 4 },
        { sector: "storm", total: 2 },
      ],
    ),
    teachingResult(
      "SELECT m.name, g.power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 1900 ORDER BY g.power DESC LIMIT 1",
      ["name", "power"],
      [{ name: "雷王", power: 21 }],
    ),
  ],
};

const AMBUSH_QUERIES: Record<number, SqlQueryResult> = {
  111: teachingResult(
    "SELECT name FROM monsters WHERE id = 111",
    ["name"],
    [{ name: "幻影" }],
  ),
  211: teachingResult(
    "SELECT id FROM monsters WHERE room_id = 12 AND status = 'lurking'",
    ["id"],
    [{ id: 211 }],
    [211],
  ),
  311: teachingResult(
    "SELECT name FROM monsters WHERE master_id IS NULL AND status = 'faded'",
    ["name"],
    [{ name: "鬼火" }],
  ),
  810: teachingResult(
    "SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 810 GROUP BY channel",
    ["channel", "total"],
    [
      { channel: "echo", total: 2 },
      { channel: "noise", total: 2 },
    ],
  ),
  1210: teachingResult(
    "SELECT channel FROM monster_signals WHERE monster_id = 1210 ORDER BY charge DESC LIMIT 1",
    ["channel"],
    [{ channel: "surge" }],
  ),
  1310: teachingResult(
    "SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 1310 ORDER BY channel",
    ["channel"],
    [{ channel: "echo" }, { channel: "mirror" }],
  ),
  1410: teachingResult(
    "SELECT m.name, r.name AS room_name FROM monsters m INNER JOIN rooms r ON m.room_id = r.id WHERE m.id = 1410",
    ["name", "room_name"],
    [{ name: "幼蛛", room_name: "伏击桥" }],
  ),
  1510: teachingResult(
    "SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 34 AND g.monster_id IS NULL",
    ["id"],
    [{ id: 1510 }],
    [1510],
  ),
};

function pathToAny(session: GameSession, goals: readonly Position[]): Position[] {
  const snapshot = session.snapshot();
  const completed = new Set(snapshot.completedLessons);
  const livingActors = new Set(snapshot.worldActors.flatMap((actor) => {
    const alive = snapshot.monsters.some(
      (monster) => monster.id === actor.monsterId && monster.hp > 0,
    );
    return alive ? [key(actor)] : [];
  }));
  const goalKeys = new Set(goals.map(key));
  const start = { x: snapshot.player.x, y: snapshot.player.y };
  const pending: Position[] = [start];
  const previous = new Map<string, { from: string; step: Position }>();
  const visited = new Set([key(start)]);
  let reached: string | null = goalKeys.has(key(start)) ? key(start) : null;

  while (!reached && pending.length > 0) {
    const current = pending.shift();
    if (!current) break;
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next);
      if (
        visited.has(nextKey) ||
        livingActors.has(nextKey) ||
        !isMazeWalkable(snapshot.mazeFloor, next.x, next.y, completed)
      ) continue;
      visited.add(nextKey);
      previous.set(nextKey, { from: key(current), step: direction });
      if (goalKeys.has(nextKey)) {
        reached = nextKey;
        break;
      }
      pending.push(next);
    }
  }

  if (!reached) throw new Error(`没有纯步行路径可到达：${[...goalKeys].join(", ")}`);
  const path: Position[] = [];
  let cursor = reached;
  while (cursor !== key(start)) {
    const link = previous.get(cursor);
    if (!link) throw new Error(`路径回溯失败：${cursor}`);
    path.unshift(link.step);
    cursor = link.from;
  }
  return path;
}

function walkPath(session: GameSession, path: readonly Position[]): void {
  path.forEach((step) => {
    const move = session.attemptPlayerMove(step.x, step.y);
    expect(move, move.message).toMatchObject({ ok: true, moved: true });
    if (move.encounterId !== null) {
      const query = AMBUSH_QUERIES[move.encounterId];
      if (!query) throw new Error(`突发遭遇没有测试查询：${move.encounterId}`);
      const resolution = session.resolveQuery(query);
      expect(resolution.accepted, resolution.message).toBe(true);
      expect(session.snapshot().mode).toBe("explore");
    }
  });
}

function walkTo(session: GameSession, destination: Position): void {
  walkPath(session, pathToAny(session, [destination]));
  expect(session.snapshot().player).toMatchObject({
    x: destination.x,
    y: destination.y,
  });
}

function engageLessonByWalking(session: GameSession, lessonId: LessonId): void {
  const snapshot = session.snapshot();
  const monster = snapshot.monsters.find((entry) => entry.lessonId === lessonId);
  if (!monster) throw new Error(`缺少课程怪物：${lessonId}`);
  const actor = snapshot.worldActors.find((entry) => entry.monsterId === monster.id);
  if (!actor) throw new Error(`缺少课程 Actor：${lessonId}`);
  const adjacent = DIRECTIONS.map((direction) => ({
    x: actor.x + direction.x,
    y: actor.y + direction.y,
  })).filter((position) => isMazeWalkable(
    snapshot.mazeFloor,
    position.x,
    position.y,
    new Set(snapshot.completedLessons),
  ));
  walkPath(session, pathToAny(session, adjacent));
  const player = session.snapshot().player;
  const encounter = session.attemptPlayerMove(actor.x - player.x, actor.y - player.y);
  expect(encounter).toMatchObject({ ok: true, moved: false, encounterId: monster.id });
  expect(session.snapshot()).toMatchObject({ mode: "combat", lessonId });
}

function collectItemByWalking(session: GameSession, item: GroundItem): void {
  walkTo(session, item);
  if (item.collection === "interact") {
    expect(session.interact()).toMatchObject({ ok: true });
  } else {
    expect(session.snapshot().groundItems.some((entry) => entry.id === item.id)).toBe(false);
  }
}

function clearLessonByWalking(session: GameSession, lessonId: LessonId): void {
  engageLessonByWalking(session, lessonId);
  const queries = LESSON_QUERIES[lessonId];
  queries.forEach((query, index) => {
    const resolution = session.resolveQuery(query);
    expect(resolution.accepted, resolution.message).toBe(true);
    expect(resolution.lessonCompleted).toBe(index === queries.length - 1 ? lessonId : null);
  });
  const snapshot = session.snapshot();
  const monster = snapshot.monsters.find((entry) => entry.lessonId === lessonId);
  const bundle = snapshot.lootBundles.find(
    (entry) => entry.sourceMonsterId === monster?.id,
  );
  if (!bundle) throw new Error(`${lessonId} 应产生课程战利品包`);
  walkTo(session, bundle);
  expect(session.interact()).toMatchObject({ ok: true, kind: "loot-bundle" });
  const protectedWeapon = bundle.items.find((item) => item.kind === "weapon" && item.protected);
  if (protectedWeapon) {
    expect(session.takeLootItem(bundle.id, protectedWeapon.dropId, "equip").ok).toBe(true);
  }
  if (session.snapshot().mode === "loot") {
    expect(session.takeAllLoot(bundle.id).ok).toBe(true);
  }
  if (session.snapshot().mode === "loot") session.closeLootBundle();
}

function collectAggregateHammer(session: GameSession): void {
  const hammer = session.snapshot().groundItems.find(
    (item) => item.rewardId === "aggregate-hammer",
  );
  if (!hammer) throw new Error("聚合战锤没有生成在物理迷宫中");
  collectItemByWalking(session, hammer);
  expect(session.snapshot().player.weapon.id).toBe("aggregate-hammer");
}

describe("continuous physical maze run", () => {
  it.each([
    ["where", "is-null"],
    ["is-null", "where"],
  ] as const)("分支顺序 %s → %s 不依赖调试传送也能贯通两层", (first, second) => {
    const session = new GameSession(null, null, `physical-${first}-${second}`);
    clearLessonByWalking(session, "select");
    clearLessonByWalking(session, first);
    clearLessonByWalking(session, second);
    collectAggregateHammer(session);
    clearLessonByWalking(session, "group-by");
    clearLessonByWalking(session, "having");

    expect(session.snapshot()).toMatchObject({ mode: "transition", floor: 1 });
    expect(session.advanceFloor()).toBe(true);
    expect(session.snapshot()).toMatchObject({ mode: "explore", floor: 2 });

    clearLessonByWalking(session, "order-by");
    clearLessonByWalking(session, "distinct");
    clearLessonByWalking(session, "inner-join");
    clearLessonByWalking(session, "left-join");
    clearLessonByWalking(session, "join-boss");

    expect(session.snapshot().mode).toBe("victory");
    expect(session.snapshot().completedLessons).toEqual([
      "order-by",
      "distinct",
      "inner-join",
      "left-join",
      "join-boss",
    ]);
    expect(session.toProfile().masteredLessons).toEqual([
      "select",
      first,
      second,
      "group-by",
      "having",
      "order-by",
      "distinct",
      "inner-join",
      "left-join",
      "join-boss",
    ]);
    expect(session.toProfile().victories).toBe(1);
  });
});
