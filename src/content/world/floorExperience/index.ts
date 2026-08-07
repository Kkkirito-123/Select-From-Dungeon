/**
 * 汇总八层运行时体验内容。
 *
 * 各楼层文件只声明地标、NPC、隐藏区域和剧情触发器；本入口负责按楼层
 * 暴露统一查询边界，不负责推进剧情或修改玩家状态。
 */
import { FLOOR_ONE_EXPERIENCE } from "./floor01";
import { FLOOR_TWO_EXPERIENCE } from "./floor02";
import { FLOOR_THREE_EXPERIENCE } from "./floor03";
import { FLOOR_FOUR_EXPERIENCE } from "./floor04";
import { FLOOR_FIVE_EXPERIENCE } from "./floor05";
import { FLOOR_SIX_EXPERIENCE } from "./floor06";
import { FLOOR_SEVEN_EXPERIENCE } from "./floor07";
import { FLOOR_EIGHT_EXPERIENCE } from "./floor08";
import type { FloorExperienceDefinition } from "./types";

export * from "./types";
export {
  FLOOR_ONE_EXPERIENCE,
  FLOOR_TWO_EXPERIENCE,
  FLOOR_THREE_EXPERIENCE,
  FLOOR_FOUR_EXPERIENCE,
  FLOOR_FIVE_EXPERIENCE,
  FLOOR_SIX_EXPERIENCE,
  FLOOR_SEVEN_EXPERIENCE,
  FLOOR_EIGHT_EXPERIENCE,
};

export const FLOOR_EXPERIENCES = [
  FLOOR_ONE_EXPERIENCE,
  FLOOR_TWO_EXPERIENCE,
  FLOOR_THREE_EXPERIENCE,
  FLOOR_FOUR_EXPERIENCE,
  FLOOR_FIVE_EXPERIENCE,
  FLOOR_SIX_EXPERIENCE,
  FLOOR_SEVEN_EXPERIENCE,
  FLOOR_EIGHT_EXPERIENCE,
] as const satisfies readonly FloorExperienceDefinition[];

export type FloorExperienceNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function hasFloorExperience(
  floor: number,
): floor is FloorExperienceNumber {
  return floor >= 1 && floor <= 8;
}

export function floorExperience(
  floor: FloorExperienceNumber,
): FloorExperienceDefinition {
  return FLOOR_EXPERIENCES.find((experience) => experience.floor === floor)
    ?? FLOOR_ONE_EXPERIENCE;
}

export function hiddenAreaGateIdsForFloor(floor: number): readonly string[] {
  const experience = FLOOR_EXPERIENCES.find((entry) => entry.floor === floor);
  return experience?.hiddenAreas.map((area) => area.gateId) ?? [];
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
  if (experience.landmarks.filter((landmark) => landmark.kind === "sql-seal").length !== 1) {
    errors.push(`${experience.id} 必须恰好拥有一座剧情化 SQL 密文机关。`);
  }
  if (experience.npcPlacements.some((npc) => !npc.alwaysShowName)) {
    errors.push(`${experience.id} 的 NPC 名称必须常亮。`);
  }
  return errors;
}
