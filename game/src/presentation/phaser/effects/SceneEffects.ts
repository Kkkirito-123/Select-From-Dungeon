/**
 * Phaser 场景效果适配器。
 *
 * 镜头和世界脉冲只表达已经由剧情系统决定的事件，不读取存档、不修改
 * GameSession。Reduced Motion 在这里统一处理，避免剧情事件处理器散落在场景中。
 */
import Phaser from "phaser";
import type { Position } from "../../../domain/shared/types";

export interface SceneEffectColors {
  query: number;
  gold: number;
}

export class SceneEffects {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reducedMotion: boolean,
    private readonly playerView: () => Phaser.GameObjects.Container,
    private readonly colors: SceneEffectColors,
  ) {}

  focusCamera(point: Position): void {
    if (!this.scene.scene.isActive()) return;
    const duration = this.reducedMotion ? 0 : 520;
    this.scene.cameras.main.stopFollow();
    if (duration === 0) {
      this.scene.cameras.main.centerOn(point.x, point.y);
    } else {
      this.scene.cameras.main.pan(point.x, point.y, duration, "Sine.easeInOut", true);
    }
    this.scene.time.delayedCall(duration + (this.reducedMotion ? 180 : 1_000), () => {
      const player = this.playerView();
      if (!this.scene.scene.isActive() || !player.active) return;
      this.scene.cameras.main.startFollow(player, true, 0.18, 0.18);
    });
  }

  playWorldPulse(point: Position): void {
    const pulse = this.scene.add.ellipse(
      point.x,
      point.y,
      26,
      15,
      this.colors.query,
      0.18,
    )
      .setStrokeStyle(3, this.colors.gold, 0.92)
      .setDepth(35);
    if (this.reducedMotion) {
      this.scene.time.delayedCall(360, () => pulse.destroy());
      return;
    }
    this.scene.tweens.add({
      targets: pulse,
      scaleX: 4.4,
      scaleY: 4.4,
      alpha: 0,
      duration: 820,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }
}
