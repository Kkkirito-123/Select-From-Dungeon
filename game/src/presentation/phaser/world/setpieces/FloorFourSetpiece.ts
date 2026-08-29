import Phaser from "phaser";
import type { GameSnapshot } from "../../../../contracts/game/snapshots";
import type { FloorFourWorldState } from "../../../../domain/progression/floorWorldState";
import {
  FloorSetpieceModule,
  type FloorWorldState,
} from "../shared/FloorSetpieceModule";

const F4 = {
  ember: 0xdf6544,
  brass: 0xd6ab55,
  frost: 0x7ecbe0,
  storm: 0xa47ad4,
  stone: 0x282833,
  iron: 0x4a4448,
} as const;

export class FloorFourSetpiece extends FloorSetpieceModule {
  private floorFourSourceCore: Phaser.GameObjects.Ellipse | null = null;
  private floorFourFrostCells: Phaser.GameObjects.Rectangle[] = [];
  private floorFourPipes: Phaser.GameObjects.Rectangle[] = [];
  private floorFourDependencyRings: Phaser.GameObjects.Ellipse[] = [];
  private floorFourEchoDoor: Phaser.GameObjects.Container | null = null;
  private floorFourAscentLight: Phaser.GameObjects.Rectangle | null = null;

  protected buildFloor(snapshot: GameSnapshot): void {
    this.buildFloorFour(snapshot);
  }

  protected syncFloor(world: FloorWorldState): void {
    if (world.floor === 4) this.syncFloorFour(world);
  }

  protected resetFloorState(): void {
    this.floorFourSourceCore = null;
    this.floorFourFrostCells = [];
    this.floorFourPipes = [];
    this.floorFourDependencyRings = [];
    this.floorFourEchoDoor = null;
    this.floorFourAscentLight = null;
  }

  private buildFloorFour(snapshot: GameSnapshot): void {
    this.createZoneSkin(snapshot, [0x3a2628, 0x243746, 0x302743]);
    this.createFloorFourSource(snapshot);
    this.createFloorFourFrostArray(snapshot);
    this.createFloorFourForgeLord(snapshot);
    this.createFloorFourDependencySpine(snapshot);
    this.createFloorFourThrone(snapshot);
    this.createFloorFourHiddenArea(snapshot);
    this.createUniqueScribe(snapshot, "npc-scribe-f4");
  }

  private createFloorFourSource(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f4-source-core");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    const body = this.scene.add.rectangle(0, 9, 72, 58, F4.iron, 0.96)
      .setStrokeStyle(3, F4.brass, 0.74);
    this.floorFourSourceCore = this.scene.add.ellipse(0, 1, 34, 34, F4.ember, 0.18)
      .setStrokeStyle(2, F4.brass, 0.8);
    const inner = this.scene.add.text(0, 1, "( ? )", {
      color: "#f2c979",
      fontFamily: "monospace",
      fontSize: "8px",
      fontStyle: "bold",
    }).setOrigin(0.5);
    container.add([body, this.floorFourSourceCore, inner]);
    this.root?.add(container);
    this.addLabel(point, "命令源炉 · 标量结果", "#f2c979", -43);
  }

