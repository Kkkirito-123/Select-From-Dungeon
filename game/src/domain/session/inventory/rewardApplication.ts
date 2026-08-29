/** 奖励与遗物的确定性状态转换；不负责模式、通知或存档。 */
import {
  JOIN_CHAIN,
  SORT_SABER,
} from "../../../content/curriculum/floor2Level";
import {
  AGGREGATE_HAMMER,
  DATA_BLADE,
  FILTER_BOW,
  NULL_LANTERN,
} from "../../../content/curriculum/mvpLevel";
import { RELICS } from "../../../content/world/runContent";
import type { RoomReward } from "../../progression/runGraph";
import type { PlayerState, Relic } from "../../shared/types";

/** Reward application owns exactly the mutable slices it is allowed to update. */
export interface RewardContext {
  player: PlayerState;
  relics: Relic[];
  acquiredUniqueItemIds: Set<string>;
}

/** Add one relic once; duplicate rewards preserve the original inventory. */
export function addRelic(context: RewardContext, relic: Relic): boolean {
  if (context.relics.some((entry) => entry.id === relic.id)) return false;
  context.relics.push({ ...relic });
  return true;
}

/** Apply a deterministic room reward without emitting or changing session mode. */
export function applyReward(context: RewardContext, rewardId: RoomReward): void {
  const { player, acquiredUniqueItemIds } = context;
  if (rewardId === "restore-12-hp") {
    player.hp = Math.min(player.maxHp, player.hp + 1);
  } else if (rewardId === "restore-20-hp") {
    player.hp = player.maxHp;
  } else if (rewardId === "cool-8-heat" || rewardId === "reroll-token") {
    player.heat = Math.max(0, player.heat - 8);
  } else if (rewardId === "cool-12-heat") {
    player.heat = Math.max(0, player.heat - 12);
  } else if (rewardId === "hint-token") {
    addRelic(context, RELICS["schema-eye"]);
  } else if (rewardId === "schema-shard") {
    addRelic(context, RELICS["cache-chip"]);
  } else if (rewardId === "weapon-cache") {
    addRelic(context, RELICS["rollback-heart"]);
    player.maxHp += 1;
    player.hp = Math.min(player.maxHp, player.hp + 1);
  } else if (rewardId === "elite-query-lens") {
    addRelic(context, RELICS["query-lens"]);
  } else if (rewardId === "elite-transaction-shield") {
    player.hp = Math.min(player.maxHp, player.hp + 1);
    player.heat = 0;
  } else if (rewardId === "aggregate-hammer") {
    player.weapon = { ...AGGREGATE_HAMMER };
    acquiredUniqueItemIds.add(AGGREGATE_HAMMER.id);
  } else if (rewardId === "sort-saber") {
    player.weapon = { ...SORT_SABER };
    acquiredUniqueItemIds.add(SORT_SABER.id);
  } else if (rewardId === "join-chain") {
    player.weapon = { ...JOIN_CHAIN };
    acquiredUniqueItemIds.add(JOIN_CHAIN.id);
  } else if (rewardId === "filter-rune") {
    player.weapon = { ...FILTER_BOW };
    acquiredUniqueItemIds.add(FILTER_BOW.id);
  } else if (rewardId === "null-lantern") {
    player.weapon = { ...NULL_LANTERN };
    acquiredUniqueItemIds.add(NULL_LANTERN.id);
  } else if (rewardId === "data-blade") {
    player.weapon = { ...DATA_BLADE };
    acquiredUniqueItemIds.add(DATA_BLADE.id);
  }
}
