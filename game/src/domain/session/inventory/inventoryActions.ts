/**
 * GameSession 的装备、消耗品和战利品包动作。
 *
 * 本模块不持有会话状态，也不发送快照；它只对调用方传入的玩家、背包和
 * 战利品包应用一次规则。公开命令、模式、banner 与通知仍由 GameSession
 * 编排，以保持一次动作一次提交的原子顺序。
 */
import {
  CONSUMABLE_SLOT_CAPACITY,
  CONSUMABLE_STACK_CAPACITY,
  EQUIPMENT_CAPACITY,
} from "../../../content/inventory/inventoryCatalog";
import { applyReward, type RewardContext } from "./rewardApplication";
import type {
  Consumable,
  ConsumableStack,
  EquipmentItem,
  InventoryResolution,
  LootBundle,
  LootItem,
  Position,
  PlayerState,
} from "../../shared/types";

/** Shared mutable slices for one loot item; session mode remains outside. */
export interface LootItemActionContext extends RewardContext {
  equipmentInventory: EquipmentItem[];
  consumables: ConsumableStack[];
  claimFloorKey: () => string;
}

/** Apply the item-specific part of taking one loot item from an open bundle. */
export function takeLootItemAction(
  context: LootItemActionContext,
  bundle: LootBundle,
  item: LootItem,
  action: "store" | "equip" | "claim",
  replaceInstanceId?: string,
): string | null {
  if (item.kind === "weapon" || item.kind === "armor") {
    return action === "equip"
      ? equipLootEquipment(
          context.player,
          context.equipmentInventory,
          bundle,
          item,
          replaceInstanceId,
        )
      : storeLootEquipment(
          context.equipmentInventory,
          bundle,
          item,
          replaceInstanceId,
        );
  }
  if (item.kind === "consumable" && item.consumable) {
    return storeConsumable(context.consumables, item.consumable)
      ? `已将 ${item.name} 放入恢复品栏。`
      : null;
  }
  if (item.kind === "reward" && item.rewardId) {
    if (item.rewardId === "floor-key") return context.claimFloorKey();
    applyReward(context, item.rewardId);
    return `已领取 ${item.name}。${item.description}`;
  }
  return null;
}

/** Context for dropping one inventory entry back onto the current floor. */
export interface InventoryDropContext {
  lootBundles: LootBundle[];
  sourceRoomId: string;
  floor: LootBundle["floor"];
  position: Position;
  nextLootBundleId: (baseId: string) => string;
}

export interface InventoryDropResolution extends InventoryResolution {
  itemName?: string;
}

/** Remove one ordinary equipment item and create its recoverable ground bundle. */
export function discardInventoryEquipment(
  context: InventoryDropContext & { equipmentInventory: EquipmentItem[] },
  instanceId: string,
  bundleBaseId: string,
): InventoryDropResolution {
  const index = context.equipmentInventory.findIndex((item) => item.instanceId === instanceId);
  const item = context.equipmentInventory[index];
  if (!item) return { ...inventoryFailure("背包中没有这件装备。") };
  if (item.protected) return { ...inventoryFailure("基础武器和课程必需装备不能丢弃。") };
  context.equipmentInventory.splice(index, 1);
  const bundleId = context.nextLootBundleId(bundleBaseId);
  context.lootBundles.push({
    id: bundleId,
    sourceMonsterId: null,
    sourceRoomId: context.sourceRoomId,
    floor: context.floor,
    ...context.position,
    items: [lootItemFromEquipment(item, `${bundleId}:item`)],
  });
  return {
    ok: true,
    message: "",
    remainingItemIds: [],
    itemName: item.weapon?.name ?? item.armor?.name ?? "装备",
  };
}

/** Remove one consumable unit and create its recoverable ground bundle. */
export function discardConsumable(
  context: InventoryDropContext & { consumables: ConsumableStack[] },
  consumableId: Consumable["id"],
  bundleBaseId: string,
): InventoryDropResolution {
  const stack = context.consumables.find((entry) => entry.item.id === consumableId);
  if (!stack) return { ...inventoryFailure("恢复品栏中没有该物品。") };
  const item = { ...stack.item };
  stack.quantity -= 1;
  if (stack.quantity <= 0) {
    const stackIndex = context.consumables.indexOf(stack);
    context.consumables.splice(stackIndex, 1);
  }
  const bundleId = context.nextLootBundleId(bundleBaseId);
  const dropId = `${bundleId}:item`;
  context.lootBundles.push({
    id: bundleId,
    sourceMonsterId: null,
    sourceRoomId: context.sourceRoomId,
    floor: context.floor,
    ...context.position,
    items: [{
      dropId,
      itemId: consumableId,
      kind: "consumable",
      name: item.name,
      description: item.description,
      guaranteed: true,
      probability: 1,
      protected: false,
      consumable: item,
    }],
  });
  return {
    ok: true,
    message: "",
    remainingItemIds: [],
    itemName: item.name,
  };
}

