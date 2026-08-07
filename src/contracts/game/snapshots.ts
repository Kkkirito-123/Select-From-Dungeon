/**
 * 游戏运行时只读快照的跨层出口。
 *
 * UI、Phaser 和 Agent 只能通过快照读取游戏事实，不能借此直接修改
 * GameSession。具体领域类型暂时继续由 domain/shared/types.ts 管理，
 * 这里先固定跨层引用位置，后续拆分时不需要同时修改所有调用方。
 */
export type { GameSnapshot } from "../../domain/shared/types";
