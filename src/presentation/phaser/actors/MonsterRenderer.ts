/**
 * 怪物角色表现适配器。
 *
 * 只复用共享 Actor 配方创建怪物身体；身份、生命和可见性仍由
 * DungeonScene 根据 GameSnapshot 同步，避免表现层成为怪物状态来源。
 */
import Phaser from "phaser";
import type { Monster } from "../../../domain/shared/types";
import { createMonsterActorParts } from "../PixelActorFactory";

export class MonsterRenderer {
  createBody(scene: Phaser.Scene, monster: Monster): Phaser.GameObjects.GameObject[] {
    return createMonsterActorParts(scene, monster);
  }
}