/** 创建背包操作失败结果。 */
export function inventoryFailure(message: string): InventoryResolution {
  return { ok: false, message, remainingItemIds: [] };
}

function equippedWeaponItem(player: PlayerState): EquipmentItem {
  return {
    instanceId: `equipped:weapon:${player.weapon.id}`,
    kind: "weapon",
    // 课程武器被替换后可整理，避免八层流程被历史武器永久占满。
    protected: false,
    weapon: { ...player.weapon },
  };
}

function equippedArmorItem(player: PlayerState): EquipmentItem {
  if (!player.armor) throw new Error("Cannot store an empty armor slot.");
  return {
    instanceId: `equipped:armor:${player.armor.id}`,
    kind: "armor",
    protected: false,
    armor: { ...player.armor },
    armorHp: player.armorHp,
  };
}

function equipmentFromLoot(item: LootItem): EquipmentItem | null {
  if (item.kind === "weapon" && item.weapon) {
    return {
      instanceId: `loot:weapon:${item.dropId}`,
      kind: "weapon",
      protected: item.protected,
      weapon: { ...item.weapon },
    };
  }
  if (item.kind === "armor" && item.armor) {
    return {
      instanceId: `loot:armor:${item.dropId}`,
      kind: "armor",
      protected: item.protected,
      armor: { ...item.armor },
      armorHp: Math.min(item.armor.maxArmor, item.armorHp ?? item.armor.maxArmor),
    };
  }
  return null;
}

export function lootItemFromEquipment(
  item: EquipmentItem,
  dropId: string,
): LootItem {
  const weapon = item.weapon ? { ...item.weapon } : undefined;
  const armor = item.armor ? { ...item.armor } : undefined;
  return {
    dropId,
    itemId: weapon?.id ?? armor?.id ?? item.instanceId,
    kind: item.kind,
    name: weapon?.name ?? armor?.name ?? "未知装备",
    description: weapon?.description ?? armor?.description ?? "装备数据不完整。",
    guaranteed: true,
    probability: 1,
    protected: item.protected,
    weapon,
    armor,
    armorHp: armor
      ? Math.min(armor.maxArmor, item.armorHp ?? armor.maxArmor)
      : undefined,
  };
}

function replaceInventoryItem(
  equipmentInventory: EquipmentItem[],
  bundle: LootBundle,
  replaceInstanceId: string | undefined,
): EquipmentItem | null {
  if (!replaceInstanceId) return null;
  const index = equipmentInventory.findIndex(
    (item) => item.instanceId === replaceInstanceId,
  );
  const replaced = equipmentInventory[index];
  if (!replaced || replaced.protected) return null;
  equipmentInventory.splice(index, 1);
  bundle.items.push(lootItemFromEquipment(
    replaced,
    `replaced:${bundle.id}:${replaced.instanceId}`,
  ));
  return replaced;
}

export function storeLootEquipment(
  equipmentInventory: EquipmentItem[],
  bundle: LootBundle,
  item: LootItem,
  replaceInstanceId?: string,
): string | null {
  const equipment = equipmentFromLoot(item);
  if (!equipment) return null;
  let replaced: EquipmentItem | null = null;
  if (equipmentInventory.length >= EQUIPMENT_CAPACITY) {
    replaced = replaceInventoryItem(equipmentInventory, bundle, replaceInstanceId);
    if (!replaced) return null;
  }
  equipmentInventory.push(equipment);
  const replacedName = replaced?.weapon?.name ?? replaced?.armor?.name;
  return replacedName
    ? `已将 ${item.name} 放入装备背包；${replacedName} 留在当前战利品包中。`
    : `已将 ${item.name} 放入装备背包。`;
}

