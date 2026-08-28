/** 第二层泥沼区域房间，用于选择水面/湿地装饰配方。 */
export const FLOOR_TWO_MARSH_ROOM_IDS = [
  "floor-2-inner-join",
  "floor-2-left-join",
  "floor-2-join-elite",
] as const;

/** 第二层沙地区域房间，用于选择干燥地面和沉船装饰配方。 */
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
  // 先固定底边，再按 scaleY 向上缩放；这样水位动画不会漂移房间底部锚点。
  const bottomY = baseCenterY + baseHeight / 2;
  return {
    centerY: bottomY - (baseHeight * scaleY) / 2,
    surfaceY: bottomY - baseHeight * scaleY,
  };
}
