/**
 * 共享角色像素表现工厂。
 * 根据角色身份和状态生成 Phaser 图形对象，保证探索与战斗使用同一套
 * 视觉配方；不负责角色位置、生命或战斗状态。
 */
import Phaser from "phaser";
import {
  SCRIBE_ACTOR_PROFILE,
  monsterActorProfile,
  type ActorIdleMotion,
  type MonsterActorProfile,
  type PlayerActorProfile,
} from "../../content/world/actorVisuals";
import type { Monster } from "../../domain/shared/types";

export interface PixelActorOptions {
  x: number;
  y: number;
  scale?: number;
  depth?: number;
}

export interface PixelActorView {
  container: Phaser.GameObjects.Container;
  idle: ActorIdleMotion;
}

function rectangle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  alpha = 1,
): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, width, height, color, alpha);
}

function triangle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  alpha = 1,
): Phaser.GameObjects.Triangle {
  return scene.add.triangle(
    x,
    y,
    -width / 2,
    height / 2,
    0,
    -height / 2,
    width / 2,
    height / 2,
    color,
    alpha,
  );
}

function actorContainer(
  scene: Phaser.Scene,
  options: PixelActorOptions,
  parts: Phaser.GameObjects.GameObject[],
): Phaser.GameObjects.Container {
  const container = scene.add
    .container(options.x, options.y, parts)
    .setDepth(options.depth ?? 25)
    .setScale(options.scale ?? 1);
  return container;
}

export function createPlayerActor(
  scene: Phaser.Scene,
  profile: PlayerActorProfile,
  options: PixelActorOptions,
): PixelActorView {
  const parts: Phaser.GameObjects.GameObject[] = [];
  const longCoatHeight = profile.hasLongCoat ? 27 : 22;
  const coatY = profile.hasLongCoat ? 7 : 4;

  parts.push(
    rectangle(scene, -6, coatY, 11, longCoatHeight, profile.coat),
    rectangle(scene, 6, coatY, 12, longCoatHeight, profile.coatSecondary),
    rectangle(scene, 0, -10, 20, 14, profile.face)
      .setStrokeStyle(1, profile.lining, 0.72),
    rectangle(scene, -6, -11, 4, 4, profile.eye),
    rectangle(scene, 6, -11, 4, 4, profile.eye),
    rectangle(scene, -8, 21, 7, 5, profile.lining),
    rectangle(scene, 8, 21, 7, 5, profile.lining),
  );

  if (profile.hasMantle) {
    parts.push(
      rectangle(scene, 0, -1, 27, 7, profile.lining)
        .setStrokeStyle(1, profile.trim, 0.78),
      rectangle(scene, 0, 3, 4, 16, profile.trim, 0.82),
    );
  }
  if (profile.hasLongCoat) {
    parts.push(
      triangle(scene, -7, 21, 10, 13, profile.coat),
      triangle(scene, 7, 21, 10, 13, profile.coatSecondary),
    );
  }
  if (profile.armor !== null) {
    parts.push(
      rectangle(scene, 0, 6, 20, 10, profile.armor, 0.76)
        .setStrokeStyle(1, profile.trim, 0.88),
      rectangle(scene, -12, 3, 5, 9, profile.armor, 0.8),
      rectangle(scene, 12, 3, 5, 9, profile.armor, 0.8),
    );
  }
  if (profile.armorStyle === "ember-echo") {
    parts.push(
      rectangle(scene, 0, -20, 24, 5, 0x382a31, 0.96)
        .setStrokeStyle(1, profile.trim, 0.82),
      rectangle(scene, -12, -11, 5, 18, 0x382a31, 0.96),
      rectangle(scene, 12, -11, 5, 18, 0x382a31, 0.96),
      rectangle(scene, -14, 1, 7, 10, profile.trim, 0.92),
      rectangle(scene, 14, 1, 7, 10, profile.trim, 0.92),
      rectangle(scene, 0, 7, 7, 7, 0xe16b42, 0.96)
        .setStrokeStyle(1, 0xf4d17b, 0.9),
    );
  }

  const weapon = rectangle(scene, 14, 2, 3, 29, profile.weapon)
    .setStrokeStyle(1, profile.lining, 0.75)
    .setAngle(22);
  parts.push(weapon);
  if (profile.stage === "history-set") {
    parts.push(
      rectangle(scene, 0, -20, 14, 3, profile.trim),
      rectangle(scene, 0, -18, 3, 5, profile.trim),
    );
  }

  const container = actorContainer(scene, options, parts);
  container.setData("actor-kind", "player");
  container.setData("actor-stage", profile.stage);
  container.setData("armor-style", profile.armorStyle);
  return { container, idle: "breathe" };
}

