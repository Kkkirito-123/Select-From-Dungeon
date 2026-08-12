/**
 * 迷宫地形渲染器。
 *
 * 它只把保存快照中的 tile、生态区域和安全区画到 Phaser Graphics，不计算
 * 碰撞、门状态或遭遇。楼层颜色和区域颜色由 DungeonScene 注入，避免渲染器
 * 成为新的内容权威。
 */
import Phaser from "phaser";
import { TILE_SIZE } from "../../../content/curriculum/mvpLevel";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import { safeZoneCellKeys } from "../../../domain/exploration/campfire";
import { floorOneAreaAt } from "../../../domain/exploration/floorOneLabyrinth";
import { biomeRegionAt } from "../../../domain/exploration/biome";
import { mazeZoneAt } from "../../../domain/exploration/mazeGenerator";

export interface TerrainPalette {
  void: number;
  wall: number;
  wallTop: number;
  floor: number;
  floorAlt: number;
  gold: number;
  query: number;
  biomeStyle(kind: string): {
    wall: number;
    floor: number;
    accent: number;
  };
  zoneColors: Readonly<Record<string, number>>;
}

function mixColor(left: number, right: number, ratio: number): number {
  const mix = (shift: number) => Math.round(
    ((left >> shift) & 0xff) * (1 - ratio) +
    ((right >> shift) & 0xff) * ratio,
  );
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export class TerrainRenderer {
  render(
    graphics: Phaser.GameObjects.Graphics,
    snapshot: GameSnapshot,
    palette: TerrainPalette,
  ): void {
    const floor = snapshot.mazeFloor;
    for (let y = 0; y < floor.height; y += 1) {
      for (let x = 0; x < floor.width; x += 1) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const tile = floor.tiles[y][x];
        const biome = biomeRegionAt(snapshot.biomePlan, { x, y });
        const biomeColors = palette.biomeStyle(biome.kind);
        if (tile === "#") {
          graphics.fillStyle(mixColor(palette.wall, biomeColors.wall, 0.56), 1);
          graphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          const opensBelow = y + 1 < floor.height && floor.tiles[y + 1][x] !== "#";
          if (opensBelow) {
            graphics.fillStyle(mixColor(palette.void, biomeColors.wall, 0.34), 0.78);
            graphics.fillRect(px, py + TILE_SIZE - 8, TILE_SIZE, 8);
            graphics.fillStyle(mixColor(palette.wallTop, biomeColors.accent, 0.3), 0.68);
            graphics.fillRect(px + 2, py + TILE_SIZE - 8, TILE_SIZE - 4, 2);
          } else if ((x + y * 3) % 13 === 0) {
            graphics.fillStyle(palette.wallTop, 0.12);
            graphics.fillRect(px + 6, py + 7, TILE_SIZE - 12, 2);
          }
        } else {
          const zone = mazeZoneAt(floor, { x, y });
          const baseColor = zone
            ? palette.zoneColors[zone.type]
            : (x + y) % 2 === 0 ? palette.floor : palette.floorAlt;
          const color = mixColor(baseColor, biomeColors.floor, zone ? 0.38 : 0.72);
          graphics.fillStyle(color, 1);
          graphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          if ((x * 3 + y * 5) % 11 === 0) {
            graphics.lineStyle(1, palette.wallTop, 0.14);
            graphics.lineBetween(
              px + TILE_SIZE * 0.24,
              py + TILE_SIZE * 0.63,
              px + TILE_SIZE * 0.7,
              py + TILE_SIZE * 0.63,
            );
          }
        }
      }
    }
    this.renderSafeZones(graphics, snapshot, palette);
  }

  private renderSafeZones(
    graphics: Phaser.GameObjects.Graphics,
    snapshot: GameSnapshot,
    palette: TerrainPalette,
  ): void {
    safeZoneCellKeys(snapshot.mazeFloor, snapshot.campfires).forEach((cell) => {
      const [x, y] = cell.split(":").map(Number);
      if (!Number.isInteger(x) || !Number.isInteger(y)) return;
      const floorOneArea = snapshot.floor === 1
        ? floorOneAreaAt(snapshot.mazeFloor, { x, y })
        : "labyrinth";
      graphics.fillStyle(
        floorOneArea === "left-safe"
          ? 0xb56e47
          : floorOneArea === "right-safe"
            ? palette.gold
            : palette.query,
        snapshot.floor > 1 ? 0.07 : 0.1,
      );
      graphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    });
    if (snapshot.floor !== 1) return;
    snapshot.mazeFloor.zones
      .filter((zone) => zone.roomNodeId === "floor-1-entry" || zone.roomNodeId === "floor-1-rest")
      .forEach((zone) => {
        graphics.lineStyle(
          2,
          zone.roomNodeId === "floor-1-entry" ? 0xd88a58 : palette.gold,
          0.58,
        );
        graphics.strokeRect(
          zone.x * TILE_SIZE + 2,
          zone.y * TILE_SIZE + 2,
          zone.width * TILE_SIZE - 4,
          zone.height * TILE_SIZE - 4,
        );
      });
  }
}
