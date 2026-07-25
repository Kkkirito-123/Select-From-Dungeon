import { describe, expect, it } from "vitest";
import { generateCampfires } from "../src/domain/campfire";
import {
  generateGuidedMapPlan,
  nearbyShortcut,
  shortcutNameForFloor,
  shortcutDestination,
  validateGuidedMapPlan,
} from "../src/domain/guidedMap";
import { generateMazeFloor } from "../src/domain/mazeGenerator";
import { generateRoomGraph } from "../src/domain/runGraph";

describe("guided map plan", () => {
  it("八层捷径使用各自地图主题的直白名称", () => {
    const names = ([1, 2, 3, 4, 5, 6, 7, 8] as const)
      .map((floor) => shortcutNameForFloor(floor));
    expect(new Set(names).size).toBe(8);
    names.forEach((name) => expect(name.endsWith("捷径") || name.endsWith("梯") || name.endsWith("门")).toBe(true));
  });

  it.each([1, 2] as const)("第 %i 层同 Seed 的路线、死路收益和捷径完全一致", (floorNumber) => {
    const graph = generateRoomGraph(`guided-repeatable:${floorNumber}`, floorNumber);
    const firstFloor = generateMazeFloor(graph);
    const secondFloor = generateMazeFloor(graph);
    const firstCampfires = generateCampfires(graph, firstFloor);
    const secondCampfires = generateCampfires(graph, secondFloor);

    expect(generateGuidedMapPlan(graph, firstFloor, firstCampfires)).toEqual(
      generateGuidedMapPlan(graph, secondFloor, secondCampfires),
    );
  });

  it("装饰密度不会改变路线信标、钥匙或捷径", () => {
    const graph = generateRoomGraph("guided-decor-isolated");
    const sparse = generateMazeFloor(graph, { decorDensity: 0.01 });
    const dense = generateMazeFloor(graph, { decorDensity: 0.18 });
    const sparsePlan = generateGuidedMapPlan(
      graph,
      sparse,
      generateCampfires(graph, sparse),
    );
    const densePlan = generateGuidedMapPlan(
      graph,
      dense,
      generateCampfires(graph, dense),
    );

    expect(sparsePlan).toEqual(densePlan);
  });

  it("捷径两端都能识别，并返回另一端", () => {
    const graph = generateRoomGraph("guided-shortcut-lookup");
    const floor = generateMazeFloor(graph);
    const plan = generateGuidedMapPlan(graph, floor, generateCampfires(graph, floor));
    const shortcut = plan.shortcuts[0];

    expect(shortcut).toBeDefined();
    expect(nearbyShortcut(plan, shortcut.entry)).toMatchObject({
      shortcut: { id: shortcut.id },
      side: "entry",
    });
    expect(nearbyShortcut(plan, shortcut.exit)).toMatchObject({
      shortcut: { id: shortcut.id },
      side: "exit",
    });
    expect(shortcutDestination(shortcut, "entry")).toEqual(shortcut.exit);
    expect(shortcutDestination(shortcut, "exit")).toEqual(shortcut.entry);
  });

  it("八层各 64 个 Seed 均满足引导距离、死路收益和钥匙捷径约束", () => {
    ([1, 2, 3, 4, 5, 6, 7, 8] as const).forEach((floorNumber) => {
      for (let index = 0; index < 64; index += 1) {
        const seed = `guided-invariant:${floorNumber}:${index}`;
        const graph = generateRoomGraph(seed, floorNumber);
        const floor = generateMazeFloor(graph);
        const campfires = generateCampfires(graph, floor);
        const plan = generateGuidedMapPlan(graph, floor, campfires);
        const validation = validateGuidedMapPlan(graph, floor, campfires, plan);

        expect(validation, `失败 Seed: ${seed}`).toMatchObject({
          valid: true,
          errors: [],
          emptyDeadEnds: 0,
        });
        expect(validation.maxMarkerGap).toBeLessThanOrEqual(18);
        expect(plan.shortcuts).toHaveLength(1);
        expect(plan.shortcuts[0].detourDistance).toBeGreaterThanOrEqual(17);
      }
    });
  }, 60_000);
});
