import Phaser from "phaser";
import {
  floorExperience,
  hasFloorExperience,
} from "../content/floorExperience";
import { TILE_SIZE } from "../content/mvpLevel";
import {
  floorWorldStateFromSnapshot,
  type FloorEightWorldState,
  type FloorFiveWorldState,
  type FloorFourWorldState,
  type FloorSevenWorldState,
  type FloorSixWorldState,
  type FloorThreeWorldState,
} from "../domain/floorWorldState";
import type { GameSnapshot } from "../domain/types";
import { createScribeActor } from "./PixelActorFactory";
import {
  FLOOR_ART_FRAMES,
  FLOOR_ART_KEYS,
} from "./floorArtAssets";
import {
  anchoredWaterBandGeometry,
  FLOOR_TWO_MARSH_ROOM_IDS,
  FLOOR_TWO_SAND_ROOM_IDS,
} from "./floorSetpieceGeometry";
import {
  WORLD_VISUAL_LANGUAGE,
  landmarkInteractionLabel,
} from "./worldVisualLanguage";
import type { FloorLandmarkKind } from "../content/floorExperience";

interface PixelPoint {
  x: number;
  y: number;
}

interface ScribeView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  roomNodeId: string;
  point: PixelPoint;
}

interface FloorOneWaterBand {
  water: Phaser.GameObjects.Rectangle;
  glint: Phaser.GameObjects.Rectangle;
  baseCenterY: number;
  baseHeight: number;
}

interface HiddenAreaView {
  gateId: string;
  gatePoint: PixelPoint;
  sealed: Phaser.GameObjects.Container;
  opened: Phaser.GameObjects.Container;
  entranceLabel: Phaser.GameObjects.Text;
  roomNodeId: string;
  backdrop: Phaser.GameObjects.Container | null;
  interior: Phaser.GameObjects.Container;
  interiorLabel: Phaser.GameObjects.Text;
  sealedLabel: string;
  openedLabel: string;
}

interface SqlSealView {
  container: Phaser.GameObjects.Container;
  core: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  point: PixelPoint;
  gateId: string;
}

interface LateSetpieceView {
  container: Phaser.GameObjects.Container;
  stateDot: Phaser.GameObjects.Ellipse;
  stateText: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  interactionRing: Phaser.GameObjects.Ellipse;
  interactionKey: Phaser.GameObjects.Text;
  point: PixelPoint;
  title: string;
  kind: FloorLandmarkKind;
  interaction: string | null;
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

const F2 = {
  water: 0x236d91,
  waterDeep: 0x123e62,
  foam: 0xa8e2e8,
  sand: 0xc6ae72,
  wood: 0x795f43,
  green: 0x557b54,
  light: 0xf2d478,
  stone: 0xb7b6aa,
} as const;

const F3 = {
  frost: 0xa9d7df,
  ice: 0x5b8e9b,
  bone: 0xd9d1b8,
  soil: 0x292932,
  peat: 0x3a3035,
  ghost: 0x74d4c6,
  bronze: 0xa27a4e,
} as const;

const F4 = {
  ember: 0xdf6544,
  brass: 0xd6ab55,
  frost: 0x7ecbe0,
  storm: 0xa47ad4,
  stone: 0x282833,
  iron: 0x4a4448,
} as const;

const LATE_FLOOR_PALETTES = {
  5: { dark: 0x24272e, mid: 0x54525a, light: 0xd7b565, accent: 0x9f3f3f },
  6: { dark: 0x22272c, mid: 0x465f69, light: 0x8ed9d0, accent: 0xd46b42 },
  7: { dark: 0x29253a, mid: 0x59607a, light: 0xe2c56f, accent: 0x78cfd0 },
  8: { dark: 0x171820, mid: 0x4c3c54, light: 0xe4c878, accent: 0xb35a63 },
} as const;

function discoveredRoom(snapshot: GameSnapshot, roomNodeId: string): boolean {
  return snapshot.adminMode || snapshot.visitedRoomIds.includes(roomNodeId);
}

export class FloorSetpieceLayer {
  private root: Phaser.GameObjects.Container | null = null;
  private scribe: ScribeView | null = null;
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
  private beaconLights: Phaser.GameObjects.Ellipse[] = [];
  private beaconReflections: Phaser.GameObjects.Rectangle[] = [];
  private drownedVillage: Phaser.GameObjects.Container | null = null;
  private drownedVillageBaseY = 0;
  private rootBridge: Phaser.GameObjects.Container | null = null;
  private shipLockBars: Phaser.GameObjects.Container | null = null;
  private lighthouseOverwriteBeam: Phaser.GameObjects.Triangle | null = null;
  private lighthousePreserveBeams: Phaser.GameObjects.Triangle[] = [];
  private northFerry: Phaser.GameObjects.Container | null = null;
  private hiddenArea: HiddenAreaView | null = null;
  private floorThreeBoneBridge: Phaser.GameObjects.Container | null = null;
  private floorThreeSteleLabels: Phaser.GameObjects.Text[] = [];
  private floorThreeRelicChain: Phaser.GameObjects.Container | null = null;
  private floorThreeWitnesses: Phaser.GameObjects.Ellipse[] = [];
  private floorThreeShaftLight: Phaser.GameObjects.Ellipse | null = null;
  private floorFourSourceCore: Phaser.GameObjects.Ellipse | null = null;
  private floorFourFrostCells: Phaser.GameObjects.Rectangle[] = [];
  private floorFourPipes: Phaser.GameObjects.Rectangle[] = [];
  private floorFourDependencyRings: Phaser.GameObjects.Ellipse[] = [];
  private floorFourEchoDoor: Phaser.GameObjects.Container | null = null;
  private floorFourAscentLight: Phaser.GameObjects.Rectangle | null = null;
  private sqlSeal: SqlSealView | null = null;
  private lateSetpieces = new Map<string, LateSetpieceView>();
  private proximityLabels: Array<{
    label: Phaser.GameObjects.Text;
    point: PixelPoint;
    radius: number;
  }> = [];
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    private readonly reducedMotion: boolean,
  ) {}

  build(snapshot: GameSnapshot): void {
    this.destroy();
    if (!hasFloorExperience(snapshot.floor)) return;
    this.root = this.scene.add.container(0, 0).setDepth(12);
    this.parent.addAt(this.root, 0);
    if (snapshot.floor === 1) this.buildFloorOne(snapshot);
    else if (snapshot.floor === 2) this.buildFloorTwo(snapshot);
    else if (snapshot.floor === 3) this.buildFloorThree(snapshot);
    else if (snapshot.floor === 4) this.buildFloorFour(snapshot);
    else this.buildLateFloor(snapshot);
    this.createSqlSeal(snapshot);
    this.sync(snapshot);
  }

