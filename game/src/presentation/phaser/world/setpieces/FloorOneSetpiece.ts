import Phaser from "phaser";
import { TILE_SIZE } from "../../../../content/curriculum/mvpLevel";
import type { GameSnapshot } from "../../../../contracts/game/snapshots";
import { floorWorldStateFromSnapshot } from "../../../../domain/progression/floorWorldState";
import {
  FLOOR_ART_FRAMES,
  FLOOR_ART_KEYS,
} from "../../floorArtAssets";
import { anchoredWaterBandGeometry } from "../../floorSetpieceGeometry";
import {
  FloorSetpieceModule,
  type FloorWorldState,
  type PixelPoint,
} from "../shared/FloorSetpieceModule";

interface FloorOneWaterBand {
  water: Phaser.GameObjects.Rectangle;
  glint: Phaser.GameObjects.Rectangle;
  baseCenterY: number;
  baseHeight: number;
}

const F1 = {
  water: 0x2b7183,
  waterLine: 0x78c9d3,
  brass: 0xb9894c,
  brassLight: 0xe5c17b,
  paper: 0xe5dbc2,
  ink: 0x28343a,
  ember: 0xe16b42,
  stone: 0x48575d,
} as const;

export class FloorOneSetpiece extends FloorSetpieceModule {
  private waterLayer: Phaser.GameObjects.Container | null = null;
  private floorOneWaterBands: FloorOneWaterBand[] = [];
  private wheel: Phaser.GameObjects.Container | null = null;
  private wheelTween: Phaser.Tweens.Tween | null = null;
  private wheelLabel: Phaser.GameObjects.Text | null = null;
  private wheelPoint: PixelPoint | null = null;
  private bedLabels: Phaser.GameObjects.Text[] = [];
  private dormitoryLabel: Phaser.GameObjects.Text | null = null;
  private dormitoryPoint: PixelPoint | null = null;
  private registryRule: Phaser.GameObjects.Text | null = null;
  private liftLight: Phaser.GameObjects.Rectangle | null = null;
  private floorOneLever: Phaser.GameObjects.Image | null = null;
  private floorOneLiftDoor: Phaser.GameObjects.Image | null = null;

  protected buildFloor(snapshot: GameSnapshot): void {
    this.buildFloorOne(snapshot);
  }

  protected syncFloor(world: FloorWorldState, snapshot: GameSnapshot): void {
    if (world.floor === 1) this.syncFloorOne(world, snapshot);
  }

  protected resetFloorState(): void {
    this.wheelTween?.destroy();
    this.wheelTween = null;
    this.waterLayer = null;
    this.floorOneWaterBands = [];
    this.wheel = null;
    this.wheelLabel = null;
    this.wheelPoint = null;
    this.bedLabels = [];
    this.dormitoryLabel = null;
    this.dormitoryPoint = null;
    this.registryRule = null;
    this.liftLight = null;
    this.floorOneLever = null;
    this.floorOneLiftDoor = null;
  }

  private buildFloorOne(snapshot: GameSnapshot): void {
    this.createFloorOneTerrainSkin(snapshot);
    this.createFloorOneWater(snapshot);
    this.createSpawnEmber(snapshot, "f1-spawn-ember");
    this.createWaterWheel(snapshot);
    this.createNamelessBeds(snapshot);
    this.createRegistry(snapshot);
    this.createFloorOneHiddenArea(snapshot);
    this.createUniqueScribe(snapshot, "npc-scribe-f1");
  }

  private createFloorOneHiddenArea(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f1-sealed-vault");
    if (!point) return;
    const backdrop = this.createHiddenRoomBackdrop(
      snapshot,
      "floor-1-treasure",
      0x261d17,
      F1.brass,
      false,
    );
    const interior = this.scene.add.container(point.x, point.y);
    const dryFloor = this.scene.add.rectangle(0, 10, 86, 66, 0x3b3023, 0.96)
      .setStrokeStyle(3, F1.brass, 0.72);
    const backCloth = this.scene.add.rectangle(0, -12, 74, 22, 0x5b4025, 0.78);
    const shelves = [-27, 0, 27].map((x) => (
      this.scene.add.rectangle(x, 8, 20, 48, 0x60452d, 0.94)
        .setStrokeStyle(2, 0x9b7042, 0.8)
    ));
    const pages = [-31, -19, -4, 8, 23, 33].map((x, index) => (
      this.scene.add.rectangle(x, index % 2 === 0 ? -10 : 1, 9, 13, F1.paper, 0.92)
        .setAngle(index % 2 === 0 ? -4 : 5)
    ));
    const restoreSeal = this.scene.add.ellipse(0, 28, 18, 18, F1.ember, 0.85)
      .setStrokeStyle(2, F1.brassLight, 0.92);
    interior.add([dryFloor, backCloth, ...shelves, ...pages, restoreSeal]);
    this.root?.add(interior);
    const interiorLabel = this.addLabel(point, "封存旧库 · 未焚旧页", "#f0c879", -47);
    this.createHiddenAreaEntrance(
      snapshot,
      backdrop,
      interior,
      interiorLabel,
      "纸屑砖缝",
      "旧库暗门",
      0x6b5134,
      0xe5c17b,
    );
  }

