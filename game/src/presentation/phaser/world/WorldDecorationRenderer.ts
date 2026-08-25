import Phaser from "phaser";
import { TILE_SIZE } from "../../../content/curriculum/mvpLevel";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { Position } from "../../../domain/shared/types";
import { colorsForFloor } from "./DungeonPalette";
import {
  WORLD_VISUAL_LANGUAGE,
  shouldRenderPassiveFeature,
} from "../worldVisualLanguage";

function gridToPixels(position: Position): Position {
  return {
    x: position.x * TILE_SIZE + TILE_SIZE / 2,
    y: position.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}

/** Draws passive biome decoration; it never owns scene lifecycle or game rules. */
export class WorldDecorationRenderer {
  render(
    scene: Phaser.Scene,
    entityLayer: Phaser.GameObjects.Container,
    snapshot: GameSnapshot,
  ): void {
    const colors = colorsForFloor(snapshot.floor);
    snapshot.mazeFloor.decorations.forEach((decoration, index) => {
      if (decoration.kind !== "torch" && index % 3 !== 0) return;
      const pixel = gridToPixels(decoration);
      const parts: Phaser.GameObjects.GameObject[] = [];
      if (decoration.kind === "torch") {
        parts.push(
          scene.add.rectangle(pixel.x, pixel.y + 3, 3, 10, colors.wallTop, 0.46),
          scene.add.triangle(pixel.x, pixel.y - 4, -3, 5, 0, -6, 3, 5, colors.gold, 0.58),
        );
      } else if (decoration.kind === "rubble") {
        parts.push(
          scene.add.rectangle(
            pixel.x - 3,
            pixel.y + 2,
            7,
            4,
            colors.wallTop,
            WORLD_VISUAL_LANGUAGE.passiveDecorationAlpha,
          ).setAngle(-12),
          scene.add.rectangle(
            pixel.x + 3,
            pixel.y,
            5,
            3,
            colors.wallTop,
            WORLD_VISUAL_LANGUAGE.passiveDecorationAlpha * 0.8,
          ).setAngle(18),
        );
      } else {
        parts.push(
          scene.add.rectangle(
            pixel.x,
            pixel.y,
            5,
            5,
            colors.query,
            WORLD_VISUAL_LANGUAGE.passiveDecorationAlpha * 0.72,
          ).setAngle(45),
        );
      }
      parts.forEach((part) => entityLayer.add(part));
    });
    // 路线菱形只保留在小地图中；若在世界中重复绘制，会让被动引导看起来
    // 像铺满一地的可交互对象。
    snapshot.biomePlan.features.forEach((feature, index) => {
      if (!shouldRenderPassiveFeature(index)) return;
      const pixel = gridToPixels(feature);
      const parts: Phaser.GameObjects.Shape[] = [];
      if (feature.kind === "water") {
        parts.push(
          scene.add.ellipse(pixel.x, pixel.y + 3, 22, 10, 0x4b9fbe, 0.7)
            .setStrokeStyle(1, 0x8bd9eb, 0.72),
          scene.add.rectangle(pixel.x + 2, pixel.y, 10, 2, 0xb5eff7, 0.55),
        );
      } else if (feature.kind === "reeds") {
        parts.push(
          scene.add.rectangle(pixel.x - 5, pixel.y + 2, 3, 15, 0x718d43).setAngle(-14),
          scene.add.rectangle(pixel.x + 2, pixel.y, 3, 18, 0x92ad58).setAngle(9),
          scene.add.rectangle(pixel.x + 7, pixel.y + 3, 3, 13, 0x5b7739).setAngle(18),
        );
      } else if (feature.kind === "tree") {
        parts.push(
          scene.add.rectangle(pixel.x, pixel.y + 6, 5, 14, 0x765035),
          scene.add.rectangle(pixel.x - 6, pixel.y - 2, 13, 13, 0x356a43),
          scene.add.rectangle(pixel.x + 6, pixel.y - 4, 15, 14, 0x468351),
        );
      } else if (feature.kind === "slime") {
        parts.push(
          scene.add.ellipse(pixel.x, pixel.y + 4, 19, 10, 0x5ead75, 0.72)
            .setStrokeStyle(1, 0x8cdda0, 0.7),
          scene.add.rectangle(pixel.x + 3, pixel.y + 1, 4, 3, 0xd5f2c9, 0.72),
        );
      } else if (feature.kind === "ember") {
        parts.push(
          scene.add.rectangle(pixel.x, pixel.y + 4, 13, 4, 0x6a4932),
          scene.add.triangle(pixel.x, pixel.y - 4, -5, 8, 0, -7, 5, 8, 0xd87b3f, 0.82),
        );
      } else if (feature.kind === "bones") {
        parts.push(
          scene.add.rectangle(pixel.x - 4, pixel.y, 16, 4, 0xd7ccb0).setAngle(32),
          scene.add.rectangle(pixel.x + 5, pixel.y + 1, 14, 4, 0xbcae91).setAngle(-38),
        );
      } else if (feature.kind === "grave") {
        parts.push(
          scene.add.rectangle(pixel.x, pixel.y + 2, 13, 20, 0x655f58)
            .setStrokeStyle(1, 0xa39b8c),
          scene.add.rectangle(pixel.x, pixel.y - 8, 8, 3, 0x918879),
        );
      } else if (feature.kind === "ghost-flame") {
        parts.push(
          scene.add.ellipse(pixel.x, pixel.y + 3, 15, 9, 0x7250a1, 0.54),
          scene.add.triangle(pixel.x, pixel.y - 4, -6, 8, 0, -9, 6, 8, 0xb985dc, 0.85),
        );
      } else if (feature.kind === "lava") {
        parts.push(
          scene.add.rectangle(pixel.x, pixel.y + 2, 22, 8, 0x9d3124, 0.86)
            .setStrokeStyle(1, 0xff7a3d),
          scene.add.rectangle(pixel.x + 4, pixel.y, 8, 2, 0xffc15b, 0.88),
        );
      } else if (feature.kind === "ice") {
        parts.push(
          scene.add.polygon(
            pixel.x,
            pixel.y,
            [0, -12, 8, -2, 5, 11, -6, 9, -9, -2],
            0x75cbe8,
            0.72,
          ).setStrokeStyle(1, 0xc7f3ff),
        );
      } else if (feature.kind === "crystal") {
        parts.push(
          scene.add.triangle(pixel.x - 4, pixel.y, -5, 9, 0, -12, 5, 9, 0x9d78dc, 0.9),
          scene.add.triangle(pixel.x + 5, pixel.y + 3, -4, 7, 0, -8, 4, 7, 0x6fdbe6, 0.86),
        );
      } else if (feature.kind === "iron") {
        parts.push(
          scene.add.rectangle(pixel.x - 4, pixel.y, 18, 5, 0x85939a).setAngle(36),
          scene.add.rectangle(pixel.x + 4, pixel.y, 18, 5, 0x59656b).setAngle(-36),
          scene.add.rectangle(pixel.x, pixel.y + 7, 14, 3, 0xd0a94d),
        );
      } else if (feature.kind === "banner") {
        parts.push(
          scene.add.rectangle(pixel.x - 6, pixel.y, 3, 25, 0xa7a08e),
          scene.add.rectangle(pixel.x + 3, pixel.y - 6, 15, 13, 0x99453d)
            .setStrokeStyle(1, 0xd5aa52),
        );
      } else if (feature.kind === "battlement") {
        parts.push(
          scene.add.rectangle(pixel.x, pixel.y + 4, 24, 14, 0x4d5559)
            .setStrokeStyle(1, 0x899397),
          scene.add.rectangle(pixel.x - 8, pixel.y - 5, 6, 8, 0x697378),
          scene.add.rectangle(pixel.x + 8, pixel.y - 5, 6, 8, 0x697378),
        );
      } else if (feature.kind === "egg") {
        parts.push(
          scene.add.ellipse(pixel.x, pixel.y + 2, 16, 23, 0xc8b58b)
            .setStrokeStyle(2, 0xe96845),
          scene.add.rectangle(pixel.x + 3, pixel.y - 2, 4, 6, 0x754b47, 0.76),
        );
      } else if (feature.kind === "magma") {
        parts.push(
          scene.add.ellipse(pixel.x, pixel.y + 3, 25, 12, 0xa93424, 0.88)
            .setStrokeStyle(1, 0xff7b40),
          scene.add.rectangle(pixel.x - 3, pixel.y + 1, 11, 2, 0xffc257, 0.92),
        );
      } else if (feature.kind === "dragon-bone") {
        parts.push(
          scene.add.rectangle(pixel.x, pixel.y + 3, 24, 4, 0xd9c7a2).setAngle(-18),
          scene.add.triangle(pixel.x - 11, pixel.y - 2, -5, 6, 0, -7, 5, 6, 0xbda782),
          scene.add.triangle(pixel.x + 11, pixel.y + 3, -4, 5, 0, -6, 4, 5, 0xbda782),
        );
      } else if (feature.kind === "crystal-tree") {
        parts.push(
          scene.add.rectangle(pixel.x, pixel.y + 6, 4, 15, 0x47745f),
          scene.add.triangle(pixel.x - 5, pixel.y - 3, -6, 8, 0, -11, 6, 8, 0x74d7c1, 0.88),
          scene.add.triangle(pixel.x + 5, pixel.y, -5, 7, 0, -9, 5, 7, 0xa5f0dd, 0.82),
        );
      } else if (feature.kind === "root") {
        parts.push(
          scene.add.rectangle(pixel.x - 5, pixel.y, 18, 4, 0x7b6943).setAngle(28),
          scene.add.rectangle(pixel.x + 5, pixel.y + 2, 18, 4, 0x5e5738).setAngle(-31),
        );
      } else if (feature.kind === "index-rune") {
        parts.push(
          scene.add.polygon(pixel.x, pixel.y, [0, -10, 9, 0, 0, 10, -9, 0], 0x5fcdbb, 0.55)
            .setStrokeStyle(2, 0xb7f4e6),
          scene.add.rectangle(pixel.x, pixel.y, 3, 13, 0xe5d76d, 0.85),
        );
      } else if (feature.kind === "obsidian") {
        parts.push(
          scene.add.polygon(pixel.x, pixel.y, [0, -11, 8, -4, 7, 9, -7, 9, -9, -3], 0x272334)
            .setStrokeStyle(1, 0x817691),
        );
      } else if (feature.kind === "void-flame") {
        parts.push(
          scene.add.ellipse(pixel.x, pixel.y + 4, 14, 8, 0x42205f, 0.55),
          scene.add.triangle(pixel.x, pixel.y - 4, -6, 8, 0, -10, 6, 8, 0x9b55be, 0.86),
        );
      } else if (feature.kind === "gold-throne") {
        parts.push(
          scene.add.rectangle(pixel.x, pixel.y + 4, 19, 12, 0x4b3521)
            .setStrokeStyle(2, 0xd9b84f),
          scene.add.rectangle(pixel.x, pixel.y - 5, 15, 9, 0x71512a),
        );
      } else {
        parts.push(
          scene.add.rectangle(pixel.x, pixel.y, 18, 8, 0x385563, 0.56)
            .setStrokeStyle(1, 0x6b909c, 0.65),
          scene.add.rectangle(pixel.x, pixel.y, 3, 8, 0x101820, 0.8),
        );
      }
      parts.forEach((part) => {
        part.setData("cell", positionKey(feature));
        part.setAlpha(Math.min(part.alpha, WORLD_VISUAL_LANGUAGE.passiveFeatureAlpha));
        entityLayer.add(part);
      });
    });
  }
}