  sync(snapshot: GameSnapshot): void {
    if (!this.root || !hasFloorExperience(snapshot.floor)) return;
    const world = floorWorldStateFromSnapshot(snapshot);
    if (!world) return;

    this.syncProximityLabels(snapshot);
    if (this.scribe) {
      const visible = discoveredRoom(snapshot, this.scribe.roomNodeId);
      this.scribe.container.setVisible(visible);
      this.scribe.label.setVisible(visible);
      this.scribe.label.setText(
        this.isPlayerNear(snapshot, this.scribe.point)
          ? "E · 与抄写员交谈"
          : "抄写员",
      );
    }
    this.syncHiddenArea(snapshot);

    if (world.floor === 1) this.syncFloorOne(world, snapshot);
    else if (world.floor === 2) this.syncFloorTwo(world);
    else if (world.floor === 3) this.syncFloorThree(world);
    else if (world.floor === 4) this.syncFloorFour(world);
    else {
      this.syncLateFloor(world);
      this.syncLateSetpieceLabels(snapshot);
    }
    this.syncSqlSeal(snapshot, world.cipher);
  }

  destroy(): void {
    this.wheelTween?.destroy();
    this.wheelTween = null;
    this.timers.forEach((timer) => timer.remove(false));
    this.timers = [];
    if (this.root?.active) this.root.destroy(true);
    this.root = null;
    this.scribe = null;
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
    this.beaconLights = [];
    this.beaconReflections = [];
    this.drownedVillage = null;
    this.drownedVillageBaseY = 0;
    this.rootBridge = null;
    this.shipLockBars = null;
    this.lighthouseOverwriteBeam = null;
    this.lighthousePreserveBeams = [];
    this.northFerry = null;
    this.hiddenArea = null;
    this.floorThreeBoneBridge = null;
    this.floorThreeSteleLabels = [];
    this.floorThreeRelicChain = null;
    this.floorThreeWitnesses = [];
    this.floorThreeShaftLight = null;
    this.floorFourSourceCore = null;
    this.floorFourFrostCells = [];
    this.floorFourPipes = [];
    this.floorFourDependencyRings = [];
    this.floorFourEchoDoor = null;
    this.floorFourAscentLight = null;
    this.sqlSeal = null;
    this.lateSetpieces.clear();
    this.proximityLabels = [];
  }

  private anchorPoint(snapshot: GameSnapshot, landmarkId: string): PixelPoint | null {
    if (!hasFloorExperience(snapshot.floor)) return null;
    const landmark = floorExperience(snapshot.floor).landmarks.find(
      (entry) => entry.id === landmarkId,
    );
    if (!landmark) return null;
    const zone = snapshot.mazeFloor.zones.find(
      (entry) => entry.roomNodeId === landmark.anchor.roomNodeId,
    );
    if (!zone) return null;
    return {
      x: (zone.x + landmark.anchor.position.x * zone.width) * TILE_SIZE,
      y: (zone.y + landmark.anchor.position.y * zone.height) * TILE_SIZE,
    };
  }

  private hasTexture(key: string): boolean {
    return this.scene.textures.exists(key);
  }

  private addPixelImage(
    x: number,
    y: number,
    key: string,
    frame?: string | number,
    scale = 2,
  ): Phaser.GameObjects.Image {
    const image = this.scene.add.image(x, y, key, frame).setScale(scale);
    this.root?.add(image);
    return image;
  }

  private addLabel(
    point: PixelPoint,
    text: string,
    color = "#efe0bd",
    offsetY = -34,
  ): Phaser.GameObjects.Text {
    const label = this.scene.add.text(point.x, point.y + offsetY, text, {
      color,
      fontFamily: "monospace",
      fontSize: "8px",
      fontStyle: "bold",
      backgroundColor: "#080b0ddd",
      padding: { x: 4, y: 2 },
      align: "center",
    }).setOrigin(0.5).setVisible(false);
    this.root?.add(label);
    this.proximityLabels.push({ label, point, radius: 3 });
    return label;
  }

  private syncProximityLabels(snapshot: GameSnapshot): void {
    this.proximityLabels.forEach(({ label, point, radius }) => {
      label.setVisible(this.isPlayerNear(snapshot, point, radius));
    });
  }