  private createFloorOneTerrainSkin(snapshot: GameSnapshot): void {
    if (
      !this.hasTexture(FLOOR_ART_KEYS.floorOne.floor) ||
      !this.hasTexture(FLOOR_ART_KEYS.floorOne.walls)
    ) return;
    const frames = FLOOR_ART_FRAMES.floorOne;
    const wetRooms = new Set([
      "floor-1-entry",
      "floor-1-tutorial",
      "floor-1-where",
      "floor-1-is-null",
    ]);
    snapshot.mazeFloor.zones.forEach((zone, index) => {
      const centerX = (zone.x + zone.width / 2) * TILE_SIZE;
      const centerY = (zone.y + zone.height / 2) * TILE_SIZE;
      const floorFrame = wetRooms.has(zone.roomNodeId)
        ? frames.wetStone
        : index % 3 === 0
          ? frames.crackedStone
          : frames.dryStone;
      const floor = this.scene.add.tileSprite(
        centerX,
        centerY,
        Math.max(TILE_SIZE, (zone.width - 1.1) * TILE_SIZE),
        Math.max(TILE_SIZE, (zone.height - 1.1) * TILE_SIZE),
        FLOOR_ART_KEYS.floorOne.floor,
        floorFrame,
      ).setTileScale(2).setAlpha(zone.type === "boss" ? 0.74 : 0.66);
      const wall = this.scene.add.tileSprite(
        centerX,
        (zone.y + 0.48) * TILE_SIZE,
        Math.max(TILE_SIZE, (zone.width - 0.6) * TILE_SIZE),
        TILE_SIZE,
        FLOOR_ART_KEYS.floorOne.walls,
        zone.type === "boss" ? frames.wallCorner : frames.wallRun,
      ).setTileScale(2).setAlpha(zone.type === "boss" ? 0.88 : 0.72);
      this.root?.add([floor, wall]);
    });
  }

  private createFloorOneWater(snapshot: GameSnapshot): void {
    this.waterLayer = this.scene.add.container(0, 0);
    snapshot.mazeFloor.zones
      .filter((zone) => [
        "floor-1-entry",
        "floor-1-tutorial",
        "floor-1-where",
        "floor-1-is-null",
      ].includes(zone.roomNodeId))
      .forEach((zone, zoneIndex) => {
        const waterHeight = TILE_SIZE * 0.74;
        const baseCenterY = (zone.y + zone.height - 0.78) * TILE_SIZE;
        const water = this.scene.add.rectangle(
          (zone.x + zone.width / 2) * TILE_SIZE,
          baseCenterY,
          Math.max(TILE_SIZE, (zone.width - 1) * TILE_SIZE),
          waterHeight,
          F1.water,
          0.52,
        ).setStrokeStyle(1, F1.waterLine, 0.58);
        const glint = this.scene.add.rectangle(
          (zone.x + 1.25) * TILE_SIZE,
          (zone.y + zone.height - 0.92) * TILE_SIZE,
          Math.max(18, (zone.width - 2.5) * TILE_SIZE),
          2,
          F1.waterLine,
          0.65,
        ).setOrigin(0, 0.5);
        this.waterLayer?.add([water, glint]);
        this.floorOneWaterBands.push({
          water,
          glint,
          baseCenterY,
          baseHeight: waterHeight,
        });
        if (!this.reducedMotion) {
          this.scene.tweens.add({
            targets: glint,
            x: glint.x + (zoneIndex % 2 === 0 ? 8 : -8),
            alpha: 0.26,
            duration: 1_800 + zoneIndex * 230,
            yoyo: true,
            repeat: -1,
            ease: "Sine.inOut",
          });
        }
      });
    this.root?.add(this.waterLayer);
  }

