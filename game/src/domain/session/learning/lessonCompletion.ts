/**
 * GameSession 的课程完成状态转换。
 *
 * 本模块返回新的集合和数组，不修改输入；它只登记课程、房间、图鉴与原样怪物状态，
 * 不处理战斗 UI、掉落或通知。GameSession 在一次命令末尾统一提交结果。
 */
import type { LessonId, Monster } from "../../shared/types";

export interface LessonCompletionInput {
  lessonId: LessonId;
  roomId: string;
  completedLessons: ReadonlySet<LessonId>;
  completedRoomIds: ReadonlySet<string>;
  masteredLessons: readonly LessonId[];
  monsters: readonly Monster[];
}

export interface LessonCompletionResolution {
  completedLessons: Set<LessonId>;
  completedRoomIds: Set<string>;
  masteredLessons: LessonId[];
  monsters: Monster[];
}

/** 完成课程时只推进对应事实，绝不重置任何怪物生命。 */
export function resolveLessonCompletion(
  input: LessonCompletionInput,
): LessonCompletionResolution {
  const completedLessons = new Set(input.completedLessons);
  completedLessons.add(input.lessonId);
  const completedRoomIds = new Set(input.completedRoomIds);
  completedRoomIds.add(input.roomId);
  return {
    completedLessons,
    completedRoomIds,
    masteredLessons: input.masteredLessons.includes(input.lessonId)
      ? [...input.masteredLessons]
      : [...input.masteredLessons, input.lessonId],
    monsters: [...input.monsters],
  };
}
