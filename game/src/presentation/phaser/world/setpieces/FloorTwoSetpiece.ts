import Phaser from "phaser";
import { TILE_SIZE } from "../../../../content/curriculum/mvpLevel";
import type { GameSnapshot } from "../../../../contracts/game/snapshots";
import { floorWorldStateFromSnapshot } from "../../../../domain/progression/floorWorldState";
import {
  FLOOR_ART_FRAMES,
  FLOOR_ART_KEYS,
} from "../../floorArtAssets";
import {
  FLOOR_TWO_MARSH_ROOM_IDS,
  FLOOR_TWO_SAND_ROOM_IDS,
} from "../../floorSetpieceGeometry";
import {
  FloorSetpieceModule,
  type FloorWorldState,
} from "../shared/FloorSetpieceModule";

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

export class FloorTwoSetpiece extends FloorSetpieceModule {
  private waterLayer: Phaser.GameObjects.Container | null = null;
  private beaconLights: Phaser.GameObjects.Ellipse[] = [];
  private beaconReflections: Phaser.GameObjects.Rectangle[] = [];
  private drownedVillage: Phaser.GameObjects.Container | null = null;
  private drownedVillageBaseY = 0;
  private rootBridge: Phaser.GameObjects.Container | null = null;
  private shipLockBars: Phaser.GameObjects.Container | null = null;
  private lighthouseOverwriteBeam: Phaser.GameObjects.Triangle | null = null;
  private lighthousePreserveBeams: Phaser.GameObjects.Triangle[] = [];
  private northFerry: Phaser.GameObjects.Container | null = null;

  protected buildFloor(snapshot: GameSnapshot): void {
    this.buildFloorTwo(snapshot);
  }

  protected syncFloor(world: FloorWorldState): void {
    if (world.floor === 2) this.syncFloorTwo(world);
  }

  protected resetFloorState(): void {
    this.waterLayer = null;
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
