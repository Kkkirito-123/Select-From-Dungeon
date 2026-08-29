export const FLOOR_ONE_LESSONS = [
  "select",
  "where",
  "is-null",
  "group-by",
  "having",
] as const;

export const FLOOR_TWO_LESSONS = [
  "order-by",
  "distinct",
  "inner-join",
  "left-join",
  "join-boss",
] as const;

export const FLOOR_THREE_LESSONS = [
  "f3-inner",
  "f3-left",
  "f3-self",
  "f3-chain",
  "f3-union",
  "f3-audit",
] as const;

export const FLOOR_FOUR_LESSONS = [
  "f4-scalar",
  "f4-in",
  "f4-exists",
  "f4-correlated",
  "f4-cte",
  "f4-recursive",
] as const;

export const FLOOR_FIVE_LESSONS = [
  "f5-over",
  "f5-row-number",
  "f5-rank",
  "f5-lag-lead",
  "f5-frame",
  "f5-top-n",
] as const;

export const FLOOR_SIX_LESSONS = [
  "f6-insert",
  "f6-update",
  "f6-delete",
  "f6-constraint",
  "f6-transaction",
  "f6-savepoint",
] as const;

export const FLOOR_SEVEN_LESSONS = [
  "f7-btree",
  "f7-composite",
  "f7-covering",
  "f7-invalid",
  "f7-plan",
  "f7-optimize",
] as const;

export const FLOOR_EIGHT_LESSONS = [
  "f8-mvcc",
  "f8-lock",
  "f8-isolation",
  "f8-modeling",
  "f8-replication",
  "f8-sharding",
  "f8-security",
] as const;

export const REQUIRED_RUN_LESSONS = [
  ...FLOOR_ONE_LESSONS,
  ...FLOOR_TWO_LESSONS,
  ...FLOOR_THREE_LESSONS,
  ...FLOOR_FOUR_LESSONS,
  ...FLOOR_FIVE_LESSONS,
  ...FLOOR_SIX_LESSONS,
  ...FLOOR_SEVEN_LESSONS,
  ...FLOOR_EIGHT_LESSONS,
] as const;

export type RunLessonId = (typeof REQUIRED_RUN_LESSONS)[number];
export type FloorNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const REQUIRED_PREREQUISITES: Record<RunLessonId, readonly RunLessonId[]> = {
  select: [],
  where: ["select"],
  "is-null": ["select"],
  "group-by": ["where", "is-null"],
  having: ["group-by"],
  "order-by": [],
  distinct: ["order-by"],
  "inner-join": ["distinct"],
  "left-join": ["inner-join"],
  "join-boss": ["left-join"],
  "f3-inner": [],
  "f3-left": ["f3-inner"],
  "f3-self": ["f3-inner"],
  "f3-chain": ["f3-left", "f3-self"],
  "f3-union": ["f3-chain"],
  "f3-audit": ["f3-union"],
  "f4-scalar": [],
  "f4-in": ["f4-scalar"],
  "f4-exists": ["f4-in"],
  "f4-correlated": ["f4-exists"],
  "f4-cte": ["f4-correlated"],
  "f4-recursive": ["f4-cte"],
  "f5-over": [],
  "f5-row-number": ["f5-over"],
  "f5-rank": ["f5-row-number"],
  "f5-lag-lead": ["f5-rank"],
  "f5-frame": ["f5-lag-lead"],
  "f5-top-n": ["f5-frame"],
  "f6-insert": [],
  "f6-update": ["f6-insert"],
  "f6-delete": ["f6-update"],
  "f6-constraint": ["f6-delete"],
  "f6-transaction": ["f6-constraint"],
  "f6-savepoint": ["f6-transaction"],
  "f7-btree": [],
  "f7-composite": ["f7-btree"],
  "f7-covering": ["f7-composite"],
  "f7-invalid": ["f7-covering"],
  "f7-plan": ["f7-invalid"],
  "f7-optimize": ["f7-plan"],
  "f8-mvcc": [],
  "f8-lock": ["f8-mvcc"],
  "f8-isolation": ["f8-lock"],
  "f8-modeling": ["f8-isolation"],
  "f8-replication": ["f8-modeling"],
  "f8-sharding": ["f8-replication"],
  "f8-security": ["f8-sharding"],
};

export function lessonsForFloor(floor: FloorNumber): readonly RunLessonId[] {
  if (floor === 1) return FLOOR_ONE_LESSONS;
  if (floor === 2) return FLOOR_TWO_LESSONS;
  if (floor === 3) return FLOOR_THREE_LESSONS;
  if (floor === 4) return FLOOR_FOUR_LESSONS;
  if (floor === 5) return FLOOR_FIVE_LESSONS;
  if (floor === 6) return FLOOR_SIX_LESSONS;
  if (floor === 7) return FLOOR_SEVEN_LESSONS;
  return FLOOR_EIGHT_LESSONS;
}
