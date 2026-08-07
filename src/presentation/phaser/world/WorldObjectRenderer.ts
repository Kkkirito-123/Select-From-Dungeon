/**
 * 世界对象可见性辅助。
 *
 * 门、怪物、陷阱和道具共享“已探索且在当前视野内”的可见性条件；本模块
 * 只做集合判断，不负责创建或销毁 Phaser 对象，也不改变发现状态。
 */
import Phaser from "phaser";
import type { FloorTransitKind } from "../../../content/world/floorMapBlueprints";
import type { Position } from "../../../domain/shared/types";

export class WorldObjectRenderer {
  /** 判断一个对象是否已经被玩家走过的迷雾区域发现。 */
  isDiscovered(
    discovered: ReadonlySet<string>,
    position: Position,
  ): boolean {
    return discovered.has(`${position.x}:${position.y}`);
  }

  isVisible(
    discovered: ReadonlySet<string>,
    currentSight: ReadonlySet<string>,
    position: Position,
  ): boolean {
    const key = `${position.x}:${position.y}`;
    return this.isDiscovered(discovered, position) && currentSight.has(key);
  }

  /**
   * 创建楼层交通对象的局部造型。
   *
   * 造型属于 Phaser 表现层，门是否可通过仍由 GameSession 判定；因此这里
   * 只返回尚未加入父容器的对象，生命周期由 DungeonScene 统一管理。
   */
  createTransitParts(
    scene: Phaser.Scene,
    kind: FloorTransitKind,
    regionPortal = false,
  ): Phaser.GameObjects.GameObject[] {
    if (kind === "floodgate" && regionPortal) {
      return [
        scene.add.ellipse(0, 7, 30, 12, 0x2a6574, 0.58)
          .setStrokeStyle(2, 0x78c9b8),
        scene.add.rectangle(0, 2, 23, 5, 0x446b75, 0.82),
        scene.add.rectangle(0, -4, 9, 9, 0x78c9b8, 0.82)
          .setAngle(45)
          .setStrokeStyle(1, 0xd8fff8),
      ];
    }
    if (kind === "floodgate") {
      return [
        scene.add.rectangle(0, 1, 29, 34, 0x24313a, 0.96)
          .setStrokeStyle(2, 0x78c9b8),
        scene.add.rectangle(-7, 1, 3, 29, 0xa7b5b8),
        scene.add.rectangle(0, 1, 3, 29, 0xa7b5b8),
        scene.add.rectangle(7, 1, 3, 29, 0xa7b5b8),
        scene.add.rectangle(0, 12, 25, 5, 0x3a91ad, 0.78),
      ];
    }
    if (kind === "skiff") {
      return [
        scene.add.polygon(0, 6, [-17, -4, 16, -4, 10, 8, -10, 8], 0x765035)
          .setStrokeStyle(2, 0xd7ad55),
        scene.add.rectangle(-2, -6, 2, 23, 0xe8dfc7),
        scene.add.triangle(5, -11, -6, 8, -6, -9, 8, 8, 0x78c9b8, 0.9)
          .setStrokeStyle(1, 0xd8fff8),
        scene.add.ellipse(0, 13, 34, 6, 0x397e9d, 0.55),
      ];
    }
    if (kind === "tomb-gate") {
      return [
        scene.add.rectangle(-10, 4, 7, 29, 0x696d75)
          .setStrokeStyle(1, 0xbec9cf),
        scene.add.rectangle(10, 4, 7, 29, 0x696d75)
          .setStrokeStyle(1, 0xbec9cf),
        scene.add.rectangle(0, -11, 27, 7, 0x838891)
          .setStrokeStyle(1, 0xd7e5e9),
        scene.add.triangle(0, -17, -14, 7, 0, -6, 14, 7, 0xa9cbd7, 0.72),
      ];
    }
    if (kind === "element-switch") {
      return [
        scene.add.polygon(0, 1, [0, -17, 17, 0, 0, 17, -17, 0], 0x29243a)
          .setStrokeStyle(3, 0x9d78dc),
        scene.add.triangle(-5, 1, -5, 8, 0, -10, 5, 8, 0x63bfe0, 0.94),
        scene.add.triangle(6, 1, -5, 8, 0, -10, 5, 8, 0xe36a48, 0.94),
      ];
    }
    if (kind === "drawbridge") {
      return [
        scene.add.rectangle(0, 3, 31, 19, 0x765035)
          .setStrokeStyle(2, 0xd7ad55),
        scene.add.rectangle(-10, 3, 2, 18, 0xc49a61),
        scene.add.rectangle(0, 3, 2, 18, 0xc49a61),
        scene.add.rectangle(10, 3, 2, 18, 0xc49a61),
        scene.add.rectangle(-13, -10, 2, 15, 0x9ca4aa).setAngle(-24),
        scene.add.rectangle(13, -10, 2, 15, 0x9ca4aa).setAngle(24),
      ];
    }
    if (kind === "minecart") {
      return [
        scene.add.polygon(0, 2, [-16, -9, 16, -9, 11, 8, -11, 8], 0x59656b)
          .setStrokeStyle(2, 0xd7ad55),
        scene.add.rectangle(0, -3, 23, 3, 0x89959b),
        scene.add.ellipse(-9, 12, 8, 8, 0x171b22)
          .setStrokeStyle(2, 0xa7b0b4),
        scene.add.ellipse(9, 12, 8, 8, 0x171b22)
          .setStrokeStyle(2, 0xa7b0b4),
      ];
    }
    if (kind === "crystal-gate") {
      return [
        scene.add.triangle(-10, 2, -6, 15, 0, -17, 6, 15, 0x55b9b0, 0.88)
          .setStrokeStyle(2, 0xb7f4e6),
        scene.add.triangle(10, 2, -6, 15, 0, -17, 6, 15, 0x8568b0, 0.88)
          .setStrokeStyle(2, 0xe1c8ff),
        scene.add.polygon(0, -13, [0, -7, 8, 0, 0, 7, -8, 0], 0xe0bf63, 0.92),
      ];
    }
    return [
      scene.add.rectangle(0, 1, 28, 35, 0x332719, 0.97)
        .setStrokeStyle(3, 0xd7ad55),
      scene.add.rectangle(-7, 1, 11, 29, 0x5d4323)
        .setStrokeStyle(1, 0xe0bf63),
      scene.add.rectangle(7, 1, 11, 29, 0x5d4323)
        .setStrokeStyle(1, 0xe0bf63),
      scene.add.rectangle(0, -11, 19, 3, 0xf0c75e, 0.86),
      scene.add.ellipse(-2, 2, 3, 3, 0xf4e5a1),
      scene.add.ellipse(2, 2, 3, 3, 0xf4e5a1),
    ];
  }
}
