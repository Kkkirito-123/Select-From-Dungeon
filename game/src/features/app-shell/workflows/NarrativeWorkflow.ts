/**
 * AppShell 的叙事展示工作流。
 *
 * 该工作流只编排剧情队列、抄写员输出和记录面板展示。规则提交通过
 * 显式端口回调完成，不持有 GameSession，也不复制快照中的规则状态。
 */
import type { AgentRuntimeState } from "../../../application/agent/AgentRuntime";
import type { ScribeAgentContent } from "../../../contracts/agent/scribe";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import {
  finalMigrationProgress,
  type MigrationStepId,
} from "../../../domain/progression/finalMigration";
import { narrativeFloorFor } from "../../../domain/progression/narrative";
import {
  FloorStoryMomentQueue,
  floorStoryMoments,
  type FloorStoryMoment,
} from "../../../domain/progression/floorStory";
import {
  canPresentFinalMigrationStoryMoment,
  canPresentQueuedNarrativeMoment,
  finalMigrationRecordCopy,
  isFinalMigrationStoryMoment,
  narrativeMomentUsesRecordOverlay,
  narrativeProgressForSnapshot,
  redactSnapshotMonsterIdentity,
  shouldDismissTransientCard,
  storyMomentRecordBody,
} from "../../../presentation/dom/policies/appShellPolicies";
import type { FeedbackNotice } from "../../../infrastructure/feedback/FeedbackDirector";
import type { NarrativePanel } from "../../../presentation/dom/panels/NarrativePanel";
import type { RecordPanel } from "../../../presentation/dom/panels/RecordPanel";
import type { NarrativeCoordinator } from "../../narrative/NarrativeCoordinator";

export interface NarrativeWorkflowPorts {
  readonly root: HTMLElement;
  readonly recordPanel: RecordPanel;
  readonly narrativeCodex: NarrativePanel;
  readonly narrativeCoordinator: NarrativeCoordinator;
  readonly showNotice: (notice: FeedbackNotice) => void;
  readonly getSnapshot: () => GameSnapshot;
  readonly isInspectionOpen: () => boolean;
  readonly isBusy: () => boolean;
  readonly hasBlockingOverlay: () => boolean;
  readonly isCombatSettlementVisible: () => boolean;
  readonly recordMigrationStep: (stepId: MigrationStepId) => boolean;
  readonly refreshFloorTransition: (snapshot: GameSnapshot) => void;
}

function requiredElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少叙事投影节点：${selector}`);
  return element;
}

export class NarrativeWorkflow {
  private readonly momentQueue = new FloorStoryMomentQueue();
  private queuePrimed = false;
  private bootstrapMode: "new" | "restored";
  private activeMoment: FloorStoryMoment | null = null;
  private actionInFlight = false;
  private beatShownAtMove: number | null = null;
  private lastScribeNoticeKey: string | null = null;

  constructor(
    private readonly ports: NarrativeWorkflowPorts,
    initialRunSource: "new" | "restored" = "new",
  ) {
    this.bootstrapMode = initialRunSource;
  }

  get activeNarrativeMoment(): FloorStoryMoment | null {
    return this.activeMoment;
  }

  get activeNarrativePresentation(): FloorStoryMoment["presentation"] | undefined {
    return this.activeMoment?.presentation;
  }

  hasPendingPresentation(): boolean {
    return this.activeMoment !== null || this.momentQueue.pendingIds.length > 0;
  }

  renderScribeState(state: AgentRuntimeState): void {
    const scribe = state.scribe;
    if (!scribe.content || !scribe.requestKey) return;
    if (scribe.scene === "interaction") {
      if (
        this.ports.isInspectionOpen() &&
        this.ports.recordPanel.kind === "scribe" &&
        this.ports.recordPanel.requestKey === scribe.requestKey
      ) {
        this.renderScribeOverlay(scribe.content);
      }
      return;
    }
    if (scribe.scene === "navigation") return;
    const noticeKey = `${scribe.requestKey}:${state.phases.scribe}`;
    if (noticeKey === this.lastScribeNoticeKey) return;
    this.lastScribeNoticeKey = noticeKey;
    this.ports.showNotice({
      message: scribe.content.message,
      tone: scribe.scene === "death-review" ? "danger" : "info",
    });
  }

  openScribeOverlay(
    output: ScribeAgentContent,
    requestKey: string | null,
  ): void {
    const copy = {
      kicker: "SCRIBE / 抄写员",
      title: output.headline,
      body: output.message,
      closeLabel: "E · 继续探索",
      kind: "scribe" as const,
    };
    if (
      this.ports.isInspectionOpen() &&
      this.ports.recordPanel.kind === "scribe"
    ) {
      this.ports.recordPanel.render(copy);
    } else {
      this.openRecordOverlay(copy);
    }
    if (requestKey) this.ports.recordPanel.requestKey = requestKey;
  }

  presentInspection(
    moment: FloorStoryMoment,
    snapshot: GameSnapshot,
    inspectionMessage: string,
    scribeOutput: ScribeAgentContent | null,
    requestKey: string | null,
  ): void {
    this.activeMoment = moment;
    if (scribeOutput) {
      this.openScribeOverlay(scribeOutput, requestKey);
    } else {
      this.openStoryMoment(moment, snapshot, inspectionMessage);
    }
  }

  renderNarrativeProgress(snapshot: GameSnapshot): void {
    const progress = narrativeProgressForSnapshot(snapshot);
    if (this.queuePrimed) {
      this.momentQueue.enqueue(progress.unlockedMoments);
    } else {
      if (this.bootstrapMode === "restored") {
        const migration = finalMigrationProgress(snapshot.openedGateIds);
        const resumableMigrationMoment = (
          snapshot.floor === 8 &&
          snapshot.mode === "victory" &&
          !migration.complete
        )
          ? progress.unlockedMoments.find(isFinalMigrationStoryMoment) ??
            floorStoryMoments(8).find(isFinalMigrationStoryMoment) ??
            null
          : null;
        this.momentQueue.primeExisting(
          resumableMigrationMoment
            ? progress.unlockedMoments.filter(
                (moment) => moment.id !== resumableMigrationMoment.id,
              )
            : progress.unlockedMoments,
        );
        if (resumableMigrationMoment) {
          this.momentQueue.enqueue([resumableMigrationMoment]);
        }
      } else {
        this.momentQueue.enqueue(progress.unlockedMoments);
      }
      this.queuePrimed = true;
      this.bootstrapMode = "restored";
    }
    this.ports.narrativeCodex.render({
      floor: snapshot.floor,
      discoveredMonsterIds: snapshot.profile.discoveredMonsterIds,
      seenBeatIds: progress.seenBeatIds,
      seenMomentIds: progress.seenMomentIds,
      discoveredEvidenceIds: progress.discoveredEvidenceIds,
      completedAscentIds: progress.completedAscentIds,
      completedMigrationStepIds: progress.completedMigrationStepIds,
    });
    requiredElement<HTMLButtonElement>(this.ports.root, "#open-narrative").textContent =
      progress.storyMomentTotal > 0
        ? `▧ 剧情档案 ${progress.seenMomentIds.length}/${progress.storyMomentTotal}`
        : `▧ 剧情档案 ${progress.seenBeatIds.length}/5`;
    const latestBeat = progress.latestBeat ?? narrativeFloorFor(snapshot.floor).beats[0];
    const latestRecord = progress.latestMoment ?? latestBeat;
    requiredElement(this.ports.root, "#story-thread-title").textContent =
      latestRecord
        ? redactSnapshotMonsterIdentity(latestRecord.title, snapshot)
        : "记录尚未恢复";
    requiredElement(this.ports.root, "#story-thread-line").textContent =
      latestRecord?.lines[0]
        ? redactSnapshotMonsterIdentity(latestRecord.lines[0], snapshot)
        : "继续探索，寻找这一层留下的记录。";

    if (
      (snapshot.mode === "transition" || snapshot.mode === "victory") &&
      this.beatShownAtMove !== null
    ) {
      this.hideNarrativeBeatCard();
    } else if (
      shouldDismissTransientCard(this.beatShownAtMove, snapshot.totalMoves)
    ) {
      this.hideNarrativeBeatCard();
    }

    if (this.beatShownAtMove !== null) return;
    if (!this.canPresentNarrativeCard(snapshot)) return;

    let nextMoment = this.momentQueue.peekNext();
    while (
      nextMoment?.presentation === "ambient" &&
      (snapshot.mode === "transition" || snapshot.mode === "victory")
    ) {
      this.executeStoryMomentActions(nextMoment, false);
      this.momentQueue.ackPresented(nextMoment.id);
      nextMoment = this.momentQueue.peekNext();
    }
    if (snapshot.mode === "transition" && nextMoment) {
      while (nextMoment) {
        this.executeStoryMomentActions(nextMoment, false);
        this.momentQueue.ackPresented(nextMoment.id);
        nextMoment = this.momentQueue.peekNext();
      }
      return;
    }
    if (nextMoment) {
      if (!canPresentFinalMigrationStoryMoment(nextMoment, snapshot)) return;
      this.showNarrativeMomentCard(nextMoment, snapshot);
    }
  }

  hideNarrativeBeatCard(): void {
    const card = this.ports.root.querySelector<HTMLElement>("#narrative-beat-card");
    card?.classList.remove("is-visible");
    if (card) card.hidden = true;
    this.beatShownAtMove = null;
  }

  reset(): void {
    this.hideNarrativeBeatCard();
    this.activeMoment = null;
    this.actionInFlight = false;
    this.momentQueue.clear();
    this.queuePrimed = false;
    this.bootstrapMode = "new";
    this.lastScribeNoticeKey = null;
  }

  clearActiveMoment(): void {
    this.activeMoment = null;
  }

  confirmMoment(moment: FloorStoryMoment): void {
    this.momentQueue.ackPresented(moment.id);
    this.activeMoment = null;
    this.actionInFlight = true;
    try {
      this.executeStoryMomentActions(moment, true);
    } finally {
      this.actionInFlight = false;
    }
    queueMicrotask(() => {
      const snapshot = this.ports.getSnapshot();
      this.renderNarrativeProgress(snapshot);
      this.ports.refreshFloorTransition(snapshot);
    });
  }

  advanceFinalMigration(): void {
    if (
      !this.ports.isInspectionOpen() ||
      this.ports.recordPanel.kind !== "migration" ||
      !this.activeMoment ||
      !isFinalMigrationStoryMoment(this.activeMoment)
    ) return;
    const beforeSnapshot = this.ports.getSnapshot();
    const before = finalMigrationProgress(beforeSnapshot.openedGateIds);
    const step = before.nextStep;
    if (!step) return;
    if (!this.ports.recordMigrationStep(step.id)) {
      this.openFinalMigrationMoment(this.ports.getSnapshot());
      return;
    }

    const afterSnapshot = this.ports.getSnapshot();
    const after = finalMigrationProgress(afterSnapshot.openedGateIds);
    if (!after.complete) {
      this.openFinalMigrationMoment(afterSnapshot);
      return;
    }

    const completedMoment = this.activeMoment;
    this.momentQueue.ackPresented(completedMoment.id);
    const finalAscent = this.momentQueue.peekNext();
    if (finalAscent?.floor === 8 && finalAscent.kind === "ascent") {
      this.momentQueue.ackPresented(finalAscent.id);
    }
    this.actionInFlight = true;
    try {
      this.executeStoryMomentActions(completedMoment, true);
    } finally {
      this.actionInFlight = false;
    }
    this.activeMoment = null;
    this.ports.recordPanel.close(false);
    queueMicrotask(() => {
      const snapshot = this.ports.getSnapshot();
      this.renderNarrativeProgress(snapshot);
      this.ports.refreshFloorTransition(snapshot);
    });
  }

  private canPresentNarrativeCard(snapshot: GameSnapshot): boolean {
    return canPresentQueuedNarrativeMoment(
      snapshot.mode,
      this.ports.isBusy() || this.actionInFlight,
      this.ports.isCombatSettlementVisible(),
      this.ports.hasBlockingOverlay(),
    );
  }

  private showNarrativeMomentCard(
    moment: FloorStoryMoment,
    snapshot: GameSnapshot,
  ): void {
    if (narrativeMomentUsesRecordOverlay(moment.presentation)) {
      this.activeMoment = moment;
      this.openStoryMoment(moment, snapshot);
      return;
    }
    this.executeStoryMomentActions(moment, false);
    this.momentQueue.ackPresented(moment.id);
    const card = requiredElement<HTMLElement>(this.ports.root, "#narrative-beat-card");
    requiredElement(card, "#narrative-beat-kind").textContent = moment.kicker;
    requiredElement(card, "#narrative-beat-title").textContent =
      redactSnapshotMonsterIdentity(moment.title, snapshot);
    const lines = requiredElement(card, "#narrative-beat-lines");
    lines.replaceChildren(...moment.lines.map((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = redactSnapshotMonsterIdentity(line, snapshot);
      return paragraph;
    }));
    this.beatShownAtMove = snapshot.totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
  }

  private executeStoryMomentActions(
    moment: FloorStoryMoment,
    recordEvidence: boolean,
  ): void {
    this.ports.narrativeCoordinator.executeStoryMomentActions(moment, recordEvidence);
  }

  private openStoryMoment(
    moment: FloorStoryMoment,
    snapshot: GameSnapshot,
    inspectionMessage?: string,
  ): void {
    if (isFinalMigrationStoryMoment(moment)) {
      this.openFinalMigrationMoment(snapshot);
      return;
    }
    const recordBody = storyMomentRecordBody(moment);
    this.openRecordOverlay({
      kicker: moment.kicker,
      title: redactSnapshotMonsterIdentity(moment.title, snapshot),
      body: redactSnapshotMonsterIdentity(
        inspectionMessage
          ? `${recordBody}\n\n现场调查\n${inspectionMessage}`
          : recordBody,
        snapshot,
      ),
      closeLabel: "E · 继续探索",
      kind: "story",
    });
  }

  private openFinalMigrationMoment(snapshot: GameSnapshot): void {
    const copy = finalMigrationRecordCopy(snapshot.openedGateIds);
    if (!copy) return;
    this.openRecordOverlay({
      kicker: copy.kicker,
      title: copy.title,
      body: copy.body,
      closeLabel: copy.closeLabel,
      kind: "migration",
    });
  }

  private renderScribeOverlay(output: ScribeAgentContent): void {
    this.ports.recordPanel.render({
      kicker: "SCRIBE / 抄写员",
      title: output.headline,
      body: output.message,
    });
  }

  private openRecordOverlay(copy: {
    kicker: string;
    title: string;
    body: string;
    closeLabel: string;
    kind: "story" | "scribe" | "migration";
  }): void {
    this.hideNarrativeBeatCard();
    this.ports.recordPanel.open(copy);
  }
}
