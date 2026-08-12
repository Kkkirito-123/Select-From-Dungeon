/**
 * 永久 Profile 的 JSON 编码边界。
 *
 * Profile 的版本校验和旧版本迁移仍由 localProgress 负责；这里不访问浏览器
 * 存储，只保证写入格式集中，避免入口函数散落 JSON.stringify。
 */
import type { ProfileProgress } from "../../contracts/game/persistence";
import type { LessonId } from "../../domain/shared/types";

/** Profile 需要覆盖的全部课程 ID；顺序也是首次生成 attempts 时的稳定顺序。 */
export const PROFILE_LESSON_IDS: readonly LessonId[] = [
  "select",
  "where",
  "is-null",
  "group-by",
  "having",
  "order-by",
  "distinct",
  "inner-join",
  "left-join",
  "join-boss",
  "f3-inner",
  "f3-left",
  "f3-self",
  "f3-chain",
  "f3-union",
  "f3-audit",
  "f4-scalar",
  "f4-in",
  "f4-exists",
  "f4-correlated",
  "f4-cte",
  "f4-recursive",
  "f5-over",
  "f5-row-number",
  "f5-rank",
  "f5-lag-lead",
  "f5-frame",
  "f5-top-n",
  "f6-insert",
  "f6-update",
  "f6-delete",
  "f6-constraint",
  "f6-transaction",
  "f6-savepoint",
  "f7-btree",
  "f7-composite",
  "f7-covering",
  "f7-invalid",
  "f7-plan",
  "f7-optimize",
  "f8-mvcc",
  "f8-lock",
  "f8-isolation",
  "f8-modeling",
  "f8-replication",
  "f8-sharding",
  "f8-security",
];

/** 创建内存中的空 v3 Profile，不读取浏览器，也不产生持久化副作用。 */
export function createEmptyProfile(
  lessonIds: readonly LessonId[] = PROFILE_LESSON_IDS,
): ProfileProgress {
  const attempts = lessonIds.reduce<Record<LessonId, number>>((result, lessonId) => {
    result[lessonId] = 0;
    return result;
  }, {} as Record<LessonId, number>);
  return {
    version: 3,
    masteredLessons: [],
    attempts,
    discoveredMonsterIds: [],
    victories: 0,
    bestRunQueries: null,
  };
}

/** 根据已经掌握的课程推导永久图鉴中的怪物 ID。 */
export function discoveredMonsterIdsForLessons(
  masteredLessons: readonly LessonId[],
  lessons: readonly Readonly<{ id: LessonId; primaryMonsterId: number }>[],
): number[] {
  const mastered = new Set(masteredLessons);
  return lessons
    .filter((lesson) => mastered.has(lesson.id))
    .map((lesson) => lesson.primaryMonsterId)
    .filter((id, index, values) => values.indexOf(id) === index)
    .sort((left, right) => left - right);
}

/** 序列化已经通过校验的 v3 Profile。 */
export function encodeProfile(profile: ProfileProgress): string {
  return JSON.stringify(profile);
}

export interface ProfileValidationRules {
  lessonIds: readonly LessonId[];
  isLessonId: (value: unknown) => value is LessonId;
  isNonNegativeInteger: (value: unknown) => boolean;
}

/** 校验 v3 Profile 的结构，不执行迁移，也不读取浏览器。 */
export function validateProfileProgress(
  value: unknown,
  rules: ProfileValidationRules,
): value is ProfileProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Partial<ProfileProgress>;
  return (
    profile.version === 3 &&
    Array.isArray(profile.masteredLessons) &&
    profile.masteredLessons.every(rules.isLessonId) &&
    Boolean(profile.attempts) &&
    rules.lessonIds.every((id) => rules.isNonNegativeInteger(profile.attempts?.[id])) &&
    Array.isArray(profile.discoveredMonsterIds) &&
    profile.discoveredMonsterIds.every(rules.isNonNegativeInteger) &&
    new Set(profile.discoveredMonsterIds).size === profile.discoveredMonsterIds.length &&
    rules.isNonNegativeInteger(profile.victories) &&
    (profile.bestRunQueries === null || rules.isNonNegativeInteger(profile.bestRunQueries))
  );
}
