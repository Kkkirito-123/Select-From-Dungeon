/** 固定布景使用的几何辅助数据，必须与楼层体验内容中的房间 ID 保持一致。 */
export const FLOOR_TWO_MARSH_ROOM_IDS = [
  "floor-2-inner-join",
  "floor-2-left-join",
  "floor-2-join-elite",
] as const;

export const FLOOR_TWO_SAND_ROOM_IDS = [
  "floor-2-entry",
  "floor-2-order",
  "floor-2-distinct",
] as const;

export function anchoredWaterBandGeometry(
  baseCenterY: number,
  baseHeight: number,
  scaleY: number,
): { centerY: number; surfaceY: number } {
  /** 根据房间锚点生成确定性的水带几何，不修改迷宫可行走区域。 */
  const bottomY = baseCenterY + baseHeight / 2;
  return {
    centerY: bottomY - (baseHeight * scaleY) / 2,
    surfaceY: bottomY - baseHeight * scaleY,
  };
}
