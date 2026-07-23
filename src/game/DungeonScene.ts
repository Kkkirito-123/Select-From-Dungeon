import Phaser from "phaser";
import { TILE_SIZE } from "../content/mvpLevel";
import {
  mazeZoneAt,
  type MazeDecorationKind,
  type MazeZone,
} from "../domain/mazeGenerator";
import { safeZoneCellKeys } from "../domain/campfire";
import { GameSession } from "../domain/GameSession";
import type {
  GameSnapshot,
  GroundItem,
  Monster,
  MoveResolution,
  Position,
} from "../domain/types";
import type { FeedbackDirector } from "../feedback/FeedbackDirector";
import {
  isGameplayShortcutCaptured,
  parseExternalMoveDetail,
} from "./gameInput";
import { newlyOpenedGate, pickedItemsBetween } from "./snapshotFeedback";

interface MonsterView {
  container: Phaser.GameObjects.Container;
  hpFill: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface ItemView {
  container: Phaser.GameObjects.Container;
  tween?: Phaser.Tweens.Tween;
}

interface GateView {
  block: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface CampfireView {
  container: Phaser.GameObjects.Container;
  checkpointRing: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  frameTimer?: Phaser.Time.TimerEvent;
}

const COLORS = {
  void: 0x08090c,
  wall: 0x252a34,
  wallTop: 0x505766,
  floor: 0x171b22,
  floorAlt: 0x1d222b,
  line: 0x0e1117,
  query: 0x78c9b8,
  gold: 0xd7ad55,
  ember: 0xc75248,
  paper: 0xe8dfc7,
  plum: 0x7f5a87,
  fog: 0x030407,
} as const;

const ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x25231d,
  tutorial: 0x16302e,
  lesson: 0x261f2b,
  rest: 0x2d211d,
  treasure: 0x2a291a,
  event: 0x221d2a,
  elite: 0x31281a,
  boss: 0x32191e,
};

const FLOOR_TWO_COLORS = {
  void: 0x070b18,
  wall: 0x281f4d,
  wallTop: 0x664f9f,
  floor: 0x102844,
  floorAlt: 0x163a63,
  line: 0x0a1528,
  query: 0x66e3ff,
  gold: 0xffd166,
  ember: 0xff4d8d,
  paper: 0xe9f7ff,
  plum: 0x8d6dff,
  fog: 0x030611,
} as const;

const FLOOR_TWO_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x142e52,
  tutorial: 0x163c5d,
  lesson: 0x27255a,
  rest: 0x19374b,
  treasure: 0x34304f,
  event: 0x2d2054,
  elite: 0x39224f,
  boss: 0x411b48,
};

const KEY_TO_DIRECTION: Record<string, Position> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