export function equipLootEquipment(
  player: PlayerState,
  equipmentInventory: EquipmentItem[],
  bundle: LootBundle,
  item: LootItem,
  replaceInstanceId?: string,
): string | null {
  const equipment = equipmentFromLoot(item);
  if (!equipment) return null;
  const displaced = equipment.kind === "weapon"
    ? equippedWeaponItem(player)
    : player.armor ? equippedArmorItem(player) : null;
  let replaced: EquipmentItem | null = null;
  if (displaced && equipmentInventory.length >= EQUIPMENT_CAPACITY) {
    replaced = replaceInventoryItem(equipmentInventory, bundle, replaceInstanceId);
    if (!replaced) return null;
  }
  if (displaced) equipmentInventory.push(displaced);

  if (equipment.kind === "weapon" && equipment.weapon) {
    const previous = player.weapon.name;
    player.weapon = { ...equipment.weapon };
    const replacedName = replaced?.weapon?.name ?? replaced?.armor?.name;
    return `已装备 ${equipment.weapon.name}：${previous} 已收入背包${
      replacedName ? `，${replacedName} 留在战利品包中` : ""
    }。`;
  }
  if (equipment.kind === "armor" && equipment.armor) {
    const previous = player.armor?.name ?? "无防具";
    player.armor = { ...equipment.armor };
    player.armorHp = Math.min(
      equipment.armor.maxArmor,
      equipment.armorHp ?? equipment.armor.maxArmor,
    );
    const replacedName = replaced?.weapon?.name ?? replaced?.armor?.name;
    return `已装备 ${equipment.armor.name}：${previous} → ${equipment.armor.name}，护甲 ${player.armorHp}/${
      equipment.armor.maxArmor
    }${replacedName ? `；${replacedName} 留在战利品包中` : ""}。`;
  }
  return null;
}

export function equipInventoryItem(
  player: PlayerState,
  equipmentInventory: EquipmentItem[],
  instanceId: string,
): InventoryResolution {
  const index = equipmentInventory.findIndex((item) => item.instanceId === instanceId);
  const item = equipmentInventory[index];
  if (!item) return inventoryFailure("背包中没有这件装备。");
  equipmentInventory.splice(index, 1);
  if (item.kind === "weapon" && item.weapon) {
    equipmentInventory.push(equippedWeaponItem(player));
    const previous = player.weapon.name;
    player.weapon = { ...item.weapon };
    return {
      ok: true,
      message: `已装备 ${item.weapon.name}：${previous} → ${item.weapon.name}，伤害 ${item.weapon.damage}。`,
      remainingItemIds: [],
    };
  }
  if (item.kind === "armor" && item.armor) {
    if (player.armor) equipmentInventory.push(equippedArmorItem(player));
    const previous = player.armor?.name ?? "无防具";
    player.armor = { ...item.armor };
    player.armorHp = Math.min(item.armor.maxArmor, item.armorHp ?? item.armor.maxArmor);
    return {
      ok: true,
      message: `已装备 ${item.armor.name}：${previous} → ${item.armor.name}，护甲生命 ${player.armorHp}/${item.armor.maxArmor}。`,
      remainingItemIds: [],
    };
  }
  equipmentInventory.splice(index, 0, item);
  return inventoryFailure("装备数据不完整，未进行更换。");
}

export function storeConsumable(
  consumables: ConsumableStack[],
  consumable: Consumable,
): boolean {
  const stack = consumables.find((entry) => entry.item.id === consumable.id);
  if (stack) {
    if (stack.quantity >= CONSUMABLE_STACK_CAPACITY) return false;
    stack.quantity += 1;
    return true;
  }
  if (consumables.length >= CONSUMABLE_SLOT_CAPACITY) return false;
  consumables.push({ item: { ...consumable }, quantity: 1 });
  return true;
}

export function applyConsumable(player: PlayerState, consumable: Consumable): void {
  if (consumable.effect === "heal-hp" || consumable.effect === "heal-both") {
    player.hp = Math.min(player.maxHp, player.hp + consumable.amount);
  }
  if (
    (consumable.effect === "heal-armor" || consumable.effect === "heal-both") &&
    player.armor
  ) {
    player.armorHp = Math.min(
      player.armor.maxArmor,
      player.armorHp + consumable.amount,
    );
  }
}

/** Context for using one recovery item; the caller owns mode and feedback. */
export interface ConsumableUseContext {
  player: PlayerState;
  consumables: ConsumableStack[];
}

export interface ConsumableUseResolution extends InventoryResolution {
  itemName?: string;
  previousHp?: number;
  previousArmor?: number;
}

/** Consume one item only when it changes HP or armor, preserving stack limits. */
export function useConsumable(
  context: ConsumableUseContext,
  consumableId: Consumable["id"],
): ConsumableUseResolution {
  const stack = context.consumables.find((entry) => entry.item.id === consumableId);
  if (!stack) return { ...inventoryFailure("恢复品栏中没有该物品。") };
  const previousHp = context.player.hp;
  const previousArmor = context.player.armorHp;
  applyConsumable(context.player, stack.item);
  if (previousHp === context.player.hp && previousArmor === context.player.armorHp) {
    return { ...inventoryFailure("当前生命与护甲均不需要恢复。") };
  }
  stack.quantity -= 1;
  if (stack.quantity <= 0) {
    const stackIndex = context.consumables.indexOf(stack);
    context.consumables.splice(stackIndex, 1);
  }
  return {
    ok: true,
    message: "",
    remainingItemIds: [],
    itemName: stack.item.name,
    previousHp,
    previousArmor,
  };
}