  private isPlayerNear(
    snapshot: GameSnapshot,
    point: PixelPoint | null,
    maxTiles = 3,
  ): boolean {
    if (!point) return false;
    const playerX = (snapshot.player.x + 0.5) * TILE_SIZE;
    const playerY = (snapshot.player.y + 0.5) * TILE_SIZE;
    return (
      Math.abs(playerX - point.x) + Math.abs(playerY - point.y)
    ) <= maxTiles * TILE_SIZE;
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

  private createUniqueScribe(snapshot: GameSnapshot, npcId: string): void {
    if (!hasFloorExperience(snapshot.floor)) return;
    const npc = floorExperience(snapshot.floor).npcPlacements.find(
      (entry) => entry.id === npcId,
    );
    if (!npc) return;
    const zone = snapshot.mazeFloor.zones.find(
      (entry) => entry.roomNodeId === npc.anchor.roomNodeId,
    );
    if (!zone) return;
    const point = {
      x: (zone.x + npc.anchor.position.x * zone.width) * TILE_SIZE,
      y: (zone.y + npc.anchor.position.y * zone.height) * TILE_SIZE,
    };
    const actor = createScribeActor(this.scene, {
      x: point.x,
      y: point.y,
      scale: 0.9,
      depth: 24,
    }).container;
    const label = this.scene.add.text(point.x, point.y - 35, npc.name, {
      color: "#f4dfbd",
      fontFamily: "monospace",
      fontSize: "8px",
      fontStyle: "bold",
      backgroundColor: "#080b0dee",
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5);
    this.root?.add([actor, label]);
    this.scribe = {
      container: actor,
      label,
      roomNodeId: npc.anchor.roomNodeId,
      point,
    };
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

  private buildFloorTwo(snapshot: GameSnapshot): void {
    this.createFloorTwoWater(snapshot);
    this.createFloorTwoIslandSkin(snapshot);
    this.createNavigationLight(snapshot);
    this.createBeacons(snapshot);
    this.createDrownedVillage(snapshot);
    this.createRootBridge(snapshot);
    this.createShipLock(snapshot);
    this.createLighthouse(snapshot);
    this.createFloorTwoHiddenArea(snapshot);
    this.createUniqueScribe(snapshot, "npc-scribe-f2");
  }

  private createFloorTwoHiddenArea(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f2-wreck-ledger");
    if (!point) return;
    const backdrop = this.createHiddenRoomBackdrop(
      snapshot,
      "floor-2-treasure",
      0x0d2433,
      F2.foam,
      true,
    );
    const interior = this.scene.add.container(point.x, point.y);
    const hull = this.scene.add.ellipse(0, 11, 102, 66, 0x3d3026, 0.96)
      .setStrokeStyle(4, F2.wood, 0.94);
    const deck = this.scene.add.rectangle(0, 22, 84, 6, 0x8c6d47, 0.92);
    const ribs = [-34, -17, 0, 17, 34].map((x) => (
      this.scene.add.rectangle(x, 8, 4, 48, 0x9d7b4f, 0.74)
    ));
    const porthole = this.scene.add.ellipse(0, -12, 28, 28, F2.waterDeep, 1)
      .setStrokeStyle(4, F2.foam, 0.9);
    const moon = this.scene.add.ellipse(4, -15, 9, 9, 0xe9e3bd, 0.94);
    const boxes = [-31, -21, -10, 0, 10, 21, 31].map((x, index) => (
      this.scene.add.rectangle(x, 12 + index % 2 * 4, 10, 13, 0x486b69, 0.96)
        .setStrokeStyle(1, F2.foam, 0.76)
    ));
    interior.add([hull, deck, ...ribs, porthole, moon, ...boxes]);
    this.root?.add(interior);
    const interiorLabel = this.addLabel(point, "沉船记录舱 · 七只防水匣", "#b9eced", -51);
    this.createHiddenAreaEntrance(
      snapshot,
      backdrop,
      interior,
      interiorLabel,
      "破损船腹",
      "记录舱裂口",
      0x344d58,
      0xa8e2e8,
    );
  }

  private createHiddenRoomBackdrop(
    snapshot: GameSnapshot,
    roomNodeId: string,
    fillColor: number,
    lineColor: number,
    horizontalPlanks: boolean,
  ): Phaser.GameObjects.Container | null {
    const zone = snapshot.mazeFloor.zones.find((entry) => entry.roomNodeId === roomNodeId);
    if (!zone) return null;
    const centerX = (zone.x + zone.width / 2) * TILE_SIZE;
    const centerY = (zone.y + zone.height / 2) * TILE_SIZE;
    const width = Math.max(84, (zone.width - 1.05) * TILE_SIZE);
    const height = Math.max(76, (zone.height - 1.05) * TILE_SIZE);
    const backdrop = this.scene.add.rectangle(centerX, centerY, width, height, fillColor, 0.97)
      .setStrokeStyle(3, lineColor, 0.68);
    const inset = this.scene.add.rectangle(
      centerX,
      centerY,
      Math.max(64, width - 18),
      Math.max(56, height - 18),
      fillColor,
      0.12,
    ).setStrokeStyle(1, lineColor, 0.24);
    const grain: Phaser.GameObjects.Rectangle[] = [];
    const axisLength = horizontalPlanks ? height : width;
    for (let offset = -axisLength / 2 + 22; offset < axisLength / 2 - 12; offset += 28) {
      grain.push(horizontalPlanks
        ? this.scene.add.rectangle(centerX, centerY + offset, width - 20, 2, lineColor, 0.12)
        : this.scene.add.rectangle(centerX + offset, centerY, 2, height - 20, lineColor, 0.12));
    }
    const container = this.scene.add.container(0, 0);
    container.add([backdrop, inset, ...grain]);
    this.root?.add(container);
    return container;
  }

  private createHiddenAreaEntrance(
    snapshot: GameSnapshot,
    backdrop: Phaser.GameObjects.Container | null,
    interior: Phaser.GameObjects.Container,
    interiorLabel: Phaser.GameObjects.Text,
    sealedLabel: string,
    openedLabel: string,
    darkColor: number,
    lightColor: number,
  ): void {
    if (!hasFloorExperience(snapshot.floor)) return;
    const area = floorExperience(snapshot.floor).hiddenAreas[0];
    if (!area) return;
    const gate = snapshot.mazeFloor.gates.find((entry) => entry.id === area.gateId);
    if (!gate) return;
    const gatePoint = {
      x: (gate.x + 0.5) * TILE_SIZE,
      y: (gate.y + 0.5) * TILE_SIZE,
    };
    const sealed = this.scene.add.container(gatePoint.x, gatePoint.y);
    const sealedStone = this.scene.add.rectangle(0, 0, 22, 22, darkColor, 0.96)
      .setStrokeStyle(2, lightColor, 0.38);
    const seam = this.scene.add.line(0, 0, -7, -9, 2, 9, lightColor, 0.76)
      .setLineWidth(2);
    const trace = this.scene.add.rectangle(7, 6, 5, 2, lightColor, 0.88);
    sealed.add([sealedStone, seam, trace]);
    const opened = this.scene.add.container(gatePoint.x, gatePoint.y);
    const aperture = this.scene.add.rectangle(0, 0, 22, 22, 0x080b0d, 0.98)
      .setStrokeStyle(3, lightColor, 0.92);
    const threshold = this.scene.add.rectangle(0, 9, 18, 3, lightColor, 0.72);
    opened.add([aperture, threshold]);
    this.root?.add([sealed, opened]);
    const entranceLabel = this.addLabel(gatePoint, sealedLabel, `#${lightColor.toString(16).padStart(6, "0")}`, -27);
    this.hiddenArea = {
      gateId: area.gateId,
      gatePoint,
      sealed,
      opened,
      entranceLabel,
      roomNodeId: area.roomNodeId,
      backdrop,
      interior,
      interiorLabel,
      sealedLabel,
      openedLabel,
    };
  }

  private syncHiddenArea(snapshot: GameSnapshot): void {
    const view = this.hiddenArea;
    if (!view) return;
    const opened = snapshot.openedGateIds.includes(view.gateId);
    const interiorVisible = discoveredRoom(snapshot, view.roomNodeId);
    view.sealed.setVisible(!opened);
    view.opened.setVisible(opened);
    view.backdrop?.setVisible(interiorVisible);
    view.interior.setVisible(interiorVisible);
    view.interiorLabel.setVisible(interiorVisible);
    view.entranceLabel.setVisible(this.isPlayerNear(snapshot, view.gatePoint, 2));
    view.entranceLabel.setText(opened ? view.openedLabel : view.sealedLabel);
  }

  private createNavigationLight(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f2-spawn-light");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    const base = this.scene.add.rectangle(0, 8, 24, 12, 0x5b604f, 0.94)
      .setStrokeStyle(1, F2.sand, 0.72);
    const post = this.scene.add.rectangle(0, -3, 5, 28, F2.wood, 0.96);
    const lamp = this.scene.add.ellipse(0, -18, 14, 14, F2.light, 0.96)
      .setStrokeStyle(2, F2.foam, 0.78);
    container.add([base, post, lamp]);
    this.root?.add(container);
    if (this.hasTexture(FLOOR_ART_KEYS.floorTwo.waterAndIslands)) {
      this.addPixelImage(
        point.x + 54,
        point.y + 30,
        FLOOR_ART_KEYS.floorTwo.waterAndIslands,
        FLOOR_ART_FRAMES.floorTwo.boatLeft,
      ).setAlpha(0.94);
    }
    if (!this.reducedMotion) {
      this.scene.tweens.add({
        targets: lamp,
        alpha: 0.62,
        scale: 0.86,
        duration: 1_350,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }

  private createFloorTwoWater(snapshot: GameSnapshot): void {
    this.waterLayer = this.scene.add.container(0, 0);
    const usesWaterArt = this.hasTexture(FLOOR_ART_KEYS.floorTwo.waterAndIslands);
    snapshot.mazeFloor.zones.forEach((zone, index) => {
      if (["boss", "rest"].includes(zone.type)) return;
      if (usesWaterArt) {
        const frames = FLOOR_ART_FRAMES.floorTwo;
        const water = this.scene.add.tileSprite(
          (zone.x + zone.width / 2) * TILE_SIZE,
          (zone.y + zone.height / 2) * TILE_SIZE,
          Math.max(46, (zone.width - 0.18) * TILE_SIZE),
          Math.max(34, (zone.height - 0.18) * TILE_SIZE),
          FLOOR_ART_KEYS.floorTwo.waterAndIslands,
          index % 2 === 0 ? frames.deepWater : frames.deepWaterAlt,
        ).setTileScale(2).setAlpha(index % 3 === 0 ? 0.72 : 0.58);
        this.waterLayer?.add(water);
        if (!this.reducedMotion) {
          this.scene.tweens.add({
            targets: water,
            tilePositionX: index % 2 === 0 ? 16 : -16,
            duration: 3_600 + index * 190,
            yoyo: true,
            repeat: -1,
            ease: "Sine.inOut",
          });
        }
        return;
      }
      const water = this.scene.add.ellipse(
        (zone.x + zone.width / 2) * TILE_SIZE,
        (zone.y + zone.height / 2) * TILE_SIZE,
        Math.max(46, (zone.width - 0.4) * TILE_SIZE),
        Math.max(34, (zone.height - 0.7) * TILE_SIZE),
        index % 2 === 0 ? F2.water : F2.waterDeep,
        0.16,
      ).setStrokeStyle(2, F2.foam, 0.16);
      this.waterLayer?.add(water);
      if (!this.reducedMotion) {
        this.scene.tweens.add({
          targets: water,
          scaleX: 1.025,
          scaleY: 0.975,
          alpha: 0.11,
          duration: 2_300 + index * 170,
          yoyo: true,
          repeat: -1,
          ease: "Sine.inOut",
        });
      }
    });
    this.root?.add(this.waterLayer);
  }

  private createFloorTwoIslandSkin(snapshot: GameSnapshot): void {
    if (!this.hasTexture(FLOOR_ART_KEYS.floorTwo.overworld)) return;
    const frames = FLOOR_ART_FRAMES.floorTwo;
    const marshRooms = new Set<string>(FLOOR_TWO_MARSH_ROOM_IDS);
    const sandRooms = new Set<string>(FLOOR_TWO_SAND_ROOM_IDS);
    snapshot.mazeFloor.zones.forEach((zone, index) => {
      const floorFrame = marshRooms.has(zone.roomNodeId)
        ? index % 2 === 0
          ? frames.grass
          : frames.grassDetail
        : sandRooms.has(zone.roomNodeId)
          ? index % 2 === 0
            ? frames.sand
            : frames.sandDetail
          : zone.type === "boss"
            ? frames.cliff
            : index % 2 === 0
              ? frames.grassDetail
              : frames.sandDetail;
      const island = this.scene.add.tileSprite(
        (zone.x + zone.width / 2) * TILE_SIZE,
        (zone.y + zone.height / 2) * TILE_SIZE,
        Math.max(TILE_SIZE, (zone.width - 1.2) * TILE_SIZE),
        Math.max(TILE_SIZE, (zone.height - 1.2) * TILE_SIZE),
        FLOOR_ART_KEYS.floorTwo.overworld,
        floorFrame,
      ).setTileScale(2).setAlpha(zone.type === "boss" ? 0.9 : 0.84);
      this.root?.add(island);
    });
  }

  private createBeacons(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f2-ranked-beacons");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    for (let index = 0; index < 7; index += 1) {
      const angle = (-150 + index * 50) * Math.PI / 180;
      const x = Math.cos(angle) * (42 + (index % 2) * 9);
      const y = Math.sin(angle) * 24;
      const post = this.scene.add.rectangle(x, y + 8, 3, 17, F2.wood, 0.95);
      const light = this.scene.add.ellipse(x, y - 2, 9, 9, F2.light, 1)
        .setStrokeStyle(1, F2.foam, 0.8);
      const reflection = this.scene.add.rectangle(x, y + 23, 3, 24, F2.light, 0.34);
      this.beaconLights.push(light);
      this.beaconReflections.push(reflection);
      container.add([post, light, reflection]);
    }
    this.root?.add(container);
    this.addLabel(point, "七盏月潮浮标", "#f2d478", -42);
  }

  private createDrownedVillage(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f2-drowned-village");
    if (!point) return;
    this.drownedVillage = this.scene.add.container(point.x, point.y);
    this.drownedVillageBaseY = point.y;
    [-48, -16, 18, 49].forEach((x, index) => {
      if (this.hasTexture(FLOOR_ART_KEYS.floorTwo.overworld)) {
        const house = this.scene.add.image(
          x,
          index % 2 === 0 ? 6 : 11,
          FLOOR_ART_KEYS.floorTwo.overworld,
          index % 2 === 0
            ? FLOOR_ART_FRAMES.floorTwo.hut
            : FLOOR_ART_FRAMES.floorTwo.hutAlt,
        ).setScale(2).setOrigin(0.5, 1);
        this.drownedVillage?.add(house);
        return;
      }
      const house = this.scene.add.rectangle(x, 11 + index % 2 * 5, 27, 28, 0x6f6759, 0.88)
        .setStrokeStyle(1, 0xb9ad91, 0.72);
      const roof = this.scene.add.triangle(
        x,
        -8 + index % 2 * 5,
        -18,
        11,
        0,
        -13,
        18,
        11,
        index % 2 === 0 ? 0x4f6570 : 0x56604e,
        0.95,
      );
      const door = this.scene.add.rectangle(x, 18 + index % 2 * 5, 7, 13, 0x292d2e, 0.9);
      this.drownedVillage?.add([house, roof, door]);
    });
    this.root?.add(this.drownedVillage);
    this.addLabel(point, "沉水村落", "#b8e6e9", -47);
  }

  private createRootBridge(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f2-root-bridge");
    if (!point) return;
    this.rootBridge = this.scene.add.container(point.x, point.y);
    for (let index = -3; index <= 3; index += 1) {
      if (this.hasTexture(FLOOR_ART_KEYS.floorTwo.waterAndIslands)) {
        const segment = this.scene.add.image(
          index * 17,
          index % 2 === 0 ? -2 : 2,
          FLOOR_ART_KEYS.floorTwo.waterAndIslands,
          index % 2 === 0
            ? FLOOR_ART_FRAMES.floorTwo.bridgeLog
            : FLOOR_ART_FRAMES.floorTwo.bridgeLogAlt,
        ).setScale(2);
        this.rootBridge.add(segment);
        continue;
      }
      const segment = this.scene.add.rectangle(
        index * 17,
        Math.sin(index * 1.3) * 5,
        23,
        8,
        index % 2 === 0 ? 0x806843 : 0x5f5438,
        0.95,
      ).setAngle(index * 7).setStrokeStyle(1, 0x9e8a57, 0.62);
      this.rootBridge.add(segment);
    }
    if (this.hasTexture(FLOOR_ART_KEYS.floorTwo.waterAndIslands)) {
      [
        { x: -71, frame: FLOOR_ART_FRAMES.floorTwo.reedLeft },
        { x: 71, frame: FLOOR_ART_FRAMES.floorTwo.reedRight },
      ].forEach(({ x, frame }) => {
        this.rootBridge?.add(
          this.scene.add.image(
            x,
            4,
            FLOOR_ART_KEYS.floorTwo.waterAndIslands,
            frame,
          ).setScale(2),
        );
      });
    }
    this.root?.add(this.rootBridge);
    this.addLabel(point, "古树根桥", "#b9d78e", -32);
  }

  private createShipLock(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f2-ship-lock");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    const channel = this.hasTexture(FLOOR_ART_KEYS.floorTwo.waterAndIslands)
      ? this.scene.add.tileSprite(
        0,
        4,
        78,
        34,
        FLOOR_ART_KEYS.floorTwo.waterAndIslands,
        FLOOR_ART_FRAMES.floorTwo.deepWaterAlt,
      ).setTileScale(2).setAlpha(0.9)
      : this.scene.add.rectangle(0, 4, 78, 34, F2.waterDeep, 0.82)
        .setStrokeStyle(2, F2.foam, 0.5);
    this.shipLockBars = this.scene.add.container(0, 0);
    [-26, -13, 0, 13, 26].forEach((x) => this.shipLockBars?.add(
      this.scene.add.rectangle(x, 0, 5, 44, 0x9aa4a5, 0.95)
        .setStrokeStyle(1, 0xd2d7d2, 0.58),
    ));
    container.add([channel, this.shipLockBars]);
    this.root?.add(container);
    this.addLabel(point, "中央船闸", "#b8e6e9", -36);
  }

  private createLighthouse(snapshot: GameSnapshot): void {
    const point = this.anchorPoint(snapshot, "f2-lighthouse-arena");
    if (!point) return;
    const container = this.scene.add.container(point.x, point.y);
    const base = this.scene.add.polygon(
      0,
      22,
      [-28, 34, -20, -35, 20, -35, 28, 34],
      0x9d9b91,
      0.96,
    )
      .setStrokeStyle(2, 0xd8d1b7, 0.75);
    const tower = this.scene.add.rectangle(0, -17, 37, 74, F2.stone, 0.96)
      .setStrokeStyle(2, 0xf1e2b5, 0.7);
    const room = this.scene.add.rectangle(0, -61, 55, 23, 0x394d53, 0.98)
      .setStrokeStyle(2, F2.light, 0.85);
    const lamp = this.scene.add.ellipse(0, -62, 15, 15, F2.light, 0.96);
    this.lighthouseOverwriteBeam = this.scene.add.triangle(
      75,
      -61,
      -63,
      -10,
      95,
      0,
      -63,
      10,
      F2.light,
      0.18,
    );
    for (let index = 0; index < 7; index += 1) {
      const direction = -105 + index * 35;
      const beam = this.scene.add.triangle(
        0,
        -62,
        -5,
        -4,
        80,
        0,
        -5,
        4,
        F2.light,
        0.12,
      ).setAngle(direction);
      this.lighthousePreserveBeams.push(beam);
    }
    container.add([
      ...this.lighthousePreserveBeams,
      this.lighthouseOverwriteBeam,
      base,
      tower,
      room,
      lamp,
    ]);
    if (this.hasTexture(FLOOR_ART_KEYS.floorTwo.overworld)) {
      container.add([
        this.scene.add.image(
          -44,
          29,
          FLOOR_ART_KEYS.floorTwo.overworld,
          FLOOR_ART_FRAMES.floorTwo.cliff,
        ).setScale(2),
        this.scene.add.image(
          43,
          28,
          FLOOR_ART_KEYS.floorTwo.overworld,
          FLOOR_ART_FRAMES.floorTwo.treeAlt,
        ).setScale(2).setOrigin(0.5, 1),
      ]);
    }
    this.root?.add(container);
    this.addLabel(point, "月潮灯塔", "#f2d478", -92);

    const ferryPoint = this.anchorPoint(snapshot, "f2-north-ferry");
    if (ferryPoint) {
      this.northFerry = this.scene.add.container(ferryPoint.x, ferryPoint.y);
      if (this.hasTexture(FLOOR_ART_KEYS.floorTwo.waterAndIslands)) {
        this.northFerry.add(
          this.scene.add.image(
            0,
            5,
            FLOOR_ART_KEYS.floorTwo.waterAndIslands,
            FLOOR_ART_FRAMES.floorTwo.boatRight,
          ).setScale(3),
        );
        this.root?.add(this.northFerry);
        this.addLabel(ferryPoint, "北岸渡船", "#f2d478", -42);
        return;
      }
      const hull = this.scene.add.polygon(0, 7, [-31, -8, 31, -8, 23, 11, -22, 11], F2.wood, 0.98)
        .setStrokeStyle(2, F2.light, 0.72);
      const mast = this.scene.add.rectangle(-3, -13, 3, 37, 0xd8ceb1, 0.9);
      const sail = this.scene.add.triangle(11, -17, -12, 13, -12, -12, 15, 13, 0xb9dfda, 0.88);
      this.northFerry.add([hull, mast, sail]);
      this.root?.add(this.northFerry);
      this.addLabel(ferryPoint, "北岸渡船", "#f2d478", -42);
    }
  }

  private createZoneSkin(
    snapshot: GameSnapshot,
    colors: readonly [number, number, number],
  ): void {
    snapshot.mazeFloor.zones.forEach((zone, index) => {
      const centerX = (zone.x + zone.width / 2) * TILE_SIZE;
      const centerY = (zone.y + zone.height / 2) * TILE_SIZE;
      const colorIndex = Math.min(2, Math.floor(index * 3 / snapshot.mazeFloor.zones.length));
      const plate = this.scene.add.rectangle(
        centerX,
        centerY,
        Math.max(TILE_SIZE, (zone.width - 1.1) * TILE_SIZE),
        Math.max(TILE_SIZE, (zone.height - 1.1) * TILE_SIZE),
        colors[colorIndex],
        zone.type === "boss"
          ? WORLD_VISUAL_LANGUAGE.bossZoneWashAlpha
          : WORLD_VISUAL_LANGUAGE.zoneWashAlpha,
      );
      this.root?.add(plate);
    });
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

  private createSqlSeal(snapshot: GameSnapshot): void {
    if (!hasFloorExperience(snapshot.floor)) return;
    const sealLandmark = floorExperience(snapshot.floor).landmarks.find(
      (landmark) => landmark.kind === "sql-seal",
    );
    if (!sealLandmark) return;
    const gateId = `gate:${snapshot.roomGraph.bossId}`;
    const gate = snapshot.mazeFloor.gates.find((entry) => entry.id === gateId);
    const anchor = gate
      ? { x: (gate.x + 0.5) * TILE_SIZE, y: (gate.y + 0.5) * TILE_SIZE }
      : this.anchorPoint(snapshot, sealLandmark.id);
    if (!anchor) return;

    const container = this.scene.add.container(anchor.x, anchor.y);
    const shadow = this.scene.add.rectangle(0, 0, 30, 34, 0x090b10, 0.94)
      .setStrokeStyle(3, 0xd0a656, 0.8);
    const leftRune = this.scene.add.line(0, 0, -10, -11, -2, 0, 0x6ed5d3, 0.86)
      .setLineWidth(2);
    const rightRune = this.scene.add.line(0, 0, 10, -11, 2, 0, 0x6ed5d3, 0.86)
      .setLineWidth(2);
    const lowerRune = this.scene.add.line(0, 0, -8, 10, 8, 10, 0xd0a656, 0.82)
      .setLineWidth(2);
    const core = this.scene.add.rectangle(0, 1, 7, 7, 0x6ed5d3, 0.3)
      .setStrokeStyle(1, 0xe6d8a6, 0.9);
    container.add([shadow, leftRune, rightRune, lowerRune, core]);
    this.root?.add(container);
    const label = this.addLabel(anchor, sealLandmark.name, "#e6cf83", -31);
    this.sqlSeal = { container, core, label, point: anchor, gateId };
  }

  private syncSqlSeal(
    snapshot: GameSnapshot,
    state: "sealed" | "decoded",
  ): void {
    if (!this.sqlSeal) return;
    const decoded = state === "decoded";
    this.sqlSeal.container.setAlpha(decoded ? 0.82 : 1);
    this.sqlSeal.core.setFillStyle(decoded ? 0xe6cf83 : 0x6ed5d3, decoded ? 0.96 : 0.3);
    this.sqlSeal.core.setScale(decoded ? 1.45 : 1);
    const visible = snapshot.adminMode || this.isPlayerNear(snapshot, this.sqlSeal.point, 3);
    this.sqlSeal.label.setVisible(visible);
    this.sqlSeal.label.setText(
      decoded ? "SQL 密文已解 · 侧路永久开放" : "E · 解读 SQL 密文",
    );
  }

  private buildLateFloor(snapshot: GameSnapshot): void {
    if (snapshot.floor < 5 || snapshot.floor > 8) return;
    const floor = snapshot.floor as 5 | 6 | 7 | 8;
    const palette = LATE_FLOOR_PALETTES[floor];
    this.createZoneSkin(snapshot, [palette.dark, palette.mid, palette.accent]);

    const definitions = floor === 5
      ? [
          ["f5-muster-board", "分区轮值表", "board"],
          ["f5-rank-standards", "并列双旗", "flags"],
          ["f5-patrol-chain", "前后岗灯", "chain"],
          ["f5-alert-wall", "累计警戒墙", "bars"],
          ["f5-command-clock", "黑铁军钟", "clock"],
          ["f5-ascent", "上行吊桥", "bridge"],
        ] as const
      : floor === 6
        ? [
            ["f6-sandbox-incubator", "一次性孵化副本", "incubator"],
            ["f6-cleanup-sluice", "鳞片清理槽", "sluice"],
            ["f6-constraint-door", "龙晶约束门", "door"],
            ["f6-state-bridge", "原始／候选双轨", "bridge"],
            ["f6-savepoint-altar", "保存点祭台", "altar"],
            ["f6-dragon-throne", "事务提交巢", "throne"],
            ["f6-ascent", "王室升降台", "lift"],
          ] as const
        : floor === 7
          ? [
              ["f7-scan-road", "完整扫描长路", "road"],
              ["f7-index-road", "索引晶枝短路", "branch"],
              ["f7-covering-lake", "覆盖镜湖", "lake"],
              ["f7-broken-root", "函数缠绕根门", "root"],
              ["f7-plan-tree", "执行计划巨树", "tree"],
              ["f7-index-throne", "路径审计树心", "throne"],
              ["f7-ascent", "金色长阶", "stairs"],
            ] as const
          : [
              ["f8-version-gallery", "可见版本长廊", "gallery"],
              ["f8-deadlock-gate", "双骑等待门", "deadlock"],
              ["f8-incident-wings", "事故证据翼", "wings"],
              ["f8-migration-dais", "七步迁移台", "steps"],
              ["f8-archivist-throne", "最终迁移王座", "throne"],
              ["f8-sunset-vista", "最后一道残晖", "vista"],
            ] as const;

    definitions.forEach(([id, title, shape]) => {
      this.createLateSetpiece(snapshot, id, title, shape, palette);
    });
    this.createLateHiddenArea(snapshot, palette);
    this.createUniqueScribe(snapshot, `npc-scribe-f${floor}`);
  }

  private createLateSetpiece(
    snapshot: GameSnapshot,
    landmarkId: string,
    title: string,
    shape: string,
    palette: { dark: number; mid: number; light: number; accent: number },
  ): void {
    const point = this.anchorPoint(snapshot, landmarkId);
    if (!point) return;
    const landmark = floorExperience(snapshot.floor).landmarks.find(
      (entry) => entry.id === landmarkId,
    );
    if (!landmark) return;
    const container = this.scene.add.container(point.x, point.y);
    const shadow = this.scene.add.ellipse(0, 31, 68, 22, 0x070809, 0.46);
    const interactionRing = this.scene.add.ellipse(
      0,
      31,
      56,
      18,
      WORLD_VISUAL_LANGUAGE.interactionInk,
      0.2,
    ).setStrokeStyle(
      2,
      WORLD_VISUAL_LANGUAGE.interactionGold,
      landmark.interaction
        ? WORLD_VISUAL_LANGUAGE.interactionIdleAlpha
        : 0,
    );
    const interactionKey = this.scene.add.text(31, 28, "E", {
      color: "#f0d58a",
      fontFamily: "monospace",
      fontSize: "7px",
      fontStyle: "bold",
      backgroundColor: "#15130fee",
      padding: { x: 3, y: 2 },
    }).setOrigin(0.5).setVisible(landmark.interaction !== null);
    container.add([shadow, interactionRing]);
    const panel = () => this.scene.add.rectangle(0, 4, 82, 54, palette.dark, 0.94)
      .setStrokeStyle(2, palette.light, 0.54);

    if (shape === "board" || shape === "gallery") {
      container.add(panel());
      [-25, 0, 25].forEach((x) => {
        container.add(this.scene.add.rectangle(x, 1, 18, 35, palette.mid, 0.7)
          .setStrokeStyle(1, palette.light, 0.62));
      });
    } else if (shape === "flags") {
      [-22, 22].forEach((x, index) => {
        container.add([
          this.scene.add.rectangle(x, 4, 4, 54, palette.light, 0.76),
          this.scene.add.triangle(x + (index === 0 ? 10 : -10), -14, -15, -9, 15, -9, 0, 11, palette.accent, 0.9),
        ]);
      });
    } else if (shape === "chain" || shape === "deadlock") {
      const nodes = shape === "deadlock"
        ? [{ x: -28, y: -10 }, { x: 28, y: -10 }, { x: 0, y: 23 }]
        : [-36, -12, 12, 36].map((x, index) => ({ x, y: index % 2 === 0 ? -5 : 8 }));
      nodes.forEach((node, index) => {
        const next = nodes[(index + 1) % nodes.length];
        if (shape === "deadlock" || index < nodes.length - 1) {
          container.add(this.scene.add.line(
            0,
            0,
            node.x,
            node.y,
            next.x,
            next.y,
            palette.accent,
            0.66,
          ).setLineWidth(2));
        }
        container.add(this.scene.add.ellipse(node.x, node.y, 15, 15, palette.mid, 0.94)
          .setStrokeStyle(2, palette.light, 0.72));
      });
    } else if (shape === "bars") {
      container.add(panel());
      [-30, -18, -6, 6, 18, 30].forEach((x, index) => {
        container.add(this.scene.add.rectangle(x, 11 - index * 4, 7, 15 + index * 8, palette.accent, 0.74));
      });
    } else if (shape === "clock") {
      container.add(this.scene.add.ellipse(0, 1, 78, 78, palette.dark, 0.96)
        .setStrokeStyle(5, palette.light, 0.8));
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI / 4;
        container.add(this.scene.add.ellipse(
          Math.cos(angle) * 29,
          Math.sin(angle) * 29,
          5,
          5,
          palette.light,
          0.82,
        ));
      }
      container.add([
        this.scene.add.line(0, 0, 0, 0, 0, -24, palette.accent, 0.96).setLineWidth(3),
        this.scene.add.line(0, 0, 0, 0, 19, 8, palette.light, 0.92).setLineWidth(2),
      ]);
    } else if (shape === "incubator") {
      container.add(panel());
      [-24, 0, 24].forEach((x, index) => {
        container.add(this.scene.add.ellipse(x, 7, 18, 27, index === 1 ? palette.accent : palette.mid, 0.84)
          .setStrokeStyle(2, palette.light, 0.7));
      });
    } else if (shape === "sluice") {
      container.add([
        this.scene.add.rectangle(0, 10, 88, 30, palette.mid, 0.84)
          .setStrokeStyle(3, palette.light, 0.62),
        this.scene.add.triangle(0, -13, -43, -9, 43, -9, 0, 15, palette.dark, 0.96),
      ]);
      [-25, -8, 9, 26].forEach((x) => {
        container.add(this.scene.add.polygon(x, 9, [-6, -5, 6, -5, 9, 3, 0, 8, -9, 3], palette.accent, 0.74));
      });
    } else if (shape === "door" || shape === "root") {
      container.add(this.scene.add.rectangle(0, 5, 58, 72, palette.dark, 0.96)
        .setStrokeStyle(4, palette.light, 0.74));
      [-16, 0, 16].forEach((x, index) => {
        container.add(this.scene.add.line(0, 0, x, -27, -x / 2, 31, shape === "root" ? palette.accent : palette.mid, 0.84)
          .setLineWidth(index === 1 ? 4 : 2));
      });
    } else if (shape === "bridge" || shape === "road" || shape === "stairs") {
      const count = shape === "stairs" ? 6 : 5;
      for (let index = 0; index < count; index += 1) {
        const y = (index - (count - 1) / 2) * 10;
        const width = shape === "stairs" ? 35 + index * 10 : 88;
        container.add(this.scene.add.rectangle(0, y, width, 7, index % 2 === 0 ? palette.mid : palette.dark, 0.9)
          .setStrokeStyle(1, palette.light, 0.54));
      }
    } else if (shape === "altar" || shape === "steps") {
      const count = shape === "steps" ? 7 : 3;
      for (let index = 0; index < count; index += 1) {
        container.add(this.scene.add.rectangle(
          0,
          25 - index * 8,
          90 - index * 9,
          7,
          index === count - 1 ? palette.accent : palette.mid,
          0.88,
        ).setStrokeStyle(1, palette.light, 0.5));
      }
    } else if (shape === "branch" || shape === "tree") {
      container.add(this.scene.add.rectangle(0, 17, 9, 62, palette.dark, 0.96)
        .setStrokeStyle(2, palette.light, 0.58));
      const branches = shape === "tree" ? 6 : 3;
      for (let index = 0; index < branches; index += 1) {
        const side = index % 2 === 0 ? -1 : 1;
        container.add(this.scene.add.line(
          0,
          0,
          0,
          8 - index * 8,
          side * (24 + index * 3),
          -4 - index * 8,
          palette.accent,
          0.82,
        ).setLineWidth(3));
      }
    } else if (shape === "lake") {
      container.add([
        this.scene.add.ellipse(0, 8, 104, 48, palette.mid, 0.54)
          .setStrokeStyle(3, palette.light, 0.72),
        this.scene.add.ellipse(0, 5, 58, 20, palette.accent, 0.24)
          .setStrokeStyle(2, palette.light, 0.46),
      ]);
    } else if (shape === "wings") {
      container.add(panel());
      [-36, -12, 12, 36].forEach((x) => {
        container.add(this.scene.add.triangle(x, 1, -10, 19, 0, -20, 10, 19, palette.mid, 0.7)
          .setStrokeStyle(1, palette.light, 0.56));
      });
    } else if (shape === "vista") {
      container.add([
        this.scene.add.rectangle(0, 0, 74, 68, palette.dark, 0.9)
          .setStrokeStyle(4, palette.light, 0.78),
        this.scene.add.rectangle(0, 4, 58, 48, palette.accent, 0.4),
        this.scene.add.ellipse(18, 0, 25, 25, palette.light, 0.84),
      ]);
    } else {
      container.add([
        this.scene.add.rectangle(0, 11, 72, 49, palette.dark, 0.96)
          .setStrokeStyle(3, palette.light, 0.72),
        this.scene.add.rectangle(0, -18, 49, 23, palette.mid, 0.9)
          .setStrokeStyle(2, palette.accent, 0.7),
      ]);
    }

    const stateDot = this.scene.add.ellipse(-35, 34, 8, 8, palette.mid, 0.72)
      .setStrokeStyle(1, palette.light, 0.72);
    const stateText = this.scene.add.text(-27, 34, "未响应", {
      color: "#aeb5be",
      fontFamily: "monospace",
      fontSize: "7px",
      fontStyle: "bold",
    }).setOrigin(0, 0.5);
    container.add([stateDot, stateText, interactionKey]);
    this.root?.add(container);
    const label = this.addLabel(
      point,
      title,
      `#${palette.light.toString(16).padStart(6, "0")}`,
      -48,
    );
    this.lateSetpieces.set(landmarkId, {
      container,
      stateDot,
      stateText,
      label,
      interactionRing,
      interactionKey,
      point,
      title,
      kind: landmark.kind,
      interaction: landmark.interaction,
    });
  }

  private createLateHiddenArea(
    snapshot: GameSnapshot,
    palette: { dark: number; mid: number; light: number; accent: number },
  ): void {
    if (!hasFloorExperience(snapshot.floor)) return;
    const area = floorExperience(snapshot.floor).hiddenAreas[0];
    if (!area) return;
    const point = this.anchorPoint(snapshot, area.landmarkId);
    if (!point) return;
    const backdrop = this.createHiddenRoomBackdrop(
      snapshot,
      area.roomNodeId,
      palette.dark,
      palette.light,
      snapshot.floor % 2 === 0,
    );
    const interior = this.scene.add.container(point.x, point.y);
    const room = this.scene.add.rectangle(0, 6, 98, 68, palette.dark, 0.96)
      .setStrokeStyle(3, palette.light, 0.76);
    const armor = this.scene.add.polygon(
      0,
      2,
      [-18, -19, -7, -27, 0, -19, 7, -27, 18, -19, 13, 25, -13, 25],
      palette.accent,
      0.9,
    ).setStrokeStyle(2, palette.light, 0.9);
    const evidence = this.scene.add.text(0, 32, `REWARD · ${area.rewardArmorId ?? "ARCHIVE"}`, {
      color: `#${palette.light.toString(16).padStart(6, "0")}`,
      fontFamily: "monospace",
      fontSize: "7px",
      fontStyle: "bold",
    }).setOrigin(0.5);
    interior.add([room, armor, evidence]);
    this.root?.add(interior);
    const label = this.addLabel(point, `${area.title} · 专属换装`, "#f0d88b", -49);
    this.createHiddenAreaEntrance(
      snapshot,
      backdrop,
      interior,
      label,
      "未解暗门",
      area.title,
      palette.dark,
      palette.light,
    );
  }

  private setLateState(
    id: string,
    active: boolean,
    text: string,
    ratio = active ? 1 : 0,
  ): void {
    const view = this.lateSetpieces.get(id);
    if (!view) return;
    view.container.setAlpha(active ? 1 : 0.46);
    view.stateDot.setFillStyle(active ? 0x78d5c4 : 0x6a6570, active ? 0.96 : 0.64);
    view.stateDot.setScale(0.78 + Math.max(0, Math.min(1, ratio)) * 0.35);
    view.stateText.setText(text);
    view.stateText.setColor(active ? "#8ce0cf" : "#aeb5be");
  }

  private syncLateSetpieceLabels(snapshot: GameSnapshot): void {
    this.lateSetpieces.forEach((view) => {
      const nearby = this.isPlayerNear(snapshot, view.point, 3);
      view.label.setVisible(nearby);
      view.label.setText(landmarkInteractionLabel({
        name: view.title,
        kind: view.kind,
        interaction: view.interaction,
        nearby,
      }));
      view.stateDot.setVisible(nearby);
      view.stateText.setVisible(nearby);
      view.interactionRing.setStrokeStyle(
        2,
        WORLD_VISUAL_LANGUAGE.interactionGold,
        view.interaction === null
          ? 0
          : nearby
            ? WORLD_VISUAL_LANGUAGE.interactionNearAlpha
            : WORLD_VISUAL_LANGUAGE.interactionIdleAlpha,
      );
      view.interactionKey.setAlpha(nearby ? 1 : 0.68);
    });
  }

  private syncLateFloor(
    world: FloorFiveWorldState | FloorSixWorldState | FloorSevenWorldState | FloorEightWorldState,
  ): void {
    if (world.floor === 5) {
      this.setLateState(
        "f5-muster-board",
        world.roster !== "folded",
        world.roster === "partitioned" ? "分区展开" : "岗次待排",
      );
      this.setLateState(
        "f5-rank-standards",
        world.standards === "ties-visible",
        world.standards === "ties-visible" ? "并列已保留" : "名次未明",
      );
      this.setLateState(
        "f5-patrol-chain",
        world.patrol === "linked",
        world.patrol === "linked" ? "前后岗接通" : "巡逻断链",
      );
      this.setLateState(
        "f5-alert-wall",
        world.alert === "framed",
        world.alert === "framed" ? "当前行范围" : "全城警戒",
      );
      this.setLateState(
        "f5-command-clock",
        world.clock === "reordered",
        world.clock === "reordered" ? "唯一名次停止" : "指针乱转",
      );
      this.setLateState(
        "f5-ascent",
        world.ascent === "lowered",
        world.ascent === "lowered" ? "吊桥落下" : "吊桥高悬",
      );
      return;
    }
    if (world.floor === 6) {
      this.setLateState(
        "f6-sandbox-incubator",
        world.sandbox !== "pristine",
        world.sandbox === "updated"
          ? "记录已定向更新"
          : world.sandbox === "written"
            ? "新记录孵化"
            : "副本洁净",
      );
      this.setLateState(
        "f6-cleanup-sluice",
        world.cleanup === "targeted",
        world.cleanup === "targeted" ? "指定项已清理" : "鳞片淤积",
      );
      this.setLateState(
        "f6-constraint-door",
        world.constraint === "protected",
        world.constraint === "protected" ? "约束保护" : "冲突未验",
      );
      this.setLateState(
        "f6-state-bridge",
        world.bridge === "rolled-back",
        world.bridge === "rolled-back" ? "状态已回滚" : "候选态悬空",
      );
      this.setLateState(
        "f6-savepoint-altar",
        world.savepoint === "validated",
        world.savepoint === "validated" ? "局部撤销通过" : "保存点未立",
      );
      this.setLateState(
        "f6-dragon-throne",
        world.throne === "validated",
        world.throne === "validated" ? "龙巢已验证" : "事务未决",
      );
      this.setLateState(
        "f6-ascent",
        world.ascent === "active",
        world.ascent === "active" ? "升降台开启" : "升降台停机",
      );
      return;
    }
    if (world.floor === 7) {
      this.setLateState(
        "f7-index-road",
        world.indexPath !== "dark",
        world.indexPath === "composite"
          ? "复合短路"
          : world.indexPath === "point-search"
            ? "主键点查"
            : "索引未亮",
      );
      this.setLateState(
        "f7-covering-lake",
        world.lake === "covering",
        world.lake === "covering" ? "覆盖索引" : "仍需回表",
      );
      this.setLateState(
        "f7-broken-root",
        world.rootGate === "range-open",
        world.rootGate === "range-open" ? "范围门恢复" : "根门断裂",
      );
      this.setLateState(
        "f7-plan-tree",
        world.planTree === "explained",
        world.planTree === "explained" ? "计划已展开" : "执行路未明",
      );
      this.setLateState(
        "f7-index-throne",
        world.throne === "paths-compared",
        world.throne === "paths-compared" ? "路径已比较" : "代价待估",
      );
      this.setLateState(
        "f7-ascent",
        world.ascent === "sunlit",
        world.ascent === "sunlit" ? "金阶点亮" : "残照未至",
      );
      this.setLateState("f7-scan-road", true, "慢路始终保留");
      return;
    }
    this.setLateState(
      "f8-version-gallery",
      world.gallery === "snapshot",
      world.gallery === "snapshot" ? "快照稳定" : "版本重叠",
    );
    this.setLateState(
      "f8-deadlock-gate",
      world.deadlock === "cycle-exposed",
      world.deadlock === "cycle-exposed" ? "等待环已显" : "双骑对峙",
    );
    this.setLateState(
      "f8-incident-wings",
      world.wings > 0,
      `${world.wings}/4 证据翼`,
      world.wings / 4,
    );
    this.setLateState(
      "f8-migration-dais",
      world.migration === "ready",
      world.migration === "ready" ? "迁移台就绪" : "七步未齐",
    );
    this.setLateState(
      "f8-archivist-throne",
      world.throne !== "waiting",
      world.throne === "committed" ? "记录已提交" : "等待审计",
    );
    this.setLateState(
      "f8-sunset-vista",
      world.vista === "new-dawn",
      world.vista === "new-dawn" ? "新晨线" : "最后残晖",
    );
  }

  private syncFloorTwo(world: ReturnType<typeof floorWorldStateFromSnapshot> & { floor: 2 }): void {
    this.waterLayer?.setAlpha(world.tide === "high" ? 1 : 0.58);
    this.beaconLights.forEach((light, index) => {
      const rankedCount = world.beacons === "dark" ? 0 : world.beacons === "ranked" ? 3 : 7;
      light.setAlpha(index < rankedCount ? 1 : 0.16);
    });
    this.beaconReflections.forEach((reflection) => {
      reflection.setVisible(world.beacons === "seven-reflections");
    });
    this.drownedVillage?.setAlpha(world.drownedVillage === "revealed" ? 1 : 0.34);
    this.drownedVillage?.setY(
      this.drownedVillageBaseY + (world.drownedVillage === "revealed" ? 0 : 18),
    );
    this.rootBridge?.setAlpha(world.rootBridge === "linked" ? 1 : 0.28);
    this.shipLockBars?.setVisible(world.shipLock === "closed");
    this.lighthouseOverwriteBeam?.setVisible(world.lighthouse === "overwriting");
    this.lighthousePreserveBeams.forEach((beam) => {
      beam.setVisible(world.lighthouse === "preserving");
    });
    this.northFerry?.setAlpha(world.northFerry === "docked" ? 1 : 0.18);
  }
}