  private createFloorFourFrostArray(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f4-frost-array");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    for (let index = 0; index < 6; index += 1) {
      const x = (index % 3 - 1) * 28;
      const y = Math.floor(index / 3) * 31 - 10;
      const cell = this.scene.add.rectangle(x, y, 22, 26, 0x40576b, 0.46)
        .setStrokeStyle(2, F4.frost, 0.56);
      this.floorFourFrostCells.push(cell);
      container.add(cell);
    }
    this.root?.add(container);
    this.addLabel(point, "冻结依赖阵列 · room_id IN (...)", "#9be6f1", -46);
  }

  private createFloorFourForgeLord(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f4-forge-lord");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    const floor = this.scene.add.ellipse(0, 14, 105, 48, 0x202430, 0.96)
      .setStrokeStyle(4, F4.frost, 0.72);
    const mirror = this.scene.add.rectangle(0, -17, 48, 58, 0x314250, 0.84)
      .setStrokeStyle(3, F4.brass, 0.82);
    const crackA = this.scene.add.line(0, -17, -9, -25, 7, 8, F4.frost, 0.82).setLineWidth(2);
    const crackB = this.scene.add.line(0, -17, 7, 8, -10, 20, F4.frost, 0.7).setLineWidth(2);
    container.add([floor, mirror, crackA, crackB]);
    this.root?.add(container);
    this.addLabel(point, "中层首领 · ID #044", "#e8d7a7", -59);
  }

  private createFloorFourDependencySpine(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f4-dependency-spine");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    [-34, 0, 34].forEach((x, index) => {
      const colors = [F4.ember, F4.frost, F4.storm] as const;
      const pipe = this.scene.add.rectangle(x, 12, 13, 73, colors[index], 0.28)
        .setStrokeStyle(2, colors[index], 0.72);
      this.floorFourPipes.push(pipe);
      container.add(pipe);
    });
    [31, 47, 64].forEach((size, index) => {
      const ring = this.scene.add.ellipse(0, -27, size, size, F4.stone, 0.08)
        .setStrokeStyle(2, index === 0 ? F4.brass : F4.storm, 0.36);
      this.floorFourDependencyRings.push(ring);
      container.add(ring);
    });
    this.root?.add(container);
    this.addLabel(point, "三相依赖脊柱 · WITH / RECURSIVE", "#dec982", -69);
  }

  private createFloorFourThrone(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f4-elemental-throne");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    const ring = this.scene.add.ellipse(0, 6, 106, 75, 0x191a22, 0.92)
      .setStrokeStyle(4, F4.storm, 0.72);
    const status = this.scene.add.text(0, 4, "TRANSACTION\nOPEN", {
      color: "#f0c86d",
      fontFamily: "monospace",
      fontSize: "8px",
      fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5);
    container.add([ring, status]);
    this.root?.add(container);
    const ascentPoint = this.anchorPoint(snapshot, "f4-ascent");
    if (ascentPoint) {
      const ascent = this.scene.add.container(ascentPoint.x, ascentPoint.y);
      const cage = this.scene.add.rectangle(0, 5, 46, 65, 0x23252d, 0.96)
        .setStrokeStyle(3, F4.brass, 0.75);
      this.floorFourAscentLight = this.scene.add.rectangle(0, -34, 27, 5, 0x5b4430, 1);
      ascent.add([cage, this.floorFourAscentLight]);
      this.root?.add(ascent);
      this.addLabel(ascentPoint, "垂直升炉", "#e8c66e", -48);
    }
  }

  private createFloorFourHiddenArea(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f4-echo-gate");
    if (!point) return;
    const backdrop = this.createHiddenRoomBackdrop(
      snapshot,
      "floor-4-treasure",
      0x251f22,
      F4.brass,
      false,
    );
    const interior = this.scene.add.container(point.x, point.y);
    const room = this.scene.add.rectangle(0, 5, 105, 72, 0x342b2b, 0.96)
      .setStrokeStyle(3, F4.brass, 0.78);
    const waterWheel = this.scene.add.ellipse(-28, 0, 34, 34, 0x26252a, 0.9)
      .setStrokeStyle(4, F4.brass, 0.84);
    const ember = this.scene.add.triangle(20, 8, -9, 13, 1, -17, 10, 13, F4.ember, 0.92);
    const bed = this.scene.add.rectangle(34, 19, 26, 34, 0x52433b, 0.92)
      .setStrokeStyle(2, F4.frost, 0.54);
    const nullLabel = this.scene.add.text(34, -4, "NULL", {
      color: "#7dd9cb",
      fontFamily: "monospace",
      fontSize: "7px",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const robe = this.scene.add.triangle(0, 8, -14, 19, 0, -22, 14, 19, 0x6f3e38, 0.94)
      .setStrokeStyle(2, F4.brass, 0.88);
    const registryLabel = this.scene.add.text(-28, -24, "登记台", {
      color: "#d8c58d",
      fontFamily: "monospace",
      fontSize: "6px",
    }).setOrigin(0.5);
    const emberLabel = this.scene.add.text(20, -18, "无温余烬", {
      color: "#ef9a69",
      fontFamily: "monospace",
      fontSize: "6px",
    }).setOrigin(0.5);
    const returnLabel = this.scene.add.text(39, 38, "← 返回升炉", {
      color: "#9be6f1",
      fontFamily: "monospace",
      fontSize: "6px",
    }).setOrigin(0.5);
    interior.add([
      room,
      waterWheel,
      ember,
      bed,
      nullLabel,
      robe,
      registryLabel,
      emberLabel,
      returnLabel,
    ]);
    this.floorFourEchoDoor = interior;
    this.root?.add(interior);
    const label = this.addLabel(point, "回燃残响 · 确定换装：回燃衣", "#efc96d", -50);
    this.createHiddenAreaEntrance(
      snapshot,
      backdrop,
      interior,
      label,
      "无温余烬",
      "回燃门",
      0x352b31,
      F4.brass,
    );
  }

  private syncFloorFour(world: FloorFourWorldState): void {
    this.floorFourSourceCore?.setAlpha(world.source === "identified" ? 0.94 : 0.18);
    this.floorFourFrostCells.forEach((cell, index) => {
      cell.setAlpha(world.frostArray === "selected" && index < 4 ? 0.92 : 0.28);
    });
    this.floorFourPipes.forEach((pipe) => {
      pipe.setAlpha(world.pipes === "correlated" ? 0.86 : 0.26);
    });
    this.floorFourDependencyRings.forEach((ring, index) => {
      const visibleCount = world.dependency === "traced" ? 3 : world.dependency === "named" ? 2 : 1;
      ring.setAlpha(index < visibleCount ? 0.9 : 0.16);
    });
    this.floorFourEchoDoor?.setAlpha(world.echoGate === "open" ? 1 : world.echoGate === "sealed" ? 0.44 : 0.08);
    this.floorFourAscentLight?.setFillStyle(
      world.ascent === "active" ? F4.brass : 0x5b4430,
      1,
    );
  }
}
