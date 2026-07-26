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
  const bottomY = baseCenterY + baseHeight / 2;
  return {
    centerY: bottomY - (baseHeight * scaleY) / 2,
    surfaceY: bottomY - baseHeight * scaleY,
  };
}
