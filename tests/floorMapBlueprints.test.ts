import { describe, expect, it } from "vitest";
import {
  FLOOR_MAP_BLUEPRINTS,
  FLOOR_TRANSIT_PRESENTATIONS,
  MVP2_MAZE_HEIGHT,
  MVP2_MAZE_WIDTH,
  compatibleFloorLayoutNames,
  floorTransitPresentation,
  regionPortalsEnabledForFloor,
} from "../src/content/world/floorMapBlueprints";
import {
  generateRoomGraph,
  type FloorNumber,
} from "../src/domain/progression/runGraph";

const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly FloorNumber[];

describe("FLOOR_MAP_BLUEPRINTS", () => {
  it("八层都有独立名称、交通和 2–4 格主路", () => {
    const blueprints = FLOORS.map((floor) => FLOOR_MAP_BLUEPRINTS[floor]);
    expect(new Set(blueprints.map((entry) => entry.layoutName)).size).toBe(8);
    expect(new Set(blueprints.map((entry) => entry.routeTransit)).size).toBe(8);
    expect(new Set(blueprints.map((entry) => entry.ascentTransit)).size).toBe(8);
    expect(Object.keys(FLOOR_TRANSIT_PRESENTATIONS)).toHaveLength(16);
    blueprints.forEach((entry) => {
      expect(floorTransitPresentation(entry.routeTransit).label.length).toBeGreaterThan(2);
      expect(floorTransitPresentation(entry.ascentTransit).label.length).toBeGreaterThan(2);
    });
    blueprints.forEach((entry) => {
      expect(entry.regionNames).toHaveLength(3);
      expect(entry.mainRoadWidth).toBeGreaterThanOrEqual(2);
      expect(entry.mainRoadWidth).toBeLessThanOrEqual(4);
    });
  });

  it("第一层只保留连续步行与唯一实体水闸，不启用通用区域传送点", () => {
    const transit = floorTransitPresentation(
      FLOOR_MAP_BLUEPRINTS[1].routeTransit,
    );
    expect(transit.label).toBe("排水水闸");
    expect(transit.regionLabel).toBe("排水渡点");
    expect(regionPortalsEnabledForFloor(1)).toBe(false);
    expect(regionPortalsEnabledForFloor(2)).toBe(true);
  });

  it("第一、二层保留已发布 v11 布局名作为只读存档兼容身份", () => {
    expect(compatibleFloorLayoutNames(1)).toEqual([
      "双岸失名档案",
      "地下余烬档案回环",
      "回燃档案环廊",
    ]);
    expect(compatibleFloorLayoutNames(2)).toEqual([
      "月潮群岛船闸环线",
      "月潮群岛航线",
    ]);
    expect(compatibleFloorLayoutNames(3)).toEqual(["白霜墓原回环"]);
  });

  it("每个蓝图槽位与本层 RoomGraph 一一对应、位于地图内且互不重叠", () => {
    FLOORS.forEach((floorNumber) => {
      const blueprint = FLOOR_MAP_BLUEPRINTS[floorNumber];
      const graph = generateRoomGraph("blueprint-contract", floorNumber);
      expect(blueprint.slots).toHaveLength(graph.nodes.length);
      expect(new Set(blueprint.slots.map((slot) => slot.roomNodeId))).toEqual(
        new Set(graph.nodes.map((node) => node.id)),
      );
      blueprint.slots.forEach((slot, index) => {
        expect(slot.x, `第 ${floorNumber} 层 ${slot.roomNodeId}`).toBeGreaterThan(0);
        expect(slot.y, `第 ${floorNumber} 层 ${slot.roomNodeId}`).toBeGreaterThan(0);
        expect(slot.x + slot.width, `第 ${floorNumber} 层 ${slot.roomNodeId}`)
          .toBeLessThan(MVP2_MAZE_WIDTH);
        expect(slot.y + slot.height, `第 ${floorNumber} 层 ${slot.roomNodeId}`)
          .toBeLessThan(MVP2_MAZE_HEIGHT);
        blueprint.slots.slice(index + 1).forEach((other) => {
          const overlaps = !(
            slot.x + slot.width <= other.x ||
            other.x + other.width <= slot.x ||
            slot.y + slot.height <= other.y ||
            other.y + other.height <= slot.y
          );
          expect(
            overlaps,
            `第 ${floorNumber} 层 ${slot.roomNodeId} 与 ${other.roomNodeId}`,
          ).toBe(false);
        });
      });
    });
  });

  it("第八层为 11 节点七翼终局，其余楼层为 10 节点", () => {
    FLOORS.forEach((floorNumber) => {
      expect(FLOOR_MAP_BLUEPRINTS[floorNumber].slots).toHaveLength(
        floorNumber === 8 ? 11 : 10,
      );
    });
  });
});
