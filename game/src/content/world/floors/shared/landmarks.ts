import type { FloorNumber } from "../../../../domain/progression/runGraph";

/** 地标文案解析器的输入只包含玩家可见状态，不携带完整快照或隐藏答案。 */
export interface FloorLandmarkMessageInput {
  floor: FloorNumber;
  landmarkId: string;
  completedLessons: ReadonlySet<string>;
  openedGateIds: ReadonlySet<string>;
  monsters: readonly { id: number; hp: number }[];
}

export type FloorLandmarkMessageResolver = (
  input: FloorLandmarkMessageInput,
) => string | null;
