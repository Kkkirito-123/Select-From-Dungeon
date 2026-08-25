import Phaser from "phaser";
import {
  floorExperience,
  hasFloorExperience,
} from "../../../../content/world/floorExperience";
import { TILE_SIZE } from "../../../../content/curriculum/mvpLevel";
import {
  floorWorldStateFromSnapshot,
} from "../../../../domain/progression/floorWorldState";
import type { GameSnapshot } from "../../../../contracts/game/snapshots";
import { createScribeActor } from "../../PixelActorFactory";
import { WORLD_VISUAL_LANGUAGE } from "../../worldVisualLanguage";

export interface PixelPoint {
  x: number;
  y: number;
}

interface ScribeView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  roomNodeId: string;
  point: PixelPoint;
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

export type FloorWorldState = NonNullable<
  ReturnType<typeof floorWorldStateFromSnapshot>
>;

function discoveredRoom(snapshot: GameSnapshot, roomNodeId: string): boolean {
  return snapshot.adminMode || snapshot.visitedRoomIds.includes(roomNodeId);
}

export abstract class FloorSetpieceModule {
  protected root: Phaser.GameObjects.Container | null = null;
  private scribe: ScribeView | null = null;
  private hiddenArea: HiddenAreaView | null = null;
  private sqlSeal: SqlSealView | null = null;
  private proximityLabels: Array<{
    label: Phaser.GameObjects.Text;
    point: PixelPoint;
    radius: number;
  }> = [];
  protected timers: Phaser.Time.TimerEvent[] = [];

  constructor(
    protected readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    protected readonly reducedMotion: boolean,
  ) {}

  build(snapshot: GameSnapshot): void {
    this.destroy();
    if (!hasFloorExperience(snapshot.floor)) return;
    this.root = this.scene.add.container(0, 0).setDepth(12);
    this.parent.addAt(this.root, 0);
    this.buildFloor(snapshot);
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
    this.syncFloor(world, snapshot);
    this.syncSqlSeal(snapshot, world.cipher);
  }

  destroy(): void {
    this.resetFloorState();
    this.timers.forEach((timer) => timer.remove(false));
    this.timers = [];
    if (this.root?.active) this.root.destroy(true);
    this.root = null;
    this.scribe = null;
    this.hiddenArea = null;
    this.sqlSeal = null;
    this.proximityLabels = [];
  }

  protected abstract buildFloor(snapshot: GameSnapshot): void;
  protected abstract syncFloor(
    world: FloorWorldState,
    snapshot: GameSnapshot,
  ): void;
  protected resetFloorState(): void {}
  protected anchorPoint(snapshot: GameSnapshot, landmarkId: string): PixelPoint | null {
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

  protected hasTexture(key: string): boolean {
    return this.scene.textures.exists(key);
  }

  protected addPixelImage(
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

  protected addLabel(
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

  protected syncProximityLabels(snapshot: GameSnapshot): void {
    this.proximityLabels.forEach(({ label, point, radius }) => {
      label.setVisible(this.isPlayerNear(snapshot, point, radius));
    });
  }

  protected isPlayerNear(
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

  protected createUniqueScribe(snapshot: GameSnapshot, npcId: string): void {
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

  protected createHiddenRoomBackdrop(
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

  protected createHiddenAreaEntrance(
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

  protected syncHiddenArea(snapshot: GameSnapshot): void {
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

  protected createZoneSkin(
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

  protected createSqlSeal(snapshot: GameSnapshot): void {
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

  protected syncSqlSeal(
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

}

