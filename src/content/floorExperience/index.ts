import { FLOOR_ONE_EXPERIENCE } from "./floor01";
import { FLOOR_TWO_EXPERIENCE } from "./floor02";
import type { FloorExperienceDefinition } from "./types";

export * from "./types";
export { FLOOR_ONE_EXPERIENCE, FLOOR_TWO_EXPERIENCE };

export const FLOOR_EXPERIENCES = [
  FLOOR_ONE_EXPERIENCE,
  FLOOR_TWO_EXPERIENCE,
] as const satisfies readonly FloorExperienceDefinition[];

export function floorExperience(
  floor: 1 | 2,
): FloorExperienceDefinition {
  return floor === 1 ? FLOOR_ONE_EXPERIENCE : FLOOR_TWO_EXPERIENCE;
}

export function hiddenAreaGateIdsForFloor(floor: number): readonly string[] {
  if (floor !== 1 && floor !== 2) return [];
  return floorExperience(floor).hiddenAreas.map((area) => area.gateId);
}

export function validateFloorExperience(
  experience: FloorExperienceDefinition,
): string[] {
  const errors: string[] = [];
  const regionIds = new Set(experience.regions.map((region) => region.id));
  const landmarkIds = new Set(experience.landmarks.map((landmark) => landmark.id));
  const assetKeys = new Set(experience.assetPack.assets.map((asset) => asset.key));

  if (regionIds.size !== experience.regions.length) {
    errors.push(`${experience.id} 存在重复区域 ID。`);
  }
  if (landmarkIds.size !== experience.landmarks.length) {
    errors.push(`${experience.id} 存在重复地标 ID。`);
  }
  experience.regions.forEach((region) => {
    region.landmarkIds.forEach((landmarkId) => {
      if (!landmarkIds.has(landmarkId)) {
        errors.push(`${region.id} 引用了不存在的地标 ${landmarkId}。`);
      }
    });
  });
  experience.landmarks.forEach((landmark) => {
    if (!regionIds.has(landmark.regionId)) {
      errors.push(`${landmark.id} 引用了不存在的区域 ${landmark.regionId}。`);
    }
    if (
      !assetKeys.has(landmark.assetKey) &&
      !landmark.assetKey.startsWith("shared.")
    ) {
      errors.push(`${landmark.id} 的素材键 ${landmark.assetKey} 没有包内声明。`);
    }
  });
  experience.npcPlacements.forEach((npc) => {
    if (!regionIds.has(npc.regionId)) {
      errors.push(`${npc.id} 引用了不存在的区域 ${npc.regionId}。`);
    }
    if (
      !assetKeys.has(npc.assetKey) &&
      !npc.assetKey.startsWith("shared.")
    ) {
      errors.push(`${npc.id} 的素材键 ${npc.assetKey} 没有包内声明。`);
    }
  });
  if (experience.hiddenAreas.length !== 1) {
    errors.push(`${experience.id} 必须恰好拥有一个可选隐藏区域。`);
  }
  experience.hiddenAreas.forEach((area) => {
    if (!landmarkIds.has(area.landmarkId)) {
      errors.push(`${area.id} 引用了不存在的隐藏区域地标 ${area.landmarkId}。`);
    }
    if (!experience.storyEvents.some((event) => event.id === area.discoveryEventId)) {
      errors.push(`${area.id} 缺少发现剧情事件 ${area.discoveryEventId}。`);
    }
    if (
      area.requiredLessonIds.length === 0 ||
      area.requiredLessonIds.some((lessonId) => !experience.regions.some(
        (region) => region.lessonIds.includes(lessonId),
      ))
    ) {
      errors.push(`${area.id} 的发现前置课程无效。`);
    }
  });
  experience.storyEvents.forEach((event) => {
    event.actions.forEach((action) => {
      if (action.type === "camera-focus" && !landmarkIds.has(action.landmarkId)) {
        errors.push(`${event.id} 聚焦了不存在的地标 ${action.landmarkId}。`);
      }
    });
  });
  if (experience.landmarks.filter((landmark) => landmark.kind === "campfire").length !== 2) {
    errors.push(`${experience.id} 必须恰好拥有两座可休息篝火。`);
  }
  if (experience.npcPlacements.some((npc) => !npc.alwaysShowName)) {
    errors.push(`${experience.id} 的 NPC 名称必须常亮。`);
  }
  return errors;
}
