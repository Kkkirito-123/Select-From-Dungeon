/** Run、楼层和全局档案的树节点。 */
import type { FloorNumber } from "../../domain/progression/runGraph";
import type { ProfileProgress, SavedRun } from "../../domain/shared/types";
import { cloneValue } from "./cloneValue";

export const TREE_SCHEMA = 1;
export const CURRENT_KEY = "current";

export type RunData = Pick<
  SavedRun,
  | "version"
  | "runInstanceId"
  | "questionBankVersion"
  | "campaign"
  | "floor"
  | "equipmentInventory"
  | "consumables"
  | "keyItems"
  | "acquiredUniqueItemIds"
  | "relics"
  | "queryCount"
  | "totalMoves"
>;

export type FloorData = Omit<SavedRun, keyof RunData>;

export interface RunNode {
  key: typeof CURRENT_KEY;
  schema: typeof TREE_SCHEMA;
  data: RunData;
}

export interface FloorNode {
  key: string;
  schema: typeof TREE_SCHEMA;
  runId: string;
  floor: FloorNumber;
  data: FloorData;
}

export interface ProfileNode {
  key: typeof CURRENT_KEY;
  schema: typeof TREE_SCHEMA;
  data: ProfileProgress;
}

export interface GuideNode {
  key: typeof CURRENT_KEY;
  schema: typeof TREE_SCHEMA;
  value: string;
}

export function floorKey(runId: string, floor: FloorNumber): string {
  return `${runId}:${floor}`;
}

export function splitRun(value: SavedRun): { run: RunNode; floor: FloorNode } {
  const {
    version,
    runInstanceId,
    questionBankVersion,
    campaign,
    floor,
    equipmentInventory,
    consumables,
    keyItems,
    acquiredUniqueItemIds,
    relics,
    queryCount,
    totalMoves,
    ...floorData
  } = cloneValue(value);

  return {
    run: {
      key: CURRENT_KEY,
      schema: TREE_SCHEMA,
      data: {
        version,
        runInstanceId,
        questionBankVersion,
        campaign,
        floor,
        equipmentInventory,
        consumables,
        keyItems,
        acquiredUniqueItemIds,
        relics,
        queryCount,
        totalMoves,
      },
    },
    floor: {
      key: floorKey(runInstanceId, floor),
      schema: TREE_SCHEMA,
      runId: runInstanceId,
      floor,
      data: floorData,
    },
  };
}

export function joinRun(run: RunNode, floor: FloorNode): SavedRun {
  return cloneValue({ ...floor.data, ...run.data });
}