  private createSpawnEmber(snapshot: GameSnapshot, id: string): void {
    const point = this.anchorPoint(snapshot, id);
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    const ring = this.scene.add.ellipse(0, 7, 28, 15, 0x403a35, 0.95)
      .setStrokeStyle(2, 0x8c8174, 0.7);
    if (this.hasTexture(FLOOR_ART_KEYS.floorOne.floor)) {
      const ember = this.scene.add.image(
        0,
        -1,
        FLOOR_ART_KEYS.floorOne.floor,
        FLOOR_ART_FRAMES.floorOne.emberHigh,
      ).setScale(2);
      container.add([ring, ember]);
      this.root?.add(container);
      if (!this.reducedMotion) {
        this.scene.tweens.add({
          targets: ember,
          alpha: 0.68,
          scaleY: 1.72,
          duration: 620,
          yoyo: true,
          repeat: -1,
          ease: "Sine.inOut",
        });
      }
      return;
    }
    const flame = this.scene.add.triangle(0, -1, -5, 7, 1, -11, 6, 7, F1.ember, 0.82);
    const core = this.scene.add.triangle(1, 1, -3, 5, 1, -5, 4, 5, 0xf4c16d, 0.9);
    container.add([ring, flame, core]);
    this.root?.add(container);
    if (!this.reducedMotion) {
      this.scene.tweens.add({
        targets: [flame, core],
        scaleY: 0.76,
        alpha: 0.68,
        duration: 540,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }

  private createWaterWheel(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f1-water-wheel");
    if (!point) return;
    this.wheelPoint = point;
    this.wheel = this.scene.add.container(point.x, point.y);
    const rim = this.scene.add.ellipse(0, 0, 54, 54, 0x312a24, 0.6)
      .setStrokeStyle(5, F1.brass, 1);
    const hub = this.scene.add.ellipse(0, 0, 12, 12, F1.brassLight, 1)
      .setStrokeStyle(2, 0x6b4a28);
    const spokes: Phaser.GameObjects.Rectangle[] = [];
    for (let angle = 0; angle < 180; angle += 45) {
      spokes.push(
        this.scene.add.rectangle(0, 0, 48, 4, F1.brass, 0.95).setAngle(angle),
      );
    }
    this.wheel.add([rim, ...spokes, hub]);
    this.root?.add(this.wheel);
    if (this.hasTexture(FLOOR_ART_KEYS.floorOne.leverClosed)) {
      this.floorOneLever = this.addPixelImage(
        point.x - 43,
        point.y + 4,
        FLOOR_ART_KEYS.floorOne.leverClosed,
      ).setDepth(1);
    }
    this.wheelLabel = this.addLabel(point, "档案水轮 · 停转", "#e5c17b", -38);
  }

  private createNamelessBeds(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f1-nameless-beds");
    if (!point) return;
    this.dormitoryPoint = point;
    const container = this.scene.add.container(point.x, point.y);
    [-34, 0, 34].forEach((offset, index) => {
      const bed = this.scene.add.rectangle(offset, 9, 27, 42, 0x5d4a3d, 0.95)
        .setStrokeStyle(2, 0x98816c, 0.75);
      const pillow = this.scene.add.rectangle(offset, -5, 18, 9, F1.paper, 0.7);
      const plaque = this.scene.add.text(offset, -23, "???", {
        color: "#d8cab1",
        fontFamily: "monospace",
        fontSize: "7px",
        backgroundColor: "#11171acc",
        padding: { x: 3, y: 1 },
      }).setOrigin(0.5);
      this.bedLabels.push(plaque);
      container.add([bed, pillow, plaque]);
      if (index === 1) bed.setFillStyle(0x4b4037, 1);
    });
    this.root?.add(container);
    this.dormitoryLabel = this.addLabel(point, "无名宿舍 · 淹没", "#e5dbc2", -52);
  }

  private createRegistry(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f1-registry-arena");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    const platform = this.scene.add.rectangle(0, 13, 132, 54, 0x41352d, 0.56)
      .setStrokeStyle(3, F1.brass, 0.8);
    const archLeft = this.scene.add.rectangle(-52, -21, 13, 75, F1.stone, 0.96)
      .setStrokeStyle(2, F1.brass, 0.62);
    const archRight = this.scene.add.rectangle(52, -21, 13, 75, F1.stone, 0.96)
      .setStrokeStyle(2, F1.brass, 0.62);
    const lintel = this.scene.add.rectangle(0, -54, 117, 13, F1.stone, 0.96)
      .setStrokeStyle(2, F1.brass, 0.62);
    this.registryRule = this.scene.add.text(0, -22, "ROW REQUIRED", {
      color: "#e5c17b",
      fontFamily: "monospace",
      fontSize: "9px",
      fontStyle: "bold",
      backgroundColor: "#1a1110e8",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5);
    container.add([platform, archLeft, archRight, lintel, this.registryRule]);
    this.root?.add(container);

    const liftPoint = this.anchorPoint(snapshot, "f1-lift");
    if (liftPoint) {
      const lift = this.scene.add.container(liftPoint.x, liftPoint.y);
      const door = this.scene.add.rectangle(0, 0, 42, 64, 0x263137, 0.98)
        .setStrokeStyle(3, F1.brass, 0.85);
      [-12, 0, 12].forEach((x) => lift.add(
        this.scene.add.rectangle(x, 0, 3, 55, 0x75868a, 0.85),
      ));
      this.liftLight = this.scene.add.rectangle(0, -40, 25, 5, 0x5b4430, 1);
      lift.add([door, this.liftLight]);
      this.root?.add(lift);
      if (this.hasTexture(FLOOR_ART_KEYS.floorOne.doorClosed)) {
        this.floorOneLiftDoor = this.addPixelImage(
          liftPoint.x,
          liftPoint.y + 5,
          FLOOR_ART_KEYS.floorOne.doorClosed,
        ).setAlpha(0.95);
      }
      this.addLabel(liftPoint, "档案升降机", "#e5c17b", -48);
    }
  }

  private syncFloorOne(
    world: ReturnType<typeof floorWorldStateFromSnapshot> & { floor: 1 },
    snapshot: GameSnapshot,
  ): void {
    const waterScale = world.water === "high" ? 1.7 : world.water === "middle" ? 1.12 : 0.58;
    this.floorOneWaterBands.forEach((band) => {
      const geometry = anchoredWaterBandGeometry(
        band.baseCenterY,
        band.baseHeight,
        waterScale,
      );
      band.water.setScale(1, waterScale).setY(geometry.centerY);
      band.glint.setY(geometry.surfaceY);
    });
    this.waterLayer?.setAlpha(world.water === "low" ? 0.62 : 1);
    if (this.wheel) {
      if (world.wheel === "turning" && !this.reducedMotion && !this.wheelTween) {
        this.wheelTween = this.scene.tweens.add({
          targets: this.wheel,
          angle: 360,
          duration: 4_800,
          repeat: -1,
          ease: "Linear",
        });
      } else if (world.wheel === "stalled" && this.wheelTween) {
        this.wheelTween.destroy();
        this.wheelTween = null;
        this.wheel.setAngle(-12);
      }
    }
    this.wheelLabel?.setText(
      this.isPlayerNear(snapshot, this.wheelPoint)
        ? "E · 调查档案水轮"
        : world.wheel === "turning"
          ? "档案水轮 · 运转"
          : "档案水轮 · 停转",
    );
    this.bedLabels.forEach((label) => {
      label.setText(world.beds === "revealed" ? "NULL" : "???");
      label.setColor(world.beds === "revealed" ? "#89e0ce" : "#d8cab1");
      label.setAlpha(world.beds === "hidden" ? 0.22 : 1);
    });
    this.dormitoryLabel?.setText(
      this.isPlayerNear(snapshot, this.dormitoryPoint)
        ? "E · 读取无名床牌"
        : world.beds === "revealed"
          ? "无名宿舍 · NULL"
          : world.beds === "visible"
            ? "无名宿舍 · ???"
            : "无名宿舍 · 淹没",
    );
    this.registryRule?.setText(
      world.registry === "amended"
        ? "RESTORE TRACE ACCEPTED"
        : world.registry === "awake"
          ? "ROW REQUIRED · AUDIT ACTIVE"
          : "ROW REQUIRED",
    );
    this.registryRule?.setColor(world.registry === "amended" ? "#89e0ce" : "#e5c17b");
    this.liftLight?.setFillStyle(world.lift === "active" ? 0x89e0ce : 0x5b4430, 1);
    this.floorOneLever?.setTexture(
      world.wheel === "turning"
        ? FLOOR_ART_KEYS.floorOne.leverOpen
        : FLOOR_ART_KEYS.floorOne.leverClosed,
    );
    this.floorOneLiftDoor?.setTexture(
      world.lift === "active"
        ? FLOOR_ART_KEYS.floorOne.doorOpen
        : FLOOR_ART_KEYS.floorOne.doorClosed,
    );
  }
}
