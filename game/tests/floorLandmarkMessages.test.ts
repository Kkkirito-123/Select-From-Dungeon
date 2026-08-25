import { describe, expect, it } from "vitest";
import { floorLandmarkMessage } from "../src/content/world/floors/landmarkRegistry";
import type { FloorNumber } from "../src/domain/progression/runGraph";

function message(
  floor: FloorNumber,
  landmarkId: string,
  completedLessons: readonly string[] = [],
  openedGateIds: readonly string[] = [],
  monsters: readonly { id: number; hp: number }[] = [],
): string | null {
  return floorLandmarkMessage({
    floor,
    landmarkId,
    completedLessons: new Set(completedLessons),
    openedGateIds: new Set(openedGateIds),
    monsters,
  });
}

describe("floorLandmarkMessage", () => {
  it("按楼层路由文案且未识别地标失败关闭", () => {
    expect(message(1, "npc-scribe-f1")).toContain("SELECT");
    expect(message(2, "npc-scribe-f2")).toContain("ORDER BY");
    expect(message(3, "npc-scribe-f3")).toContain("断裂骨桥");
    expect(message(4, "npc-scribe-f4")).toContain("内层查询");
    expect(message(5, "npc-scribe-f5")).toContain("OVER");
    expect(message(6, "npc-scribe-f6")).toContain("一次性副本");
    expect(message(7, "npc-scribe-f7")).toContain("B-Tree");
    expect(message(8, "npc-scribe-f8")).toContain("MVCC");
    expect(message(1, "f8-version-gallery")).toBeNull();
    expect(message(8, "unknown-landmark")).toBeNull();
  });

  it("只消费课程、门和怪物的最小只读状态", () => {
    expect(message(4, "f4-forge-lord", [], [], [{ id: 44, hp: 0 }]))
      .toContain("已经倒下");
    expect(message(6, "f6-uncommitted-rookery", [], ["gate:floor-6-treasure"]))
      .toContain("龙鳞甲");
    expect(message(8, "f8-incident-wings", [
      "f8-isolation",
      "f8-modeling",
      "f8-replication",
    ])).toContain("3/4");
  });
});
