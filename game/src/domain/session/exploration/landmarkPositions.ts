/** 作者化楼层地标和抄写员的迷宫坐标投影；不持有会话状态。 */
import {
  floorExperience,
  hasFloorExperience,
} from "../../../content/world/floorExperience";
import type { FloorNumber } from "../../progression/runGraph";
import type { MazeFloor } from "../../exploration/mazeGenerator";
import type { Position } from "../../shared/types";

export interface LandmarkPositionContext {
  floor: FloorNumber;
  mazeFloor: MazeFloor;
}

function anchoredPosition(
  context: LandmarkPositionContext,
  roomNodeId: string,
  anchor: { position: { x: number; y: number } },
): Position | null {
  const zone = context.mazeFloor.zones.find(
    (entry) => entry.roomNodeId === roomNodeId,
  );
  if (!zone) return null;
  return {
    x: Math.round(zone.x + anchor.position.x * zone.width),
    y: Math.round(zone.y + anchor.position.y * zone.height),
  };
}

/** Resolve one authored landmark anchor into the current maze coordinates. */
export function floorLandmarkPosition(
  context: LandmarkPositionContext,
  landmarkId: string,
): Position | null {
  if (!hasFloorExperience(context.floor)) return null;
  const landmark = floorExperience(context.floor).landmarks.find(
    (entry) => entry.id === landmarkId,
  );
  return landmark
    ? anchoredPosition(context, landmark.anchor.roomNodeId, landmark.anchor)
    : null;
}

/** Resolve one authored NPC anchor into the current maze coordinates. */
export function floorNpcPosition(
  context: LandmarkPositionContext,
  npcId: string,
): Position | null {
  if (!hasFloorExperience(context.floor)) return null;
  const npc = floorExperience(context.floor).npcPlacements.find(
    (entry) => entry.id === npcId,
  );
  return npc
    ? anchoredPosition(context, npc.anchor.roomNodeId, npc.anchor)
    : null;
}
