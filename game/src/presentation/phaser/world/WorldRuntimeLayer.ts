import Phaser from "phaser";
import { TILE_SIZE } from "../../../content/curriculum/mvpLevel";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import { floorCurrentSightCellKeys } from "../../../domain/exploration/floorLabyrinth";
import type { Position } from "../../../domain/shared/types";
import {
  INTERACTION_LABEL_DISTANCE,
  isNearPlayer,
} from "../worldOverlay";
import {
  HAZARD_STYLES,
  colorsForFloor,
  type HazardKind,
  type HazardStyle,
} from "./DungeonPalette";
import type { WorldObjectRenderer } from "./WorldObjectRenderer";

interface GateView {
  block: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  parts?: Phaser.GameObjects.Rectangle[];
}

interface CampfireView {
  container: Phaser.GameObjects.Container;
  checkpointRing: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  frameTimer?: Phaser.Time.TimerEvent;
}

interface HazardView {
  container: Phaser.GameObjects.Container;
  motion: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
}

interface ZoneLabelView {
  label: Phaser.GameObjects.Text;
  roomNodeId: string;
}

function gridToPixels(position: Position): Position {
  return {
    x: position.x * TILE_SIZE + TILE_SIZE / 2,
    y: position.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** 统一持有当前地牢拓扑中的有状态 Phaser 视图。 */
export class WorldRuntimeLayer {
  private readonly gateViews = new Map<string, GateView>();
  private readonly shortcutViews = new Map<string, GateView[]>();
  private readonly campfireViews = new Map<string, CampfireView>();
  private readonly hazardViews = new Map<string, HazardView>();
  private readonly zoneLabelViews: ZoneLabelView[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly entityLayer: Phaser.GameObjects.Container,
    private readonly reducedMotion: boolean,
    private readonly visibility: WorldObjectRenderer,
  ) {}

  build(snapshot: GameSnapshot): void {
    this.createZoneLabels(snapshot);
    this.createGates(snapshot);
    this.createShortcutViews(snapshot);
    this.createHazardViews(snapshot);
    this.createCampfireViews(snapshot);
  }

  sync(snapshot: GameSnapshot): void {
    this.syncGateViews(snapshot);
    this.syncShortcutViews(snapshot);
    this.syncCampfireViews(snapshot);
    this.syncHazardViews(snapshot);
    this.syncZoneLabels(snapshot);
  }

  destroy(): void {
    this.campfireViews.forEach((view) => {
      view.frameTimer?.remove(false);
      if (view.container.active) view.container.destroy(true);
    });
    this.campfireViews.clear();

    this.hazardViews.forEach((view) => {
      this.scene.tweens.killTweensOf(view.motion);
      if (view.container.active) view.container.destroy(true);
    });
    this.hazardViews.clear();

    this.gateViews.forEach((view) => {
      view.block.destroy();
      view.parts?.forEach((part) => part.destroy());
      view.label.destroy();
    });
    this.gateViews.clear();

    this.shortcutViews.forEach((views) => {
      views.forEach((view) => {
        view.block.destroy();
        view.parts?.forEach((part) => part.destroy());
        view.label.destroy();
      });
    });
    this.shortcutViews.clear();

    this.zoneLabelViews.forEach((view) => view.label.destroy());
    this.zoneLabelViews.length = 0;
  }

  private createZoneLabels(snapshot: GameSnapshot): void {
    snapshot.mazeFloor.zones.forEach((zone) => {
      const room = snapshot.roomGraph.nodes.find((node) => node.id === zone.roomNodeId);
      const pixel = gridToPixels({ x: zone.x + 0.35, y: zone.y + 0.35 });
      const label = this.scene.add.text(pixel.x, pixel.y, room?.title ?? "未知区域", {
        color: zone.type === "boss" ? "#ff978e" : "#e8dfc7",
        fontFamily: "monospace",
        fontSize: "7px",
        backgroundColor: "#08090ca8",
        padding: { x: 3, y: 2 },
      }).setOrigin(0, 0).setDepth(15).setVisible(false);
      this.entityLayer.add(label);
      this.zoneLabelViews.push({ label, roomNodeId: zone.roomNodeId });
    });
  }

  private syncZoneLabels(snapshot: GameSnapshot): void {
    this.zoneLabelViews.forEach((view) => {
      const room = snapshot.roomGraph.nodes.find(
        (node) => node.id === view.roomNodeId,
      );
      view.label
        .setText(room?.title ?? "未知区域")
        .setVisible(view.roomNodeId === snapshot.currentRoomId);
    });
  }

  private createGates(snapshot: GameSnapshot): void {
    const colors = colorsForFloor(snapshot.floor);
    snapshot.mazeFloor.gates.forEach((gate) => {
      const pixel = gridToPixels(gate);
      const block = this.scene.add.rectangle(
        pixel.x,
        pixel.y + 2,
        18,
        TILE_SIZE - 6,
        0x15191d,
        0.94,
      )
        .setStrokeStyle(2, colors.gold, 0.86)
        .setDepth(18);
      const parts = [-5, 0, 5].map((offset) => this.scene.add.rectangle(
        pixel.x + offset,
        pixel.y + 2,
        2,
        TILE_SIZE - 12,
        colors.wallTop,
        0.7,
      ).setDepth(19));
      parts.push(
        this.scene.add.rectangle(
          pixel.x,
          pixel.y + 2,
          5,
          5,
          colors.gold,
          0.88,
        ).setAngle(45).setDepth(20),
      );
      const label = this.scene.add.text(pixel.x, pixel.y - 22, "", {
        color: "#f1d28b",
        fontFamily: "monospace",
        fontSize: "7px",
        backgroundColor: "#08090cdd",
        padding: { x: 3, y: 2 },
      }).setOrigin(0.5).setDepth(19);
      this.entityLayer.add([block, ...parts, label]);
      this.gateViews.set(gate.id, { block, label, parts });
    });
  }

  private syncGateViews(snapshot: GameSnapshot): void {
    const colors = colorsForFloor(snapshot.floor);
    const discovered = new Set(snapshot.discoveredCells);
    snapshot.mazeFloor.gates.forEach((gate) => {
      const view = this.gateViews.get(gate.id);
      if (!view) return;
      const missing = gate.requires.filter(
        (lesson) => !snapshot.completedLessons.includes(lesson),
      );
      const open = snapshot.availableRoomIds.includes(gate.roomNodeId);
      const challengeGate = gate.id === snapshot.challengeGateId;
      view.block.setFillStyle(
        open ? colors.query : challengeGate ? colors.plum : 0x15191d,
        open ? 0.2 : 0.94,
      );
      view.block.setStrokeStyle(2, open ? colors.query : colors.gold, 0.82);
      view.parts?.forEach((part, index) => {
        part.setVisible(!open && view.block.visible);
        part.setFillStyle(
          index === view.parts!.length - 1 ? colors.gold : colors.wallTop,
          challengeGate ? 0.92 : 0.7,
        );
      });
      view.label.setText(open
        ? ""
        : challengeGate
          ? "E · SQL 密文"
          : missing.length > 0
            ? missing.map((lesson) => lesson.toUpperCase()).join(" + ")
            : "需要聚合战锤");
      view.block.setVisible(this.visibility.isDiscovered(discovered, gate));
      view.parts?.forEach((part) => part.setVisible(view.block.visible && !open));
      view.label.setVisible(
        view.block.visible &&
        !open &&
        isNearPlayer(snapshot.player, gate, INTERACTION_LABEL_DISTANCE),
      );
    });
  }

  private createShortcutViews(snapshot: GameSnapshot): void {
    const colors = colorsForFloor(snapshot.floor);
    snapshot.guidedMap.shortcuts.forEach((shortcut) => {
      const views = [shortcut.entry, shortcut.exit].map((position, index) => {
        const pixel = gridToPixels(position);
        const isPrimaryFloodgate = snapshot.floor === 1 && index === 0;
        const block = this.scene.add.rectangle(
          pixel.x,
          pixel.y,
          isPrimaryFloodgate ? TILE_SIZE - 4 : TILE_SIZE - 12,
          isPrimaryFloodgate ? TILE_SIZE + 2 : 10,
          isPrimaryFloodgate ? 0x24313a : colors.plum,
          isPrimaryFloodgate ? 0.96 : 0.62,
        ).setStrokeStyle(
          2,
          isPrimaryFloodgate ? colors.query : colors.gold,
          0.9,
        ).setDepth(18);
        const parts: Phaser.GameObjects.Rectangle[] = [];
        if (isPrimaryFloodgate) {
          [-7, 0, 7].forEach((offset) => {
            parts.push(
              this.scene.add.rectangle(
                pixel.x + offset,
                pixel.y,
                3,
                TILE_SIZE - 5,
                0xa7b5b8,
              ).setDepth(19),
            );
          });
          parts.push(
            this.scene.add.rectangle(
              pixel.x,
              pixel.y + 12,
              TILE_SIZE - 7,
              5,
              0x3a91ad,
              0.78,
            ).setDepth(19),
          );
        }
        const label = this.scene.add.text(
          pixel.x,
          pixel.y - 22,
          isPrimaryFloodgate ? "E · 排水水闸" : "E · 捷径落点",
          {
            color: "#f1d28b",
            fontFamily: "monospace",
            fontSize: "7px",
            backgroundColor: "#08090cdd",
            padding: { x: 3, y: 2 },
          },
        ).setOrigin(0.5).setDepth(20);
        this.entityLayer.add([block, ...parts, label]);
        return { block, label, parts };
      });
      this.shortcutViews.set(shortcut.id, views);
    });
  }

  private syncShortcutViews(snapshot: GameSnapshot): void {
    const colors = colorsForFloor(snapshot.floor);
    const discovered = new Set(snapshot.discoveredCells);
    snapshot.guidedMap.shortcuts.forEach((shortcut) => {
      const views = this.shortcutViews.get(shortcut.id);
      if (!views) return;
      const open = snapshot.openedGateIds.includes(shortcut.id);
      const hasKey = snapshot.keyItems.includes(shortcut.keyId);
      [shortcut.entry, shortcut.exit].forEach((position, index) => {
        const view = views[index];
        if (!view) return;
        const isPrimaryFloodgate = snapshot.floor === 1 && index === 0;
        view.block.setFillStyle(
          open ? colors.query : isPrimaryFloodgate ? 0x24313a : colors.plum,
          open ? 0.28 : isPrimaryFloodgate ? 0.96 : 0.62,
        );
        view.block.setStrokeStyle(2, open ? colors.query : colors.gold, 0.9);
        view.label.setText(
          isPrimaryFloodgate
            ? open
              ? "E · 已开启捷径"
              : hasKey
                ? "E · 打开排水水闸"
                : "E · 需要捷径钥匙"
            : open
              ? "E · 穿行捷径"
              : "捷径落点",
        );
        const visible = this.visibility.isDiscovered(discovered, position);
        view.block.setVisible(visible);
        view.parts?.forEach((part) => {
          part.setVisible(visible && !open);
        });
        view.label.setVisible(
          visible &&
          isNearPlayer(snapshot.player, position, INTERACTION_LABEL_DISTANCE),
        );
      });
    });
  }

  private createCampfireViews(snapshot: GameSnapshot): void {
    snapshot.campfires.forEach((campfire) => {
      const pixel = gridToPixels(campfire);
      const colors = colorsForFloor(snapshot.floor);
      const container = this.scene.add.container(pixel.x, pixel.y).setDepth(23);
      const checkpointRing = this.scene.add.ellipse(
        0,
        7,
        38,
        23,
        colors.query,
        0.06,
      ).setStrokeStyle(2, colors.query, 0.95);
      const stoneRing = this.scene.add.ellipse(0, 8, 31, 17, 0x5a5d62, 1)
        .setStrokeStyle(2, 0xb3b0a3, 0.84);
      const coal = this.scene.add.ellipse(0, 7, 21, 10, 0x17100e, 1);
      const logLeft = this.scene.add.rectangle(0, 7, 23, 5, 0x74442d)
        .setStrokeStyle(1, 0x2f1a12)
        .setAngle(27);
      const logRight = this.scene.add.rectangle(0, 7, 23, 5, 0x8f5735)
        .setStrokeStyle(1, 0x2f1a12)
        .setAngle(-27);
      const flameFrameOne = this.scene.add.container(0, -4, [
        this.scene.add.triangle(0, 0, -7, 8, 0, -12, 7, 8, 0xe85a35),
        this.scene.add.triangle(1, 2, -4, 7, 1, -7, 5, 7, 0xffb84a),
      ]);
      const flameFrameTwo = this.scene.add.container(0, -3, [
        this.scene.add.triangle(-1, 0, -6, 7, 3, -13, 7, 7, 0xd9412f),
        this.scene.add.triangle(-1, 2, -4, 7, -2, -6, 4, 7, 0xffca58),
      ]).setVisible(false);
      const label = this.scene.add.text(0, -31, "E · 篝火", {
        color: "#f1d28b",
        fontFamily: "monospace",
        fontSize: "7px",
        fontStyle: "bold",
        backgroundColor: "#08090cdd",
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5);
      container.add([
        checkpointRing,
        stoneRing,
        coal,
        logLeft,
        logRight,
        flameFrameOne,
        flameFrameTwo,
        label,
      ]);
      this.entityLayer.add(container);

      let frameTimer: Phaser.Time.TimerEvent | undefined;
      if (!this.reducedMotion) {
        let firstFrame = true;
        frameTimer = this.scene.time.addEvent({
          delay: 230,
          loop: true,
          callback: () => {
            firstFrame = !firstFrame;
            flameFrameOne.setVisible(firstFrame);
            flameFrameTwo.setVisible(!firstFrame);
          },
        });
      }
      this.campfireViews.set(campfire.id, {
        container,
        checkpointRing,
        label,
        frameTimer,
      });
    });
  }

  private syncCampfireViews(snapshot: GameSnapshot): void {
    const discovered = new Set(snapshot.discoveredCells);
    snapshot.campfires.forEach((campfire) => {
      const view = this.campfireViews.get(campfire.id);
      if (!view) return;
      const checkpoint = snapshot.respawnCampfireId === campfire.id;
      const visible = this.visibility.isDiscovered(discovered, campfire);
      view.container.setVisible(visible);
      view.checkpointRing.setVisible(checkpoint);
      view.label.setText(checkpoint ? "复活点 · 篝火" : "E · 篝火");
      view.label.setColor(checkpoint ? "#8ff5e1" : "#f1d28b");
      view.label.setVisible(
        visible &&
        isNearPlayer(snapshot.player, campfire, INTERACTION_LABEL_DISTANCE),
      );
    });
  }

  private createHazardViews(snapshot: GameSnapshot): void {
    snapshot.hazards.forEach((hazard) => {
      const style = HAZARD_STYLES[hazard.kind];
      const pixel = gridToPixels(hazard);
      const container = this.scene.add.container(pixel.x, pixel.y).setDepth(22);
      const shadow = this.scene.add.ellipse(0, 7, 27, 10, 0x020305, 0.55);
      const motion = this.createHazardSymbol(hazard.kind, style);
      const label = this.scene.add.text(0, -24, hazard.name, {
        color: "#f1d28b",
        fontFamily: "monospace",
        fontSize: "7px",
        backgroundColor: "#08090cdd",
        padding: { x: 3, y: 2 },
      }).setOrigin(0.5);
      container.add([shadow, motion, label]);
      this.entityLayer.add(container);
      if (!this.reducedMotion) {
        if (style.motion === "spin") {
          this.scene.tweens.add({
            targets: motion,
            angle: 360,
            duration: style.duration,
            repeat: -1,
            ease: "Linear",
          });
        } else if (style.motion === "pulse") {
          this.scene.tweens.add({
            targets: motion,
            scaleX: 1.12,
            scaleY: 1.12,
            alpha: 0.72,
            duration: style.duration,
            yoyo: true,
            repeat: -1,
            ease: "Sine.InOut",
          });
        } else {
          this.scene.tweens.add({
            targets: motion,
            angle: { from: -5, to: 5 },
            duration: style.duration,
            yoyo: true,
            repeat: -1,
            ease: "Sine.InOut",
          });
        }
      }
      this.hazardViews.set(hazard.id, { container, motion, label });
    });
  }

  private createHazardSymbol(
    kind: HazardKind,
    style: HazardStyle,
  ): Phaser.GameObjects.Container {
    const symbol = this.scene.add.container(0, 1);
    const circleBase = () => this.scene.add.circle(0, 0, 10, style.base, 1)
      .setStrokeStyle(2, style.accent, 0.95);

    if (kind === "archive-cutter") {
      symbol.add([
        circleBase(),
        this.scene.add.rectangle(0, 0, 26, 4, style.blade, 0.9),
        this.scene.add.rectangle(0, 0, 4, 26, style.blade, 0.9),
        this.scene.add.circle(0, 0, 4, style.accent, 1)
          .setStrokeStyle(1, 0xf1d28b, 0.9),
      ]);
      return symbol;
    }

    if (kind === "tidal-current") {
      symbol.add([
        this.scene.add.ellipse(0, 0, 27, 15, style.base, 1)
          .setStrokeStyle(2, style.accent, 0.95),
        this.scene.add.ellipse(0, 0, 18, 8, style.base, 0)
          .setStrokeStyle(2, style.blade, 0.9),
        this.scene.add.circle(-9, -5, 2, style.blade, 0.9),
        this.scene.add.circle(8, 5, 2, style.accent, 0.95),
      ]);
      return symbol;
    }

    if (kind === "frost-crack") {
      symbol.add([
        this.scene.add.rectangle(0, 0, 18, 18, style.base, 1)
          .setAngle(45)
          .setStrokeStyle(2, style.accent, 0.95),
        this.scene.add.rectangle(-3, -4, 3, 12, style.blade, 0.95).setAngle(-28),
        this.scene.add.rectangle(3, 4, 3, 12, style.blade, 0.95).setAngle(28),
        this.scene.add.rectangle(4, -5, 2, 7, style.accent, 0.95).setAngle(62),
      ]);
      return symbol;
    }

    if (kind === "elemental-vent") {
      symbol.add([
        circleBase(),
        this.scene.add.circle(0, -7, 4, style.blade, 0.95),
        this.scene.add.circle(-7, 5, 4, style.accent, 0.95),
        this.scene.add.circle(7, 5, 4, 0x78c9b8, 0.95),
        this.scene.add.circle(0, 0, 3, style.base, 1),
      ]);
      return symbol;
    }

    if (kind === "alarm-wire") {
      symbol.add([
        this.scene.add.rectangle(0, 2, 28, 10, style.base, 1)
          .setStrokeStyle(2, style.accent, 0.95),
        this.scene.add.rectangle(-11, -2, 3, 22, style.blade, 0.95),
        this.scene.add.rectangle(11, -2, 3, 22, style.blade, 0.95),
        this.scene.add.rectangle(0, -5, 21, 2, style.accent, 1),
        this.scene.add.circle(0, 1, 5, style.accent, 1)
          .setStrokeStyle(1, style.blade, 0.95),
        this.scene.add.circle(0, 7, 2, style.blade, 1),
      ]);
      return symbol;
    }

    if (kind === "magma-fissure") {
      symbol.add([
        this.scene.add.ellipse(0, 2, 28, 14, style.base, 1)
          .setStrokeStyle(2, style.accent, 0.95),
        this.scene.add.rectangle(-6, -3, 4, 11, style.blade, 0.95).setAngle(34),
        this.scene.add.rectangle(0, 2, 4, 12, style.accent, 1).setAngle(-28),
        this.scene.add.rectangle(6, 6, 4, 10, style.blade, 0.95).setAngle(38),
      ]);
      return symbol;
    }

    if (kind === "root-snare") {
      symbol.add([
        this.scene.add.ellipse(0, 2, 27, 14, style.base, 1)
          .setStrokeStyle(2, style.accent, 0.95),
        this.scene.add.ellipse(-6, -2, 5, 24, style.blade, 0.85).setAngle(-28),
        this.scene.add.ellipse(6, -2, 5, 24, style.accent, 0.9).setAngle(28),
        this.scene.add.ellipse(0, 3, 5, 20, style.blade, 0.85),
      ]);
      return symbol;
    }

    symbol.add([
      this.scene.add.rectangle(0, 0, 20, 20, style.base, 1)
        .setAngle(45)
        .setStrokeStyle(2, style.accent, 0.95),
      this.scene.add.rectangle(0, 0, 12, 12, style.base, 0)
        .setAngle(45)
        .setStrokeStyle(2, style.blade, 0.95),
      this.scene.add.rectangle(0, 0, 3, 16, style.accent, 1),
    ]);
    return symbol;
  }

  private syncHazardViews(snapshot: GameSnapshot): void {
    const discovered = new Set(snapshot.discoveredCells);
    const sight = snapshot.adminMode
      ? discovered
      : floorCurrentSightCellKeys(
          snapshot.floor,
          snapshot.mazeFloor,
          snapshot.campfires,
          snapshot.player,
        );
    snapshot.hazards.forEach((hazard) => {
      const view = this.hazardViews.get(hazard.id);
      if (!view) return;
      const triggered = snapshot.openedGateIds.includes(hazard.id);
      const visible = this.visibility.isVisible(discovered, sight, hazard);
      view.container.setVisible(visible);
      view.container.setAlpha(triggered ? 0.34 : 1);
      if (triggered) {
        this.scene.tweens.killTweensOf(view.motion);
        view.motion.setAngle(0).setScale(1).setAlpha(1);
      }
      view.label.setText(triggered ? "已失效" : hazard.name);
      view.label.setVisible(
        visible && isNearPlayer(snapshot.player, hazard, INTERACTION_LABEL_DISTANCE),
      );
    });
  }
}