function gridToPixels(position: Position): Position {
  return {
    x: position.x * TILE_SIZE + TILE_SIZE / 2,
    y: position.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}

function emitMilestone(type: string): void {
  window.dispatchEvent(new CustomEvent("dungeon:milestone", { detail: { type } }));
}

export class DungeonScene extends Phaser.Scene {
  private snapshot: GameSnapshot;
  private unsubscribe: (() => void) | null = null;
  private terrain!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.Graphics;
  private entityLayer!: Phaser.GameObjects.Container;
  private playerView!: Phaser.GameObjects.Container;
  private objectiveBeacon: Phaser.GameObjects.Container | null = null;
  private readonly monsterViews = new Map<number, MonsterView>();
  private readonly itemViews = new Map<string, ItemView>();
  private readonly gateViews = new Map<string, GateView>();
  private readonly campfireViews = new Map<string, CampfireView>();
  private readonly pressedDirections = new Map<string, Position>();
  private renderedTopology = -1;
  private moveLocked = false;
  private nextHeldMoveAt = 0;
  private battleTransitioning = false;
  private pagePaused = false;
  private patrolTimer: Phaser.Time.TimerEvent | null = null;
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  private readonly externalMoveHandler = (event: Event): void => {
    if (!this.canAcceptGameplayInput()) return;
    const direction = parseExternalMoveDetail((event as CustomEvent<unknown>).detail);
    if (!direction) return;
    this.tryMove(direction.x, direction.y);
  };

  private readonly externalInteractHandler = (): void => {
    if (!this.canAcceptGameplayInput()) return;
    this.session.interact();
  };

  private readonly keyDownHandler = (event: KeyboardEvent): void => {
    if (!this.canAcceptGameplayInput(event)) return;
    if (event.code === "KeyE") {
      if (!event.repeat) this.externalInteractHandler();
      return;
    }
    const direction = KEY_TO_DIRECTION[event.code];
    if (!direction) return;
    event.preventDefault();
    this.pressedDirections.set(event.code, direction);
    if (!event.repeat) {
      this.tryMove(direction.x, direction.y);
      this.nextHeldMoveAt = performance.now() + 150;
    }
  };

  private readonly keyUpHandler = (event: KeyboardEvent): void => {
    this.pressedDirections.delete(event.code);
  };

  private readonly blurHandler = (): void => {
    this.pagePaused = true;
    this.resetPlayerMovement();
  };

  private readonly focusHandler = (): void => {
    this.pagePaused = document.hidden;
    if (!this.pagePaused) this.resetPlayerMovement();
  };

  private readonly visibilityHandler = (): void => {
    this.pagePaused = document.hidden;
    if (this.pagePaused) this.resetPlayerMovement();
  };

  private canAcceptGameplayInput(event?: KeyboardEvent): boolean {
    if (
      !this.scene.isActive() ||
      this.snapshot.mode !== "explore" ||
      this.battleTransitioning ||
      this.pagePaused
    ) return false;
    if (!event) return true;
    return !isGameplayShortcutCaptured(event.target);
  }

  constructor(
    private readonly session: GameSession,
    private readonly feedback: FeedbackDirector,
  ) {
    super("DungeonScene");
    this.snapshot = session.snapshot();
  }

  create(): void {
    this.snapshot = this.session.snapshot();
    this.cameras.main.setBackgroundColor(COLORS.void);
    this.terrain = this.add.graphics().setDepth(0);
    this.entityLayer = this.add.container(0, 0).setDepth(10);
    this.fog = this.add.graphics().setDepth(40);
    this.rebuildWorld();

    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
    window.addEventListener("blur", this.blurHandler);
    window.addEventListener("focus", this.focusHandler);
    document.addEventListener("visibilitychange", this.visibilityHandler);
    window.addEventListener("dungeon:move", this.externalMoveHandler);
    window.addEventListener("dungeon:interact", this.externalInteractHandler);
    this.unsubscribe = this.session.subscribe((snapshot) => this.receiveSnapshot(snapshot));
    if (this.snapshot.mode === "combat") {
      this.time.delayedCall(0, () => this.beginBattle());
    }

    this.patrolTimer = this.time.addEvent({
      delay: 1_100,
      loop: true,
      callback: () => this.advancePatrols(),
    });
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.battleTransitioning = false;
      this.resetPlayerMovement();
      this.snapshot = this.session.snapshot();
      this.syncViews();
      this.cameras.main.startFollow(this.playerView, true, 0.18, 0.18);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  update(time: number): void {
    if (
      time < this.nextHeldMoveAt ||
      this.moveLocked ||
      this.snapshot.mode !== "explore" ||
      this.pressedDirections.size === 0
    ) return;
    const direction = [...this.pressedDirections.values()].at(-1);
    if (!direction) return;
    this.tryMove(direction.x, direction.y);
    this.nextHeldMoveAt = time + 125;
  }

  private cleanup(): void {
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    window.removeEventListener("blur", this.blurHandler);
    window.removeEventListener("focus", this.focusHandler);
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    window.removeEventListener("dungeon:move", this.externalMoveHandler);
    window.removeEventListener("dungeon:interact", this.externalInteractHandler);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.patrolTimer?.destroy();
    this.patrolTimer = null;
    this.clearCampfireViews();
    this.pressedDirections.clear();
  }

  private receiveSnapshot(snapshot: GameSnapshot): void {
    const previous = this.snapshot;
    this.snapshot = snapshot;
    if (
      previous.floor !== snapshot.floor ||
      previous.mazeFloor.topologyHash !== snapshot.mazeFloor.topologyHash
    ) {
      this.rebuildWorld();
    } else {
      this.syncViews();
    }

    if (previous.mode !== "combat" && snapshot.mode === "combat") {
      const monster = snapshot.monsters.find((entry) => entry.id === snapshot.combat?.targetId);
      if (monster) {
        this.feedback.dispatch({ type: "encounter-start", monsterName: monster.name });
        emitMilestone("encounter-start");
      }
      this.beginBattle();
    }
    if (previous.mode !== "victory" && snapshot.mode === "victory") {
      this.feedback.dispatch({ type: "victory", message: snapshot.banner });
    }

    const openedGate = newlyOpenedGate(previous, snapshot);
    if (openedGate) {
      const openedByChallenge = !previous.openedGateIds.includes(openedGate.id)
        && snapshot.openedGateIds.includes(openedGate.id);
      const newlyLearnedRequirements = openedGate.requires.filter(
        (lesson) => !previous.completedLessons.includes(lesson)
          && snapshot.completedLessons.includes(lesson),
      );
      this.feedback.dispatch({
        type: "gate-open",
        message: openedByChallenge
          ? "越级 SQL 校验通过，当前机关门已永久开启。"
          : newlyLearnedRequirements.length > 0
          ? `${openedGate.requires.map((lesson) => lesson.toUpperCase()).join(" + ")} 知识门已开启。`
          : "聚合战锤已共鸣，GROUP BY 知识门开启。",
      });
    }
    pickedItemsBetween(previous, snapshot)
      .forEach((item) => this.playPickupFeedback(item, snapshot.banner));
  }

  private rebuildWorld(): void {
    this.renderedTopology = this.snapshot.mazeFloor.topologyHash;
    this.terrain.clear();
    this.fog.clear();
    if (this.objectiveBeacon) {
      this.tweens.killTweensOf(this.objectiveBeacon);
      this.objectiveBeacon.destroy(true);
    }
    this.objectiveBeacon = null;
    this.clearCampfireViews();
    this.entityLayer?.removeAll(true);
    this.monsterViews.clear();
    this.itemViews.forEach((view) => view.tween?.destroy());
    this.itemViews.clear();
    this.gateViews.clear();

    const floor = this.snapshot.mazeFloor;
    const worldWidth = floor.width * TILE_SIZE;
    const worldHeight = floor.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.drawTerrain();
    this.drawDecorations();
    this.drawZoneLabels();
    this.createGates();
    this.createCampfireViews();
    this.createPlayer();
    this.createMonsterViews();
    this.createObjectiveBeacon();
    this.syncItemViews();
    this.drawFog();
    this.cameras.main.startFollow(this.playerView, true, 0.18, 0.18);
    this.cameras.main.centerOn(this.playerView.x, this.playerView.y);
  }

  private drawTerrain(): void {
    const floor = this.snapshot.mazeFloor;
    const colors = this.snapshot.floor === 2 ? FLOOR_TWO_COLORS : COLORS;
    const zoneColors = this.snapshot.floor === 2 ? FLOOR_TWO_ZONE_COLORS : ZONE_COLORS;
    this.cameras.main.setBackgroundColor(colors.void);
    for (let y = 0; y < floor.height; y += 1) {
      for (let x = 0; x < floor.width; x += 1) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const tile = floor.tiles[y][x];
        if (tile === "#") {
          this.terrain.fillStyle(colors.wall, 1);
          this.terrain.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.terrain.fillStyle(colors.wallTop, 0.52);
          this.terrain.fillRect(px + 2, py + 2, TILE_SIZE - 4, 4);
        } else {
          const zone = mazeZoneAt(floor, { x, y });
          const color = zone
            ? zoneColors[zone.type]
            : (x + y) % 2 === 0 ? colors.floor : colors.floorAlt;
          this.terrain.fillStyle(color, 1);
          this.terrain.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.terrain.lineStyle(1, colors.line, 0.48);
          this.terrain.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
          if (this.snapshot.floor === 2 && (x + y) % 3 === 0) {
            this.terrain.lineStyle(1, colors.query, 0.2);
            this.terrain.lineBetween(px + 5, py + TILE_SIZE / 2, px + TILE_SIZE - 5, py + TILE_SIZE / 2);
          }
        }
      }
    }

    this.terrain.lineStyle(1, colors.query, this.snapshot.floor === 2 ? 0.2 : 0.08);
    for (let chunkX = 1; chunkX < floor.width / floor.chunkSize; chunkX += 1) {
      const x = chunkX * floor.chunkSize * TILE_SIZE;
      this.terrain.lineBetween(x, 0, x, floor.height * TILE_SIZE);
    }
    for (let chunkY = 1; chunkY < floor.height / floor.chunkSize; chunkY += 1) {
      const y = chunkY * floor.chunkSize * TILE_SIZE;
      this.terrain.lineBetween(0, y, floor.width * TILE_SIZE, y);
    }
    this.drawSafeZones();
  }

  private drawSafeZones(): void {
    const colors = this.snapshot.floor === 2 ? FLOOR_TWO_COLORS : COLORS;
    safeZoneCellKeys(this.snapshot.mazeFloor, this.snapshot.campfires)
      .forEach((cell) => {
        const [x, y] = cell.split(":").map(Number);
        if (!Number.isInteger(x) || !Number.isInteger(y)) return;
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        this.terrain.fillStyle(
          colors.query,
          this.snapshot.floor === 2 ? 0.1 : 0.075,
        );
        this.terrain.fillRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        this.terrain.lineStyle(1, colors.query, 0.14);
        this.terrain.strokeRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);
      });
  }

  private drawDecorations(): void {
    const colors = this.snapshot.floor === 2 ? FLOOR_TWO_COLORS : COLORS;
    this.snapshot.mazeFloor.decorations.forEach((decoration) => {
      const pixel = gridToPixels(decoration);
      const color: Record<MazeDecorationKind, number> = {
        torch: colors.gold,
        rubble: this.snapshot.floor === 2 ? 0x664f9f : 0x505461,
        rune: colors.query,
      };
      const size = decoration.kind === "torch" ? 5 : decoration.kind === "rune" ? 8 : 7;
      const marker = this.add.rectangle(pixel.x, pixel.y, size, size, color[decoration.kind], 0.7);
      if (decoration.kind === "rune") marker.setAngle(45);
      this.entityLayer.add(marker);
    });
  }

  private drawZoneLabels(): void {
    this.snapshot.mazeFloor.zones.forEach((zone) => {
      const room = this.snapshot.roomGraph.nodes.find((node) => node.id === zone.roomNodeId);
      const pixel = gridToPixels({ x: zone.center.x, y: zone.y + 1 });
      const label = this.add.text(pixel.x, pixel.y, room?.title ?? "未知区域", {
        color: zone.type === "boss" ? "#ff978e" : "#e8dfc7",
        fontFamily: "monospace",
        fontSize: "9px",
        fontStyle: "bold",
        backgroundColor: "#08090ccc",
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(15);
      label.setData("cell", `${zone.center.x}:${zone.center.y}`);
      this.entityLayer.add(label);
    });
  }

  private createGates(): void {
    this.snapshot.mazeFloor.gates.forEach((gate) => {
      const pixel = gridToPixels(gate);
      const block = this.add.rectangle(pixel.x, pixel.y, TILE_SIZE - 8, TILE_SIZE - 8, COLORS.query, 0.64)
        .setStrokeStyle(2, COLORS.gold, 0.8)
        .setDepth(18);
      const label = this.add.text(pixel.x, pixel.y - 22, "", {
        color: "#f1d28b",
        fontFamily: "monospace",
        fontSize: "7px",
        backgroundColor: "#08090cdd",
        padding: { x: 3, y: 2 },
      }).setOrigin(0.5).setDepth(19);
      this.entityLayer.add([block, label]);
      this.gateViews.set(gate.id, { block, label });
    });
  }

  private createCampfireViews(): void {
    this.snapshot.campfires.forEach((campfire) => {
      const pixel = gridToPixels(campfire);
      const colors = this.snapshot.floor === 2 ? FLOOR_TWO_COLORS : COLORS;
      const container = this.add.container(pixel.x, pixel.y).setDepth(23);
      const checkpointRing = this.add.ellipse(
        0,
        7,
        38,
        23,
        colors.query,
        0.06,
      ).setStrokeStyle(2, colors.query, 0.95);
      const stoneRing = this.add.ellipse(0, 8, 31, 17, 0x5a5d62, 1)
        .setStrokeStyle(2, 0xb3b0a3, 0.84);
      const coal = this.add.ellipse(0, 7, 21, 10, 0x17100e, 1);
      const logLeft = this.add.rectangle(0, 7, 23, 5, 0x74442d)
        .setStrokeStyle(1, 0x2f1a12)
        .setAngle(27);
      const logRight = this.add.rectangle(0, 7, 23, 5, 0x8f5735)
        .setStrokeStyle(1, 0x2f1a12)
        .setAngle(-27);
      const flameFrameOne = this.add.container(0, -4, [
        this.add.triangle(0, 0, -7, 8, 0, -12, 7, 8, 0xe85a35),
        this.add.triangle(1, 2, -4, 7, 1, -7, 5, 7, 0xffb84a),
      ]);
      const flameFrameTwo = this.add.container(0, -3, [
        this.add.triangle(-1, 0, -6, 7, 3, -13, 7, 7, 0xd9412f),
        this.add.triangle(-1, 2, -4, 7, -2, -6, 4, 7, 0xffca58),
      ]).setVisible(false);
      const label = this.add.text(0, -31, "E · 篝火", {
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
        frameTimer = this.time.addEvent({
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
    this.syncCampfireViews();
  }

  private syncCampfireViews(): void {
    const discovered = new Set(this.snapshot.discoveredCells);
    this.snapshot.campfires.forEach((campfire) => {
      const view = this.campfireViews.get(campfire.id);
      if (!view) return;
      const checkpoint = this.snapshot.respawnCampfireId === campfire.id;
      view.container.setVisible(discovered.has(positionKey(campfire)));
      view.checkpointRing.setVisible(checkpoint);
      view.label.setText(checkpoint ? "复活点 · 篝火" : "E · 篝火");
      view.label.setColor(checkpoint ? "#8ff5e1" : "#f1d28b");
    });
  }

  private clearCampfireViews(): void {
    this.campfireViews.forEach((view) => {
      view.frameTimer?.remove(false);
      if (view.container.active) view.container.destroy(true);
    });
    this.campfireViews.clear();
  }

  private createPlayer(): void {
    const pixel = gridToPixels(this.snapshot.player);
    this.playerView = this.add.container(pixel.x, pixel.y).setDepth(30);
    this.playerView.add([
      this.add.rectangle(-7, 4, 11, 22, 0x3d5078),
      this.add.rectangle(6, 4, 12, 22, 0x6a7fac),
      this.add.rectangle(0, -9, 20, 14, COLORS.paper),
      this.add.rectangle(-6, -10, 4, 4, 0x14161d),
      this.add.rectangle(6, -10, 4, 4, 0x14161d),
      this.add.rectangle(13, 2, 3, 27, COLORS.gold).setAngle(22),
    ]);
    this.entityLayer.add(this.playerView);
  }

  private createMonsterViews(): void {
    this.snapshot.worldActors.forEach((actor) => {
      const monster = this.snapshot.monsters.find((entry) => entry.id === actor.monsterId);
      if (!monster) return;
      const pixel = gridToPixels(actor);
      const container = this.add.container(pixel.x, pixel.y).setDepth(25);
      const body = this.createMonsterBody(monster);
      const hpBack = this.add.rectangle(0, -28, 42, 5, 0x090a0e).setOrigin(0.5)
        .setStrokeStyle(1, 0x676d7c);
      const hpFill = this.add.rectangle(-20, -28, 40, 3, COLORS.ember).setOrigin(0, 0.5);
      const label = this.add.text(0, -42, `${monster.name}  #${monster.id}`, {
        color: "#f1d28b",
        fontFamily: "monospace",
        fontSize: "7px",
        backgroundColor: "#08090cdd",
        padding: { x: 3, y: 2 },
      }).setOrigin(0.5);
      container.add([...body, hpBack, hpFill, label]);
      this.entityLayer.add(container);
      this.monsterViews.set(monster.id, { container, hpFill, label });
    });
  }

  private createObjectiveBeacon(): void {
    const firstLesson = this.snapshot.roomGraph.nodes.find((node) => node.type === "tutorial");
    const firstMonster = this.snapshot.monsters.find(
      (monster) => monster.lessonId === firstLesson?.lessonId && monster.encounterType === "curriculum",
    );
    const actor = this.snapshot.worldActors.find((entry) => entry.monsterId === firstMonster?.id);
    if (!actor) {
      this.objectiveBeacon = null;
      return;
    }
    const pixel = gridToPixels(actor);
    const beacon = this.add.container(pixel.x, pixel.y - 58).setDepth(45);
    const diamond = this.add.rectangle(0, 0, 12, 12, COLORS.query, 0.9)
      .setAngle(45)
      .setStrokeStyle(2, COLORS.paper, 0.9);
    const label = this.add.text(0, -18, this.snapshot.floor === 2 ? "ORDER BY 信标" : "SELECT 信标", {
      color: this.snapshot.floor === 2 ? "#9eeeff" : "#91e3d1",
      fontFamily: "monospace",
      fontSize: "8px",
      fontStyle: "bold",
      backgroundColor: "#08090cee",
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5);
    beacon.add([diamond, label]);
    if (!this.reducedMotion) {
      this.tweens.add({
        targets: beacon,
        y: pixel.y - 66,
        yoyo: true,
        repeat: -1,
        duration: 520,
        ease: "Sine.inOut",
      });
    }
    this.objectiveBeacon = beacon;
  }

  private createMonsterBody(monster: Monster): Phaser.GameObjects.GameObject[] {
    if (monster.kind === "projection-slime") {
      return [
        this.add.rectangle(0, 5, 34, 22, 0x4f9a8f),
        this.add.rectangle(-9, -7, 18, 15, 0x70c4b3),
        this.add.rectangle(9, -8, 20, 16, 0x84d2be),
        this.add.rectangle(-6, 1, 4, 4, 0x10141b),
        this.add.rectangle(7, 0, 4, 4, 0x10141b),
      ];
    }
    if (monster.kind === "filter-hound") {
      return [
        this.add.rectangle(-2, 3, 38, 20, 0x9b6747),
        this.add.rectangle(16, -9, 18, 18, 0xc08b5f),
        this.add.rectangle(21, -9, 4, 4, COLORS.ember),
        this.add.rectangle(-13, 19, 5, 11, 0x6f4233),
        this.add.rectangle(12, 19, 5, 11, 0x6f4233),
      ];
    }
    if (monster.kind === "null-ghost") {
      return [
        this.add.rectangle(0, 2, 31, 29, COLORS.plum, 0.95),
        this.add.rectangle(-10, 21, 10, 10, COLORS.plum, 0.95),
        this.add.rectangle(10, 21, 10, 10, COLORS.plum, 0.95),
        this.add.rectangle(-7, -4, 5, 6, COLORS.paper),
        this.add.rectangle(7, -4, 5, 6, COLORS.paper),
      ];
    }
    if (monster.kind === "sort-drake") {
      return [
        this.add.rectangle(0, 3, 30, 22, 0x3f67a8).setStrokeStyle(3, 0x17275b),
        this.add.triangle(-27, 3, 0, 11, 18, 0, 18, 22, 0x5ad9df),
        this.add.triangle(27, 3, 0, 0, 18, 11, 0, 22, 0x5ad9df),
        this.add.rectangle(-7, -2, 4, 4, 0xdffcff),
        this.add.rectangle(7, -2, 4, 4, 0xdffcff),
        this.add.rectangle(0, 17, 18, 4, 0xd483ff),
      ];
    }
    if (monster.kind === "distinct-mimic") {
      return [
        this.add.rectangle(-10, 2, 25, 29, 0x6e4aa0).setStrokeStyle(3, 0x28184c),
        this.add.rectangle(10, -2, 25, 29, 0x465fc0).setStrokeStyle(3, 0x28184c),
        this.add.rectangle(-13, -4, 4, 4, 0xa8f8ff),
        this.add.rectangle(7, -8, 4, 4, 0xa8f8ff),
        this.add.rectangle(0, 17, 24, 4, 0x251638),
      ];
    }
    if (monster.kind === "join-spider") {
      return [
        this.add.rectangle(0, 3, 31, 26, 0x68449a).setStrokeStyle(3, 0x211545),
        this.add.rectangle(0, -13, 22, 15, 0x4c6cca),
        ...[-1, 1].flatMap((side) => [
          this.add.rectangle(side * 22, -6, 22, 4, 0x68e8ee).setAngle(side * 20),
          this.add.rectangle(side * 24, 8, 23, 4, 0x68e8ee).setAngle(side * -18),
          this.add.rectangle(side * 20, 20, 18, 4, 0x68e8ee).setAngle(side * -35),
        ]),
        this.add.rectangle(-6, -14, 4, 4, 0xffffff),
        this.add.rectangle(6, -14, 4, 4, 0xffffff),
      ];
    }
    if (monster.kind === "left-join-wraith") {
      return [
        this.add.rectangle(-7, 2, 27, 34, 0x7547a7, 0.94),
        this.add.rectangle(12, 6, 13, 27, 0x2b2d65, 0.7),
        this.add.rectangle(-14, 21, 10, 9, 0x7547a7, 0.94),
        this.add.rectangle(3, 21, 10, 9, 0x7547a7, 0.94),
        this.add.rectangle(-11, -5, 4, 5, 0xe4fbff),
        this.add.text(7, -10, "NULL", {
          color: "#68e8ee",
          fontFamily: "monospace",
          fontSize: "6px",
        }).setOrigin(0.5),
      ];
    }
    if (monster.kind === "relation-titan") {
      return [
        this.add.rectangle(0, 3, 51, 46, 0x303e88).setStrokeStyle(4, 0x17163f),
        this.add.rectangle(-20, -22, 20, 13, 0x8d51bf),
        this.add.rectangle(20, -22, 20, 13, 0x8d51bf),
        this.add.rectangle(-12, -5, 7, 7, 0x68e8ee),
        this.add.rectangle(12, -5, 7, 7, 0xd483ff),
        this.add.rectangle(0, 15, 29, 5, 0x151637),
        this.add.rectangle(-34, 4, 15, 5, 0x68e8ee),
        this.add.rectangle(34, 4, 15, 5, 0xd483ff),
      ];
    }
    return [
      this.add.rectangle(0, 2, monster.isBoss ? 49 : 41, monster.isBoss ? 45 : 39, 0x725a43)
        .setStrokeStyle(4, 0x392e29),
      this.add.rectangle(-9, -4, 5, 5, COLORS.ember),
      this.add.rectangle(9, -4, 5, 5, COLORS.ember),
      this.add.rectangle(0, 14, 20, 5, 0x392e29),
    ];
  }

  private syncViews(): void {
    if (this.renderedTopology !== this.snapshot.mazeFloor.topologyHash) return;
    if (!this.moveLocked && this.playerView) {
      const pixel = gridToPixels(this.snapshot.player);
      this.playerView.setPosition(pixel.x, pixel.y);
    }
    const discovered = new Set(this.snapshot.discoveredCells);
    const firstLesson = this.snapshot.roomGraph.nodes.find((node) => node.type === "tutorial")?.lessonId;
    this.objectiveBeacon?.setVisible(
      firstLesson !== undefined && !this.snapshot.completedLessons.includes(firstLesson),
    );
    this.monsterViews.forEach((view, monsterId) => {
      const actor = this.snapshot.worldActors.find((entry) => entry.monsterId === monsterId);
      const monster = this.snapshot.monsters.find((entry) => entry.id === monsterId);
      if (!actor || !monster) return;
      const pixel = gridToPixels(actor);
      if (!this.tweens.isTweening(view.container)) view.container.setPosition(pixel.x, pixel.y);
      view.hpFill.setScale(monster.hp / monster.maxHp, 1);
      view.label.setText(`${monster.name}  #${monster.id}`);
      view.container.setVisible(monster.hp > 0 && discovered.has(positionKey(actor)));
    });
    this.syncItemViews();
    this.syncGateViews();
    this.syncCampfireViews();
    this.drawFog();
  }

  private syncGateViews(): void {
    const colors = this.snapshot.floor === 2 ? FLOOR_TWO_COLORS : COLORS;
    this.snapshot.mazeFloor.gates.forEach((gate) => {
      const view = this.gateViews.get(gate.id);
      if (!view) return;
      const missing = gate.requires.filter(
        (lesson) => !this.snapshot.completedLessons.includes(lesson),
      );
      const open = this.snapshot.availableRoomIds.includes(gate.roomNodeId);
      const challengeGate = gate.id === this.snapshot.challengeGateId;
      view.block.setFillStyle(
        open ? colors.query : challengeGate ? colors.plum : colors.ember,
        open ? 0.24 : 0.78,
      );
      view.block.setStrokeStyle(2, open ? colors.query : colors.gold, 0.82);
      view.label.setText(open
        ? ""
        : challengeGate
          ? "E · QUERY BREACH"
        : missing.length > 0
          ? missing.map((lesson) => lesson.toUpperCase()).join(" + ")
          : "需要聚合战锤");
      view.block.setVisible(this.snapshot.discoveredCells.includes(positionKey(gate)));
      view.label.setVisible(view.block.visible && !open);
    });
  }

  private syncItemViews(): void {
    const currentIds = new Set(this.snapshot.groundItems.map((item) => item.id));
    this.itemViews.forEach((view, id) => {
      if (currentIds.has(id)) return;
      view.tween?.destroy();
      view.container.destroy(true);
      this.itemViews.delete(id);
    });
    this.snapshot.groundItems.forEach((item) => {
      let view = this.itemViews.get(item.id);
      if (!view) {
        const pixel = gridToPixels(item);
        const container = this.add.container(pixel.x, pixel.y).setDepth(24);
        const sourceRoom = this.snapshot.roomGraph.nodes.find(
          (room) => room.id === item.sourceRoomId,
        );
        const isChest = item.collection === "interact" && (
          item.id.startsWith("lesson-drop:") || sourceRoom?.type === "treasure"
        );
        const parts: Phaser.GameObjects.GameObject[] = [];
        if (isChest) {
          parts.push(
            this.add.rectangle(0, 3, 24, 14, 0x8f6338)
              .setStrokeStyle(2, COLORS.gold),
            this.add.rectangle(0, -6, 24, 8, 0xb88745)
              .setStrokeStyle(2, COLORS.paper),
            this.add.rectangle(0, 1, 5, 7, COLORS.gold)
              .setStrokeStyle(1, COLORS.paper),
          );
        } else {
          const color = item.kind === "weapon"
            ? COLORS.gold
            : item.kind === "heal"
              ? COLORS.query
              : item.kind === "key"
                ? COLORS.ember
                : COLORS.plum;
          parts.push(
            this.add.rectangle(0, 0, 13, 13, color, 0.95)
              .setAngle(45)
              .setStrokeStyle(2, COLORS.paper),
            this.add.rectangle(0, 0, 5, 5, COLORS.paper),
          );
        }
        const label = this.add.text(0, -24, isChest ? "E · 战利品宝箱" : item.name, {
          color: "#f1d28b",
          fontFamily: "monospace",
          fontSize: "7px",
          backgroundColor: "#08090cdd",
          padding: { x: 3, y: 2 },
        }).setOrigin(0.5);
        parts.push(label);
        container.add(parts);
        this.entityLayer.add(container);
        const tween = this.reducedMotion
          ? undefined
          : this.tweens.add({
              targets: container,
              y: pixel.y - 4,
              yoyo: true,
              repeat: -1,
              duration: 620,
              ease: "Sine.inOut",
            });
        view = { container, tween };
        this.itemViews.set(item.id, view);
      }
      view.container.setVisible(this.snapshot.discoveredCells.includes(positionKey(item)));
    });
  }

  private drawFog(): void {
    this.fog.clear();
    const discovered = new Set(this.snapshot.discoveredCells);
    const floor = this.snapshot.mazeFloor;
    this.fog.fillStyle(this.snapshot.floor === 2 ? FLOOR_TWO_COLORS.fog : COLORS.fog, 0.94);
    for (let y = 0; y < floor.height; y += 1) {
      for (let x = 0; x < floor.width; x += 1) {
        if (discovered.has(`${x}:${y}`)) continue;
        this.fog.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private tryMove(dx: number, dy: number): void {
    if (this.moveLocked || this.snapshot.mode !== "explore") return;
    this.moveLocked = true;
    let resolution: MoveResolution;
    try {
      resolution = this.session.attemptPlayerMove(dx, dy);
    } catch (error) {
      this.moveLocked = false;
      throw error;
    }
    if (!resolution.ok) {
      this.moveLocked = false;
      if (resolution.blockedBy === "wall" || resolution.blockedBy === "gate") {
        this.feedback.dispatch({ type: "wall-bump", message: resolution.message });
        this.bumpPlayer(dx, dy);
      }
      return;
    }
    if (resolution.encounterId !== null) {
      this.moveLocked = false;
      return;
    }
    if (!resolution.moved) {
      this.moveLocked = false;
      return;
    }
    this.feedback.dispatch({ type: "player-step" });
    emitMilestone("player-step");

    const pixel = gridToPixels(resolution.to);
    const finish = (): void => {
      if (!this.moveLocked) return;
      this.playerView.setPosition(pixel.x, pixel.y);
      this.moveLocked = false;
    };
    if (this.reducedMotion) {
      finish();
    } else {
      this.tweens.add({
        targets: this.playerView,
        x: pixel.x,
        y: pixel.y,
        duration: 92,
        ease: "Quart.out",
        onComplete: finish,
        onStop: finish,
      });
    }
  }

  private bumpPlayer(dx: number, dy: number): void {
    if (this.reducedMotion || this.moveLocked) return;
    this.moveLocked = true;
    const originX = this.playerView.x;
    const originY = this.playerView.y;
    this.tweens.add({
      targets: this.playerView,
      x: originX + dx * 5,
      y: originY + dy * 5,
      yoyo: true,
      duration: 45,
      onComplete: () => {
        this.playerView.setPosition(originX, originY);
        this.moveLocked = false;
      },
      onStop: () => {
        this.playerView.setPosition(originX, originY);
        this.moveLocked = false;
      },
    });
  }

  private resetPlayerMovement(): void {
    this.pressedDirections.clear();
    this.nextHeldMoveAt = 0;
    if (this.playerView) {
      this.tweens.killTweensOf(this.playerView);
      const pixel = gridToPixels(this.snapshot.player);
      this.playerView.setPosition(pixel.x, pixel.y);
    }
    this.moveLocked = false;
  }

  private advancePatrols(): void {
    if (
      this.moveLocked ||
      this.snapshot.mode !== "explore" ||
      this.pagePaused ||
      !this.scene.isActive()
    ) return;
    const result = this.session.advanceMonsterPatrols();
    result.moves.forEach((move) => {
      const actor = this.snapshot.worldActors.find((entry) => entry.monsterId === move.monsterId);
      if (actor) {
        actor.x = move.to.x;
        actor.y = move.to.y;
        actor.moveTick += 1;
      }
      if (!move.moved) return;
      const view = this.monsterViews.get(move.monsterId);
      if (!view) return;
      const pixel = gridToPixels(move.to);
      if (this.reducedMotion) {
        view.container.setPosition(pixel.x, pixel.y);
      } else {
        this.tweens.add({
          targets: view.container,
          x: pixel.x,
          y: pixel.y,
          duration: 430,
          ease: "Quart.out",
        });
      }
    });
    if (result.moves.length > 0) {
      window.dispatchEvent(new CustomEvent("dungeon:patrol", {
        detail: { moves: result.moves },
      }));
    }
  }

  private beginBattle(): void {
    if (this.battleTransitioning || !this.scene.isActive()) return;
    this.battleTransitioning = true;
    this.pressedDirections.clear();
    this.moveLocked = false;
    this.scene.launch("BattleScene");
    if (this.sys.isActive()) this.scene.sleep();
  }

  private playPickupFeedback(item: GroundItem, message: string): void {
    this.feedback.dispatch({
      type: "item-pickup",
      itemName: item.name,
      kind: item.kind,
      message,
    });
    emitMilestone("item-pickup");
  }
}
