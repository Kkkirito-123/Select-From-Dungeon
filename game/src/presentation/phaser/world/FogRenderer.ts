/**
 * 迷雾渲染器。
 *
 * 迷雾只消费 discoveredCells 和当前视野，不改变发现状态，也不提供传送。
 * 安全区、管理员视野和楼层视野规则由领域函数计算后在这里表现出来。
 */
import Phaser from "phaser";
import { TILE_SIZE } from "../../../content/curriculum/mvpLevel";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import { floorCurrentSightCellKeys } from "../../../domain/exploration/floorLabyrinth";

export class FogRenderer {
  render(
    graphics: Phaser.GameObjects.Graphics,
    snapshot: GameSnapshot,
    fogColor: number,
  ): void {
    graphics.clear();
    const discovered = new Set(snapshot.discoveredCells);
    const floor = snapshot.mazeFloor;
    const currentSight = snapshot.adminMode
      ? discovered
      : floorCurrentSightCellKeys(
          snapshot.floor,
          floor,
          snapshot.campfires,
          snapshot.player,
        );
    for (let y = 0; y < floor.height; y += 1) {
      for (let x = 0; x < floor.width; x += 1) {
        const key = `${x}:${y}`;
        if (discovered.has(key) && currentSight.has(key)) continue;
        graphics.fillStyle(fogColor, discovered.has(key) ? 0.56 : 0.94);
        graphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}
