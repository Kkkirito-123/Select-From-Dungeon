import { describe, expect, it, vi } from "vitest";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import type { TurnResolution } from "../src/contracts/game/results";
import type { FeedbackDirector } from "../src/infrastructure/feedback/FeedbackDirector";
import type { OnboardingController } from "../src/presentation/dom/OnboardingController";
import type { TransientFeedbackPanel } from "../src/presentation/dom/panels/TransientFeedbackPanel";
import type { TransitionPanel } from "../src/presentation/dom/panels/TransitionPanel";
import type { NarrativeWorkflow } from "../src/features/app-shell/workflows/NarrativeWorkflow";
import {
  FeedbackTransitionWorkflow,
  type FeedbackTransitionWorkflowPorts,
} from "../src/features/app-shell/workflows/FeedbackTransitionWorkflow";
import { GameSession } from "../src/features/game-session/GameSession";

function snapshot(): GameSnapshot {
  return new GameSession(null, null, "feedback-transition-workflow").snapshot();
}

function ports() {
  const calls = {
    feedback: vi.fn(),
    onboarding: vi.fn(),
    loot: vi.fn(),
    settlement: vi.fn(),
    dismiss: vi.fn(),
    hideNarrative: vi.fn(),
    hasPending: vi.fn(() => false),
    renderFloor: vi.fn(),
  };
  const value: FeedbackTransitionWorkflowPorts = {
    feedback: { dispatch: calls.feedback } as unknown as Pick<FeedbackDirector, "dispatch">,
    onboarding: { advance: calls.onboarding } as unknown as Pick<OnboardingController, "advance">,
    transientFeedbackPanel: {
      showLootPickup: calls.loot,
      showCombatSettlement: calls.settlement,
      dismissAfterMoves: calls.dismiss,
      isCombatSettlementVisible: () => false,
    } as unknown as Pick<TransientFeedbackPanel, "showLootPickup" | "showCombatSettlement" | "dismissAfterMoves" | "isCombatSettlementVisible">,
    transitionPanel: { renderFloor: calls.renderFloor } as unknown as Pick<TransitionPanel, "renderFloor">,
    narrativeWorkflow: {
      hideNarrativeBeatCard: calls.hideNarrative,
      hasPendingPresentation: calls.hasPending,
    } as unknown as Pick<NarrativeWorkflow, "hideNarrativeBeatCard" | "hasPendingPresentation">,
    isBusy: () => false,
    isLootMenuOpen: () => false,
    isInspectionOpen: () => false,
  };
  return { value, calls };
}

describe("FeedbackTransitionWorkflow", () => {
  it("拾取反馈保持事件类型、教学里程碑和短卡顺序", () => {
    const { value, calls } = ports();
    const workflow = new FeedbackTransitionWorkflow(value);
    const item = {
      dropId: "drop-test",
      itemId: "weapon-test",
      kind: "weapon" as const,
      name: "测试武器",
      description: "一把测试武器。",
      guaranteed: true,
      probability: 1,
      protected: false,
    };

    workflow.presentLootAcquisition([item], "已装备。", 12);

    expect(calls.onboarding).toHaveBeenCalledWith("item-pickup");
    expect(calls.feedback).toHaveBeenCalledWith({
      type: "item-pickup",
      itemName: "测试武器",
      kind: "weapon",
      message: "已装备。",
    });
    expect(calls.loot).toHaveBeenCalledWith([item], "已装备。", 12);
  });

  it("战斗结算先隐藏剧情卡，转场阻塞只由现有端口状态决定", () => {
    const { value, calls } = ports();
    const workflow = new FeedbackTransitionWorkflow(value);
    const resolution = {
      experience: {
        monsterId: 1,
        monsterName: "史莱姆",
        gained: 1,
        previousXp: 0,
        currentXp: 1,
        previousLevel: 1,
        currentLevel: 1,
        previousMaxHp: 2,
        currentMaxHp: 2,
      },
    } as unknown as TurnResolution;

    workflow.showCombatSettlement(resolution, 13);
    workflow.renderFloorTransition(snapshot());

    expect(calls.hideNarrative).toHaveBeenCalledTimes(1);
    expect(calls.settlement).toHaveBeenCalledWith(resolution, 13);
    expect(calls.renderFloor).toHaveBeenCalledWith(
      expect.anything(),
      false,
    );
  });
});
