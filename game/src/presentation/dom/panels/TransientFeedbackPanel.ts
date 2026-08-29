/** 拾取和战斗结算两张短时反馈卡片。 */
import { monsterIdLabel } from "../../../domain/progression/monsterIdentity";
import type { TurnResolution } from "../../../contracts/game/results";
import type { GroundItem, LootItem } from "../../../domain/shared/types";
import {
  combatSettlementCopy,
  shouldDismissTransientCard,
} from "../policies/appShellPolicies";

function requiredElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少短时反馈元素：${selector}`);
  return element;
}

export interface TransientFeedbackPanelActions {
  settlementAutoClosed(): void;
}

/** 管理两张短时卡片的 DOM、显示步数和自动关闭时钟。 */
export class TransientFeedbackPanel {
  private pickupShownAtMove: number | null = null;
  private settlementShownAtMove: number | null = null;
  private settlementTimer: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: TransientFeedbackPanelActions,
  ) {}

  showPickup(item: GroundItem, effect: string, totalMoves: number): void {
    const card = requiredElement<HTMLElement>(this.root, "#pickup-card");
    const kindLabel: Record<GroundItem["kind"], string> = {
      weapon: "WEAPON / 已自动装备",
      relic: "RELIC / 本轮自动生效",
      heal: "RECOVERY / 已立即生效",
      event: "EVENT / 已立即结算",
      key: "KEY ITEM / 已记录",
    };
    requiredElement(card, "#pickup-kind").textContent = kindLabel[item.kind];
    requiredElement(card, "#pickup-name").textContent = item.name;
    requiredElement(card, "#pickup-description").textContent = item.description;
    requiredElement(card, "#pickup-effect").textContent = effect;
    this.pickupShownAtMove = totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
  }

  showLootPickup(
    items: readonly LootItem[],
    effect: string,
    totalMoves: number,
  ): void {
    const single = items.length === 1 ? items[0] : null;
    const card = requiredElement<HTMLElement>(this.root, "#pickup-card");
    const kindLabel = single
      ? single.kind === "weapon"
        ? "WEAPON / 已处理"
        : single.kind === "armor"
          ? "ARMOR / 已处理"
          : single.kind === "consumable"
            ? "RECOVERY / 已入栏"
            : single.rewardId === "floor-key"
              ? "KEY ITEM / 已记录"
              : "REWARD / 已领取"
      : `LOOT ×${items.length} / 已处理`;
    requiredElement(card, "#pickup-kind").textContent = kindLabel;
    requiredElement(card, "#pickup-name").textContent =
      items.map((item) => item.name).join("、");
    requiredElement(card, "#pickup-description").textContent =
      items.map((item) => `${item.name}：${item.description}`).join("；");
    requiredElement(card, "#pickup-effect").textContent = effect;
    this.pickupShownAtMove = totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
  }

  showCombatSettlement(resolution: TurnResolution, totalMoves: number): void {
    if (!resolution.experience) return;
    const card = requiredElement<HTMLElement>(this.root, "#combat-result-card");
    const recoveredIdentity = resolution.events.some(
      (event) => event.type === "identity-recovered",
    );
    const copy = combatSettlementCopy(
      resolution.experience,
      resolution.events.some((event) => event.type === "loot-drop"),
      resolution.events.find((event) => event.type === "auto-heal")?.itemName,
    );
    card.classList.toggle("is-new-identity", recoveredIdentity);
    requiredElement(card, "#combat-result-kicker").textContent = recoveredIdentity
      ? "NAME RECOVERED / 获得名字"
      : "IDENTITY CONFIRMED / 已识别记录";
    requiredElement(card, "#combat-result-id").textContent =
      monsterIdLabel(resolution.experience.monsterId);
    requiredElement(card, "#combat-result-name").textContent =
      resolution.experience.monsterName;
    requiredElement(card, "#combat-result-title").textContent = copy.title;
    requiredElement(card, "#combat-result-xp").textContent = copy.xp;
    requiredElement(card, "#combat-result-progress").textContent = copy.progress;
    requiredElement(card, "#combat-result-level").textContent = copy.levelUp;
    requiredElement(card, "#combat-result-reward").textContent = copy.reward;
    this.settlementShownAtMove = totalMoves;
    card.hidden = false;
    card.classList.add("is-visible");
    this.cancelSettlementTimer();
    if (resolution.mode !== "transition" && resolution.mode !== "victory") return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 900
      : 1_800;
    this.settlementTimer = window.setTimeout(() => {
      this.settlementTimer = null;
      this.hideCombatSettlement();
      this.actions.settlementAutoClosed();
    }, delay);
  }

  hidePickup(): void {
    const card = this.root.querySelector<HTMLElement>("#pickup-card");
    if (!card) return;
    this.pickupShownAtMove = null;
    card.classList.remove("is-visible");
    card.hidden = true;
  }

  hideCombatSettlement(): void {
    const card = this.root.querySelector<HTMLElement>("#combat-result-card");
    if (!card) return;
    this.cancelSettlementTimer();
    this.settlementShownAtMove = null;
    card.classList.remove("is-visible");
    card.hidden = true;
  }

  isCombatSettlementVisible(): boolean {
    return this.root.querySelector<HTMLElement>("#combat-result-card")
      ?.classList.contains("is-visible") ?? false;
  }

  dismissAfterMoves(totalMoves: number): void {
    if (shouldDismissTransientCard(this.pickupShownAtMove, totalMoves)) {
      this.hidePickup();
    }
    if (shouldDismissTransientCard(this.settlementShownAtMove, totalMoves)) {
      this.hideCombatSettlement();
    }
  }

  destroy(): void {
    this.pickupShownAtMove = null;
    this.settlementShownAtMove = null;
    this.cancelSettlementTimer();
  }

  private cancelSettlementTimer(): void {
    if (this.settlementTimer === null) return;
    window.clearTimeout(this.settlementTimer);
    this.settlementTimer = null;
  }
}
