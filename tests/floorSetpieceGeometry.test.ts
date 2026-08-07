import { describe, expect, it } from "vitest";
import {
  anchoredWaterBandGeometry,
  FLOOR_TWO_MARSH_ROOM_IDS,
  FLOOR_TWO_SAND_ROOM_IDS,
} from "../src/presentation/phaser/floorSetpieceGeometry";

describe("floor setpiece geometry", () => {
  it("changes a water band's height while keeping its world-space bottom fixed", () => {
    const baseCenterY = 240;
    const baseHeight = 20;
    const baseBottom = baseCenterY + baseHeight / 2;

    for (const scale of [1.7, 1.12, 0.58]) {
      const geometry = anchoredWaterBandGeometry(baseCenterY, baseHeight, scale);
      expect(geometry.centerY + (baseHeight * scale) / 2).toBeCloseTo(baseBottom);
      expect(geometry.surfaceY).toBeCloseTo(baseBottom - baseHeight * scale);
    }
  });

  it("uses room ids that exist in the authored floor-two blueprint", () => {
    expect(FLOOR_TWO_MARSH_ROOM_IDS).toEqual([
      "floor-2-inner-join",
      "floor-2-left-join",
      "floor-2-join-elite",
    ]);
    expect(FLOOR_TWO_SAND_ROOM_IDS).toEqual([
      "floor-2-entry",
      "floor-2-order",
      "floor-2-distinct",
    ]);
  });
});
