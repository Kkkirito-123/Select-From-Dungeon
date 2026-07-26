import Phaser from "phaser";
import { floorExperience } from "../content/floorExperience";
import { TILE_SIZE } from "../content/mvpLevel";
import { floorWorldStateFromSnapshot } from "../domain/floorWorldState";
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
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    private readonly reducedMotion: boolean,
  ) {}

  build(snapshot: GameSnapshot): void {
    this.destroy();
    if (snapshot.floor !== 1 && snapshot.floor !== 2) return;
    this.root = this.scene.add.container(0, 0).setDepth(12);
    this.parent.addAt(this.root, 0);
    if (snapshot.floor === 1) this.buildFloorOne(snapshot);
    else this.buildFloorTwo(snapshot);
    this.sync(snapshot);
  }

  sync(snapshot: GameSnapshot): void {
    if (!this.root || (snapshot.floor !== 1 && snapshot.floor !== 2)) return;
    const world = floorWorldStateFromSnapshot(snapshot);
    if (!world) return;

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

    if (world.floor === 1) {
      this.syncFloorOne(world, snapshot);
    } else {
      this.syncFloorTwo(world);
    }
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
  }

  private anchorPoint(snapshot: GameSnapshot, landmarkId: string): PixelPoint | null {
    if (snapshot.floor !== 1 && snapshot.floor !== 2) return null;
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
    }).setOrigin(0.5);
    this.root?.add(label);
    return label;
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
    this.createUniqueScribe(snapshot, "npc-scribe-f1");
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
    if (snapshot.floor !== 1 && snapshot.floor !== 2) return;
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
    this.createUniqueScribe(snapshot, "npc-scribe-f2");
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
