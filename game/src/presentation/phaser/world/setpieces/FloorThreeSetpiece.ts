import Phaser from "phaser";
import type { GameSnapshot } from "../../../../contracts/game/snapshots";
import type { FloorThreeWorldState } from "../../../../domain/progression/floorWorldState";
import {
  FloorSetpieceModule,
  type FloorWorldState,
} from "../shared/FloorSetpieceModule";

const F3 = {
  frost: 0xa9d7df,
  ice: 0x5b8e9b,
  bone: 0xd9d1b8,
  soil: 0x292932,
  peat: 0x3a3035,
  ghost: 0x74d4c6,
  bronze: 0xa27a4e,
} as const;

export class FloorThreeSetpiece extends FloorSetpieceModule {
  private floorThreeBoneBridge: Phaser.GameObjects.Container | null = null;
  private floorThreeSteleLabels: Phaser.GameObjects.Text[] = [];
  private floorThreeRelicChain: Phaser.GameObjects.Container | null = null;
  private floorThreeWitnesses: Phaser.GameObjects.Ellipse[] = [];
  private floorThreeShaftLight: Phaser.GameObjects.Ellipse | null = null;

  protected buildFloor(snapshot: GameSnapshot): void {
    this.buildFloorThree(snapshot);
  }

  protected syncFloor(world: FloorWorldState): void {
    if (world.floor === 3) this.syncFloorThree(world);
  }

  protected resetFloorState(): void {
    this.floorThreeBoneBridge = null;
    this.floorThreeSteleLabels = [];
    this.floorThreeRelicChain = null;
    this.floorThreeWitnesses = [];
    this.floorThreeShaftLight = null;
  }

  private buildFloorThree(snapshot: GameSnapshot): void {
    this.createZoneSkin(snapshot, [F3.soil, F3.peat, 0x202937]);
    this.createFloorThreeBoneBridge(snapshot);
    this.createFloorThreeSteles(snapshot);
    this.createFloorThreeRelicChain(snapshot);
    this.createFloorThreeWitnessAltar(snapshot);
    this.createFloorThreeThrone(snapshot);
    this.createFloorThreeHiddenArea(snapshot);
    this.createUniqueScribe(snapshot, "npc-scribe-f3");
  }

  private createFloorThreeBoneBridge(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f3-relation-bridge");
    if (!point) return;
    this.floorThreeBoneBridge = this.scene.add.container(point.x, point.y);
    for (let index = -3; index <= 3; index += 1) {
      const bone = this.scene.add.rectangle(
        index * 17,
        Math.abs(index) * 2,
        21,
        6,
        F3.bone,
        0.95,
      ).setAngle(index % 2 === 0 ? 8 : -7)
        .setStrokeStyle(1, F3.ice, 0.66);
      this.floorThreeBoneBridge.add(bone);
    }
    const anchors = [-61, 61].map((x) => (
      this.scene.add.ellipse(x, 8, 16, 22, F3.bronze, 0.9)
        .setStrokeStyle(2, F3.frost, 0.62)
    ));
    this.floorThreeBoneBridge.add(anchors);
    this.root?.add(this.floorThreeBoneBridge);
    this.addLabel(point, "断裂骨桥 · monsters.room_id ⇄ rooms.id", "#d9e5d9", -32);
  }

