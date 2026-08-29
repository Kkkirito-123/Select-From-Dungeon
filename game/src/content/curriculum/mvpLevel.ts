/**
 * 八层课程内容的统一 registry。
 *
 * 各楼层作者数据位于 `floors/floorNN`，本模块只单向组合并提供当前公开 API；
 * 它不拥有楼层实现，也不允许楼层子模块反向导入这里。
 */
import type {
  LessonDefinition,
  LessonId,
  LessonStageDefinition,
  Monster,
} from "../../domain/shared/types";
import {
  AGGREGATE_HAMMER,
  DATA_BLADE,
  FILTER_BOW,
  FLOOR_ONE_LESSONS,
  FLOOR_ONE_MONSTERS,
  MAP_ROWS,
  NULL_LANTERN,
  PLAYER_START,
  TILE_SIZE,
} from "./floors/floor01";
import {
  FLOOR_TWO_LESSONS,
  FLOOR_TWO_MONSTERS,
} from "./floors/floor02";
import {
  FLOOR_THREE_LESSON_DEFINITIONS,
  FLOOR_THREE_MONSTERS,
} from "./floors/floor03";
import {
  FLOOR_FOUR_LESSON_DEFINITIONS,
  FLOOR_FOUR_MONSTERS,
} from "./floors/floor04";
import {
  FLOOR_FIVE_LESSON_DEFINITIONS,
  FLOOR_FIVE_MONSTERS,
} from "./floors/floor05";
import {
  FLOOR_SIX_LESSON_DEFINITIONS,
  FLOOR_SIX_MONSTERS,
} from "./floors/floor06";
import {
  FLOOR_SEVEN_LESSON_DEFINITIONS,
  FLOOR_SEVEN_MONSTERS,
} from "./floors/floor07";
import {
  FLOOR_EIGHT_LESSON_DEFINITIONS,
  FLOOR_EIGHT_MONSTERS,
} from "./floors/floor08";
import {
  BIOME_PRACTICE_STAGES,
  FLOOR_THREE_BIOME_MONSTERS,
  FLOOR_FOUR_BIOME_MONSTERS,
  FLOOR_FIVE_BIOME_MONSTERS,
  FLOOR_SIX_BIOME_MONSTERS,
  FLOOR_SEVEN_BIOME_MONSTERS,
  FLOOR_EIGHT_BIOME_MONSTERS,
  practiceStagesFor,
} from "../world/biomeContent";

export {
  AGGREGATE_HAMMER,
  DATA_BLADE,
  FILTER_BOW,
  MAP_ROWS,
  NULL_LANTERN,
  PLAYER_START,
  TILE_SIZE,
  practiceStagesFor,
};

export const INITIAL_MONSTERS: readonly Monster[] = [
  ...FLOOR_ONE_MONSTERS,
  ...FLOOR_TWO_MONSTERS,
  ...FLOOR_THREE_MONSTERS,
  ...FLOOR_THREE_BIOME_MONSTERS,
  ...FLOOR_FOUR_MONSTERS,
  ...FLOOR_FOUR_BIOME_MONSTERS,
  ...FLOOR_FIVE_MONSTERS,
  ...FLOOR_FIVE_BIOME_MONSTERS,
  ...FLOOR_SIX_MONSTERS,
  ...FLOOR_SIX_BIOME_MONSTERS,
  ...FLOOR_SEVEN_MONSTERS,
  ...FLOOR_SEVEN_BIOME_MONSTERS,
  ...FLOOR_EIGHT_MONSTERS,
  ...FLOOR_EIGHT_BIOME_MONSTERS,
] as const;

export const PRACTICE_STAGES: Readonly<Record<number, LessonStageDefinition>> = {
  ...Object.fromEntries(
    Object.entries(BIOME_PRACTICE_STAGES).map(([id, stages]) => [id, stages[0]]),
  ),
};

export function practiceStageFor(monsterId: number): LessonStageDefinition | null {
  return PRACTICE_STAGES[monsterId] ?? null;
}

export const LESSONS: readonly LessonDefinition[] = [
  ...FLOOR_ONE_LESSONS,
  ...FLOOR_TWO_LESSONS,
  ...FLOOR_THREE_LESSON_DEFINITIONS,
  ...FLOOR_FOUR_LESSON_DEFINITIONS,
  ...FLOOR_FIVE_LESSON_DEFINITIONS,
  ...FLOOR_SIX_LESSON_DEFINITIONS,
  ...FLOOR_SEVEN_LESSON_DEFINITIONS,
  ...FLOOR_EIGHT_LESSON_DEFINITIONS,
] as const;

export function lessonById(id: LessonId): LessonDefinition {
  const lesson = LESSONS.find((entry) => entry.id === id);
  if (!lesson) throw new Error(`未知课程：${id}`);
  return lesson;
}
