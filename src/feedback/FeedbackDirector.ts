/** 将领域事件映射为一次通知和一次音效，避免 UI 与音频分别重复解释事件。 */
import type { ArcadeAudio, ArcadeSfx } from "../audio/ArcadeAudio";

export type FeedbackEvent =
  | { type: "player-step" }
  | { type: "wall-bump"; message?: string }
  | { type: "encounter-start"; monsterName: string }
  | { type: "query-cast" }
  | { type: "enemy-hurt"; amount: number }
  | { type: "player-hurt"; amount: number }
  | { type: "hazard-trigger"; hazardName: string; amount: number }
  | { type: "identity-recovered"; monsterName: string; monsterId: number; xp: number }
  | { type: "stage-clear"; message: string }
  | { type: "item-drop"; itemName: string }
  | { type: "item-pickup"; itemName: string; kind: "weapon" | "relic" | "heal" | "key" | "event"; message: string }
  | { type: "gate-open"; message: string }
  | { type: "victory"; message: string }
  | { type: "defeat"; message: string };

export interface FeedbackNotice {
  message: string;
  tone: "info" | "success" | "danger" | "reward";
}

export const PLAYER_STEP_MIN_INTERVAL_MS = 180;

type FeedbackListener = (event: FeedbackEvent, notice: FeedbackNotice | null) => void;

function cueFor(event: FeedbackEvent): ArcadeSfx {
  // 一个语义事件只映射一个音效，避免多个 UI 分支重复播放。
  switch (event.type) {
    case "player-step": return "step";
    case "wall-bump": return "bump";
    case "encounter-start": return "encounter";
    case "query-cast": return "query-cast";
    case "enemy-hurt": return "enemy-hurt";
    case "player-hurt": return "player-hurt";
    case "hazard-trigger": return "player-hurt";
    case "identity-recovered": return "stage-clear";
    case "stage-clear": return "stage-clear";
    case "item-drop": return "drop";
    case "item-pickup":
      if (event.kind === "weapon") return "pickup-weapon";
      if (event.kind === "heal") return "heal";
      return "pickup-relic";
    case "gate-open": return "gate";
    case "victory": return "victory";
    case "defeat": return "defeat";
  }
}

function noticeFor(event: FeedbackEvent): FeedbackNotice | null {
  // 只为需要玩家注意的事件创建短通知，其余事件保持安静。
  switch (event.type) {
    case "wall-bump":
      return event.message ? { message: event.message, tone: "info" } : null;
    case "encounter-start":
      return { message: `遭遇 ${event.monsterName}`, tone: "danger" };
    case "player-hurt":
      return { message: `受到 ${event.amount} 点反击伤害`, tone: "danger" };
    case "hazard-trigger":
      return {
        message: `${event.hazardName}触发 · 受到 ${event.amount} 点环境伤害`,
        tone: "danger",
      };
    case "identity-recovered":
      return {
        message: `名字恢复：${event.monsterName} · 图鉴 +1 · +${event.xp} XP`,
        tone: "reward",
      };
    case "stage-clear":
      return { message: event.message, tone: "success" };
    case "item-drop":
      return { message: `${event.itemName} 已掉落`, tone: "reward" };
    case "item-pickup":
      return { message: event.message, tone: "reward" };
    case "gate-open":
      return { message: event.message, tone: "success" };
    case "victory":
      return { message: event.message, tone: "success" };
    case "defeat":
      return { message: event.message, tone: "danger" };
    default:
      return null;
  }
}

/**
 * 每个语义事件只映射一个音频提示和一个可选通知。场景负责选择调用
 * `dispatch` 的准确帧；导演器不会根据之后的快照猜测反馈。
 */
export class FeedbackDirector {
  /** 将领域反馈统一路由到通知订阅者和音频服务。 */
  private readonly listeners = new Set<FeedbackListener>();
  private lastBumpAt = -Infinity;
  private lastStepAt = -Infinity;

  constructor(private readonly audio: Pick<ArcadeAudio, "playSfx">) {}

  subscribe(listener: FeedbackListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(event: FeedbackEvent, now = performance.now()): void {
    // 玩家移动反馈有最小间隔，防止连续碰撞或巡逻声淹没交互音效。
    if (event.type === "wall-bump") {
      if (now - this.lastBumpAt < 150) return;
      this.lastBumpAt = now;
    }
    if (event.type === "player-step") {
      if (now - this.lastStepAt < PLAYER_STEP_MIN_INTERVAL_MS) return;
      this.lastStepAt = now;
    }
    const notice = noticeFor(event);
    this.listeners.forEach((listener) => listener(event, notice));
    void this.audio.playSfx(cueFor(event));
  }
}
