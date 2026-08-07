/**
 * 八层战役进度的纯状态转换。
 *
 * 这里维护楼层顺序、seed 和 active/cleared/locked 不变量，返回新的进度
 * 副本而不修改传入对象。GameSession 决定何时调用转换并把结果持久化。
 */
import {
  CAMPAIGN_FLOORS,
  type CampaignFloorNumber,
} from "../../content/curriculum/floorContracts";

export const CAMPAIGN_PROGRESS_VERSION = 1 as const;

export type CampaignFloorStatus = "locked" | "active" | "cleared";
export type CampaignStatus = "active" | "completed";

export interface CampaignFloorSlot {
  floor: CampaignFloorNumber;
  seed: string;
  status: CampaignFloorStatus;
}

export interface CampaignProgress {
  version: 1;
  baseSeed: string;
  currentFloor: CampaignFloorNumber;
  status: CampaignStatus;
  floors: CampaignFloorSlot[];
}

export interface CampaignTransition {
  ok: boolean;
  from: CampaignFloorNumber;
  to: CampaignFloorNumber;
  completed: boolean;
  progress: CampaignProgress;
}

function normalizeBaseSeed(seed: string): string {
  const normalized = seed.trim().replace(/:floor-[2-8]$/u, "");
  return normalized || "魔王城-八层";
}

function floorSeed(baseSeed: string, floor: CampaignFloorNumber): string {
  return floor === 1 ? baseSeed : `${baseSeed}:floor-${floor}`;
}

export function createCampaignProgress(
  seed: string,
  currentFloor: CampaignFloorNumber = 1,
): CampaignProgress {
  const baseSeed = normalizeBaseSeed(seed);
  return {
    version: CAMPAIGN_PROGRESS_VERSION,
    baseSeed,
    currentFloor,
    status: "active",
    floors: CAMPAIGN_FLOORS.map((floor) => ({
      floor,
      seed: floorSeed(baseSeed, floor),
      status: floor < currentFloor
        ? "cleared"
        : floor === currentFloor ? "active" : "locked",
    })),
  };
}

export function cloneCampaignProgress(
  progress: CampaignProgress,
): CampaignProgress {
  return {
    ...progress,
    floors: progress.floors.map((slot) => ({ ...slot })),
  };
}

export function advanceCampaignProgress(
  progress: CampaignProgress,
): CampaignTransition {
  const from = progress.currentFloor;
  if (progress.status === "completed") {
    return {
      ok: false,
      from,
      to: from,
      completed: true,
      progress: cloneCampaignProgress(progress),
    };
  }
  if (from === 8) {
    const completed = cloneCampaignProgress(progress);
    completed.status = "completed";
    completed.floors = completed.floors.map((slot) => ({
      ...slot,
      status: "cleared",
    }));
    return {
      ok: true,
      from,
      to: from,
      completed: true,
      progress: completed,
    };
  }
  const to = (from + 1) as CampaignFloorNumber;
  const advanced = cloneCampaignProgress(progress);
  advanced.currentFloor = to;
  advanced.floors = advanced.floors.map((slot) => ({
    ...slot,
    status: slot.floor <= from
      ? "cleared"
      : slot.floor === to ? "active" : "locked",
  }));
  return {
    ok: true,
    from,
    to,
    completed: false,
    progress: advanced,
  };
}

export function isCampaignProgress(value: unknown): value is CampaignProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<CampaignProgress>;
  if (
    candidate.version !== CAMPAIGN_PROGRESS_VERSION ||
    typeof candidate.baseSeed !== "string" ||
    candidate.baseSeed.length === 0 ||
    !CAMPAIGN_FLOORS.includes(candidate.currentFloor as CampaignFloorNumber) ||
    (candidate.status !== "active" && candidate.status !== "completed") ||
    !Array.isArray(candidate.floors) ||
    candidate.floors.length !== CAMPAIGN_FLOORS.length
  ) return false;
  const expected = createCampaignProgress(candidate.baseSeed, candidate.currentFloor);
  if (candidate.status === "completed") {
    if (candidate.currentFloor !== 8) return false;
    expected.status = "completed";
    expected.floors = expected.floors.map((slot) => ({ ...slot, status: "cleared" }));
  }
  return JSON.stringify(candidate) === JSON.stringify(expected);
}
