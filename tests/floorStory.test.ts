/** 验证楼层故事的阻塞、环境和检查触发类型及其确认行为。 */
import { describe, expect, it } from "vitest";
import {
  FloorStoryMomentQueue,
  floorStoryEvidenceIdForLandmark,
  floorStoryEvidenceQueryForLandmark,
  floorStoryInspectMomentForLandmark,
  floorStoryMoments,
  floorStoryProgress,
  storyEvidenceIdFromMarker,
  storyEvidenceMarkerId,
  storyEvidenceMarkerIdsForFloor,
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

  it("每层只有一处 Story Query 地标恢复身份证据，marker 可稳定往返", () => {
    const queryEvidenceByLandmark = {
      "f1-water-wheel": "lost-name:f1:current-record",
      "f2-ranked-beacons": "lost-name:f2:identity-count",
      "f3-relic-chain": "lost-name:f3:relic-links",
      "f4-source-core": "lost-name:f4:command-batch",
      "f5-muster-board": "lost-name:f5:history-positions",
      "f6-state-bridge": "lost-name:f6:undo-origin",
      "f7-index-road": "lost-name:f7:hidden-history",
      "f8-version-gallery": "lost-name:f8:identity-set",
    } as const;

    Object.entries(queryEvidenceByLandmark).forEach(([landmarkId, evidenceId]) => {
      expect(floorStoryEvidenceIdForLandmark(landmarkId)).toBe(evidenceId);
      const markerId = storyEvidenceMarkerId(evidenceId);
      expect(markerId).toBe(`story:evidence:${evidenceId}`);
      expect(storyEvidenceIdFromMarker(markerId)).toBe(evidenceId);
    });

    expect(floorStoryEvidenceIdForLandmark("f3-master-steles")).toBeNull();
    expect(floorStoryEvidenceIdForLandmark("f8-deadlock-gate")).toBeNull();
    expect(storyEvidenceIdFromMarker("gate:floor-1-treasure")).toBeNull();
    expect(storyEvidenceIdFromMarker("story:evidence:")).toBeNull();

    ([1, 2, 3, 4, 5, 6, 7, 8] as const).forEach((floor) => {
      const markers = storyEvidenceMarkerIdsForFloor(floor);
      expect(markers).toHaveLength(2);
      expect(markers.every((markerId) => (
        storyEvidenceIdFromMarker(markerId)?.startsWith(`lost-name:f${floor}:`)
      ))).toBe(true);
    });
  });

  it("只从现有楼层事件、环境规则与故事查询目录组装可见节点", () => {
    expect(validateFloorStoryContent()).toEqual([]);
    expect(floorStoryMoments(1)).toHaveLength(10);
    expect(floorStoryMoments(2)).toHaveLength(12);
    expect(floorStoryMoments(3)).toHaveLength(11);
    expect(floorStoryMoments(4)).toHaveLength(12);
    expect(floorStoryMoments(5)).toHaveLength(11);
    expect(floorStoryMoments(6)).toHaveLength(12);
    expect(floorStoryMoments(7)).toHaveLength(11);
    expect(floorStoryMoments(8)).toHaveLength(12);

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

  it("阻止现场事件引用不存在或跨层的失名证据", () => {
    const allMoments = ([1, 2, 3, 4, 5, 6, 7, 8] as const)
      .flatMap((floor) => floorStoryMoments(floor));
    const forged = allMoments.map((moment) => (
      moment.id === "story:f2-story-seven-pages"
        ? {
            ...moment,
            actions: [{
              type: "evidence" as const,
              evidenceId: "lost-name:f4:not-real",
            }],
          }
        : moment
    ));

    expect(validateFloorStoryContent(forged)).toEqual(expect.arrayContaining([
      expect.stringContaining("不存在的失名证据"),
      expect.stringContaining("不属于本层"),
    ]));
  });

  it("每个现场节点显式声明展示通道，自动阻断次数保持在预算内", () => {
    ([1, 2, 3, 4, 5, 6, 7, 8] as const).forEach((floor) => {
      const moments = floorStoryMoments(floor);
      expect(moments.every((moment) => (
        ["blocking", "ambient", "inspect"].includes(moment.presentation)
      ))).toBe(true);

      const blocking = moments.filter(
        (moment) => moment.presentation === "blocking",
      );
      if (floor === 1) expect(blocking).toHaveLength(3);
      expect(blocking.length).toBeLessThanOrEqual(floor === 1 ? 3 : 4);
      expect(moments[0]?.presentation).toBe("blocking");
      expect(moments.at(-1)?.presentation)
        .toBe(floor === 8 ? "ambient" : "blocking");
    });

    expect(floorStoryMoments(2).find(
      (moment) => moment.sourceId === "f2-story-low-tide",
    )?.presentation).toBe("ambient");
    expect(floorStoryMoments(4).find(
      (moment) => moment.sourceId === "f4-story-ember-echo",
    )?.presentation).toBe("inspect");
    expect(floorStoryMoments(7).find(
      (moment) => moment.sourceId === "f7-composite-lit",
    )?.presentation).toBe("ambient");
    expect(floorStoryMoments(8).filter(
      (moment) => moment.presentation === "blocking",
    ).at(-1)?.sourceId).toBe("f8-story-migrate");
  });

  it("第二至八层指定区域首领各自解锁一次阻断剧情，并先于本层层主", () => {
    const contracts = [
      { floor: 2, areaBossId: 22, floorBossId: 14 },
      { floor: 3, areaBossId: 33, floorBossId: 28 },
      { floor: 4, areaBossId: 44, floorBossId: 39 },
      { floor: 5, areaBossId: 55, floorBossId: 50 },
      { floor: 6, areaBossId: 66, floorBossId: 61 },
      { floor: 7, areaBossId: 77, floorBossId: 72 },
      { floor: 8, areaBossId: 89, floorBossId: 84 },
    ] as const;

    contracts.forEach(({ floor, areaBossId, floorBossId }) => {
      const moments = floorStoryMoments(floor);
      const areaBossMoments = moments.filter((moment) => (
        moment.unlock.type === "monster-defeated" &&
        moment.unlock.monsterId === areaBossId
      ));
      expect(areaBossMoments).toHaveLength(1);
      expect(areaBossMoments[0]).toMatchObject({
        kind: "boss",
        presentation: "blocking",
      });
      const areaBossIndex = moments.indexOf(areaBossMoments[0]!);
      const floorBossIndex = moments.findIndex((moment) => (
        moment.unlock.type === "monster-defeated" &&
        moment.unlock.monsterId === floorBossId
      ));
      expect(areaBossIndex).toBeLessThan(floorBossIndex);
    });

    const withoutFloorFiveGuardian = ([1, 2, 3, 4, 5, 6, 7, 8] as const)
      .flatMap((floor) => floorStoryMoments(floor))
      .filter((moment) => moment.sourceId !== "f5-story-barracks-open");
    expect(validateFloorStoryContent(withoutFloorFiveGuardian)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("区域首领 ID #055 必须且只能解锁一个"),
      ]),
    );
  });

  it("第五层把抄写员供述放在主线，隐藏名册只保留旁证", () => {
    const moments = floorStoryMoments(5);
    expect(moments.find(
      (moment) => moment.sourceId === "f5-story-silence-is-order",
    )).toMatchObject({
      kind: "scribe",
      presentation: "ambient",
      unlock: { type: "lesson-completed", lessonId: "f5-frame" },
      lines: [
        "我以保护为名延迟了那份证据。",
        "有人因此先被处理；沉默也是一种排序。",
      ],
    });
    const hidden = moments.find(
      (moment) => moment.sourceId === "f5-story-silent-roster",
    );
    expect(hidden?.presentation).toBe("inspect");
    expect(hidden?.lines.join(" ")).toContain("旁证");
    expect(hidden?.lines.join(" ")).not.toContain("我在第四层");
  });

  it("第七层入口必见个人供述，隐藏花园只补充后果", () => {
    const moments = floorStoryMoments(7);
    expect(moments[0]).toMatchObject({
      sourceId: "f7-story-unreached",
      presentation: "blocking",
      lines: [
        "我曾帮王城决定谁更容易被找到。",
        "长路会经过每一页；索引短路只是路径，不是事实。",
      ],
    });
    const hidden = moments.find(
      (moment) => moment.sourceId === "f7-story-blind-garden",
    );
    expect(hidden?.presentation).toBe("inspect");
    expect(hidden?.lines.join(" ")).toContain("后果");
    expect(hidden?.lines.join(" ")).not.toContain("我保存了");
  });

  it("第八层击败 ID #084 后确认移交写权限，层末只作环境式收束", () => {
    const moments = floorStoryMoments(8);
    expect(moments.find(
      (moment) => moment.sourceId === "f8-story-migrate",
    )).toMatchObject({
      presentation: "blocking",
      lines: [
        "你没有删除旧库，也没有让王国永远停在 OPEN。",
        "写权限交给你；回滚路径仍在。",
      ],
    });
    expect(moments.at(-1)).toMatchObject({
      kind: "ascent",
      presentation: "ambient",
      unlock: { type: "floor-completed" },
    });
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

    expect(floorStoryInspectMomentForLandmark({
      floor: 1,
      mode: "explore",
      completedLessons: ["select", "where", "is-null"],
      defeatedMonsterIds: [],
      openedGateIds: [],
    }, "f1-sealed-vault")).toBeNull();
    expect(floorStoryInspectMomentForLandmark({
      floor: 1,
      mode: "explore",
      completedLessons: ["select", "where", "is-null"],
      defeatedMonsterIds: [],
      openedGateIds: ["gate:floor-1-treasure"],
    }, "f1-sealed-vault")).toMatchObject({
      presentation: "inspect",
      sourceId: "f1-story-sealed-vault",
      inspectLandmarkId: "f1-sealed-vault",
    });
  });

  it("捷径供述只在玩家回到抄写员身边按 E 时读取", () => {
    const state = {
      floor: 1 as const,
      mode: "explore",
      completedLessons: ["select", "where", "is-null"] as const,
      defeatedMonsterIds: [] as const,
      openedGateIds: ["shortcut:1:return"] as const,
    };

    expect(floorStoryInspectMomentForLandmark(
      state,
      "npc-scribe-f1",
    )).toMatchObject({ sourceId: "f1-story-shortcut-return" });
    expect(floorStoryInspectMomentForLandmark(
      state,
      "f1-back-shortcut",
    )).toBeNull();
  });

  it("同一次结算解锁多个节点时按策划顺序排队，重复刷新不会重复入队", () => {
    const queue = new FloorStoryMomentQueue();
    const bossAndAscent = floorStoryMoments(1).slice(-2);

    queue.enqueue(bossAndAscent);
    queue.enqueue(bossAndAscent);

    expect(queue.pendingIds).toEqual(bossAndAscent.map((moment) => moment.id));
    expect(queue.peekNext()?.kind).toBe("boss");
    expect(queue.pendingIds).toEqual(bossAndAscent.map((moment) => moment.id));
    expect(queue.ackPresented(queue.peekNext()?.id)?.kind).toBe("boss");
    expect(queue.pendingIds).toEqual([bossAndAscent[1]?.id]);
    expect(queue.ackPresented("not-the-head")).toBeNull();
    expect(queue.peekNext()?.kind).toBe("ascent");
    expect(queue.ackPresented()?.kind).toBe("ascent");
    expect(queue.peekNext()).toBeNull();

    queue.enqueue(bossAndAscent);
    expect(queue.pendingIds).toEqual([]);
    queue.clear();
    queue.enqueue(bossAndAscent);
    expect(queue.pendingIds).toEqual(bossAndAscent.map((moment) => moment.id));
  });

  it("读档首帧只归档既有节点，不自动回放任何现场剧情", () => {
    const queue = new FloorStoryMomentQueue();
    const unlocked = floorStoryMoments(1).slice(0, 6);

    queue.primeExisting(unlocked);

    expect(queue.pendingIds).toEqual([]);
    expect(queue.peekNext()).toBeNull();
    queue.enqueue(unlocked);
    expect(queue.pendingIds).toEqual([]);
  });

  it("自动展示队列排除 inspect，仍按作者顺序保留 blocking 与 ambient", () => {
    const queue = new FloorStoryMomentQueue();
    const moments = floorStoryMoments(1).slice(0, 8);

    queue.enqueue(moments);

    expect(queue.pendingIds).toEqual(
      moments
        .filter((moment) => moment.presentation !== "inspect")
        .map((moment) => moment.id),
    );
    expect(queue.pendingIds).not.toContain(
      moments.find((moment) => moment.presentation === "inspect")?.id,
    );
    queue.enqueue(moments);
    expect(queue.pendingIds).toEqual(
      moments
        .filter((moment) => moment.presentation !== "inspect")
        .map((moment) => moment.id),
    );
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
    expect(explored.unlocked.map((entry) => entry.sourceId)).not.toContain(
      "f2-story-frog-court",
    );

    const frogCourtOpened = floorStoryProgress({
      floor: 2,
      mode: "explore",
      completedLessons: [
        "order-by",
        "distinct",
        "inner-join",
        "left-join",
      ],
      defeatedMonsterIds: [21, 22],
      openedGateIds: ["shortcut:2:return"],
    });
    expect(frogCourtOpened.unlocked.find(
      (moment) => moment.sourceId === "f2-story-frog-court",
    )).toMatchObject({
      kind: "boss",
      presentation: "blocking",
      unlock: { type: "monster-defeated", monsterId: 22 },
    });
  });
});
