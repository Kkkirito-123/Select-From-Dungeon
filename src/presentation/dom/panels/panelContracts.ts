/**
 * DOM Panel 共用的动作边界。
 *
 * Panel 只接收快照和已绑定的动作，不创建 GameSession、存储或 Agent 实例。
 * 这样 DOM 交互可以独立测试，真正的状态变化仍由 AppShell 转发给领域门面。
 */
import type { FeedbackNotice } from "../../../infrastructure/feedback/FeedbackDirector";
import type { LootItem } from "../../../domain/shared/types";
import type { InventoryResolution } from "../../../contracts/game/results";

export type PanelResolution = {
  ok: boolean;
  message: string;
};

export type LootAction = "store" | "equip" | "claim";

export interface InventoryPanelActions {
  openInventory(): void;
  closeInventory(): boolean;
  closeLootBundle(): boolean;
  takeAllLoot(bundleId: string): InventoryResolution;
  equipInventoryItem(itemId: string): PanelResolution;
  discardInventoryItem(itemId: string): PanelResolution;
  useConsumable(itemId: string): PanelResolution;
  discardConsumable(itemId: string): PanelResolution;
  takeLootItem(
    bundleId: string,
    dropId: string,
    action: LootAction,
    replaceInstanceId?: string,
  ): PanelResolution;
  showNotice(notice: FeedbackNotice): void;
  presentLoot(items: readonly LootItem[], effect: string): void;
  focusGame(): void;
}

export interface CampfirePanelActions {
  openInventory(): void;
  openReview(): void;
  restAtCampfire(): PanelResolution;
  leaveCampfire(): boolean;
  showNotice(notice: FeedbackNotice): void;
  focusGame(): void;
}
