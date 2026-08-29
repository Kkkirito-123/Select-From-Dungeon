import { describe, expect, it } from "vitest";
import { generateCampfires } from "../src/domain/exploration/campfire";
import { generateMazeFloor } from "../src/domain/exploration/mazeGenerator";
import { generateRoomGraph } from "../src/domain/progression/runGraph";
import {
  floorLandmarkPosition,
  floorNpcPosition,
  revealAt,
} from "../src/domain/session/exploration";

describe("session exploration package", () => {
  it("reveals a deterministic safe/maze footprint without duplicating cells", () => {
    const graph = generateRoomGraph("exploration-actions", 1);
    const mazeFloor = generateMazeFloor(graph);
    const campfires = generateCampfires(graph, mazeFloor);
    const discoveredCells = new Set<string>();
    const context = { floor: 1 as const, mazeFloor, campfires, discoveredCells };

    revealAt(context, mazeFloor.spawn);
    const firstSize = discoveredCells.size;
    expect(firstSize).toBeGreaterThan(0);
    revealAt(context, mazeFloor.spawn);
    expect(discoveredCells.size).toBe(firstSize);
  });

  it("resolves authored landmark and scribe anchors through the maze zones", () => {
    const graph = generateRoomGraph("exploration-actions", 1);
    const mazeFloor = generateMazeFloor(graph);
    const context = { floor: 1 as const, mazeFloor };

    expect(floorLandmarkPosition(context, "f1-water-wheel")).not.toBeNull();
    expect(floorNpcPosition(context, "npc-scribe-f1")).not.toBeNull();
    expect(floorLandmarkPosition(context, "missing-landmark")).toBeNull();
  });
});
