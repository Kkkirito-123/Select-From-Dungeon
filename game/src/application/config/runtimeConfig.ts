/** 浏览器应用装配入口；纯参数由父级 contracts 单向提供。 */
export {
  ENCOUNTER_RUNTIME_CONFIG,
  INVENTORY_RUNTIME_CONFIG,
  NAVIGATION_RUNTIME_CONFIG,
  SQL_RUNTIME_CONFIG,
  STORAGE_RUNTIME_CONFIG,
  WORLD_RUNTIME_CONFIG,
  WORLD_UI_RUNTIME_CONFIG,
} from "../../contracts/config/runtime";

export const AGENT_RUNTIME_CONFIG = {
  /** 唯一 Agent 服务入口；未设置时三个角色全部使用本地规则。 */
  endpoint: import.meta.env.VITE_AGENT_URL?.trim() || null,
  timeoutMs: 5_000,
} as const;

export const PRESENCE_RUNTIME_CONFIG = {
  /** 相对地址会跟随游戏部署目录；生产环境由同源 Nginx 转发到在线状态服务。 */
  endpoint: import.meta.env.VITE_PRESENCE_URL?.trim() || "api/presence",
} as const;
