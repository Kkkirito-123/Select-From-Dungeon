/**
 * AppShell 的短反馈与楼层转场编排。
 *
 * 该工作流组合已有的 DOM 面板，不拥有计时器、焦点或游戏状态。Toast
 * 队列和 Gate 终端仍由 AppShell 保留，以维持共享键盘/焦点生命周期。
 */
import type { FeedbackDirector } from "../../../infrastructure/feedback/FeedbackDirector";
import type { OnboardingController } from "../../../presentation/dom/OnboardingController";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { TurnResolution } from "../../../contracts/game/results";
import type { LootItem } from "../../../domain/shared/types";
import type { TransientFeedbackPanel } from "../../../presentation/dom/panels/TransientFeedbackPanel";
import type { TransitionPanel } from "../../../presentation/dom/panels/TransitionPanel";
import type { NarrativeWorkflow } from "./NarrativeWorkflow";

export interface FeedbackTransitionWorkflowPorts {
  readonly feedback: Pick<FeedbackDirector, "dispatch">;
  readonly onboarding: Pick<OnboardingController, "advance">;
  readonly transientFeedbackPanel: Pick<
    TransientFeedbackPanel,
    "showLootPickup" | "showCombatSettlement" | "dismissAfterMoves" | "isCombatSettlementVisible"
  >;
  readonly transitionPanel: Pick<TransitionPanel, "renderFloor">;
  readonly narrativeWorkflow: Pick<
    NarrativeWorkflow,
    "hideNarrativeBeatCard" | "hasPendingPresentation"
  >;
  readonly isBusy: () => boolean;
  readonly isLootMenuOpen: () => boolean;
  readonly isInspectionOpen: () => boolean;
}
export class FeedbackTransitionWorkflow {
  constructor(private readonly ports: FeedbackTransitionWorkflowPorts) {}

  presentLootAcquisition(
    items: readonly LootItem[],
    effect: string,
    totalMoves: number,
  ): void {
    if (items.length === 0) return;
    this.ports.onboarding.advance("item-pickup");
    const single = items.length === 1 ? items[0] : null;
    const feedbackKind = single?.kind === "weapon"
      ? "weapon"
      : single?.kind === "consumable"
        ? "heal"
        : single?.rewardId === "floor-key"
          ? "key"
          : single?.kind === "armor"
            ? "relic"
            : "event";
    this.ports.feedback.dispatch({
      type: "item-pickup",
      itemName: items.map((item) => item.name).join("、"),
      kind: feedbackKind,
      message: effect,
    });
    this.ports.transientFeedbackPanel.showLootPickup(items, effect, totalMoves);
  }

  showCombatSettlement(resolution: TurnResolution, totalMoves: number): void {
    if (!resolution.experience) return;
    this.ports.narrativeWorkflow.hideNarrativeBeatCard();
    this.ports.transientFeedbackPanel.showCombatSettlement(resolution, totalMoves);
  }

  dismissTransientCards(totalMoves: number): void {
    this.ports.transientFeedbackPanel.dismissAfterMoves(totalMoves);
  }

  renderFloorTransition(snapshot: GameSnapshot): void {
    const presentationBlocked = this.ports.isBusy() ||
      this.ports.transientFeedbackPanel.isCombatSettlementVisible() ||
      this.ports.isLootMenuOpen() ||
      this.ports.isInspectionOpen() ||
      this.ports.narrativeWorkflow.hasPendingPresentation();
    this.ports.transitionPanel.renderFloor(snapshot, presentationBlocked);
  }
}
