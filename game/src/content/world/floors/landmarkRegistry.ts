import { floorLandmarkMessage as floor01LandmarkMessage } from "./floor01/landmarks";
import { floorLandmarkMessage as floor02LandmarkMessage } from "./floor02/landmarks";
import { floorLandmarkMessage as floor03LandmarkMessage } from "./floor03/landmarks";
import { floorLandmarkMessage as floor04LandmarkMessage } from "./floor04/landmarks";
import { floorLandmarkMessage as floor05LandmarkMessage } from "./floor05/landmarks";
import { floorLandmarkMessage as floor06LandmarkMessage } from "./floor06/landmarks";
import { floorLandmarkMessage as floor07LandmarkMessage } from "./floor07/landmarks";
import { floorLandmarkMessage as floor08LandmarkMessage } from "./floor08/landmarks";
import type {
  FloorLandmarkMessageInput,
  FloorLandmarkMessageResolver,
} from "./shared/landmarks";

const FLOOR_LANDMARK_RESOLVERS: Readonly<Record<number, FloorLandmarkMessageResolver>> = {
  1: floor01LandmarkMessage,
  2: floor02LandmarkMessage,
  3: floor03LandmarkMessage,
  4: floor04LandmarkMessage,
  5: floor05LandmarkMessage,
  6: floor06LandmarkMessage,
  7: floor07LandmarkMessage,
  8: floor08LandmarkMessage,
};

export function floorLandmarkMessage(
  input: FloorLandmarkMessageInput,
): string | null {
  return FLOOR_LANDMARK_RESOLVERS[input.floor](input);
}

export type { FloorLandmarkMessageInput } from "./shared/landmarks";