export function createScribeActor(
  scene: Phaser.Scene,
  options: PixelActorOptions,
): PixelActorView {
  const palette = SCRIBE_ACTOR_PROFILE;
  const parts: Phaser.GameObjects.GameObject[] = [
    triangle(scene, 0, 8, 29, 39, palette.robe)
      .setStrokeStyle(1, palette.robeSecondary, 0.9),
    rectangle(scene, 0, -11, 18, 13, palette.paper)
      .setStrokeStyle(1, palette.hair, 0.7),
    rectangle(scene, -6, -18, 8, 6, palette.hair),
    rectangle(scene, 4, -17, 11, 5, palette.hair),
    rectangle(scene, -5, -11, 3, 3, palette.eye),
    rectangle(scene, 5, -11, 3, 3, palette.eye),
    rectangle(scene, 0, 4, 17, 11, palette.paper)
      .setStrokeStyle(1, palette.trim, 0.88),
    rectangle(scene, 0, 4, 2, 8, palette.robeSecondary),
    rectangle(scene, 15, 3, 3, 20, palette.trim).setAngle(8),
    rectangle(scene, 16, -7, 7, 7, palette.lamp, 0.88)
      .setStrokeStyle(1, palette.paper, 0.74),
  ];
  const container = actorContainer(scene, options, parts);
  container.setData("actor-kind", "scribe");
  return { container, idle: "breathe" };
}

export function createMonsterActor(
  scene: Phaser.Scene,
  monster: Pick<Monster, "kind" | "species" | "isBoss">,
  options: PixelActorOptions,
): PixelActorView {
  const profile = monsterActorProfile(monster);
  const parts = createMonsterActorParts(scene, monster);
  const container = actorContainer(scene, options, parts);
  container.setData("actor-kind", "monster");
  container.setData("actor-profile", profile.id);
  container.setData("actor-silhouette", profile.silhouette);
  return { container, idle: profile.idle };
}

export function createMonsterActorParts(
  scene: Phaser.Scene,
  monster: Pick<Monster, "kind" | "species" | "isBoss">,
): Phaser.GameObjects.GameObject[] {
  return monsterParts(scene, monsterActorProfile(monster));
}

export function startActorIdle(
  scene: Phaser.Scene,
  view: PixelActorView,
  reducedMotion: boolean,
): Phaser.Tweens.Tween | undefined {
  if (reducedMotion) return undefined;
  const { container, idle } = view;
  const baseY = container.y;
  const baseScaleX = container.scaleX;
  const baseScaleY = container.scaleY;
  const common = {
    targets: container,
    yoyo: true,
    repeat: -1,
    ease: "Sine.inOut",
  } as const;

  if (idle === "float") {
    return scene.tweens.add({
      ...common,
      y: baseY - 5,
      duration: 980,
    });
  }
  if (idle === "squash") {
    return scene.tweens.add({
      ...common,
      scaleX: baseScaleX * 1.035,
      scaleY: baseScaleY * 0.965,
      duration: 620,
    });
  }
  if (idle === "pulse") {
    return scene.tweens.add({
      ...common,
      scaleX: baseScaleX * 1.018,
      scaleY: baseScaleY * 1.018,
      alpha: 0.86,
      duration: 760,
    });
  }
  return scene.tweens.add({
    ...common,
    y: baseY - 2,
    scaleY: baseScaleY * 1.012,
    duration: 1050,
  });
}

