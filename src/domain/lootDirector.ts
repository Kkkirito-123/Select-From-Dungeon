import { CONSUMABLES, type LootCandidate } from "../content/inventoryCatalog";
import { legacyMonsterIdForCurrent } from "../content/monsterIds";
import type { LootItem, Monster } from "./types";
import { stableStringHash, type FloorNumber } from "./runGraph";

export interface LootRollInput {
  seed: string;
  floor: FloorNumber;
  monster: Monster;
  candidates: readonly LootCandidate[];
  fixedItems: readonly LootItem[];
  acquiredUniqueItemIds: ReadonlySet<string>;
  minimumNonKeyDrops?: number;
}

function cloneLootItem(item: LootItem): LootItem {
  return {
    ...item,
    weapon: item.weapon ? { ...item.weapon } : undefined,
    armor: item.armor ? { ...item.armor } : undefined,
    consumable: item.consumable ? { ...item.consumable } : undefined,
  };
}

function roll(seed: string): number {
  return stableStringHash(seed) / 0x1_0000_0000;
}

function duplicateReplacement(item: LootItem): LootItem {
  const consumable = item.kind === "weapon"
    ? CONSUMABLES.whetstone
    : CONSUMABLES["repair-shard"];
  return {
    dropId: item.dropId,
    itemId: consumable.id,
    kind: "consumable",
    name: consumable.name,
    description: `${item.name} 已在本轮出现，转化为${consumable.name}。${consumable.description}`,
    guaranteed: item.guaranteed,
    probability: item.probability,
    protected: false,
    consumable: { ...consumable },
  };
}

function isKey(item: LootItem): boolean {
  return item.rewardId === "floor-key";
}

/**
 * Every candidate has its own deterministic roll. Guaranteed curriculum items
 * are inserted first, and keys never consume the three visible non-key loot
 * slots. The optional minimum is retained for explicit authored callers and
 * tests; production combat omits it, so rank never creates a random drop.
 */
export function rollLootItems(input: LootRollInput): LootItem[] {
  const stableMonsterId = legacyMonsterIdForCurrent(input.monster.id);
  const rolled = input.candidates
    .filter((candidate) => (
      roll(`${input.seed}:loot:${input.floor}:${stableMonsterId}:${candidate.item.itemId}`) <
      candidate.probability
    ))
    .map((candidate) => ({
      ...candidate.item,
      dropId: `${input.monster.id}:${candidate.item.itemId}`,
      guaranteed: false,
      probability: candidate.probability,
    } satisfies LootItem));
  const selected = [
    ...input.fixedItems.map(cloneLootItem),
    ...rolled,
  ];
  const seen = new Set<string>();
  const normalized: LootItem[] = [];
  selected.forEach((rawItem) => {
    let item = cloneLootItem(rawItem);
    if (
      (item.kind === "weapon" || item.kind === "armor") &&
      input.acquiredUniqueItemIds.has(item.itemId)
    ) {
      item = duplicateReplacement(item);
    }
    if (seen.has(item.itemId)) return;
    seen.add(item.itemId);
    normalized.push(item);
  });

  const minimum = input.minimumNonKeyDrops ?? 0;
  for (const candidate of input.candidates) {
    if (normalized.filter((item) => !isKey(item)).length >= minimum) break;
    let item: LootItem = {
      ...candidate.item,
      dropId: `${input.monster.id}:${candidate.item.itemId}`,
      guaranteed: true,
      probability: candidate.probability,
    };
    if (
      (item.kind === "weapon" || item.kind === "armor") &&
      input.acquiredUniqueItemIds.has(item.itemId)
    ) {
      item = duplicateReplacement(item);
    }
    if (seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    normalized.push(item);
  }

  const keys = normalized.filter(isKey);
  const nonKeys = normalized
    .filter((item) => !isKey(item))
    .sort((left, right) => (
      Number(right.guaranteed) - Number(left.guaranteed) ||
      left.probability - right.probability ||
      left.itemId.localeCompare(right.itemId)
    ))
    .slice(0, 3);
  return [...nonKeys, ...keys].map(cloneLootItem);
}
