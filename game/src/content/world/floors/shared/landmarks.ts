import type { FloorNumber } from "../../../../domain/progression/runGraph";

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
