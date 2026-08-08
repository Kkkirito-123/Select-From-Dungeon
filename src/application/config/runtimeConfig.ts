/**
 * 浏览器游戏的可调运行参数。
 *
 * 这里只放会影响运行体验、容量或外部请求的参数；剧情文本、稳定 ID、
 * SQL 判题契约、物品定义和存档版本仍由各自领域模块负责，避免形成配置“总仓库”。
 */

export const WORLD_RUNTIME_CONFIG = {
  /** 新游戏始终使用同一套八层地图；该值不是玩家可选的随机种子。 */
  fixedWorldSeed: "sql-dungeon-canonical-world-v1",
  /** 当前紧凑地图尺寸。 */
  width: 56,
  height: 42,
  chunkSize: 14,
  /** DFS 主迷宫打通额外回环的默认比例与安全上限。 */
  braidRatio: 0.15,
  maxBraidRatio: 0.35,
} as const;

export const ENCOUNTER_RUNTIME_CONFIG = {
  /** 新 Run 与战斗后免遭遇的安全步数。 */
  initialSafeSteps: 5,
  postBattleSafeSteps: 5,
  /** 每一步的伏击概率与强制保底步数。 */
  ambushRollStart: 1,
  ambushChance: 0.02,
  ambushGuaranteeAt: 30,
} as const;

export const NAVIGATION_RUNTIME_CONFIG = {
  /** 主路线标记的目标间距。 */
  routeMarkerSpacing: 14,
  /** 迷路后的三级辅助阈值，以及高亮路线的最大格数。 */
  directionHintAt: 40,
  routeHighlightAt: 60,
  /** 达到该步数后继续显示强化路线高亮，不再自动移动玩家。 */
  escortAt: 100,
  maxHighlightedCells: 24,
} as const;

export const INVENTORY_RUNTIME_CONFIG = {
  equipmentCapacity: 12,
  consumableSlotCapacity: 3,
  consumableStackCapacity: 5,
} as const;

export const STORAGE_RUNTIME_CONFIG = {
  /** Run 内即时复盘最多保留的 SQL 回合数。 */
  maxAnswerHistory: 200,
  /** 完整学习作答最多保留条数；聚合统计不受此上限影响。 */
  maxLearningAttempts: 5_000,
  /** 非关键移动快照合并写入的等待时间。 */
  progressSaveDebounceMs: 350,
} as const;

export const SQL_RUNTIME_CONFIG = {
  /** 单次查询在终端中最多展示的结果行数。 */
  maxResultRows: 50,
} as const;

export const WORLD_UI_RUNTIME_CONFIG = {
  interactionLabelDistance: 1,
  monsterLabelDistance: 2,
} as const;

export const CAMPFIRE_AGENT_RUNTIME_CONFIG = {
  /** 未设置时不创建客户端，游戏完全使用本地确定性复盘。 */
  endpoint: import.meta.env.VITE_CAMPFIRE_AGENT_URL?.trim() || null,
  /** 本地复盘已经先展示，网络请求只允许在后台等待这一时长。 */
  requestTimeoutMs: 3_000,
} as const;
