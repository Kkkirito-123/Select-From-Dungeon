/** 会话地图视野的状态转换；不会改变玩家位置、模式或遭遇计量。 */
import {
  floorLabyrinthAreaAt,
  floorSafeAreaCellKeysAt,
} from "../../exploration/floorLabyrinth";
import { floorLabyrinth } from "../../../content/world/floorLabyrinth";
import {
  revealAround,
  type MazeFloor,
} from "../../exploration/mazeGenerator";
import type { FloorNumber } from "../../progression/runGraph";
import type { Campfire, Position } from "../../shared/types";

export interface VisibilityContext {
  floor: FloorNumber;
  mazeFloor: MazeFloor;
  campfires: readonly Campfire[];
  discoveredCells: Set<string>;
}

/** Reveal the safe-zone footprint or the configured labyrinth radius. */
export function revealAt(
  context: VisibilityContext,
  position: Position,
): void {
  if (
    floorLabyrinthAreaAt(
      context.floor,
      context.mazeFloor,
      context.campfires,
      position,
    ) === "safe"
  ) {
    floorSafeAreaCellKeysAt(
      context.floor,
      context.mazeFloor,
      context.campfires,
      position,
    ).forEach((cell) => context.discoveredCells.add(cell));
    return;
  }
  const radius = floorLabyrinth(context.floor).sightRadius + 1;
  revealAround(context.mazeFloor, position, radius).forEach(
    (cell) => context.discoveredCells.add(cell),
  );
}
