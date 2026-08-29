/**
 * 永久 Profile 的创建、校验和 JSON 编码边界。
 *
 * 本模块不访问浏览器存储；localProgress 只负责当前键的读写。
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

function isLessonId(value: unknown): value is LessonId {
  return typeof value === "string" && PROFILE_LESSON_IDS.includes(value as LessonId);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** 校验 v3 Profile；不合法档案由存储入口回退为空档案。 */
export function isProfileProgress(value: unknown): value is ProfileProgress {
  return validateProfileProgress(value, {
    lessonIds: PROFILE_LESSON_IDS,
    isLessonId,
    isNonNegativeInteger,
  });
}
