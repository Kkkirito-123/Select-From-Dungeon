/**
 * 游戏运行时向 Agent Hook 发布的语义事件。
 *
 * 事件只携带只读快照和必要事实，不允许 Hook 通过事件反向修改游戏状态。
 * 这里不发渲染帧、按键或普通移动事件，避免无意义的模型请求。
 */
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { AnswerAttemptRecord } from "../../contracts/game/results";

export interface AnswerEvent {
  type: "answer";
  snapshot: GameSnapshot;
  previous: GameSnapshot;
  record: AnswerAttemptRecord;
}
export interface CampfireEvent {
  type: "campfire";
  snapshot: GameSnapshot;
  previous: GameSnapshot | null;
  campfireId: string;
}

export interface FloorEvent {
  type: "floor";
  snapshot: GameSnapshot;
  previous: GameSnapshot;
}

export interface DeathEvent {
  type: "death";
  snapshot: GameSnapshot;
  previous: GameSnapshot;
}

export type Trigger = AnswerEvent | CampfireEvent | FloorEvent | DeathEvent;
export type TriggerListener = (event: Trigger) => void;
