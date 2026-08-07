/**
 * 持久化数据的跨层契约出口。
 *
 * 存档版本、字段含义和迁移责任仍归 infrastructure/storage 所有；
 * 其他层只能消费已经校验过的 SavedRun/ProfileProgress。
 */
export type {
  ProfileProgress,
  SavedGame,
  SavedRun,
} from "../../domain/shared/types";