function monsterParts(
  scene: Phaser.Scene,
  profile: MonsterActorProfile,
): Phaser.GameObjects.GameObject[] {
  const parts: Phaser.GameObjects.GameObject[] = [];
  const { base, accent, shadow, eye } = profile;

  if (profile.silhouette === "blob") {
    parts.push(
      scene.add.ellipse(0, 7, 38, 25, base).setStrokeStyle(2, shadow),
      rectangle(scene, -10, -6, 17, 13, accent),
      rectangle(scene, 10, -7, 18, 14, accent),
      rectangle(scene, -7, 1, 4, 4, eye),
      rectangle(scene, 8, 0, 4, 4, eye),
    );
  } else if (profile.silhouette === "quadruped") {
    parts.push(
      rectangle(scene, -3, 5, 37, 21, base).setStrokeStyle(2, shadow),
      rectangle(scene, 17, -6, 20, 18, accent).setStrokeStyle(2, shadow),
      triangle(scene, 18, -19, 15, 13, shadow),
      rectangle(scene, -14, 21, 6, 13, shadow),
      rectangle(scene, 12, 21, 6, 13, shadow),
      rectangle(scene, 22, -7, 4, 4, eye),
      rectangle(scene, -26, 0, 19, 4, accent).setAngle(-18),
    );
  } else if (profile.silhouette === "spirit") {
    parts.push(
      rectangle(scene, 0, 2, 32, 34, base, 0.92).setStrokeStyle(2, shadow),
      triangle(scene, -10, 25, 15, 17, base, 0.92),
      triangle(scene, 10, 25, 15, 17, base, 0.92),
      rectangle(scene, -7, -5, 4, 5, eye),
      rectangle(scene, 7, -5, 4, 5, eye),
      rectangle(scene, 0, 9, 18, 3, accent, 0.82),
    );
  } else if (profile.silhouette === "construct") {
    parts.push(
      rectangle(scene, 0, 6, 43, 39, base).setStrokeStyle(3, shadow),
      rectangle(scene, -17, -17, 18, 15, accent).setStrokeStyle(2, shadow),
      rectangle(scene, 17, -17, 18, 15, accent).setStrokeStyle(2, shadow),
      rectangle(scene, -9, 0, 5, 6, eye),
      rectangle(scene, 9, 0, 5, 6, eye),
      rectangle(scene, 0, 13, 4, 27, accent, 0.7),
    );
  } else if (profile.silhouette === "mimic") {
    parts.push(
      rectangle(scene, -10, 4, 25, 32, base).setStrokeStyle(2, shadow),
      rectangle(scene, 10, 1, 25, 32, accent).setStrokeStyle(2, shadow),
      rectangle(scene, 0, 20, 28, 5, shadow),
      rectangle(scene, -13, -4, 4, 4, eye),
      rectangle(scene, 7, -8, 4, 4, eye),
    );
  } else if (profile.silhouette === "arachnid") {
    parts.push(
      scene.add.ellipse(0, 6, 30, 25, base).setStrokeStyle(2, shadow),
      scene.add.ellipse(0, -10, 22, 16, accent).setStrokeStyle(2, shadow),
      ...[-1, 1].flatMap((side) => [
        rectangle(scene, side * 23, -2, 25, 3, accent).setAngle(side * 22),
        rectangle(scene, side * 26, 10, 28, 3, accent).setAngle(side * -16),
        rectangle(scene, side * 21, 22, 22, 3, accent).setAngle(side * -36),
      ]),
      rectangle(scene, -5, -11, 3, 3, eye),
      rectangle(scene, 5, -11, 3, 3, eye),
    );
  } else if (profile.silhouette === "humanoid") {
    parts.push(
      rectangle(scene, 0, 6, 30, 34, base).setStrokeStyle(2, shadow),
      rectangle(scene, 0, -15, 24, 18, accent).setStrokeStyle(2, shadow),
      rectangle(scene, -7, -17, 4, 5, eye),
      rectangle(scene, 7, -17, 4, 5, eye),
      rectangle(scene, -10, 29, 7, 13, shadow),
      rectangle(scene, 10, 29, 7, 13, shadow),
    );
  } else if (profile.silhouette === "amphibian") {
    parts.push(
      scene.add.ellipse(0, 8, 39, 25, base).setStrokeStyle(2, shadow),
      scene.add.ellipse(-18, 17, 18, 8, shadow).setAngle(-20),
      scene.add.ellipse(18, 17, 18, 8, shadow).setAngle(20),
      rectangle(scene, -10, -7, 14, 13, accent).setStrokeStyle(2, shadow),
      rectangle(scene, 10, -7, 14, 13, accent).setStrokeStyle(2, shadow),
      rectangle(scene, -10, -8, 4, 4, eye),
      rectangle(scene, 10, -8, 4, 4, eye),
      rectangle(scene, 0, 12, 14, 3, shadow),
    );
  } else if (profile.silhouette === "treant") {
    parts.push(
      rectangle(scene, 0, 5, 25, 37, base).setStrokeStyle(2, shadow),
      rectangle(scene, -15, -9, 23, 23, accent),
      rectangle(scene, 15, -12, 25, 24, accent),
      rectangle(scene, -6, 1, 4, 4, eye),
      rectangle(scene, 6, 1, 4, 4, eye),
      rectangle(scene, 0, 14, 12, 3, shadow),
    );
  } else if (profile.silhouette === "aquatic") {
    parts.push(
      scene.add.ellipse(0, 5, 41, 25, base).setStrokeStyle(2, shadow),
      triangle(scene, -25, 6, 24, 26, accent),
      rectangle(scene, -7, -3, 4, 4, eye),
      rectangle(scene, 7, -3, 4, 4, eye),
      rectangle(scene, 0, 13, 17, 3, shadow),
    );
  } else if (profile.silhouette === "crystal") {
    parts.push(
      scene.add.polygon(
        0,
        3,
        [0, -31, 22, -9, 16, 25, 0, 34, -16, 25, -22, -9],
        base,
      ).setStrokeStyle(3, accent),
      triangle(scene, -22, 7, 15, 28, accent, 0.9),
      triangle(scene, 22, 7, 15, 28, accent, 0.9),
      rectangle(scene, -7, -3, 4, 5, eye),
      rectangle(scene, 7, -3, 4, 5, eye),
    );
  } else if (profile.silhouette === "eye") {
    parts.push(
      scene.add.ellipse(0, 3, 48, 34, base).setStrokeStyle(3, accent),
      scene.add.ellipse(0, 3, 25, 25, eye),
      rectangle(scene, 0, 3, 9, 23, accent),
      rectangle(scene, 0, 3, 4, 17, shadow),
    );
  } else if (profile.silhouette === "twin") {
    parts.push(
      rectangle(scene, -14, 6, 25, 37, base).setStrokeStyle(2, shadow),
      rectangle(scene, 14, 6, 25, 37, accent).setStrokeStyle(2, shadow),
      rectangle(scene, -14, -15, 19, 16, accent),
      rectangle(scene, 14, -15, 19, 16, base),
      rectangle(scene, -18, -16, 4, 4, eye),
      rectangle(scene, 10, -16, 4, 4, eye),
    );
  } else {
    const dragonLike = profile.silhouette === "dragon" || profile.silhouette === "drake";
    const bodyWidth = dragonLike ? 44 : 38;
    parts.push(
      rectangle(scene, 0, 5, bodyWidth, 36, base).setStrokeStyle(3, shadow),
      rectangle(scene, 0, -16, dragonLike ? 30 : 27, 20, accent)
        .setStrokeStyle(2, shadow),
      triangle(scene, -18, -31, 15, 18, shadow),
      triangle(scene, 18, -31, 15, 18, shadow),
      rectangle(scene, -7, -18, 4, 5, eye),
      rectangle(scene, 7, -18, 4, 5, eye),
    );
  }

  if (profile.hasWings) {
    parts.unshift(
      triangle(scene, -29, 2, 30, 39, accent, 0.84).setAngle(-18),
      triangle(scene, 29, 2, 30, 39, accent, 0.84).setAngle(18),
    );
  }
  if (profile.hasWeapon) {
    parts.push(
      rectangle(scene, 24, 4, 4, 39, accent)
        .setStrokeStyle(1, shadow)
        .setAngle(14),
    );
  }
  if (profile.hasCrown) {
    parts.push(
      triangle(scene, 0, -34, 28, 19, 0xd7ad55)
        .setStrokeStyle(1, shadow),
    );
  }
  return parts;
}
