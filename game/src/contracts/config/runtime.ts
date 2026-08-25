/**
 * 跨层只读运行参数契约。
 *
 * 这里不读取环境变量，也不装配浏览器服务。领域、内容、基础设施与表现层
 * 只能单向消费这些父级常量；具体运行时入口由 application 负责组装。
 */

export const WORLD_RUNTIME_CONFIG = {
  fixedWorldSeed: "sql-dungeon-canonical-world-v1",
  width: 56,
  height: 42,
  chunkSize: 14,
  braidRatio: 0.15,
  maxBraidRatio: 0.35,
} as const;

export const ENCOUNTER_RUNTIME_CONFIG = {
  initialSafeSteps: 5,
  postBattleSafeSteps: 5,
  ambushRollStart: 1,
  ambushChance: 0.02,
  ambushGuaranteeAt: 30,
} as const;

export const NAVIGATION_RUNTIME_CONFIG = {
  routeMarkerSpacing: 14,
  directionHintAt: 40,
  routeHighlightAt: 60,
  escortAt: 100,
  maxHighlightedCells: 24,
} as const;

export const INVENTORY_RUNTIME_CONFIG = {
  equipmentCapacity: 12,
  consumableSlotCapacity: 3,
  consumableStackCapacity: 5,
} as const;

export const STORAGE_RUNTIME_CONFIG = {
  maxAnswerHistory: 200,
  maxLearningAttempts: 5_000,
  progressSaveDebounceMs: 350,
} as const;

export const SQL_RUNTIME_CONFIG = {
  maxResultRows: 50,
} as const;

export const WORLD_UI_RUNTIME_CONFIG = {
  interactionLabelDistance: 1,
  monsterLabelDistance: 2,
} as const;
