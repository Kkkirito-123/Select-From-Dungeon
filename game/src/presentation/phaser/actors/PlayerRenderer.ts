/**
 * 玩家角色表现适配器。
 *
 * 玩家位置和装备真相来自 GameSnapshot；本模块只创建/移动共享像素角色，
 * 不判断碰撞、装备效果或战斗结果。
 */
import Phaser from "phaser";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import { playerActorProfile } from "../../../content/world/actorVisuals";
import { createPlayerActor } from "../PixelActorFactory";
import { TILE_SIZE } from "../../../content/curriculum/mvpLevel";

export class PlayerRenderer {
  create(
    scene: Phaser.Scene,
    entityLayer: Phaser.GameObjects.Container,
    snapshot: GameSnapshot,
  ): Phaser.GameObjects.Container {
    const pixel = {
      x: snapshot.player.x * TILE_SIZE + TILE_SIZE / 2,
      y: snapshot.player.y * TILE_SIZE + TILE_SIZE / 2,
    };
    const player = createPlayerActor(
      scene,
      playerActorProfile(snapshot.floor, snapshot.player),
      { x: pixel.x, y: pixel.y, depth: 30 },
    );
    entityLayer.add(player.container);
    return player.container;
  }
}
