import { NARRATIVE_ENDINGS } from "../../../content/narrative/narrativeContent";
import {
  floorMapBlueprint,
  floorTransitPresentation,
} from "../../../content/world/floorMapBlueprints";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import { narrativeFloorFor } from "../../../domain/progression/narrative";
import {
  FloorTransitionCoordinator,
  floorTransitionPolicy,
} from "../FloorTransitionCoordinator";
import { finalVictoryPortalReady } from "../policies/appShellPolicies";

function requiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少转场元素：${selector}`);
  return element;
}

export interface TransitionPanelActions {
  advanceFloor(): void;
  hidePickup(): void;
  hideCombatSettlement(): void;
  respawnAfterDefeat(): void;
}

/** 拥有楼层、区域和死亡转场的 DOM 与短时定时器。 */
export class TransitionPanel {
  private readonly floorCoordinator: FloorTransitionCoordinator;
  private defeatTimer: number | null = null;
  private regionTimer: number | null = null;
  private lastRegionTransferSequence = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: TransitionPanelActions,
  ) {
    this.floorCoordinator = new FloorTransitionCoordinator({
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (timerId) => window.clearTimeout(timerId),
    }, actions.advanceFloor);
  }

  renderFloor(snapshot: GameSnapshot, presentationBlocked: boolean): void {
    const portal = requiredElement<HTMLElement>(this.root, "#floor-portal");
    const victoryWasVisible = !portal.hidden && portal.dataset.state === "victory";
    const policy = floorTransitionPolicy({
      mode: snapshot.mode,
      floor: snapshot.floor,
      finalVictoryReady: finalVictoryPortalReady(snapshot),
      presentationBlocked,
    });
    const visible = policy.transitionVisible || policy.victoryVisible;
    portal.hidden = !visible;
    portal.inert = !visible;
    portal.setAttribute("aria-hidden", String(!visible));
    requiredElement<HTMLElement>(portal, "#floor-victory-actions").hidden =
      !policy.victoryVisible;
    this.root.classList.toggle("victory-active", policy.victoryVisible);

    if (policy.transitionVisible) {
      this.renderFloorAdvance(portal, snapshot);
      this.actions.hidePickup();
    } else if (policy.victoryVisible) {
      this.renderVictory(portal, victoryWasVisible);
      this.actions.hidePickup();
    } else {
      delete portal.dataset.state;
      portal.removeAttribute("role");
      portal.removeAttribute("aria-modal");
      portal.removeAttribute("aria-labelledby");
    }
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 650
      : 1_500;
    this.floorCoordinator.sync(policy.shouldScheduleAdvance, delay);
  }

  private renderFloorAdvance(portal: HTMLElement, snapshot: GameSnapshot): void {
    portal.dataset.state = "transition";
    portal.removeAttribute("role");
    portal.removeAttribute("aria-modal");
    portal.removeAttribute("aria-labelledby");
    const ascent = narrativeFloorFor(snapshot.floor).ascent;
    const blueprint = floorMapBlueprint(snapshot.floor);
    const transit = floorTransitPresentation(blueprint.ascentTransit);
    const arrival = ascent?.arrival ?? `第 ${snapshot.floor + 1} 层`;
    portal.dataset.transit = blueprint.ascentTransit;
    requiredElement(portal, "#floor-ascent-facility").textContent = transit.label;
    requiredElement(portal, "#floor-ascent-destination").textContent = arrival;
    requiredElement(portal, "#floor-clear-title").textContent =
      `FLOOR ${String(snapshot.floor).padStart(2, "0")} CLEARED`;
    requiredElement(portal, "#floor-clear-copy").textContent =
      `CONGRATULATIONS!! · ${transit.action}${transit.label} · 前往${arrival}`;
  }

  private renderVictory(portal: HTMLElement, victoryWasVisible: boolean): void {
    portal.dataset.state = "victory";
    portal.setAttribute("role", "dialog");
    portal.setAttribute("aria-modal", "true");
    portal.setAttribute("aria-labelledby", "floor-clear-title");
    portal.dataset.transit = "migrate";
    requiredElement(portal, "#floor-ascent-facility").textContent = "HISTORY";
    requiredElement(portal, "#floor-ascent-destination").textContent = "IDENTITY";
    requiredElement(portal, "#floor-clear-title").textContent = "DUNGEON CLEARED";
    requiredElement(portal, "#floor-clear-copy").textContent =
      NARRATIVE_ENDINGS[0].finalLine;
    if (victoryWasVisible) return;
    queueMicrotask(() => {
      if (!this.isVictoryOpen()) return;
      requiredElement<HTMLButtonElement>(portal, "#open-ending-codex").focus({
        preventScroll: true,
      });
    });
  }

  isVictoryOpen(): boolean {
    const portal = this.root.querySelector<HTMLElement>("#floor-portal");
    return Boolean(portal && !portal.hidden && portal.dataset.state === "victory");
  }

  renderRegion(snapshot: GameSnapshot): void {
    const transfer = snapshot.regionTransfer;
    if (!transfer || transfer.sequence <= this.lastRegionTransferSequence) return;
    this.lastRegionTransferSequence = transfer.sequence;
    const overlay = requiredElement<HTMLElement>(this.root, "#region-transition");
    const blueprint = floorMapBlueprint(snapshot.floor);
    const transit = floorTransitPresentation(blueprint.routeTransit);
    overlay.dataset.transit = blueprint.routeTransit;
    requiredElement(overlay, "#region-transition-kind").textContent =
      `REGION TRANSIT / ${transit.label}`;
    requiredElement(overlay, "#region-transition-route").textContent =
      `${transfer.fromName} → ${transfer.toName}`;
    requiredElement(overlay, "#region-transition-copy").textContent =
      `${transit.action}${transit.label} · 生态音乐与地图色调正在切换…`;
    overlay.hidden = false;
    if (this.regionTimer !== null) window.clearTimeout(this.regionTimer);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 350 : 850;
    this.regionTimer = window.setTimeout(() => {
      overlay.hidden = true;
      this.regionTimer = null;
    }, delay);
  }

  renderDefeat(snapshot: GameSnapshot, entered: boolean): void {
    const overlay = requiredElement<HTMLElement>(this.root, "#run-state-overlay");
    const defeated = snapshot.mode === "defeat";
    overlay.hidden = !defeated;
    if (!defeated) {
      this.cancelDefeat();
      return;
    }
    this.actions.hidePickup();
    this.actions.hideCombatSettlement();
    requiredElement(overlay, "p").textContent = snapshot.respawnCampfireId
      ? "正在返回最近休息的篝火…"
      : "尚未记录篝火，正在返回本层出生安全区…";
    if (entered) this.cancelDefeat();
    if (this.defeatTimer !== null) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 500 : 1_200;
    this.defeatTimer = window.setTimeout(() => {
      this.defeatTimer = null;
      this.actions.respawnAfterDefeat();
    }, delay);
  }

  cancelDefeat(): void {
    if (this.defeatTimer === null) return;
    window.clearTimeout(this.defeatTimer);
    this.defeatTimer = null;
  }

  destroy(): void {
    this.floorCoordinator.destroy();
    this.cancelDefeat();
    if (this.regionTimer !== null) window.clearTimeout(this.regionTimer);
    this.regionTimer = null;
  }
}
