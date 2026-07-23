import { describe, expect, it } from "vitest";
import {
  createSeededRandom,
  FLOOR_ONE_LESSONS,
  FLOOR_TWO_LESSONS,
  generateRoomGraph,
  stableStringHash,
  validateRoomGraph,
  type RoomGraph,
} from "../src/domain/runGraph";

function cloneGraph(graph: RoomGraph): RoomGraph {
  return JSON.parse(JSON.stringify(graph)) as RoomGraph;
}

describe("stableStringHash / createSeededRandom", () => {
  it("同一字符串和 seed 始终产生同一结果", () => {
    expect(stableStringHash("魔王城-alpha")).toBe(2_325_380_787);
    expect(stableStringHash("魔王城-alpha")).not.toBe(stableStringHash("魔王城-beta"));

    const first = createSeededRandom("run-42");
    const second = createSeededRandom("run-42");
    expect([first(), first(), first(), first()]).toEqual([
      second(),
      second(),
      second(),
      second(),
    ]);
  });
});

describe("generateRoomGraph", () => {
  it("同 seed 可重入且深度相等", () => {
    expect(generateRoomGraph("castle-2026")).toEqual(generateRoomGraph("castle-2026"));
  });

  it("不同 seed 大概率改变分支布局或奖励", () => {
    const first = generateRoomGraph("castle-alpha");
    const second = generateRoomGraph("castle-beta");
    const projection = (graph: RoomGraph) => graph.nodes.map((node) => ({
      id: node.id,
      lane: node.lane,
      reward: node.reward,
      next: node.next,
    }));

    expect(projection(first)).not.toEqual(projection(second));
  });

  it("第一层生成 10 个房间并固定保留本层必修课与功能房", () => {
    const graph = generateRoomGraph("curriculum-safe");
    expect(graph.nodes).toHaveLength(10);
    expect(graph.nodes.map((node) => node.lessonId).filter(Boolean).sort()).toEqual(
      [...FLOOR_ONE_LESSONS].sort(),
    );
    expect(graph.nodes.map((node) => node.type)).toEqual(
      expect.arrayContaining([
        "entry",
        "tutorial",
        "lesson",
        "rest",
        "treasure",
        "event",
        "elite",
        "boss",
      ]),
    );
  });

  it("第二层使用独立课程图并按顺序解锁 JOIN 综合 Boss", () => {
    const graph = generateRoomGraph("curriculum-safe", 2);
    expect(graph).toMatchObject({ floor: 2, version: 2 });
    expect(graph.nodes).toHaveLength(10);
    expect(graph.nodes.map((node) => node.lessonId).filter(Boolean).sort()).toEqual(
      [...FLOOR_TWO_LESSONS].sort(),
    );
    const byLesson = new Map(
      graph.nodes.filter((node) => node.lessonId).map((node) => [node.lessonId, node]),
    );
    expect(byLesson.get("distinct")?.prerequisiteLessons).toEqual(["order-by"]);
    expect(byLesson.get("inner-join")?.prerequisiteLessons).toEqual(["distinct"]);
    expect(byLesson.get("left-join")?.prerequisiteLessons).toEqual(["inner-join"]);
    expect(byLesson.get("join-boss")?.prerequisiteLessons).toEqual(["left-join"]);
  });

  it("WHERE 与 IS NULL 可自由选择，完成后才解锁 GROUP BY", () => {
    const graph = generateRoomGraph("free-order");
    const byLesson = new Map(
      graph.nodes.filter((node) => node.lessonId).map((node) => [node.lessonId, node]),
    );
    const whereRoom = byLesson.get("where");
    const nullRoom = byLesson.get("is-null");
    const groupRoom = byLesson.get("group-by");
    expect(whereRoom?.prerequisiteLessons).not.toContain("is-null");
    expect(nullRoom?.prerequisiteLessons).not.toContain("where");
    expect(groupRoom?.prerequisiteLessons).toEqual(
      expect.arrayContaining(["where", "is-null"]),
    );
    expect(
      graph.nodes.some(
        (node) => node.next.includes(whereRoom?.id ?? "") && node.next.includes(nullRoom?.id ?? ""),
      ),
    ).toBe(true);
  });

  it("通过完整图校验：Boss 可达且所有非 Boss 房都能继续", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(validateRoomGraph(generateRoomGraph(`invariant-${index}`))).toEqual({
        valid: true,
        errors: [],
      });
      expect(validateRoomGraph(generateRoomGraph(`invariant-${index}`, 2))).toEqual({
        valid: true,
        errors: [],
      });
    }
  });
});

describe("validateRoomGraph", () => {
  it("报告课程缺失、Boss 不可达和非 Boss 死路", () => {
    const graph = cloneGraph(generateRoomGraph("broken"));
    const whereRoom = graph.nodes.find((node) => node.lessonId === "where");
    if (!whereRoom) throw new Error("测试图缺少 WHERE 房。");
    whereRoom.lessonId = undefined;
    whereRoom.next = [];

    const elite = graph.nodes.find((node) => node.type === "elite");
    if (!elite) throw new Error("测试图缺少 elite 房。");
    elite.next = [];

    const groupRoom = graph.nodes.find((node) => node.lessonId === "group-by");
    if (!groupRoom) throw new Error("测试图缺少 GROUP BY 房。");
    groupRoom.required = false;

    const validation = validateRoomGraph(graph);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        "缺少必修课程房：where",
        `非 Boss 房 ${whereRoom.id} 没有出口。`,
        `非 Boss 房 ${elite.id} 没有出口。`,
        "入口无法到达 Boss。",
        "必修课程房未标记为 required：group-by",
      ]),
    );
  });
});
