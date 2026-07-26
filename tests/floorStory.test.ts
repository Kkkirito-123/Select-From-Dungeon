import { describe, expect, it } from "vitest";
import {
  FloorStoryMomentQueue,
  floorStoryMoments,
  floorStoryProgress,
  validateFloorStoryContent,
} from "../src/domain/floorStory";
import { storyQuery } from "../src/sql/storyQueryCatalog";

describe("F1/F2 现场剧情展示适配器", () => {
  it("只从现有楼层事件、环境规则与故事查询目录组装可见节点", () => {
    expect(validateFloorStoryContent()).toEqual([]);
    expect(floorStoryMoments(1)).toHaveLength(8);
    expect(floorStoryMoments(2)).toHaveLength(9);

    const opening = floorStoryMoments(1)[0];
    expect(opening?.sourceId).toBe("f1-story-fire-remembers");
    expect(opening?.query).toEqual(storyQuery("f1-current-resident"));
    expect(opening?.archiveLine).toBe(
      storyQuery("f1-current-resident").purpose,
    );

    const sevenPages = floorStoryMoments(2)[0];
    expect(sevenPages?.sourceId).toBe("f2-story-seven-wet-pages");
    expect(sevenPages?.query).toEqual(storyQuery("f2-seven-source-pages"));
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
