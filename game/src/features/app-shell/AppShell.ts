/**
 * 浏览器 DOM 外壳和交互协调器。
 * AppShell 负责模板挂载、按钮/键盘事件和整体快照编排；SQL、剧情、快照投影、
 * 反馈卡与楼层转场分别由窄端口功能包提供服务。它只调用 GameSession 公开动作，
 * 不直接修改规则或存档，也不承担外部服务或模型输出生成。
 */
import { ArcadeAudio } from "../../infrastructure/audio/ArcadeAudio";
import {
  regionPortalsEnabledForFloor,
} from "../../content/world/floorMapBlueprints";
import type { OnboardingMilestone } from "../../content/curriculum/onboarding";
import {
  COMPLETE_RELATION_LINES,
  COMPLETE_SCHEMA_LINES,
  SQL_TABLES,
} from "../../content/sql/sqlSchema";
import { GameSession, LEVEL_XP_THRESHOLDS } from "../game-session/GameSession";
import {
  floorStoryInspectMomentForLandmark,
} from "../../domain/progression/floorStory";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type {
  CampfireReview,
  PatrolMove,
  QueryResultDisclosure,
  SqlQueryResult,
  TurnResolution,
} from "../../contracts/game/results";
import { buildCampfireReview, campfireReviewInput } from "../../domain/learning/campfireReview";
import type { LootItem } from "../../domain/shared/types";
import type { FeedbackDirector, FeedbackNotice } from "../../infrastructure/feedback/FeedbackDirector";
import type { BattleScene } from "../../presentation/phaser/BattleScene";
import type { SqlEngine } from "../../infrastructure/sql/SqlEngine";
import type { OnboardingController, OnboardingSnapshot } from "../../presentation/dom/OnboardingController";
import { bindAppShellDom } from "../../presentation/dom/appShellDom";
import { appShellTemplate } from "../../presentation/dom/appShellTemplate";
import { DialogFocusManager } from "../../presentation/dom/focus/DialogFocusManager";
import { HudRenderer } from "../../presentation/dom/renderers/HudRenderer";
import { MinimapRenderer } from "../../presentation/dom/renderers/MinimapRenderer";
import { CombatRenderer } from "../../presentation/dom/renderers/CombatRenderer";
import { AppShellProjectionRenderer } from "./rendering/AppShellProjectionRenderer";
import type { AnswerReviewScope } from "../../presentation/dom/AnswerReviewView";
import { NarrativePanel } from "../../presentation/dom/panels/NarrativePanel";
import { ReviewPanel } from "../../presentation/dom/panels/ReviewPanel";
import { SchemaPanel } from "../../presentation/dom/panels/SchemaPanel";
import { TerminalPanel } from "../../presentation/dom/panels/TerminalPanel";
import { MonsterCodexView } from "../../presentation/dom/MonsterCodexView";
import { SqlAutocompleteController } from "../../presentation/dom/sqlAutocomplete";
import { SqlChordTracker } from "../../presentation/dom/SqlChordTracker";
import { CampfirePanel } from "../../presentation/dom/panels/CampfirePanel";
import { InventoryPanel } from "../../presentation/dom/panels/InventoryPanel";
import type { AgentRuntime } from "../../application/agent/AgentRuntime";
import { AgentPanel } from "../../presentation/dom/panels/AgentPanel";
import { PresencePanel } from "../../presentation/dom/panels/PresencePanel";
import { RecordPanel } from "../../presentation/dom/panels/RecordPanel";
import { TransitionPanel } from "../../presentation/dom/panels/TransitionPanel";
import { TransientFeedbackPanel } from "../../presentation/dom/panels/TransientFeedbackPanel";
import { AdminPanel } from "../../presentation/dom/panels/AdminPanel";
import type { PresenceClient } from "../../infrastructure/presence/PresenceClient";
import {
  TerminalCoordinator,
  type TerminalCoordinatorPorts,
} from "../terminal/TerminalCoordinator";
import { NarrativeCoordinator } from "../narrative/NarrativeCoordinator";
import { NarrativeWorkflow } from "./workflows/NarrativeWorkflow";
import { FeedbackTransitionWorkflow } from "./workflows/FeedbackTransitionWorkflow";
import { ResetWorkflow } from "./workflows/ResetWorkflow";
import { SnapshotRenderer } from "../snapshot/SnapshotRenderer";
import { adminAnswerForInput, shouldAutofillAdminAnswer } from "../../presentation/dom/adminAnswer";
import {
  canOpenCombatTerminal,
  finalMigrationArgumentCopy,
  inspectionDialogCopy,
  inspectionEscapeCanClose,
  isInspectionPrimaryKey,
  redactSnapshotMonsterIdentity,
} from "../../presentation/dom/policies/appShellPolicies";
export { shapeOnlyQueryResultCopy } from "../../presentation/dom/panels/TerminalPanel";
export * from "../../presentation/dom/policies/appShellPolicies";

function requiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少界面元素：${selector}`);
  return element;
}

function dispatchMove(dx: number, dy: number): void {
  window.dispatchEvent(new CustomEvent("dungeon:move", { detail: { dx, dy } }));
}

function dispatchInteract(): void {
  window.dispatchEvent(new CustomEvent("dungeon:interact"));
}


export class AppShell {
  private textarea!: HTMLTextAreaElement;
  private gateTextarea!: HTMLTextAreaElement;
  private queryStatus!: HTMLElement;
  private gateQueryStatus!: HTMLElement;
  private resultRoot!: HTMLElement;
  private planRoot!: HTMLElement;
  private hintsRoot!: HTMLElement;
  private terminal!: HTMLElement;
  private gateTerminal!: HTMLElement;
  private recordPanel!: RecordPanel;
  private campfireMenu!: HTMLElement;
  private inventoryMenu!: HTMLElement;
  private lootMenu!: HTMLElement;
  private adminPanel!: AdminPanel;
  private answerReview!: ReviewPanel;
  private narrativeCodex!: NarrativePanel;
  private monsterCodex!: MonsterCodexView;
  private executeButton!: HTMLButtonElement;
  private gateExecuteButton!: HTMLButtonElement;
  private sqlButton!: HTMLButtonElement;
  private audioButton!: HTMLButtonElement;
  private combatAutocomplete!: SqlAutocompleteController;
  private gateAutocomplete!: SqlAutocompleteController;
  private lastStageId: GameSnapshot["lessonStageId"] | null = null;
  private lastMode: GameSnapshot["mode"] | null = null;
  private lastSnapshot!: GameSnapshot;
  private readonly terminalCoordinator: TerminalCoordinator;
  private readonly narrativeCoordinator: NarrativeCoordinator;
  private narrativeWorkflow!: NarrativeWorkflow;
  private feedbackTransitionWorkflow!: FeedbackTransitionWorkflow;
  private resetWorkflow!: ResetWorkflow;
  private readonly snapshotRenderer = new SnapshotRenderer();
  private readonly sqlChord = new SqlChordTracker();
  private readonly dialogFocus = new DialogFocusManager();
  private readonly hudRenderer: HudRenderer;
  private readonly minimapRenderer: MinimapRenderer;
  private readonly combatRenderer: CombatRenderer;
  private projectionRenderer!: AppShellProjectionRenderer;
  private inventoryPanel!: InventoryPanel;
  private campfirePanel!: CampfirePanel;
  private agentPanel!: AgentPanel;
  private presencePanel!: PresencePanel;
  private schemaPanel!: SchemaPanel;
  private terminalPanel!: TerminalPanel;
  private readonly listenerController = new AbortController();
  private unsubscribeSession: (() => void) | null = null;
  private unsubscribeFeedback: (() => void) | null = null;
  private unsubscribeOnboarding: (() => void) | null = null;
  private unsubscribeAgent: (() => void) | null = null;
  private unsubscribePresence: (() => void) | null = null;
  private releaseAudioGesture: (() => void) | null = null;
  private focusBeforeTerminal: HTMLElement | null = null;
  private toastTimer: number | null = null;
  private terminalFocusTimer: number | null = null;
  private transientFeedbackPanel!: TransientFeedbackPanel;
  private transitionPanel!: TransitionPanel;
  private lastLocksSignature: string | null = null;
  private lastHintsSignature: string | null = null;
  private lastMasterySignature: string | null = null;
  private lastRelicsSignature: string | null = null;
  private reviewContext: "manual" | "campfire" | "death" = "manual";
  private reviewScope: AnswerReviewScope = "all";
  private activeNotice: FeedbackNotice | null = null;
  private readonly noticeQueue: FeedbackNotice[] = [];

  private get busy(): boolean {
    return this.terminalCoordinator?.isBusy ?? false;
  }

  private readonly openTerminalHandler = (): void => this.openTerminal();
  private readonly inspectionHandler = (event: Event): void => {
    const detail = (event as CustomEvent<{
      message?: string;
      landmarkId?: string;
    }>).detail;
    const message = detail?.message;
    if (typeof message === "string" && message.trim() !== "") {
      const inspectionMessage = detail?.landmarkId?.startsWith("npc-scribe-f")
        ? this.scribeMessage(message)
        : message;
      if (typeof detail.landmarkId === "string") {
        const isScribe = detail.landmarkId.startsWith("npc-scribe-f");
        const scribeOutput = isScribe && this.agentRuntime
          ? this.agentRuntime.interactScribe(
            this.lastSnapshot,
            detail.landmarkId,
            inspectionMessage,
          )
          : null;
        const inspectMoment = floorStoryInspectMomentForLandmark({
          floor: this.lastSnapshot.floor,
          mode: this.lastSnapshot.mode,
          completedLessons: this.lastSnapshot.completedLessons,
          defeatedMonsterIds: this.lastSnapshot.monsters
            .filter((monster) => monster.hp <= 0)
            .map((monster) => monster.id),
          openedGateIds: this.lastSnapshot.openedGateIds,
        }, detail.landmarkId);
        if (inspectMoment) {
          if (scribeOutput) {
            this.narrativeWorkflow.presentInspection(
              inspectMoment,
              this.lastSnapshot,
              inspectionMessage,
              scribeOutput,
              this.agentRuntime?.getState().scribe.requestKey ?? null,
            );
          } else {
            this.narrativeWorkflow.presentInspection(
              inspectMoment,
              this.lastSnapshot,
              inspectionMessage,
              null,
              null,
            );
          }
          return;
        }
        if (scribeOutput) {
          this.narrativeWorkflow.openScribeOverlay(
            scribeOutput,
            this.agentRuntime?.getState().scribe.requestKey ?? null,
          );
          return;
        }
      }
      this.openInspection(inspectionMessage);
    }
  };
  private readonly keydownHandler = (event: KeyboardEvent): void => {
    if (this.isInspectionOpen()) {
      if (isInspectionPrimaryKey(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.recordPanel.kind === "migration") {
          this.advanceFinalMigration();
        } else {
          this.closeInspection();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!inspectionEscapeCanClose(
          this.recordPanel.kind,
          this.narrativeWorkflow.activeNarrativePresentation,
        )) return;
        this.closeInspection(true, false);
        return;
      }
      if (event.key === "Tab") {
        this.trapDialogFocus(event, this.recordPanel.element);
        return;
      }
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && this.isMonsterCodexOpen()) {
      event.preventDefault();
      this.monsterCodex.close();
      return;
    }
    if (event.key === "Escape" && this.isNarrativeCodexOpen()) {
      event.preventDefault();
      this.narrativeCodex.close();
      return;
    }
    if (event.key === "Escape" && this.isAdminMenuOpen()) {
      event.preventDefault();
      this.closeAdminMenu();
      return;
    }
    if (event.key === "Escape" && this.isReviewOpen()) {
      event.preventDefault();
      this.closeReview();
      return;
    }
    if (event.key === "Escape" && this.isLootMenuOpen()) {
      event.preventDefault();
      this.closeLootMenu();
      return;
    }
    if (event.key === "Escape" && this.isInventoryMenuOpen()) {
      event.preventDefault();
      this.closeInventoryMenu();
      return;
    }
    if (event.key === "Escape" && this.isCampfireMenuOpen()) {
      event.preventDefault();
      this.leaveCampfire();
      return;
    }
    if (event.key === "Escape" && this.isGateTerminalOpen()) {
      event.preventDefault();
      this.closeGateTerminal();
      return;
    }
    if (event.key === "Escape" && this.isTerminalOpen()) {
      event.preventDefault();
      this.closeTerminal();
      return;
    }
    if (event.key === "Escape" && this.session.cancelGuidanceEscort()) {
      event.preventDefault();
      return;
    }
    if (
      event.key === "Tab" &&
      (
        this.isReviewOpen() ||
        this.isMonsterCodexOpen() ||
        this.isNarrativeCodexOpen() ||
        this.isAdminMenuOpen() ||
        this.isLootMenuOpen() ||
        this.isInventoryMenuOpen() ||
        this.isCampfireMenuOpen() ||
        this.isVictoryPortalOpen() ||
        this.isTerminalOpen() ||
        this.isGateTerminalOpen()
      )
    ) {
      this.trapDialogFocus(
        event,
        this.isMonsterCodexOpen()
          ? this.monsterCodex.element
          : this.isNarrativeCodexOpen()
          ? this.narrativeCodex.element
          : this.isReviewOpen()
          ? this.answerReview.element
          : this.isAdminMenuOpen()
            ? this.adminPanel.element
          : this.isVictoryPortalOpen()
            ? requiredElement(this.root, "#floor-portal")
          : this.isLootMenuOpen()
            ? this.lootMenu
          : this.isInventoryMenuOpen()
            ? this.inventoryMenu
          : this.isCampfireMenuOpen()
            ? this.campfireMenu
          : this.isGateTerminalOpen() ? this.gateTerminal : this.terminal,
      );
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "Enter" &&
      this.isGateTerminalOpen()
    ) {
      event.preventDefault();
      void this.executeGateChallenge();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && this.isTerminalOpen()) {
      event.preventDefault();
      void this.executeQuery();
      return;
    }
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (
      event.code === "KeyB" &&
      activeTag !== "textarea" &&
      activeTag !== "input" &&
      activeTag !== "select" &&
      (this.lastSnapshot?.mode === "explore" || this.lastSnapshot?.mode === "campfire")
    ) {
      event.preventDefault();
      this.session.openInventory();
      return;
    }
    if (
      this.lastSnapshot?.mode === "combat" &&
      activeTag !== "textarea" &&
      activeTag !== "input" &&
      (event.code === "KeyQ" || event.code === "KeyS")
    ) {
      event.preventDefault();
      if (!canOpenCombatTerminal(this.lastSnapshot.mode, this.busy)) {
        this.sqlChord.reset();
        return;
      }
      if (this.sqlChord.keyDown(event.code)) this.openTerminal();
      return;
    }
    if (event.code === "KeyH" && activeTag !== "textarea" && activeTag !== "input") {
      event.preventDefault();
      this.requestHint();
    }
  };
  private readonly keyupHandler = (event: KeyboardEvent): void => {
    this.sqlChord.keyUp(event.code);
  };
  private readonly blurHandler = (): void => {
    this.sqlChord.reset();
  };
  private readonly milestoneHandler = (event: Event): void => {
    const milestone = (event as CustomEvent<{ type?: OnboardingMilestone }>).detail?.type;
    if (
      milestone === "player-step" ||
      milestone === "encounter-start" ||
      milestone === "item-pickup"
    ) {
      this.onboarding.advance(milestone);
    }
  };
  private readonly patrolHandler = (event: Event): void => {
    const moves = (event as CustomEvent<{ moves?: PatrolMove[] }>).detail?.moves;
    if (!Array.isArray(moves)) return;
    const markers = this.root.querySelectorAll<SVGRectElement>(
      "#castle-map .minimap-monster[data-monster-id]",
    );
    const currentSight = this.minimapRenderer.currentSight(this.lastSnapshot);
    moves.forEach((move) => {
      const marker = Array.from(markers).find(
        (entry) => entry.dataset.monsterId === String(move.monsterId),
      );
      if (!marker) return;
      marker.setAttribute("x", String(move.to.x + 0.12));
      marker.setAttribute("y", String(move.to.y + 0.12));
      marker.setAttribute(
        "visibility",
        currentSight.has(`${move.to.x}:${move.to.y}`)
          ? "visible"
          : "hidden",
      );
    });
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly session: GameSession,
    private readonly sql: SqlEngine,
    private readonly audio: ArcadeAudio,
    private readonly feedback: FeedbackDirector,
    private readonly onboarding: OnboardingController,
    private readonly getBattleScene: () => BattleScene | null,
    private readonly initialRunSource: "new" | "restored" = "new",
    private readonly agentRuntime: AgentRuntime | null = null,
    private readonly presenceClient: PresenceClient,
  ) {
    this.hudRenderer = new HudRenderer(root);
    this.minimapRenderer = new MinimapRenderer(root);
    this.combatRenderer = new CombatRenderer(root, this.hudRenderer);
    const terminalPorts: TerminalCoordinatorPorts = {
      session,
      sql,
      getBattleScene: () => this.getBattleScene(),
      getCombatInput: () => this.textarea?.value ?? "",
      getGateInput: () => this.gateTextarea?.value ?? "",
      isGateTerminalOpen: () => this.isGateTerminalOpen(),
      hideCombatAutocomplete: () => this.combatAutocomplete?.hide(),
      hideGateAutocomplete: () => this.gateAutocomplete?.hide(),
      setResolving: (resolving) => {
        requiredElement(this.root, ".game-stage").classList.toggle("is-resolving", resolving);
      },
      setCombatExecuteDisabled: (disabled) => {
        if (this.executeButton) this.executeButton.disabled = disabled;
        if (this.sqlButton) {
          this.sqlButton.disabled = disabled || this.lastSnapshot?.mode !== "combat";
        }
      },
      setGateExecuteDisabled: (disabled) => {
        if (this.gateExecuteButton) this.gateExecuteButton.disabled = disabled;
      },
      setCombatStatus: (message, kind) => {
        if (!this.queryStatus) return;
        this.queryStatus.textContent = message;
        this.queryStatus.dataset.kind = kind;
      },
      setGateStatus: (message, kind) => {
        if (!this.gateQueryStatus) return;
        this.gateQueryStatus.textContent = message;
        this.gateQueryStatus.dataset.kind = kind;
      },
      showNotice: (notice) => this.showFeedbackNotice(notice),
      dispatchFeedback: (event) => this.feedback.dispatch(event),
      renderCombatResult: (result, disclosure) => this.renderResult(result, disclosure),
      renderGateResult: (result, disclosure) => this.renderGateResult(result, disclosure),
      onLessonAccepted: () => this.onboarding.advance("query-accepted"),
      closeCombatTerminal: (returnFocus) => this.closeTerminal(returnFocus),
      openCombatTerminal: () => this.openTerminal(),
      syncAudioFocus: () => this.syncAudioFocus(),
      showCombatSettlement: (resolution) => this.showCombatSettlement(resolution),
    };
    this.terminalCoordinator = new TerminalCoordinator(terminalPorts);
    this.narrativeCoordinator = new NarrativeCoordinator({
      audio: {
        setFocus: (focus) => this.audio.setFocus(focus),
        playStageClear: () => this.audio.playSfx("stage-clear"),
      },
      setMusicState: (state) => {
        this.root.dataset.storyMusicState = state;
      },
      setWorldEffect: (effect) => {
        this.root.dataset.storyWorldEffect = effect;
      },
      recordEvidence: (evidenceId) => this.session.recordStoryEvidence(evidenceId),
      dispatchStoryActions: (momentId, actions) => {
        window.dispatchEvent(new CustomEvent("dungeon:story-actions", {
          detail: { momentId, actions },
        }));
      },
    });
  }

  mount(): void {
    const schemaFieldCount = SQL_TABLES.reduce(
      (total, table) => total + table.columns.length,
      0,
    );
    this.root.innerHTML = appShellTemplate({
      schemaTableCount: SQL_TABLES.length,
      schemaFieldCount,
    });

    const dom = bindAppShellDom(this.root);
    this.textarea = dom.textarea;
    this.gateTextarea = dom.gateTextarea;
    this.queryStatus = dom.queryStatus;
    this.gateQueryStatus = dom.gateQueryStatus;
    this.resultRoot = dom.resultRoot;
    this.planRoot = dom.planRoot;
    this.hintsRoot = dom.hintsRoot;
    this.terminal = dom.terminal;
    this.gateTerminal = dom.gateTerminal;
    this.recordPanel = new RecordPanel(this.root, dom.inspectionOverlay);
    this.transientFeedbackPanel = new TransientFeedbackPanel(this.root, {
      settlementAutoClosed: () => {
        this.renderNarrativeProgress(this.lastSnapshot);
        this.renderFloorTransition(this.lastSnapshot);
      },
    });
    this.transitionPanel = new TransitionPanel(this.root, {
      advanceFloor: () => this.advanceFromFloorTransition(),
      hidePickup: () => this.transientFeedbackPanel.hidePickup(),
      hideCombatSettlement: () => this.transientFeedbackPanel.hideCombatSettlement(),
      respawnAfterDefeat: () => {
        if (this.session.snapshot().mode !== "defeat") return;
        this.getBattleScene()?.abortEncounter();
        this.session.respawnAfterDefeat();
      },
    });
    this.campfireMenu = dom.campfireMenu;
    this.inventoryMenu = dom.inventoryMenu;
    this.lootMenu = dom.lootMenu;
    this.adminPanel = new AdminPanel(this.root, dom.adminMenu, {
      open: () => this.openAdminMenu(),
      close: () => this.closeAdminMenu(),
      nextFloor: () => this.handleAdminNextFloor(),
    });
    this.agentPanel = new AgentPanel(dom);
    this.presencePanel = new PresencePanel(dom);
    this.unsubscribePresence = this.presenceClient.subscribe(
      (state) => this.presencePanel.render(state),
    );
    this.answerReview = new ReviewPanel(this.root);
    this.narrativeCodex = new NarrativePanel(this.root, {
      onClose: () => {
        this.root.classList.remove("narrative-active");
        this.syncAudioFocus();
      },
    });
    this.narrativeWorkflow = new NarrativeWorkflow({
      root: this.root,
      recordPanel: this.recordPanel,
      narrativeCodex: this.narrativeCodex,
      narrativeCoordinator: this.narrativeCoordinator,
      showNotice: (notice) => this.showFeedbackNotice(notice),
      getSnapshot: () => this.lastSnapshot ?? this.session.snapshot(),
      isInspectionOpen: () => this.isInspectionOpen(),
      isBusy: () => this.busy,
      hasBlockingOverlay: () => (
        this.isTerminalOpen() ||
        this.isGateTerminalOpen() ||
        this.isCampfireMenuOpen() ||
        this.isInventoryMenuOpen() ||
        this.isLootMenuOpen() ||
        this.isReviewOpen() ||
        this.isNarrativeCodexOpen() ||
        this.isMonsterCodexOpen() ||
        this.isInspectionOpen() ||
        this.isAdminMenuOpen()
      ),
      isCombatSettlementVisible: () => this.transientFeedbackPanel.isCombatSettlementVisible(),
      recordMigrationStep: (stepId) => this.session.recordMigrationStep(stepId),
      refreshFloorTransition: (snapshot) => this.renderFloorTransition(snapshot),
    }, this.initialRunSource);
    this.feedbackTransitionWorkflow = new FeedbackTransitionWorkflow({
      feedback: this.feedback,
      onboarding: this.onboarding,
      transientFeedbackPanel: this.transientFeedbackPanel,
      transitionPanel: this.transitionPanel,
      narrativeWorkflow: this.narrativeWorkflow,
      isBusy: () => this.busy,
      isLootMenuOpen: () => this.isLootMenuOpen(),
      isInspectionOpen: () => this.isInspectionOpen(),
    });
    this.resetWorkflow = new ResetWorkflow({
      isAdminMode: () => this.lastSnapshot.adminMode,
      isBusy: () => this.busy,
      setBanner: (message) => {
        requiredElement(this.root, "#banner").textContent = message;
      },
      setQueryStatus: (message, kind) => {
        this.queryStatus.textContent = message;
        this.queryStatus.dataset.kind = kind;
      },
      showNotice: (notice) => this.showFeedbackNotice(notice),
      closeTerminal: (returnFocus) => this.closeTerminal(returnFocus),
      hidePickup: () => this.transientFeedbackPanel.hidePickup(),
      hideCombatSettlement: () => this.transientFeedbackPanel.hideCombatSettlement(),
      resetNarrative: () => this.narrativeWorkflow.reset(),
      cancelDefeat: () => this.transitionPanel.cancelDefeat(),
      getBattleScene: () => this.getBattleScene(),
      resetSession: () => this.session.reset(),
      readSnapshot: () => this.session.snapshot(),
      resetSql: (monsters) => this.sql.reset(monsters),
      clearQueryArtifacts: () => this.clearQueryArtifacts(),
      setAudioScene: (scene) => this.audio.setScene(scene),
    });
    this.monsterCodex = new MonsterCodexView(this.root, {
      onClose: () => {
        this.root.classList.remove("monster-codex-active");
        this.syncAudioFocus();
      },
    });
    this.projectionRenderer = new AppShellProjectionRenderer({
      root: this.root,
      hintsRoot: this.hintsRoot,
      hudRenderer: this.hudRenderer,
      minimapRenderer: this.minimapRenderer,
      combatRenderer: this.combatRenderer,
      monsterCodex: this.monsterCodex,
    });
    this.executeButton = dom.executeButton;
    this.gateExecuteButton = dom.gateExecuteButton;
    this.sqlButton = dom.sqlButton;
    this.audioButton = dom.audioButton;
    this.inventoryPanel = new InventoryPanel(this.root, {
      openInventory: () => this.session.openInventory(),
      closeInventory: () => this.session.closeInventory(),
      closeLootBundle: () => this.session.closeLootBundle(),
      takeAllLoot: (bundleId) => this.session.takeAllLoot(bundleId),
      equipInventoryItem: (itemId) => this.session.equipInventoryItem(itemId),
      discardInventoryItem: (itemId) => this.session.discardInventoryItem(itemId),
      useConsumable: (itemId) => this.session.useConsumable(
        itemId as Parameters<GameSession["useConsumable"]>[0],
      ),
      discardConsumable: (itemId) => this.session.discardConsumable(
        itemId as Parameters<GameSession["discardConsumable"]>[0],
      ),
      takeLootItem: (bundleId, dropId, action, replaceInstanceId) => (
        this.session.takeLootItem(bundleId, dropId, action, replaceInstanceId)
      ),
      showNotice: (notice) => this.showFeedbackNotice(notice),
      presentLoot: (items, effect) => this.presentLootAcquisition(items, effect),
      focusGame: () => requiredElement<HTMLElement>(this.root, "#game-root").focus({
        preventScroll: true,
      }),
    });
    this.campfirePanel = new CampfirePanel(
      this.root,
      {
        openInventory: () => this.session.openInventory(),
        openReview: () => this.openReview("floor", "campfire"),
        restAtCampfire: () => this.session.restAtCampfire(),
        leaveCampfire: () => this.session.leaveCampfire(),
        showNotice: (notice) => this.showFeedbackNotice(notice),
        focusGame: () => requiredElement<HTMLElement>(this.root, "#game-root").focus({
          preventScroll: true,
        }),
      },
      (snapshot) => this.campfireReview(snapshot),
    );
    this.terminalPanel = new TerminalPanel(this.root, {
      executeQuery: () => this.executeQuery(),
      executeGateChallenge: () => this.executeGateChallenge(),
      closeTerminal: () => this.closeTerminal(),
      closeGateTerminal: () => this.closeGateTerminal(),
      requestHint: () => this.requestHint(),
    });
    this.combatAutocomplete = new SqlAutocompleteController(
      this.textarea,
      requiredElement(this.root, "#sql-suggestions"),
      this.listenerController.signal,
    );
    this.gateAutocomplete = new SqlAutocompleteController(
      this.gateTextarea,
      requiredElement(this.root, "#gate-sql-suggestions"),
      this.listenerController.signal,
    );
    const listenerOptions = { signal: this.listenerController.signal };
    this.schemaPanel = new SchemaPanel(this.root, this.combatAutocomplete);
    this.schemaPanel.mount(listenerOptions);
    this.terminalPanel.bind(listenerOptions);
    this.campfirePanel.bind(listenerOptions);
    this.inventoryPanel.bind(listenerOptions, () => this.lastSnapshot ?? this.session.snapshot());
    this.adminPanel.bind(listenerOptions);
    requiredElement(this.root, "#close-inspection").addEventListener(
      "click",
      () => this.recordPanel.kind === "migration"
        ? this.advanceFinalMigration()
        : this.closeInspection(),
      listenerOptions,
    );
    requiredElement(this.root, "#retreat-combat").addEventListener(
      "click",
      () => this.retreatFromCombat(),
      listenerOptions,
    );
    requiredElement(this.root, "#open-review").addEventListener("click", () => this.openReview(), listenerOptions);
    requiredElement(this.root, "#open-narrative").addEventListener(
      "click",
      () => this.openNarrativeCodex(),
      listenerOptions,
    );
    requiredElement(this.root, "#open-monster-codex").addEventListener(
      "click",
      () => this.openMonsterCodex(),
      listenerOptions,
    );
    requiredElement(this.root, "#open-ending-codex").addEventListener(
      "click",
      () => this.openNarrativeCodex(),
      listenerOptions,
    );
    requiredElement(this.root, "#restart-after-victory").addEventListener(
      "click",
      () => {
        this.reset();
        requiredElement<HTMLElement>(this.root, "#game-root").focus({
          preventScroll: true,
        });
      },
      listenerOptions,
    );
    requiredElement(this.root, "#close-review").addEventListener("click", () => this.closeReview(), listenerOptions);
    requiredElement(this.root, "#interact").addEventListener(
      "click",
      () => this.isInspectionOpen()
        ? this.recordPanel.kind === "migration"
          ? this.advanceFinalMigration()
          : this.closeInspection()
        : dispatchInteract(),
      listenerOptions,
    );
    this.sqlButton.addEventListener("click", () => this.openTerminal(), listenerOptions);
    requiredElement(this.root, "#reset-game").addEventListener("click", () => this.reset(), listenerOptions);
    requiredElement(this.root, "#skip-onboarding").addEventListener("click", () => this.onboarding.skip(), listenerOptions);
    requiredElement(this.root, "#replay-onboarding").addEventListener("click", () => this.onboarding.replay(), listenerOptions);
    requiredElement(this.root, "#replay-onboarding-control").addEventListener("click", () => this.onboarding.replay(), listenerOptions);
    this.audioButton.addEventListener("click", () => void this.toggleAudio(), listenerOptions);
    requiredElement<HTMLInputElement>(this.root, "#audio-volume").addEventListener("input", (event) => {
      this.audio.setVolume(Number((event.currentTarget as HTMLInputElement).value));
    }, listenerOptions);

    this.root.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => {
      button.addEventListener("click", () => {
        const directions: Record<string, [number, number]> = {
          up: [0, -1],
          down: [0, 1],
          left: [-1, 0],
          right: [1, 0],
        };
        const direction = directions[button.dataset.move ?? ""];
        if (direction) dispatchMove(direction[0], direction[1]);
      }, listenerOptions);
    });

    this.releaseAudioGesture = this.audio.armFirstGesture(window);
    window.addEventListener("dungeon:open-terminal", this.openTerminalHandler, listenerOptions);
    window.addEventListener("dungeon:inspection", this.inspectionHandler, listenerOptions);
    window.addEventListener("dungeon:milestone", this.milestoneHandler, listenerOptions);
    window.addEventListener("dungeon:patrol", this.patrolHandler, listenerOptions);
    window.addEventListener("keydown", this.keydownHandler, {
      ...listenerOptions,
      capture: true,
    });
    window.addEventListener("keyup", this.keyupHandler, listenerOptions);
    window.addEventListener("blur", this.blurHandler, listenerOptions);
    this.unsubscribeFeedback = this.feedback.subscribe((_event, notice) => {
      if (notice) this.showFeedbackNotice(notice);
    });
    this.unsubscribeOnboarding = this.onboarding.subscribe((snapshot) => {
      this.renderOnboarding(snapshot);
    });
    this.unsubscribeAgent = this.agentRuntime?.subscribe((state) => {
      if (this.lastSnapshot && this.isCampfireMenuOpen()) {
        this.renderCampfireMenu(this.lastSnapshot, false);
      }
      this.narrativeWorkflow.renderScribeState(state);
      this.agentPanel.render(state);
    }) ?? null;
    // DOM 只订阅 GameSession 发布的完整快照，不直接读取或修改内部规则字段。
    this.unsubscribeSession = this.session.subscribe((snapshot) => this.render(snapshot));
  }

  destroy(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.unsubscribeFeedback?.();
    this.unsubscribeFeedback = null;
    this.unsubscribeOnboarding?.();
    this.unsubscribeOnboarding = null;
    this.unsubscribeAgent?.();
    this.unsubscribeAgent = null;
    this.unsubscribePresence?.();
    this.unsubscribePresence = null;
    this.releaseAudioGesture?.();
    this.releaseAudioGesture = null;
    this.listenerController.abort();
    // mount() 可能在绑定某个 DOM 节点时失败；每个面板都按已创建状态独立
    // 清理，避免一个半初始化对象阻断其余订阅和计时器的释放。
    this.narrativeCodex?.destroy();
    this.monsterCodex?.destroy();
    this.recordPanel?.destroy();
    this.transientFeedbackPanel?.destroy();
    this.agentPanel?.destroy();
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.activeNotice = null;
    this.noticeQueue.length = 0;
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = null;
    this.narrativeWorkflow?.reset();
    this.transitionPanel?.destroy();
    this.root.classList.remove(
      "terminal-active",
      "gate-terminal-active",
      "campfire-active",
      "inventory-active",
      "loot-active",
      "review-active",
      "admin-active",
      "narrative-active",
      "inspection-active",
      "monster-codex-active",
      "victory-active",
    );
    // Audio 与 Presence 的外部生命周期由 GameRuntime 统一回收；这里只解绑
    // AppShell 自己注册的订阅、面板和用户手势监听，避免重复释放异步资源。
  }

  private async executeQuery(): Promise<void> {
    await this.terminalCoordinator.executeCombat();
  }

  private async executeGateChallenge(): Promise<void> {
    await this.terminalCoordinator.executeGateChallenge();
  }

  private openNarrativeCodex(): void {
    if (
      this.busy ||
      this.isGateTerminalOpen() ||
      this.isTerminalOpen() ||
      this.isReviewOpen() ||
      this.isMonsterCodexOpen() ||
      this.isAdminMenuOpen() ||
      this.isInventoryMenuOpen() ||
      this.isLootMenuOpen()
    ) {
      this.showFeedbackNotice({
        message: "先结束当前界面，再打开失名录。",
        tone: "info",
      });
      return;
    }
    this.hideNarrativeBeatCard();
    this.root.classList.add("narrative-active");
    this.narrativeCodex.open();
    this.syncAudioFocus();
  }

  private isNarrativeCodexOpen(): boolean {
    return this.narrativeCodex?.isOpen() ?? false;
  }

  private openMonsterCodex(): void {
    if (
      this.busy ||
      this.isGateTerminalOpen() ||
      this.isTerminalOpen() ||
      this.isReviewOpen() ||
      this.isNarrativeCodexOpen() ||
      this.isAdminMenuOpen() ||
      this.isInventoryMenuOpen() ||
      this.isLootMenuOpen()
    ) {
      this.showFeedbackNotice({
        message: "先结束当前界面，再打开怪物图鉴。",
        tone: "info",
      });
      return;
    }
    this.hideNarrativeBeatCard();
    this.root.classList.add("monster-codex-active");
    this.monsterCodex.open();
    this.syncAudioFocus();
  }

  private isMonsterCodexOpen(): boolean {
    return this.monsterCodex?.isOpen() ?? false;
  }

  private syncAudioFocus(): void {
    if (this.busy) {
      this.audio.setFocus("resolving");
      return;
    }
    this.audio.setFocus(
      this.isTerminalOpen() ||
      this.isGateTerminalOpen() ||
      this.isReviewOpen() ||
      this.isMonsterCodexOpen() ||
      this.isNarrativeCodexOpen() ||
      this.isCampfireMenuOpen() ||
      this.isInspectionOpen()
        ? "thinking"
        : "world",
    );
  }

  private openReview(
    scope: AnswerReviewScope = "all",
    context: "manual" | "campfire" | "death" = "manual",
  ): void {
    if ((this.busy && context !== "death") || this.isGateTerminalOpen()) return;
    if (this.isNarrativeCodexOpen()) this.narrativeCodex.close();
    if (this.isMonsterCodexOpen()) this.monsterCodex.close();
    if (this.isTerminalOpen()) this.closeTerminal(false);
    if (!this.isReviewOpen()) {
      this.focusBeforeTerminal = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    this.reviewScope = scope;
    this.reviewContext = context;
    this.answerReview.render(this.lastSnapshot, scope);
    this.answerReview.setOpen(true);
    this.root.classList.add("review-active");
    this.answerReview.closeButton.focus({
      preventScroll: true,
    });
    this.syncAudioFocus();
  }

  private closeReview(): void {
    if (!this.isReviewOpen()) return;
    const context = this.reviewContext;
    this.reviewContext = "manual";
    this.reviewScope = "all";
    this.answerReview.setOpen(false);
    this.root.classList.remove("review-active");
    this.syncAudioFocus();
    const focusTarget = this.focusBeforeTerminal;
    this.focusBeforeTerminal = null;
    if (context === "death") {
      this.session.continueAfterDeathReview();
      requiredElement<HTMLElement>(this.root, "#game-root").focus();
      return;
    }
    if (context === "campfire" && this.lastSnapshot.mode === "campfire") {
      requiredElement<HTMLButtonElement>(this.root, "#review-at-campfire").focus();
      return;
    }
    if (focusTarget?.isConnected && !focusTarget.matches(":disabled")) {
      focusTarget.focus();
    } else {
      requiredElement<HTMLButtonElement>(this.root, "#open-review").focus();
    }
  }

  private isReviewOpen(): boolean {
    return this.answerReview?.isOpen() ?? false;
  }

  private openAdminMenu(): void {
    if (this.busy || this.isTerminalOpen() || this.isGateTerminalOpen()) return;
    if (!this.lastSnapshot.adminMode) {
      const resolution = this.session.enableAdminMode();
      if (!resolution.ok) {
        this.showFeedbackNotice({ message: resolution.message, tone: "info" });
        return;
      }
    }
    this.session.setAdminPanelOpen(true);
    this.adminPanel.open(this.session.snapshot());
  }

  private closeAdminMenu(): void {
    if (!this.isAdminMenuOpen()) return;
    this.adminPanel.close();
    this.session.setAdminPanelOpen(false);
  }

  private isAdminMenuOpen(): boolean {
    return this.adminPanel?.isOpen() ?? false;
  }

  private handleAdminNextFloor(): void {
    const resolution = this.session.adminNextFloor();
    if (!resolution.ok) {
      this.showFeedbackNotice({ message: resolution.message, tone: "info" });
      return;
    }
    const snapshot = this.session.snapshot();
    this.sql.reset(snapshot.monsters);
    this.getBattleScene()?.abortEncounter();
    this.clearQueryArtifacts();
    if (this.isInspectionOpen()) this.closeInspection(false, false);
    this.resetAdminNarrativePresentation();
    this.adminPanel.render(snapshot);
  }

  private leaveCampfire(): void {
    this.campfirePanel.leave();
  }

  private retreatFromCombat(): void {
    if (this.busy) return;
    if (this.isTerminalOpen()) this.closeTerminal(false);
    const resolution = this.session.retreatFromCombat();
    if (!resolution.ok) {
      this.showFeedbackNotice({ message: resolution.message, tone: "info" });
      return;
    }
    this.getBattleScene()?.abortEncounter();
    this.showFeedbackNotice({ message: resolution.message, tone: "success" });
    requiredElement<HTMLElement>(this.root, "#game-root").focus({
      preventScroll: true,
    });
  }

  private closeInventoryMenu(): void {
    this.inventoryPanel.closeInventory();
  }

  private closeLootMenu(): void {
    this.inventoryPanel.closeLoot();
  }

  private isInventoryMenuOpen(): boolean {
    return this.inventoryPanel.isInventoryOpen();
  }

  private isLootMenuOpen(): boolean {
    return this.inventoryPanel.isLootOpen();
  }

  private renderInventoryMenu(snapshot: GameSnapshot, entered: boolean): void {
    this.inventoryPanel.renderInventory(snapshot, entered);
  }

  private renderLootMenu(snapshot: GameSnapshot, entered: boolean): void {
    this.inventoryPanel.renderLoot(snapshot, entered);
  }

  private renderCampfireMenu(snapshot: GameSnapshot, entered: boolean): void {
    this.campfirePanel.render(snapshot, entered);
  }

  private isCampfireMenuOpen(): boolean {
    return this.campfirePanel.isOpen();
  }

  private scribeMessage(authoredMessage: string): string {
    return redactSnapshotMonsterIdentity(authoredMessage, this.lastSnapshot);
  }

  private campfireReview(snapshot: GameSnapshot): CampfireReview {
    const localReview = buildCampfireReview(campfireReviewInput(snapshot));
    const agentReview = this.agentRuntime?.campfireFor(snapshot) ?? null;
    if (
      !localReview.available ||
      !agentReview
    ) {
      return localReview;
    }
    return {
      ...localReview,
      headline: agentReview.headline,
      facts: agentReview.facts,
      focusConcept: agentReview.focusConcept,
      nextAction: agentReview.nextAction,
      message: agentReview.message,
    };
  }

  private renderNarrativeProgress(snapshot: GameSnapshot): void {
    this.narrativeWorkflow.renderNarrativeProgress(snapshot);
  }

  private hideNarrativeBeatCard(): void {
    this.narrativeWorkflow.hideNarrativeBeatCard();
  }

  private resetAdminNarrativePresentation(): void {
    this.narrativeWorkflow.reset();
  }

  private openInspection(message: string): void {
    const copy = inspectionDialogCopy(
      redactSnapshotMonsterIdentity(message, this.lastSnapshot),
    );
    this.hideNarrativeBeatCard();
    this.recordPanel.open({
      kicker: "FIELD NOTE / 现场记录",
      title: copy.title,
      body: copy.body,
      closeLabel: "E · 关闭记录",
      kind: "inspection",
    });
  }

  private closeInspection(
    returnFocus = true,
    confirmStory = true,
  ): void {
    if (!this.isInspectionOpen()) return;
    if (
      confirmStory &&
      this.recordPanel.kind === "migration"
    ) {
      this.advanceFinalMigration();
      return;
    }
    const recordKind = this.recordPanel.kind;
    const activeMoment = this.narrativeWorkflow.activeNarrativeMoment;
    const confirmedMoment = confirmStory &&
        (recordKind === "story" || (
          recordKind === "scribe" &&
          activeMoment?.kind === "scribe"
        ))
      ? activeMoment
      : null;
    this.recordPanel.close(returnFocus);
    this.narrativeWorkflow.clearActiveMoment();
    if (confirmedMoment) {
      this.narrativeWorkflow.confirmMoment(confirmedMoment);
    }
  }

  private advanceFinalMigration(): void {
    this.narrativeWorkflow.advanceFinalMigration();
  }

  private isInspectionOpen(): boolean {
    return this.recordPanel.isOpen();
  }

  private openTerminal(): void {
    if (this.busy) return;
    if (!canOpenCombatTerminal(this.lastSnapshot?.mode, this.busy)) {
      if (this.lastSnapshot) {
        const message = "在迷宫中触碰怪物所在格后，SQL 终端才会解锁。";
        requiredElement(this.root, "#banner").textContent = message;
        this.showFeedbackNotice({ message, tone: "info" });
      }
      return;
    }
    if (!this.isTerminalOpen()) {
      this.focusBeforeTerminal = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    void this.audio.resume();
    this.audio.setFocus("thinking");
    this.terminal.classList.add("is-open");
    this.root.classList.add("terminal-active");
    this.terminal.inert = false;
    this.terminal.setAttribute("aria-hidden", "false");
    this.onboarding.advance("terminal-open");
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = window.setTimeout(() => {
      this.terminalFocusTimer = null;
      if (!this.busy && this.isTerminalOpen()) {
        this.textarea.focus({ preventScroll: true });
      }
    }, 60);
  }

  private closeTerminal(returnFocus = true): void {
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = null;
    this.combatAutocomplete.hide();
    this.terminal.classList.remove("is-open");
    if (!this.isGateTerminalOpen()) this.root.classList.remove("terminal-active");
    this.terminal.inert = true;
    this.terminal.setAttribute("aria-hidden", "true");
    this.syncAudioFocus();
    if (returnFocus) {
      this.textarea.blur();
      const focusTarget = this.focusBeforeTerminal;
      this.focusBeforeTerminal = null;
      if (
        focusTarget?.isConnected &&
        !focusTarget.matches(":disabled") &&
        !this.terminal.contains(focusTarget)
      ) {
        focusTarget.focus();
      } else {
        requiredElement<HTMLElement>(this.root, "#game-root").focus();
      }
    }
  }

  private isTerminalOpen(): boolean {
    return this.terminal.classList.contains("is-open");
  }

  private closeGateTerminal(): void {
    if (this.busy) return;
    this.session.cancelGateChallenge();
  }

  private openGateTerminal(): void {
    if (this.busy || !this.lastSnapshot?.activeGateChallenge) return;
    if (!this.isGateTerminalOpen()) {
      this.focusBeforeTerminal = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    void this.audio.resume();
    this.audio.setFocus("thinking");
    this.gateTerminal.classList.add("is-open");
    this.root.classList.add("terminal-active", "gate-terminal-active");
    this.gateTerminal.inert = false;
    this.gateTerminal.setAttribute("aria-hidden", "false");
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = window.setTimeout(() => {
      this.terminalFocusTimer = null;
      if (!this.busy && this.isGateTerminalOpen()) {
        this.gateTextarea.focus({ preventScroll: true });
      }
    }, 60);
  }

  private hideGateTerminal(returnFocus = true): void {
    if (this.terminalFocusTimer !== null) window.clearTimeout(this.terminalFocusTimer);
    this.terminalFocusTimer = null;
    this.gateAutocomplete.hide();
    this.gateTerminal.classList.remove("is-open");
    this.root.classList.remove("gate-terminal-active");
    if (!this.isTerminalOpen()) this.root.classList.remove("terminal-active");
    this.gateTerminal.inert = true;
    this.gateTerminal.setAttribute("aria-hidden", "true");
    this.syncAudioFocus();
    if (!returnFocus) return;
    this.gateTextarea.blur();
    const focusTarget = this.focusBeforeTerminal;
    this.focusBeforeTerminal = null;
    if (
      focusTarget?.isConnected &&
      !focusTarget.matches(":disabled") &&
      !this.gateTerminal.contains(focusTarget)
    ) {
      focusTarget.focus();
    } else {
      requiredElement<HTMLElement>(this.root, "#game-root").focus();
    }
  }

  private isGateTerminalOpen(): boolean {
    return this.gateTerminal.classList.contains("is-open");
  }

  private trapDialogFocus(event: KeyboardEvent, dialog: HTMLElement): void {
    this.dialogFocus.trap(event, dialog);
  }

  private showFeedbackNotice(notice: FeedbackNotice): void {
    if (this.activeNotice) {
      if (
        this.activeNotice.message === notice.message ||
        this.noticeQueue.some((entry) => entry.message === notice.message)
      ) return;
      this.noticeQueue.push(notice);
      if (this.noticeQueue.length > 4) this.noticeQueue.shift();
      return;
    }
    const toast = requiredElement(this.root, "#feedback-toast");
    this.activeNotice = notice;
    toast.replaceChildren(document.createTextNode(notice.message));
    toast.dataset.tone = notice.tone;
    toast.classList.add("is-visible");
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      this.toastTimer = null;
      this.activeNotice = null;
      const next = this.noticeQueue.shift();
      if (next) this.showFeedbackNotice(next);
    }, 2_400);
  }

  private presentLootAcquisition(items: readonly LootItem[], effect: string): void {
    this.feedbackTransitionWorkflow.presentLootAcquisition(
      items,
      effect,
      this.lastSnapshot.totalMoves,
    );
  }

  private showCombatSettlement(resolution: TurnResolution): void {
    this.feedbackTransitionWorkflow.showCombatSettlement(
      resolution,
      this.lastSnapshot.totalMoves,
    );
  }

  private dismissTransientCards(snapshot: GameSnapshot): void {
    this.feedbackTransitionWorkflow.dismissTransientCards(snapshot.totalMoves);
  }

  private requestHint(): void {
    if (this.busy) {
      this.showFeedbackNotice({ message: "当前回合正在结算，结束后再查看提示。", tone: "info" });
      return;
    }
    const message = this.session.requestHint();
    this.showFeedbackNotice({ message, tone: "info" });
  }

  private renderOnboarding(snapshot: OnboardingSnapshot): void {
    const card = requiredElement<HTMLElement>(this.root, "#onboarding-card");
    card.hidden = !snapshot.visible;
    if (!snapshot.visible) return;
    requiredElement(card, "#onboarding-step").textContent = `GUIDE / ${snapshot.step.id.toUpperCase()}`;
    requiredElement(card, "#onboarding-title").textContent = snapshot.step.title;
    requiredElement(card, "#onboarding-body").textContent = snapshot.step.body;
    requiredElement(card, "#onboarding-shortcut").textContent = snapshot.step.shortcut;
  }

  private reset(): void {
    this.resetWorkflow.run();
  }

  private async toggleAudio(): Promise<void> {
    await this.audio.initialize();
    const muted = this.audio.toggleMuted();
    this.audioButton.textContent = muted ? "♪ 声音关闭" : "♪ 声音开启";
    this.audioButton.setAttribute("aria-pressed", String(muted));
  }

  /**
   * 将一个完整游戏快照更新到 HUD、面板和转场。
   * 先比较前后快照得到语义投影，再由各渲染器消费；这里不重新计算游戏规则。
   */
  private render(snapshot: GameSnapshot): void {
    const previousSnapshot = this.lastSnapshot;
    // 投影层集中识别换层、进战、拾取等状态变化，避免每个面板重复比较快照。
    const projection = this.snapshotRenderer.project(
      previousSnapshot ?? null,
      snapshot,
      this.lastStageId,
      this.lastMode,
    );
    const {
      floorChanged,
      pickedItems,
      guidedPickup,
      roomLabel,
      biomeName,
      biomeIndex,
      routeTransit,
      target,
      stageChanged,
      enteredCombat,
      enteredChallenge,
      enteredCampfire,
      enteredInventory,
      enteredLoot,
      enteredDefeat,
      enteredDeathReview,
      terminalPlaceholder,
      musicMode,
    } = projection;
    if (floorChanged) {
      this.narrativeWorkflow.reset();
    }
    if (
      snapshot.mode !== "explore" &&
      this.isInspectionOpen() &&
      this.recordPanel.kind !== "story" &&
      this.recordPanel.kind !== "migration"
    ) {
      this.closeInspection(false);
    }
    const regionTransitLegend = requiredElement(this.root, "#map-region-transit");
    regionTransitLegend.hidden = !regionPortalsEnabledForFloor(snapshot.floor);
    regionTransitLegend.textContent = `◉ ${routeTransit.regionLabel ?? routeTransit.label}`;
    this.lastSnapshot = snapshot;
    if (enteredCombat) {
      this.transientFeedbackPanel.hidePickup();
      this.transientFeedbackPanel.hideCombatSettlement();
    } else {
      this.dismissTransientCards(snapshot);
    }

    // 从这里开始只把快照和投影写入稳定 DOM 节点。
    requiredElement(this.root, "#floor-value").textContent =
      `${String(snapshot.floor).padStart(2, "0")} / 08`;
    this.adminPanel.renderToggle(snapshot.adminMode);
    this.root.dataset.floor = String(snapshot.floor);
    this.root.dataset.biome = snapshot.currentBiome;
    this.textarea.placeholder = terminalPlaceholder;
    requiredElement(this.root, "#hp-value").textContent = `${snapshot.player.hp} / ${snapshot.player.maxHp}`;
    this.projectionRenderer.renderProgress(
      "#player-hp-progress",
      "#hp-meter",
      snapshot.player.hp,
      snapshot.player.maxHp,
      `${snapshot.player.hp} / ${snapshot.player.maxHp}`,
    );
    requiredElement(this.root, "#heat-value").textContent = String(snapshot.player.heat);
    const heatUnlocked = snapshot.floor >= 7;
    requiredElement<HTMLElement>(this.root, "#heat-chip").hidden = !heatUnlocked;
    requiredElement<HTMLElement>(this.root, "#heat-progress").hidden = !heatUnlocked;
    this.projectionRenderer.renderProgress(
      "#heat-progress",
      "#heat-meter",
      snapshot.player.heat,
      100,
      `${snapshot.player.heat} / 100`,
    );
    requiredElement(this.root, "#weapon-name").textContent = snapshot.player.weapon.name;
    requiredElement(this.root, "#armor-name").textContent = snapshot.player.armor
      ? `${snapshot.player.armor.name} ${snapshot.player.armorHp}/${snapshot.player.armor.maxArmor}`
      : "无防具";
    const nextXp = LEVEL_XP_THRESHOLDS[snapshot.player.level];
    requiredElement(this.root, "#level-value").textContent = nextXp === undefined
      ? `LV.${snapshot.player.level} · ${snapshot.player.xp} XP · MAX`
      : `LV.${snapshot.player.level} · ${snapshot.player.xp} / ${nextXp} XP`;
    requiredElement(this.root, "#relic-count").textContent = String(snapshot.relics.length);
    requiredElement(this.root, "#lesson-concept").textContent =
      `${biomeName} / ${snapshot.currentRoomType.toUpperCase()} / ${roomLabel}`;
    requiredElement(this.root, "#mission-title").textContent = snapshot.missionTitle;
    requiredElement(this.root, "#mission-body").textContent = snapshot.missionBody;
    requiredElement(this.root, "#lesson-intro").textContent = snapshot.lessonIntro;
    requiredElement(this.root, "#banner").textContent = snapshot.banner;
    requiredElement(this.root, "#interaction-prompt").textContent = snapshot.interactionPrompt;
    requiredElement(this.root, "#query-counter").textContent = `查询 ${snapshot.queryCount} 次`;
    requiredElement(this.root, "#terminal-title").textContent = `${snapshot.lessonId.toUpperCase()} · 阶段 ${snapshot.lessonStageIndex + 1} · 回合 ${snapshot.combat?.round ?? 1}`;
    requiredElement(this.root, "#terminal-objective").textContent = snapshot.missionBody;
    this.projectionRenderer.renderTaskBrief(snapshot);
    this.renderFinalMigrationArgument(snapshot);
    requiredElement(this.root, "#victory-count").textContent = `通关 ${snapshot.profile.victories}`;
    requiredElement(this.root, ".game-stage").classList.toggle("is-combat", snapshot.mode === "combat");
    this.sqlButton.disabled = snapshot.mode !== "combat" || this.busy;
    const retreatButton = requiredElement<HTMLButtonElement>(this.root, "#retreat-combat");
    retreatButton.hidden = snapshot.mode !== "combat";
    retreatButton.disabled = snapshot.mode !== "combat" || this.busy;
    requiredElement<HTMLButtonElement>(this.root, "#open-inventory").disabled =
      snapshot.mode !== "explore" && snapshot.mode !== "campfire";
    requiredElement<HTMLButtonElement>(this.root, "#reset-game").disabled =
      snapshot.adminMode ||
      snapshot.mode === "transition" ||
      snapshot.mode === "defeat" ||
      snapshot.mode === "death-review";
    this.transitionPanel.renderRegion(snapshot);
    this.transitionPanel.renderDefeat(snapshot, enteredDefeat);
    this.renderCampfireMenu(snapshot, enteredCampfire);
    this.renderInventoryMenu(snapshot, enteredInventory);
    this.renderLootMenu(snapshot, enteredLoot);
    this.renderNarrativeProgress(snapshot);
    this.renderFloorTransition(snapshot);
    this.projectionRenderer.renderMonsterCodex(snapshot);

    this.projectionRenderer.renderTarget(target, snapshot);
    const locksSignature = snapshot.locks.join("\u0000");
    if (locksSignature !== this.lastLocksSignature) {
      this.lastLocksSignature = locksSignature;
      this.projectionRenderer.renderLocks(snapshot);
    }
    this.schemaPanel.render(snapshot);
    const hintsSignature = snapshot.hints.join("\u0000");
    if (hintsSignature !== this.lastHintsSignature) {
      this.lastHintsSignature = hintsSignature;
      this.projectionRenderer.renderHints(snapshot.hints);
    }
    this.projectionRenderer.renderMazeMap(snapshot);
    const masterySignature = snapshot.profile.masteredLessons.join("\u0000");
    if (masterySignature !== this.lastMasterySignature) {
      this.lastMasterySignature = masterySignature;
      this.projectionRenderer.renderMastery(snapshot);
    }
    const relicsSignature = snapshot.relics
      .map((relic) => `${relic.id}:${relic.description}`)
      .join("\u0000");
    if (relicsSignature !== this.lastRelicsSignature) {
      this.lastRelicsSignature = relicsSignature;
      this.projectionRenderer.renderRelics(snapshot);
    }
    this.renderGateChallenge(snapshot, enteredChallenge);
    const latestPickup = pickedItems.at(-1) ?? guidedPickup;
    if (latestPickup) {
      this.transientFeedbackPanel.showPickup(
        latestPickup,
        snapshot.banner,
        snapshot.totalMoves,
      );
    }

    if (stageChanged || enteredCombat) {
      this.textarea.value = "";
      this.clearQueryArtifacts();
      this.queryStatus.textContent = enteredCombat
        ? snapshot.floor === 6
          ? "怪物行动已预告。请写出完整沙箱脚本；支持 INSERT、UPDATE、DELETE 与事务控制。"
          : snapshot.floor === 7
            ? "怪物行动已预告。写出查询后，结果与 SQLite 执行计划必须同时正确。"
            : snapshot.floor === 8
              ? "怪物行动已预告。请从本阶段事故记录中查询可验证证据。"
              : "怪物行动已预告。请完整写出本回合只读 SQL；第四层起允许从 WITH 开始。"
        : "目标已经变化，请重新写一条完整 SQL。";
      this.queryStatus.dataset.kind = "";
    }
    if (shouldAutofillAdminAnswer(previousSnapshot ?? null, snapshot)) {
      this.textarea.value = adminAnswerForInput(snapshot) ?? "";
      this.queryStatus.textContent = "管理员模式：当前题目的正确 SQL 已填入，可直接执行。";
      this.queryStatus.dataset.kind = "success";
    }
    if (snapshot.mode !== "combat" && this.isTerminalOpen()) this.closeTerminal(true);
    if (snapshot.mode !== "challenge" && this.isGateTerminalOpen()) {
      this.hideGateTerminal(true);
    }

    this.audio.setScene({
      floor: snapshot.floor,
      region: biomeIndex,
      mode: musicMode,
    });
    this.syncAudioFocus();
    if (this.isAdminMenuOpen()) this.adminPanel.render(snapshot);
    if (this.isReviewOpen()) this.answerReview.render(snapshot, this.reviewScope);
    if (enteredDeathReview || (snapshot.mode === "death-review" && !this.isReviewOpen())) {
      this.openReview("battle", "death");
    }

    this.lastStageId = snapshot.lessonStageId;
    this.lastMode = snapshot.mode;
  }

  private renderFinalMigrationArgument(snapshot: GameSnapshot): void {
    const root = requiredElement<HTMLElement>(
      this.root,
      "#final-migration-argument",
    );
    const copy = finalMigrationArgumentCopy(snapshot);
    root.hidden = copy === null;
    if (!copy) return;
    requiredElement(root, "#final-migration-argument-title").textContent =
      copy.argument;
    requiredElement(root, "#final-migration-argument-evidence").textContent =
      copy.evidence;
    requiredElement(root, "#final-migration-argument-conclusion").textContent =
      copy.conclusion;
  }

  private renderGateChallenge(snapshot: GameSnapshot, entered: boolean): void {
    const challenge = snapshot.activeGateChallenge;
    if (!challenge) return;
    this.gateAutocomplete.setSchemaLines([
      ...challenge.schema,
      ...COMPLETE_SCHEMA_LINES,
      ...COMPLETE_RELATION_LINES,
    ]);
    this.gateAutocomplete.setPreferredKeywords(
      challenge.hints.flatMap((hint) => (
        ["INNER JOIN", "LEFT JOIN", "JOIN", "ON", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT"]
          .filter((keyword) => hint.toLocaleUpperCase().includes(keyword))
      )),
    );
    requiredElement(this.root, "#gate-terminal-title").textContent = challenge.title;
    requiredElement(this.root, "#gate-terminal-objective").textContent = challenge.objective;

    const schemaRoot = requiredElement(this.root, "#gate-challenge-schema");
    schemaRoot.replaceChildren();
    challenge.schema.forEach((line) => {
      const code = document.createElement("code");
      code.textContent = line;
      schemaRoot.append(code);
    });

    const hintRoot = requiredElement(this.root, "#gate-challenge-hints");
    hintRoot.replaceChildren();
    challenge.hints.forEach((hint, index) => {
      const item = document.createElement("p");
      item.textContent = `提示 ${index + 1} · ${hint}`;
      hintRoot.append(item);
    });

    if (entered) {
      this.gateTextarea.value = "";
      this.gateQueryStatus.textContent = "空输入不触发反噬；语法或结果错误才扣除 1 点生命。";
      this.gateQueryStatus.dataset.kind = "";
      const resultRoot = requiredElement(this.root, "#gate-query-result");
      const planRoot = requiredElement(this.root, "#gate-query-plan");
      resultRoot.className = "table-wrap empty-state";
      resultRoot.textContent = "尚未执行机关查询。";
      planRoot.className = "plan-list empty-state";
      planRoot.textContent = "等待 EXPLAIN QUERY PLAN。";
    }
    this.openGateTerminal();
  }

  private renderFloorTransition(snapshot: GameSnapshot): void {
    this.feedbackTransitionWorkflow.renderFloorTransition(snapshot);
  }

  private advanceFromFloorTransition(): void {
    const current = this.session.snapshot();
    if (current.mode !== "transition" || current.floor >= 8) return;
    this.transientFeedbackPanel.hidePickup();
    this.transientFeedbackPanel.hideCombatSettlement();
    this.hideNarrativeBeatCard();
    if (
      this.isInspectionOpen() &&
      this.recordPanel.kind !== "migration"
    ) {
      this.closeInspection(false, false);
    }
    this.narrativeWorkflow.clearActiveMoment();
    this.narrativeWorkflow.reset();
    if (!this.session.advanceFloor()) return;
    const nextSnapshot = this.session.snapshot();
    this.sql.reset(nextSnapshot.monsters);
    this.clearQueryArtifacts();
    this.audio.setScene({
      floor: nextSnapshot.floor,
      region: 0,
      mode: "explore",
    });
  }

  private isVictoryPortalOpen(): boolean {
    return this.transitionPanel.isVictoryOpen();
  }

  private renderResult(
    result: SqlQueryResult,
    disclosure: QueryResultDisclosure,
  ): void {
    this.terminalPanel.renderResult(
      result,
      this.session.snapshot(),
      disclosure,
      this.resultRoot,
      this.planRoot,
    );
  }

  private renderGateResult(
    result: SqlQueryResult,
    disclosure: QueryResultDisclosure,
  ): void {
    this.terminalPanel.renderResult(
      result,
      this.session.snapshot(),
      disclosure,
      requiredElement(this.root, "#gate-query-result"),
      requiredElement(this.root, "#gate-query-plan"),
    );
  }

  private clearQueryArtifacts(): void {
    this.terminalPanel.clearQueryArtifacts();
  }
}