  private createFloorThreeSteles(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f3-master-steles");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    [-24, 24].forEach((x, index) => {
      const stele = this.scene.add.rectangle(x, 7, 32, 57, 0x4a4648, 0.96)
        .setStrokeStyle(2, F3.frost, 0.58);
      const cap = this.scene.add.triangle(x, -26, -18, 10, 0, -11, 18, 10, 0x575256, 0.96);
      const label = this.scene.add.text(x, 4, "???", {
        color: "#d9d1b8",
        fontFamily: "monospace",
        fontSize: "7px",
        fontStyle: "bold",
      }).setOrigin(0.5);
      this.floorThreeSteleLabels.push(label);
      container.add([stele, cap, label]);
      if (index === 1) stele.setAlpha(0.82);
    });
    this.root?.add(container);
    this.addLabel(point, "双名墓碑", "#a9d7df", -50);
  }

  private createFloorThreeRelicChain(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f3-relic-chain");
    if (!point) return;
    this.floorThreeRelicChain = this.scene.add.container(point.x, point.y);
    const nodes = [
      { x: -48, label: "M" },
      { x: 0, label: "R" },
      { x: 48, label: "G" },
    ];
    nodes.forEach(({ x, label }, index) => {
      if (index < nodes.length - 1) {
        this.floorThreeRelicChain?.add(
          this.scene.add.rectangle(x + 24, 0, 42, 3, F3.bronze, 0.9),
        );
      }
      this.floorThreeRelicChain?.add([
        this.scene.add.ellipse(x, 0, 25, 25, F3.peat, 0.98)
          .setStrokeStyle(2, F3.ghost, 0.74),
        this.scene.add.text(x, 0, label, {
          color: "#d9d1b8",
          fontFamily: "monospace",
          fontSize: "8px",
          fontStyle: "bold",
        }).setOrigin(0.5),
      ]);
    });
    this.root?.add(this.floorThreeRelicChain);
    this.addLabel(point, "三段遗物链", "#c5b28c", -30);
  }

  private createFloorThreeWitnessAltar(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f3-grave-lord");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    const altar = this.scene.add.rectangle(0, 19, 92, 31, 0x34333b, 0.92)
      .setStrokeStyle(2, F3.bronze, 0.72);
    container.add(altar);
    [-44, -22, 0, 22, 44].forEach((x, index) => {
      const flame = this.scene.add.ellipse(x, -4 - Math.abs(index - 2) * 2, 11, 20, F3.ghost, 0.2);
      this.floorThreeWitnesses.push(flame);
      container.add(flame);
    });
    this.root?.add(container);
    this.addLabel(point, "区域首领 · ID #033", "#84dfcf", -40);
  }

  private createFloorThreeThrone(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f3-necromancer-throne");
    if (!point) return;
    const throne = this.scene.add.container(point.x, point.y);
    throne.add([
      this.scene.add.rectangle(0, 10, 70, 50, 0x282633, 0.96)
        .setStrokeStyle(3, F3.frost, 0.66),
      this.scene.add.rectangle(0, -26, 48, 25, 0x3c3748, 0.96)
        .setStrokeStyle(2, F3.bronze, 0.72),
      this.scene.add.text(0, -26, "ONE HEIR", {
        color: "#d9d1b8",
        fontFamily: "monospace",
        fontSize: "8px",
        fontStyle: "bold",
      }).setOrigin(0.5),
    ]);
    this.root?.add(throne);
    const shaftPoint = this.anchorPoint(snapshot, "f3-burial-shaft");
    if (shaftPoint) {
      const shaft = this.scene.add.container(shaftPoint.x, shaftPoint.y);
      const well = this.scene.add.ellipse(0, 4, 44, 25, 0x0d1116, 0.98)
        .setStrokeStyle(3, F3.bronze, 0.78);
      this.floorThreeShaftLight = this.scene.add.ellipse(0, 2, 28, 14, F3.ghost, 0.18);
      shaft.add([well, this.floorThreeShaftLight]);
      this.root?.add(shaft);
      this.addLabel(shaftPoint, "葬火井", "#c5b28c", -26);
    }
  }

  private createFloorThreeHiddenArea(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f3-reliquary");
    if (!point) return;
    const backdrop = this.createHiddenRoomBackdrop(
      snapshot,
      "floor-3-treasure",
      0x1c232d,
      F3.frost,
      false,
    );
    const interior = this.scene.add.container(point.x, point.y);
    const caseBody = this.scene.add.rectangle(0, 7, 78, 51, 0x31343d, 0.96)
      .setStrokeStyle(3, F3.bronze, 0.78);
    const relic = this.scene.add.polygon(
      0,
      3,
      [-9, -18, 9, -18, 17, 0, 0, 19, -17, 0],
      F3.ghost,
      0.88,
    ).setStrokeStyle(2, F3.frost, 0.9);
    const owner = this.scene.add.text(0, 34, "CURRENT OWNER = NULL", {
      color: "#a9d7df",
      fontFamily: "monospace",
      fontSize: "7px",
      fontStyle: "bold",
    }).setOrigin(0.5);
    interior.add([caseBody, relic, owner]);
    this.root?.add(interior);
    const label = this.addLabel(point, "无主遗物室 · 关系仍在", "#a9d7df", -48);
    this.createHiddenAreaEntrance(
      snapshot,
      backdrop,
      interior,
      label,
      "结霜墓志",
      "遗物室石门",
      0x34323a,
      F3.frost,
    );
  }

  private syncFloorThree(world: FloorThreeWorldState): void {
    this.floorThreeBoneBridge?.setAlpha(world.boneBridge === "linked" ? 1 : 0.28);
    this.floorThreeSteleLabels.forEach((label, index) => {
      label.setText(world.steles === "aliased" ? (index === 0 ? "child" : "master") : "???");
      label.setColor(world.steles === "aliased" ? "#74d4c6" : "#d9d1b8");
    });
    this.floorThreeRelicChain?.setAlpha(world.relicChain === "linked" ? 1 : 0.26);
    this.floorThreeWitnesses.forEach((witness) => {
      witness.setAlpha(world.witnesses === "united" ? 0.88 : 0.14);
    });
    this.floorThreeShaftLight?.setAlpha(world.burialShaft === "lit" ? 0.94 : 0.16);
  }
}
