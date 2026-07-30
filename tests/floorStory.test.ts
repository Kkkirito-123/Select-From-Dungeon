import { describe, expect, it } from "vitest";
import {
  FloorStoryMomentQueue,
  floorStoryEvidenceQueryForLandmark,
  floorStoryMoments,
  floorStoryProgress,
  validateFloorStoryContent,
} from "../src/domain/floorStory";
import { storyQuery } from "../src/sql/storyQueryCatalog";

describe("F1-F8 现场剧情展示适配器", () => {
  it("完成对应课程后可在地图地标按 E 重读已解密 SQL 证据", () => {
    const none = floorStoryEvidenceQueryForLandmark(
      "f8-version-gallery",
      new Set(),
      new Set(),
    );
    expect(none).toBeNull();

    expect(floorStoryEvidenceQueryForLandmark(
      "f8-version-gallery",
      new Set(["f8-mvcc"]),
      new Set(),
    )).toEqual(storyQuery("f8-visible-snapshot"));

    expect(floorStoryEvidenceQueryForLandmark(
      "f1-sealed-vault",
      new Set(),
      new Set(),
    )).toBeNull();
    expect(floorStoryEvidenceQueryForLandmark(
      "f1-sealed-vault",
      new Set(),
      new Set(["gate:floor-1-treasure"]),
    )).toEqual(storyQuery("f1-restore-contradiction"));
  });

  it("只从现有楼层事件、环境规则与故事查询目录组装可见节点", () => {
    expect(validateFloorStoryContent()).toEqual([]);
    expect(floorStoryMoments(1)).toHaveLength(10);
    expect(floorStoryMoments(2)).toHaveLength(11);
    expect(floorStoryMoments(3)).toHaveLength(11);
    expect(floorStoryMoments(4)).toHaveLength(12);
    expect(floorStoryMoments(5)).toHaveLength(10);
    expect(floorStoryMoments(6)).toHaveLength(11);
    expect(floorStoryMoments(7)).toHaveLength(10);
    expect(floorStoryMoments(8)).toHaveLength(11);

    const opening = floorStoryMoments(1)[0];
    expect(opening?.sourceId).toBe("f1-story-fire-remembers");
    expect(opening?.query).toEqual(storyQuery("f1-current-resident"));
    expect(opening?.archiveLine).toBe(
      storyQuery("f1-current-resident").purpose,
    );
    expect(opening?.actions).toEqual(expect.arrayContaining([
      { type: "music-state", state: "f1-home-ember" },
      { type: "camera-focus", landmarkId: "f1-spawn-ember" },
    ]));

    const sevenPages = floorStoryMoments(2)[0];
    expect(sevenPages?.sourceId).toBe("f2-story-seven-wet-pages");
    expect(sevenPages?.query).toEqual(storyQuery("f2-seven-source-pages"));

    const evidenceQueries = [3, 4, 5, 6, 7, 8].flatMap((floor) =>
      floorStoryMoments(floor as 3 | 4 | 5 | 6 | 7 | 8)
        .map((moment) => moment.query?.id)
        .filter(Boolean)
    );
    expect(evidenceQueries).toEqual([
      "f3-unarmed-record-preserved",
      "f3-room-relic-chain",
      "f4-three-incident-fronts",
      "f4-dependency-lineage",
      "f5-stable-duty-order",
      "f5-ties-preserved",
      "f6-duplicate-candidates",
      "f6-baseline-restored",
      "f7-all-realms-present",
      "f7-crystal-plan-candidates",
      "f8-visible-snapshot",
      "f8-deadlock-cycle",
    ]);
  });

  it("第三层把关系写回环境，第四层以中层首领开启第一层残响", () => {
    const floorThree = floorStoryMoments(3);
    expect(floorThree).toHaveLength(11);
    expect(floorThree.map((entry) => entry.sourceId)).toEqual(
      expect.arrayContaining([
        "f3-story-no-owner",
        "f3-bone-linked",
        "f3-story-reliquary",
        "f3-story-grave-lord",
        "f3-story-audit-complete",
      ]),
    );

    const beforeBoss = floorStoryProgress({
      floor: 4,
      mode: "explore",
      completedLessons: ["f4-scalar", "f4-in", "f4-exists"],
      defeatedMonsterIds: [],
      openedGateIds: [],
    });
    expect(beforeBoss.unlocked.map((entry) => entry.sourceId))
      .not.toContain("f4-story-forge-lord");

    const echoOpened = floorStoryProgress({
      floor: 4,
      mode: "explore",
      completedLessons: ["f4-scalar", "f4-in", "f4-exists"],
      defeatedMonsterIds: [44],
      openedGateIds: ["gate:floor-4-treasure"],
    });
    expect(echoOpened.unlocked.map((entry) => entry.sourceId)).toEqual(
      expect.arrayContaining(["f4-story-forge-lord", "f4-story-ember-echo"]),
    );
    expect(echoOpened.latest?.title).toBe("火记得你，第二次");
  });

  it("隐藏区域只在对应实体暗门开启后进入现场档案", () => {
    const sealed = floorStoryProgress({
      floor: 1,
      mode: "explore",
      completedLessons: ["select", "where", "is-null"],
      defeatedMonsterIds: [],
      openedGateIds: [],
    });
    expect(sealed.unlocked.map((entry) => entry.sourceId)).not.toContain(
      "f1-story-sealed-vault",
    );

    const opened = floorStoryProgress({
      floor: 1,
      mode: "explore",
      completedLessons: ["select", "where", "is-null"],
      defeatedMonsterIds: [],
      openedGateIds: ["gate:floor-1-treasure"],
    });
    expect(opened.latest).toMatchObject({
      kind: "secret",
      sourceId: "f1-story-sealed-vault",
      title: "被撕下的页",
    });
  });

  it("同一次结算解锁多个节点时按策划顺序排队，重复刷新不会重复入队", () => {
    const queue = new FloorStoryMomentQueue();
    const bossAndAscent = floorStoryMoments(1).slice(-2);

    queue.enqueue(bossAndAscent);
    queue.enqueue(bossAndAscent);

    expect(queue.pendingIds).toEqual(bossAndAscent.map((moment) => moment.id));
    expect(queue.takeNext()?.kind).toBe("boss");
    expect(queue.pendingIds).toEqual([bossAndAscent[1]?.id]);
    expect(queue.takeNext()?.kind).toBe("ascent");
    expect(queue.takeNext()).toBeNull();

    queue.enqueue(bossAndAscent);
    expect(queue.pendingIds).toEqual([]);
    queue.clear();
    queue.enqueue(bossAndAscent);
    expect(queue.pendingIds).toEqual(bossAndAscent.map((moment) => moment.id));
  });

  it("读档首帧只回放最新节点，同时把更早节点标记为已记录", () => {
    const queue = new FloorStoryMomentQueue();
    const unlocked = floorStoryMoments(1).slice(0, 6);

    queue.prime(unlocked);

    expect(queue.pendingIds).toEqual([unlocked.at(-1)?.id]);
    expect(queue.takeNext()?.id).toBe(unlocked.at(-1)?.id);
    queue.enqueue(unlocked);
    expect(queue.pendingIds).toEqual([]);
  });

  it("按当前 Run 的课程、捷径与击败记录逐步解锁，不读取永久图鉴代替本轮进度", () => {
    const initial = floorStoryProgress({
      floor: 1,
      mode: "explore",
      completedLessons: [],
      defeatedMonsterIds: [],
      openedGateIds: [],
    });
    expect(initial.unlocked.map((entry) => entry.sourceId)).toEqual([
      "f1-story-fire-remembers",
    ]);

    const middle = floorStoryProgress({
      floor: 1,
      mode: "explore",
      completedLessons: ["select", "where", "is-null", "group-by"],
      defeatedMonsterIds: [],
      openedGateIds: ["shortcut:1:return"],
    });
    expect(middle.unlocked.map((entry) => entry.sourceId)).toEqual([
      "f1-story-fire-remembers",
      "f1-wheel-turning",
      "f1-water-low",
      "f1-beds-revealed",
      "f1-story-shortcut-return",
      "f1-receipts-grouped",
    ]);
    expect(middle.unlocked.some((entry) => entry.title.includes("登记官")))
      .toBe(false);

    const complete = floorStoryProgress({
      floor: 1,
      mode: "transition",
      completedLessons: ["select", "where", "is-null", "group-by", "having"],
      defeatedMonsterIds: [5],
      openedGateIds: ["shortcut:1:return"],
    });
    expect(complete.unlocked).toHaveLength(8);
    expect(complete.latest?.kind).toBe("ascent");
  });

  it("第二层入口只说明七个来源，区域首领与灯塔结论均在本轮击败后出现", () => {
    const entry = floorStoryProgress({
      floor: 2,
      mode: "explore",
      completedLessons: [],
      defeatedMonsterIds: [],
      openedGateIds: [],
    });
    expect(entry.unlocked).toHaveLength(1);
    expect(entry.latest?.query?.expectedRowCount).toBe(7);
    expect(entry.latest?.lines.join(" ")).not.toContain("灯塔守卫");

    const explored = floorStoryProgress({
      floor: 2,
      mode: "explore",
      completedLessons: [
        "order-by",
        "distinct",
        "inner-join",
        "left-join",
      ],
      defeatedMonsterIds: [21],
      openedGateIds: ["shortcut:2:return"],
    });
    expect(explored.unlocked.map((entry) => entry.sourceId)).toContain(
      "f2-story-low-tide",
    );
    expect(explored.unlocked.map((entry) => entry.sourceId)).toContain(
      "f2-story-seven-reflections",
    );
    expect(explored.unlocked.map((entry) => entry.sourceId)).not.toContain(
      "f2-story-seven-pages",
    );
  });
});
