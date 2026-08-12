import { describe, expect, it, vi } from "vitest";
import { GameSession } from "../src/domain/session/GameSession";
import { floorKey, joinRun, splitRun } from "../src/infrastructure/storage/dataTree";

describe("数据树", () => {
  it("把 Run 分成全局节点和楼层节点，并能无损合并", () => {
    const run = new GameSession(null, null, "data-tree-test").toSavedRun();
    const tree = splitRun(run);

    expect(tree.run.data.runInstanceId).toBe(run.runInstanceId);
    expect(tree.run.data.floor).toBe(run.floor);
    expect(tree.floor.key).toBe(floorKey(run.runInstanceId, run.floor));
    expect(tree.floor.data.mazeFloor).toEqual(run.mazeFloor);
    expect(tree.floor.data).not.toHaveProperty("equipmentInventory");
    expect(joinRun(tree.run, tree.floor)).toEqual(run);
  });

  it("works when structuredClone is unavailable", () => {
    const run = new GameSession(null, null, "data-tree-legacy-browser").toSavedRun();
    vi.stubGlobal("structuredClone", undefined);

    try {
      const tree = splitRun(run);
      expect(joinRun(tree.run, tree.floor)).toEqual(run);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
