/**
 * 楼层地标和固定布景的 Phaser 门面。
 * 具体绘制按楼层分区，本类只负责选择、切换和销毁当前模块。
 */
import Phaser from "phaser";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { FloorSetpieceModule } from "./world/shared/FloorSetpieceModule";
import { FloorOneSetpiece } from "./world/setpieces/FloorOneSetpiece";
import { FloorTwoSetpiece } from "./world/setpieces/FloorTwoSetpiece";
import { FloorThreeSetpiece } from "./world/setpieces/FloorThreeSetpiece";
import { FloorFourSetpiece } from "./world/setpieces/FloorFourSetpiece";
import { LateFloorsSetpiece } from "./world/setpieces/LateFloorsSetpiece";

type FloorSetpieceConstructor = new (
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  reducedMotion: boolean,
) => FloorSetpieceModule;

const FLOOR_SETPIECE_MODULES: Record<number, FloorSetpieceConstructor> = {
  1: FloorOneSetpiece,
  2: FloorTwoSetpiece,
  3: FloorThreeSetpiece,
  4: FloorFourSetpiece,
  5: LateFloorsSetpiece,
  6: LateFloorsSetpiece,
  7: LateFloorsSetpiece,
  8: LateFloorsSetpiece,
};

export class FloorSetpieceLayer {
  private activeModule: FloorSetpieceModule | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    private readonly reducedMotion: boolean,
  ) {}

  build(snapshot: GameSnapshot): void {
    this.destroy();
    const Module = FLOOR_SETPIECE_MODULES[snapshot.floor];
    if (!Module) return;
    this.activeModule = new Module(
      this.scene,
      this.parent,
      this.reducedMotion,
    );
    this.activeModule.build(snapshot);
  }

  sync(snapshot: GameSnapshot): void {
    this.activeModule?.sync(snapshot);
  }

  destroy(): void {
    this.activeModule?.destroy();
    this.activeModule = null;
  }
}
