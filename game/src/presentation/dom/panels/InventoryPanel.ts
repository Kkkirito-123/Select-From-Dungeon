/**
 * 背包和战利品 Panel。
 *
 * 该模块只负责两个 DOM 菜单的交互和渲染。它通过显式动作端口请求装备、
 * 丢弃和领取，不直接修改 GameSession，也不读取 localStorage。数据来源是
 * 每次渲染传入的 GameSnapshot，菜单本身没有独立状态副本。
 */
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type {
  InventoryPanelActions,
  LootAction,
  PanelResolution,
} from "./panelContracts";

function requiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少背包界面元素：${selector}`);
  return element;
}

export class InventoryPanel {
  private readonly inventoryMenu: HTMLElement;
  private readonly lootMenu: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: InventoryPanelActions,
  ) {
    this.inventoryMenu = requiredElement(root, "#inventory-menu");
    this.lootMenu = requiredElement(root, "#loot-menu");
  }

  /** 供 AppShell 的键盘和焦点协调使用。 */
  isInventoryOpen(): boolean {
    return this.inventoryMenu.classList.contains("is-open");
  }

  /** 供 AppShell 的键盘和焦点协调使用。 */
  isLootOpen(): boolean {
    return this.lootMenu.classList.contains("is-open");
  }

  /**
   * 绑定背包和战利品菜单的事件。
   *
   * `getSnapshot` 只用于比较“领取全部”前后的物品，不保存快照副本；实际
   * 领取、装备和丢弃仍通过 actions 交给 GameSession。
   */
  bind(
    options: AddEventListenerOptions,
    getSnapshot: () => GameSnapshot,
  ): void {
    requiredElement<HTMLButtonElement>(this.root, "#open-inventory")
      .addEventListener("click", () => this.actions.openInventory(), options);
    requiredElement<HTMLButtonElement>(this.root, "#close-inventory")
      .addEventListener("click", () => this.closeInventory(), options);
    requiredElement<HTMLButtonElement>(this.root, "#close-loot")
      .addEventListener("click", () => this.closeLoot(), options);
    requiredElement<HTMLElement>(this.root, "#equipment-inventory")
      .addEventListener("click", (event) => {
        this.handleInventoryAction(event, getSnapshot());
      }, options);
    requiredElement<HTMLElement>(this.root, "#consumable-inventory")
      .addEventListener("click", (event) => {
        this.handleInventoryAction(event, getSnapshot());
      }, options);
    requiredElement<HTMLElement>(this.root, "#loot-items")
      .addEventListener("click", (event) => {
        this.handleLootAction(event, getSnapshot());
      }, options);
    requiredElement<HTMLButtonElement>(this.root, "#take-all-loot")
      .addEventListener("click", () => this.takeAllLoot(getSnapshot()), options);
  }

  closeInventory(): void {
    if (!this.actions.closeInventory()) return;
    this.actions.focusGame();
  }

  closeLoot(): void {
    if (!this.actions.closeLootBundle()) return;
    this.actions.focusGame();
  }

  /** 把菜单内的按钮事件转换为显式领域动作。 */
  handleInventoryAction(event: Event, snapshot: GameSnapshot): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-inventory-action]",
    );
    if (!button) return;
    const action = button.dataset.inventoryAction;
    const itemId = button.dataset.itemId;
    if (!itemId) return;
    const equipment = snapshot.equipmentInventory.find(
      (item) => item.instanceId === itemId,
    );
    const consumable = snapshot.consumables.find(
      (stack) => stack.item.id === itemId,
    );
    const resolution = action === "equip" && equipment
      ? this.actions.equipInventoryItem(equipment.instanceId)
      : action === "discard-equipment" && equipment
        ? this.actions.discardInventoryItem(equipment.instanceId)
        : action === "use" && consumable
          ? this.actions.useConsumable(consumable.item.id)
          : action === "discard-consumable" && consumable
            ? this.actions.discardConsumable(consumable.item.id)
            : null;
    if (resolution) this.showResolution(resolution);
  }

  /** 把战利品按钮转换为领取动作，并保留替换装备选择。 */
  handleLootAction(event: Event, snapshot: GameSnapshot): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-loot-action]",
    );
    if (!button) return;
    const bundleId = snapshot.activeLootBundleId;
    const dropId = button.dataset.dropId;
    const action = button.dataset.lootAction as LootAction | undefined;
    if (
      !bundleId ||
      !dropId ||
      (action !== "store" && action !== "equip" && action !== "claim")
    ) return;
    const card = button.closest<HTMLElement>("[data-loot-card]");
    const replaceInstanceId = card
      ?.querySelector<HTMLSelectElement>("[data-loot-replacement]")
      ?.value || undefined;
    const item = snapshot.lootBundles
      .find((bundle) => bundle.id === bundleId)
      ?.items.find((entry) => entry.dropId === dropId);
    const resolution = this.actions.takeLootItem(
      bundleId,
      dropId,
      action,
      replaceInstanceId,
    );
    if (resolution.ok && item) {
      this.actions.presentLoot([item], resolution.message);
    } else {
      this.showResolution(resolution);
    }
  }

  private takeAllLoot(snapshot: GameSnapshot): void {
    const bundleId = snapshot.activeLootBundleId;
    if (!bundleId) return;
    const before = snapshot.lootBundles
      .find((bundle) => bundle.id === bundleId)
      ?.items ?? [];
    const resolution = this.actions.takeAllLoot(bundleId);
    const remaining = new Set(resolution.remainingItemIds);
    const acquired = before.filter((item) => !remaining.has(item.dropId));
    if (resolution.ok) {
      this.actions.presentLoot(acquired, resolution.message);
    } else {
      this.showResolution(resolution);
    }
  }

  renderInventory(snapshot: GameSnapshot, entered: boolean): void {
    const open = snapshot.mode === "inventory";
    this.inventoryMenu.hidden = !open;
    this.inventoryMenu.inert = !open;
    this.inventoryMenu.setAttribute("aria-hidden", String(!open));
    this.inventoryMenu.classList.toggle("is-open", open);
    this.root.classList.toggle("inventory-active", open);
    if (!open) return;

    requiredElement(this.inventoryMenu, "#equipment-capacity").textContent =
      `${snapshot.equipmentInventory.length} / 12`;
    requiredElement(this.inventoryMenu, "#consumable-capacity").textContent =
      `${snapshot.consumables.length} / 3`;

    const equippedRoot = requiredElement(this.inventoryMenu, "#equipped-summary");
    equippedRoot.replaceChildren();
    const equippedEntries = [
      {
        slot: "武器",
        name: snapshot.player.weapon.name,
        detail: `伤害 ${snapshot.player.weapon.damage}`,
      },
      {
        slot: "防具",
        name: snapshot.player.armor?.name ?? "未装备",
        detail: snapshot.player.armor
          ? `护甲 ${snapshot.player.armorHp}/${snapshot.player.armor.maxArmor}`
          : "先获得防具，再用护甲承受错误反击",
      },
    ];
    equippedEntries.forEach((entry) => {
      const article = document.createElement("article");
      const slot = document.createElement("span");
      slot.textContent = entry.slot;
      const name = document.createElement("strong");
      name.textContent = entry.name;
      const detail = document.createElement("small");
      detail.textContent = entry.detail;
      article.append(slot, name, detail);
      equippedRoot.append(article);
    });

    const equipmentRoot = requiredElement(this.inventoryMenu, "#equipment-inventory");
    equipmentRoot.replaceChildren();
    if (snapshot.equipmentInventory.length === 0) {
      const empty = document.createElement("p");
      empty.className = "inventory-empty";
      empty.textContent = "装备背包为空。怪物掉落会以一个战利品包出现在地图上。";
      equipmentRoot.append(empty);
    }
    snapshot.equipmentInventory.forEach((item) => {
      const article = document.createElement("article");
      article.className = "inventory-item";
      const title = document.createElement("strong");
      title.textContent = item.weapon?.name ?? item.armor?.name ?? "未知装备";
      const description = document.createElement("p");
      description.textContent = item.weapon?.description ?? item.armor?.description ?? "";
      const stats = document.createElement("code");
      stats.textContent = item.weapon
        ? `武器 · 伤害 ${item.weapon.damage}`
        : `防具 · 护甲 ${item.armorHp ?? 0}/${item.armor?.maxArmor ?? 0}`;
      const actions = document.createElement("div");
      actions.className = "inventory-item__actions";
      const equip = document.createElement("button");
      equip.type = "button";
      equip.dataset.inventoryAction = "equip";
      equip.dataset.itemId = item.instanceId;
      equip.textContent = "装备";
      const discard = document.createElement("button");
      discard.type = "button";
      discard.dataset.inventoryAction = "discard-equipment";
      discard.dataset.itemId = item.instanceId;
      discard.textContent = item.protected ? "课程装备 · 受保护" : "丢到脚下";
      discard.disabled = item.protected;
      actions.append(equip, discard);
      article.append(title, description, stats, actions);
      equipmentRoot.append(article);
    });

    const consumableRoot = requiredElement(this.inventoryMenu, "#consumable-inventory");
    consumableRoot.replaceChildren();
    if (snapshot.consumables.length === 0) {
      const empty = document.createElement("p");
      empty.className = "inventory-empty";
      empty.textContent = "恢复品栏为空（3 格，每格最多堆叠 5 个）。";
      consumableRoot.append(empty);
    }
    snapshot.consumables.forEach((stack) => {
      const article = document.createElement("article");
      article.className = "inventory-item";
      const title = document.createElement("strong");
      title.textContent = `${stack.item.name} × ${stack.quantity}`;
      const description = document.createElement("p");
      description.textContent = stack.item.description;
      const actions = document.createElement("div");
      actions.className = "inventory-item__actions";
      const use = document.createElement("button");
      use.type = "button";
      use.dataset.inventoryAction = "use";
      use.dataset.itemId = stack.item.id;
      use.textContent = "使用";
      const discard = document.createElement("button");
      discard.type = "button";
      discard.dataset.inventoryAction = "discard-consumable";
      discard.dataset.itemId = stack.item.id;
      discard.textContent = "丢 1 个";
      actions.append(use, discard);
      article.append(title, description, actions);
      consumableRoot.append(article);
    });

    const keyRoot = requiredElement(this.inventoryMenu, "#key-inventory");
    keyRoot.replaceChildren();
    if (snapshot.keyItems.length === 0) {
      keyRoot.textContent = "尚未获得本层钥匙。捷径钥匙位于中后段，楼层钥匙由层主掉落。";
    } else {
      snapshot.keyItems.forEach((keyId) => {
        const chip = document.createElement("span");
        chip.textContent = keyId.startsWith("shortcut-key:")
          ? `捷径钥匙 · 第 ${snapshot.floor} 层`
          : keyId.startsWith("floor-")
            ? `楼层钥匙 · ${keyId.match(/\d+/)?.[0] ?? snapshot.floor}`
            : keyId;
        keyRoot.append(chip);
      });
    }

    if (entered) {
      requiredElement<HTMLButtonElement>(this.inventoryMenu, "#close-inventory")
        .focus({ preventScroll: true });
    }
  }

  renderLoot(snapshot: GameSnapshot, entered: boolean): void {
    const bundle = snapshot.activeLootBundleId
      ? snapshot.lootBundles.find((entry) => entry.id === snapshot.activeLootBundleId)
      : null;
    const open = snapshot.mode === "loot" && Boolean(bundle);
    this.lootMenu.hidden = !open;
    this.lootMenu.inert = !open;
    this.lootMenu.setAttribute("aria-hidden", String(!open));
    this.lootMenu.classList.toggle("is-open", open);
    this.root.classList.toggle("loot-active", open);
    if (!open || !bundle) return;

    requiredElement(this.lootMenu, "#loot-menu-title").textContent =
      `战利品包 · ${bundle.items.length} 件`;
    requiredElement(this.lootMenu, "#loot-menu-status").textContent =
      `装备 ${snapshot.equipmentInventory.length}/12 · 恢复品 ${snapshot.consumables.length}/3。每件掉落独立判定，同一战斗不重复。`;
    const root = requiredElement(this.lootMenu, "#loot-items");
    root.replaceChildren();
    const replaceable = snapshot.equipmentInventory.filter((item) => !item.protected);
    bundle.items.forEach((item) => {
      const article = document.createElement("article");
      article.className = `loot-item loot-item--${item.kind}`;
      article.dataset.lootCard = item.dropId;
      const header = document.createElement("div");
      const kind = document.createElement("span");
      kind.textContent = item.guaranteed
        ? "固定奖励"
        : `${Math.round(item.probability * 10_000) / 100}% 独立掉落`;
      const title = document.createElement("strong");
      title.textContent = item.name;
      header.append(kind, title);
      const description = document.createElement("p");
      description.textContent = item.description;
      article.append(header, description);

      if (
        (item.kind === "weapon" || item.kind === "armor") &&
        snapshot.equipmentInventory.length >= 12
      ) {
        const label = document.createElement("label");
        label.textContent = "背包已满，选择留在战利品包中的装备：";
        const select = document.createElement("select");
        select.dataset.lootReplacement = item.dropId;
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = replaceable.length > 0 ? "请选择普通装备" : "没有可替换的普通装备";
        select.append(placeholder);
        replaceable.forEach((entry) => {
          const option = document.createElement("option");
          option.value = entry.instanceId;
          option.textContent = entry.weapon?.name ?? entry.armor?.name ?? entry.instanceId;
          select.append(option);
        });
        label.append(select);
        article.append(label);
      }

      const actions = document.createElement("div");
      actions.className = "inventory-item__actions";
      if (item.kind === "weapon" || item.kind === "armor") {
        const store = document.createElement("button");
        store.type = "button";
        store.dataset.lootAction = "store";
        store.dataset.dropId = item.dropId;
        store.textContent = "收入背包";
        const equip = document.createElement("button");
        equip.type = "button";
        equip.dataset.lootAction = "equip";
        equip.dataset.dropId = item.dropId;
        equip.textContent = "立即装备";
        actions.append(store, equip);
      } else {
        const claim = document.createElement("button");
        claim.type = "button";
        claim.dataset.lootAction = "claim";
        claim.dataset.dropId = item.dropId;
        claim.textContent = item.rewardId === "floor-key" ? "领取钥匙" : "领取";
        actions.append(claim);
      }
      article.append(actions);
      root.append(article);
    });
    if (entered) root.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }

  private showResolution(resolution: PanelResolution): void {
    this.actions.showNotice({
      message: resolution.message,
      tone: resolution.ok ? "success" : "info",
    });
  }
}
