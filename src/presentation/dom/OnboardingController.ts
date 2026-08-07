/**
 * 独立保存的新手引导状态机。
 * 引导只记录玩家是否完成过教学里程碑，不成为 GameSession 规则来源；它
 * 通过自己的存储接口保存进度，不能写入 Run 或 Profile 字段。
 */
import {
  onboardingStep,
  type OnboardingMilestone,
  type OnboardingStep,
  type OnboardingStepId,
} from "../../content/curriculum/onboarding";

export const ONBOARDING_SAVE_KEY = "select-from-dungeon:onboarding:v1";

export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface OnboardingSave {
  version: 1;
  finished: boolean;
  skipped: boolean;
}

export interface OnboardingSnapshot {
  step: OnboardingStep;
  visible: boolean;
  finished: boolean;
  skipped: boolean;
}

type OnboardingListener = (snapshot: OnboardingSnapshot) => void;

const NEXT_STEP: Partial<Record<OnboardingStepId, [OnboardingMilestone, OnboardingStepId]>> = {
  move: ["player-step", "find-monster"],
  "find-monster": ["encounter-start", "open-terminal"],
  "open-terminal": ["terminal-open", "cast-query"],
  "cast-query": ["query-accepted", "pickup"],
  pickup: ["item-pickup", "complete"],
};

function parseSave(raw: string | null): OnboardingSave | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OnboardingSave>;
    if (
      value.version === 1 &&
      typeof value.finished === "boolean" &&
      typeof value.skipped === "boolean"
    ) return value as OnboardingSave;
  } catch {
    // 格式错误的可选引导绝不能阻止游戏启动。
  }
  return null;
}

export class OnboardingController {
  private stepId: OnboardingStepId;
  private finishedValue: boolean;
  private skippedValue: boolean;
  private readonly listeners = new Set<OnboardingListener>();

  constructor(private readonly storage: OnboardingStorage) {
    let save: OnboardingSave | null = null;
    try {
      save = parseSave(storage.getItem(ONBOARDING_SAVE_KEY));
    } catch {
      save = null;
    }
    this.finishedValue = save?.finished ?? false;
    this.skippedValue = save?.skipped ?? false;
    this.stepId = this.finishedValue ? "complete" : "move";
  }

  snapshot(): OnboardingSnapshot {
    return {
      step: onboardingStep(this.stepId),
      visible: !this.finishedValue,
      finished: this.finishedValue,
      skipped: this.skippedValue,
    };
  }

  subscribe(listener: OnboardingListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  advance(milestone: OnboardingMilestone): boolean {
    if (this.finishedValue) return false;
    const transition = NEXT_STEP[this.stepId];
    if (!transition || transition[0] !== milestone) return false;
    this.stepId = transition[1];
    if (this.stepId === "complete") {
      this.finishedValue = true;
      this.skippedValue = false;
      this.persist();
    }
    this.emit();
    return true;
  }

  skip(): void {
    this.stepId = "complete";
    this.finishedValue = true;
    this.skippedValue = true;
    this.persist();
    this.emit();
  }

  replay(): void {
    this.stepId = "move";
    this.finishedValue = false;
    this.skippedValue = false;
    try {
      this.storage.removeItem(ONBOARDING_SAVE_KEY);
    } catch {
      // 在限制隐私访问的 iframe 中，内存回放仍应可用。
    }
    this.emit();
  }

  private persist(): void {
    const save: OnboardingSave = {
      version: 1,
      finished: this.finishedValue,
      skipped: this.skippedValue,
    };
    try {
      this.storage.setItem(ONBOARDING_SAVE_KEY, JSON.stringify(save));
    } catch {
      // 即使无法持久化，引导在当前页面内仍应可用。
    }
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
