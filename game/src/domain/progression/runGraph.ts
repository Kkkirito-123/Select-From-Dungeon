/**
 * 课程依赖图和房间图的领域模型。
 * 这里决定课程顺序、房间前置条件和稳定 seed 派生，不负责物理迷宫渲染、
 * 玩家移动或存档写入。
 */
export {
  FLOOR_ONE_LESSONS,
  FLOOR_TWO_LESSONS,
  FLOOR_THREE_LESSONS,
  FLOOR_FOUR_LESSONS,
  FLOOR_FIVE_LESSONS,
  FLOOR_SIX_LESSONS,
  FLOOR_SEVEN_LESSONS,
  FLOOR_EIGHT_LESSONS,
  REQUIRED_RUN_LESSONS,
  lessonsForFloor,
} from "./runLessons";
export type { FloorNumber, RunLessonId } from "./runLessons";

export {
  createSeededRandom,
  generateRoomGraph,
  stableStringHash,
} from "./roomGraphGenerator";
export type {
  RoomGraph,
  RoomNode,
  RoomReward,
  RoomType,
} from "./roomGraphGenerator";

export { validateRoomGraph } from "./roomGraphValidator";
export type { RoomGraphValidation } from "./roomGraphValidator";
