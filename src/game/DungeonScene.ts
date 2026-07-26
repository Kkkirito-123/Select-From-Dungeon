import Phaser from "phaser";
import { TILE_SIZE } from "../content/mvpLevel";
import { playerActorProfile } from "../content/actorVisuals";
import {
  floorMapBlueprint,
  floorTransitPresentation,
  type FloorTransitKind,
} from "../content/floorMapBlueprints";
import {
  mazeZoneAt,
  type MazeDecorationKind,
  type MazeZone,
} from "../domain/mazeGenerator";
import { safeZoneCellKeys } from "../domain/campfire";
import { biomeRegionAt } from "../domain/biome";
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
import {
  createMonsterActorParts,
  createPlayerActor,
} from "./PixelActorFactory";
import { monsterIdentityPresentation } from "../domain/monsterIdentity";
import { newlyOpenedGate, pickedItemsBetween } from "./snapshotFeedback";
import {
  INTERACTION_LABEL_DISTANCE,
  MONSTER_LABEL_DISTANCE,
  isNearPlayer,
  shouldShowTutorialBeacon,
  tutorialObjective,
} from "./worldOverlay";
import { FloorSetpieceLayer } from "./FloorSetpieceLayer";
import {
  floorArtReady,
  queueFloorArtAssets,
  supportsFloorArt,
} from "./floorArtAssets";

interface MonsterView {
  container: Phaser.GameObjects.Container;
  hpBack: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface ItemView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  position: Position;
  tween?: Phaser.Tweens.Tween;
}

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

interface ZoneLabelView {
  label: Phaser.GameObjects.Text;
  roomNodeId: string;
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

const FLOOR_THREE_COLORS = {
  void: 0x080706,
  wall: 0x35302b,
  wallTop: 0x726657,
  floor: 0x25211f,
  floorAlt: 0x302925,
  line: 0x13100f,
  query: 0xa8d7c2,
  gold: 0xd5ba78,
  ember: 0x9c5149,
  paper: 0xeee6d1,
  plum: 0x785c83,
  fog: 0x050403,
} as const;

const FLOOR_THREE_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x2b2924,
  tutorial: 0x293630,
  lesson: 0x322d35,
  rest: 0x3b2921,
  treasure: 0x38321f,
  event: 0x2e2835,
  elite: 0x44331f,
  boss: 0x421f25,
};

const FLOOR_FOUR_COLORS = {
  void: 0x09060a,
  wall: 0x37233b,
  wallTop: 0x8a5c84,
  floor: 0x291a2d,
  floorAlt: 0x332039,
  line: 0x160d19,
  query: 0x7ce4ed,
  gold: 0xffc65c,
  ember: 0xef604e,
  paper: 0xfff1d8,
  plum: 0x9b57bb,
  fog: 0x050207,
} as const;

const FLOOR_FOUR_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x2e2137,
  tutorial: 0x233b45,
  lesson: 0x3a2348,
  rest: 0x43241d,
  treasure: 0x493b20,
  event: 0x2b2a4d,
  elite: 0x552923,
  boss: 0x571c27,
};

const FLOOR_FIVE_COLORS = {
  void: 0x05080b,
  wall: 0x222b32,
  wallTop: 0x687681,
  floor: 0x161d22,
  floorAlt: 0x1e272d,
  line: 0x0b1115,
  query: 0x82d5c8,
  gold: 0xe0ae4b,
  ember: 0xb94d42,
  paper: 0xe9e4d6,
  plum: 0x735b82,
  fog: 0x020405,
} as const;

const FLOOR_FIVE_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x22292b,
  tutorial: 0x213538,
  lesson: 0x2b3035,
  rest: 0x332820,
  treasure: 0x37321e,
  event: 0x282936,
  elite: 0x40311f,
  boss: 0x421d1b,
};

const FLOOR_SIX_COLORS = {
  void: 0x0b0303,
  wall: 0x352421,
  wallTop: 0x8a5a43,
  floor: 0x241512,
  floorAlt: 0x311b16,
  line: 0x160a08,
  query: 0x6ce0d5,
  gold: 0xf0bd55,
  ember: 0xf15a3f,
  paper: 0xffead2,
  plum: 0x8b4f86,
  fog: 0x050101,
} as const;

const FLOOR_SIX_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x31211b,
  tutorial: 0x22403c,
  lesson: 0x3d241e,
  rest: 0x43271c,
  treasure: 0x49361f,
  event: 0x382237,
  elite: 0x52251c,
  boss: 0x5d1815,
};

const FLOOR_SEVEN_COLORS = {
  void: 0x030909,
  wall: 0x163a35,
  wallTop: 0x58b9a8,
  floor: 0x102824,
  floorAlt: 0x173832,
  line: 0x071512,
  query: 0x8ff5df,
  gold: 0xd8ef8a,
  ember: 0x62d7bb,
  paper: 0xeafff8,
  plum: 0x6e82b9,
  fog: 0x010504,
} as const;

const FLOOR_SEVEN_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x173c36,
  tutorial: 0x174a40,
  lesson: 0x203f3b,
  rest: 0x354126,
  treasure: 0x3d4622,
  event: 0x21394a,
  elite: 0x34522e,
  boss: 0x1b593f,
};

const FLOOR_EIGHT_COLORS = {
  void: 0x020205,
  wall: 0x171522,
  wallTop: 0x5f5874,
  floor: 0x0e0d15,
  floorAlt: 0x171522,
  line: 0x050409,
  query: 0x82ded0,
  gold: 0xf0c75e,
  ember: 0xb8424f,
  paper: 0xf7edd2,
  plum: 0x704d8c,
  fog: 0x010102,
} as const;

const FLOOR_EIGHT_ZONE_COLORS: Record<MazeZone["type"], number> = {
  entry: 0x191721,
  tutorial: 0x17302f,
  lesson: 0x211a2a,
  rest: 0x302019,
  treasure: 0x352d18,
  event: 0x241b31,
  elite: 0x3c2b1b,
  boss: 0x43141d,
};

const BIOME_COLORS = {
  drainage: { floor: 0x203138, wall: 0x364a50, accent: 0x6d9da5 },
  "slime-pool": { floor: 0x21372f, wall: 0x344b3d, accent: 0x70c489 },
  "ember-cellar": { floor: 0x3a2922, wall: 0x56352a, accent: 0xd78a4b },
  lake: { floor: 0x173b52, wall: 0x244e62, accent: 0x66c9e8 },
  swamp: { floor: 0x303b27, wall: 0x475136, accent: 0x91ad57 },
  forest: { floor: 0x17352b, wall: 0x284b39, accent: 0x62bd78 },
  "bone-yard": { floor: 0x36312a, wall: 0x51493d, accent: 0xd8c89f },
  "grave-mire": { floor: 0x2f3429, wall: 0x465044, accent: 0x9ab18b },
  "spirit-crypt": { floor: 0x2d243d, wall: 0x493759, accent: 0xb88ad6 },
  "fire-forge": { floor: 0x4a211c, wall: 0x682d24, accent: 0xff8c51 },
  "frost-vault": { floor: 0x18384b, wall: 0x28556b, accent: 0x8cdef4 },
  "storm-core": { floor: 0x282451, wall: 0x403a72, accent: 0xc58df4 },
  "iron-yard": { floor: 0x202a2d, wall: 0x38464b, accent: 0x94b9bd },
  barracks: { floor: 0x352b22, wall: 0x504136, accent: 0xd39d5e },
  "black-citadel": { floor: 0x28282c, wall: 0x434248, accent: 0xd5b65b },
  "magma-nest": { floor: 0x482018, wall: 0x682d21, accent: 0xff7749 },
  "crystal-cavern": { floor: 0x263046, wall: 0x3f4d68, accent: 0x75dfdc },
  "dragon-throne": { floor: 0x3d171b, wall: 0x5a252b, accent: 0xf0b955 },
  "crystal-grove": { floor: 0x173c35, wall: 0x27584e, accent: 0x8debd3 },
  "root-maze": { floor: 0x28392c, wall: 0x3d5941, accent: 0xa6cf79 },
  "index-heart": { floor: 0x173c3d, wall: 0x28595d, accent: 0xa9f1df },
  "obsidian-hall": { floor: 0x17151e, wall: 0x2a2736, accent: 0x8c829f },
  "void-court": { floor: 0x21162b, wall: 0x382043, accent: 0xa96fc6 },
  "data-throne": { floor: 0x2c2017, wall: 0x4c3820, accent: 0xf0c75e },
} as const;

function colorsForFloor(floor: GameSnapshot["floor"]) {
  if (floor === 2) return FLOOR_TWO_COLORS;
  if (floor === 3) return FLOOR_THREE_COLORS;
  if (floor === 4) return FLOOR_FOUR_COLORS;
  if (floor === 5) return FLOOR_FIVE_COLORS;
  if (floor === 6) return FLOOR_SIX_COLORS;
  if (floor === 7) return FLOOR_SEVEN_COLORS;
  if (floor === 8) return FLOOR_EIGHT_COLORS;
  return COLORS;
}

function zoneColorsForFloor(floor: GameSnapshot["floor"]): Record<MazeZone["type"], number> {
  if (floor === 2) return FLOOR_TWO_ZONE_COLORS;
  if (floor === 3) return FLOOR_THREE_ZONE_COLORS;
  if (floor === 4) return FLOOR_FOUR_ZONE_COLORS;
  if (floor === 5) return FLOOR_FIVE_ZONE_COLORS;
  if (floor === 6) return FLOOR_SIX_ZONE_COLORS;
  if (floor === 7) return FLOOR_SEVEN_ZONE_COLORS;
  if (floor === 8) return FLOOR_EIGHT_ZONE_COLORS;
  return ZONE_COLORS;
}

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

function mixColor(left: number, right: number, ratio: number): number {
  const mix = (shift: number) => Math.round(
    ((left >> shift) & 0xff) * (1 - ratio) +
    ((right >> shift) & 0xff) * ratio,
  );
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
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
  private setpieceLayer: FloorSetpieceLayer | null = null;
  private objectiveBeacon: Phaser.GameObjects.Container | null = null;
  private readonly monsterViews = new Map<number, MonsterView>();
  private readonly itemViews = new Map<string, ItemView>();
  private readonly gateViews = new Map<string, GateView>();
  private readonly shortcutViews = new Map<string, GateView[]>();
  private readonly campfireViews = new Map<string, CampfireView>();
  private readonly zoneLabelViews: ZoneLabelView[] = [];
  private readonly pressedDirections = new Map<string, Position>();
  private renderedTopology = -1;
  private moveLocked = false;
  private nextHeldMoveAt = 0;
  private battleTransitioning = false;
  private pagePaused = false;
  private patrolTimer: Phaser.Time.TimerEvent | null = null;
  private pendingArtFloor: GameSnapshot["floor"] | null = null;
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

  private readonly wakeHandler = (): void => {
    this.battleTransitioning = false;
    this.resetPlayerMovement();
    this.snapshot = this.session.snapshot();
    this.syncViews();
    this.cameras.main.startFollow(this.playerView, true, 0.18, 0.18);
  };

  private canAcceptGameplayInput(event?: KeyboardEvent): boolean {
    const narrativeOpen = document
      .querySelector("#app")
      ?.classList.contains("narrative-active") ?? false;
    if (
      !this.scene.isActive() ||
      this.snapshot.mode !== "explore" ||
      this.battleTransitioning ||
      this.pagePaused ||
      narrativeOpen
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

  preload(): void {
    queueFloorArtAssets(this, this.snapshot.floor);
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
    this.events.on(Phaser.Scenes.Events.WAKE, this.wakeHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  update(time: number): void {
    if (
      time < this.nextHeldMoveAt ||
      this.moveLocked ||
      !this.canAcceptGameplayInput() ||
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
    this.events.off(Phaser.Scenes.Events.WAKE, this.wakeHandler);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.patrolTimer?.destroy();
    this.patrolTimer = null;
    this.setpieceLayer?.destroy();
    this.setpieceLayer = null;
    this.clearCampfireViews();
    this.pressedDirections.clear();
  }

  private receiveSnapshot(snapshot: GameSnapshot): void {
    const previous = this.snapshot;
    this.snapshot = snapshot;
    if (previous.floor !== snapshot.floor) {
      this.ensureFloorArt(snapshot.floor);
    }
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
        const identity = monsterIdentityPresentation(
          monster,
          snapshot.profile.discoveredMonsterIds,
        );
        this.feedback.dispatch({
          type: "encounter-start",
          monsterName: identity.nameLabel,
        });
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
    const shortcutKey = snapshot.guidedMap.shortcuts.find((shortcut) => (
      !previous.keyItems.includes(shortcut.keyId) &&
      snapshot.keyItems.includes(shortcut.keyId)
    ));
    if (shortcutKey) {
      this.feedback.dispatch({
        type: "item-pickup",
        itemName: "捷径钥匙",
        kind: "key",
        message: snapshot.banner,
      });
      emitMilestone("item-pickup");
    }
    const openedGuidedId = snapshot.openedGateIds.find(
      (id) => !previous.openedGateIds.includes(id),
    );
    const openedShortcut = snapshot.guidedMap.shortcuts.find(
      (shortcut) => shortcut.id === openedGuidedId,
    );
    if (openedShortcut) {
      this.feedback.dispatch({
        type: "gate-open",
        message: `${openedShortcut.name}已永久开启。`,
      });
    }
    const openedCache = snapshot.guidedMap.deadEndCaches.find(
      (cache) => cache.id === openedGuidedId,
    );
    if (openedCache) {
      this.feedback.dispatch({
        type: "item-pickup",
        itemName: "死路补给",
        kind: "event",
        message: snapshot.banner,
      });
      emitMilestone("item-pickup");
    }
    pickedItemsBetween(previous, snapshot)
      .forEach((item) => this.playPickupFeedback(item, snapshot.banner));
  }

  private ensureFloorArt(floor: GameSnapshot["floor"]): void {
    if (
      !supportsFloorArt(floor) ||
      floorArtReady(this, floor) ||
      this.pendingArtFloor === floor
    ) return;
    const queued = queueFloorArtAssets(this, floor);
    if (!queued) return;
    this.pendingArtFloor = floor;
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.pendingArtFloor = null;
      if (!this.scene.isActive() || this.snapshot.floor !== floor) return;
      this.rebuildWorld();
    });
    if (!this.load.isLoading()) this.load.start();
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
    this.setpieceLayer?.destroy();
    this.entityLayer?.removeAll(true);
    this.setpieceLayer = new FloorSetpieceLayer(
      this,
      this.entityLayer,
      this.reducedMotion,
    );
    this.monsterViews.clear();
    this.itemViews.forEach((view) => view.tween?.destroy());
    this.itemViews.clear();
    this.gateViews.clear();
    this.shortcutViews.clear();
    this.zoneLabelViews.length = 0;

    const floor = this.snapshot.mazeFloor;
    const worldWidth = floor.width * TILE_SIZE;
    const worldHeight = floor.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.drawTerrain();
    this.drawDecorations();
    this.setpieceLayer.build(this.snapshot);
    this.drawZoneLabels();
    this.createGates();
    this.createShortcutViews();
    this.createCampfireViews();
    this.createPlayer();
    this.createMonsterViews();
    this.createObjectiveBeacon();
    this.syncViews();
    this.cameras.main.startFollow(this.playerView, true, 0.18, 0.18);
    this.cameras.main.centerOn(this.playerView.x, this.playerView.y);
  }

  private drawTerrain(): void {
    const floor = this.snapshot.mazeFloor;
    const colors = colorsForFloor(this.snapshot.floor);
    const zoneColors = zoneColorsForFloor(this.snapshot.floor);
    this.cameras.main.setBackgroundColor(colors.void);
    for (let y = 0; y < floor.height; y += 1) {
      for (let x = 0; x < floor.width; x += 1) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const tile = floor.tiles[y][x];
        const biome = biomeRegionAt(this.snapshot.biomePlan, { x, y });
        const biomeColors = BIOME_COLORS[biome.kind];
        if (tile === "#") {
          this.terrain.fillStyle(mixColor(colors.wall, biomeColors.wall, 0.56), 1);
          this.terrain.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.terrain.fillStyle(mixColor(colors.wallTop, biomeColors.accent, 0.36), 0.52);
          this.terrain.fillRect(px + 2, py + 2, TILE_SIZE - 4, 4);
        } else {
          const zone = mazeZoneAt(floor, { x, y });
          const baseColor = zone
            ? zoneColors[zone.type]
            : (x + y) % 2 === 0 ? colors.floor : colors.floorAlt;
          const color = mixColor(baseColor, biomeColors.floor, zone ? 0.38 : 0.72);
          this.terrain.fillStyle(color, 1);
          this.terrain.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.terrain.lineStyle(1, colors.line, 0.48);
          this.terrain.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
          if (this.snapshot.floor > 1 && (x + y) % 3 === 0) {
            this.terrain.lineStyle(1, colors.query, 0.2);
            this.terrain.lineBetween(px + 5, py + TILE_SIZE / 2, px + TILE_SIZE - 5, py + TILE_SIZE / 2);
          }
        }
      }
    }

    this.terrain.lineStyle(1, colors.query, this.snapshot.floor > 1 ? 0.2 : 0.08);
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
    const colors = colorsForFloor(this.snapshot.floor);
    safeZoneCellKeys(this.snapshot.mazeFloor, this.snapshot.campfires)
      .forEach((cell) => {
        const [x, y] = cell.split(":").map(Number);
        if (!Number.isInteger(x) || !Number.isInteger(y)) return;
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        this.terrain.fillStyle(
          colors.query,
          this.snapshot.floor > 1 ? 0.1 : 0.075,
        );
        this.terrain.fillRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        this.terrain.lineStyle(1, colors.query, 0.14);
        this.terrain.strokeRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);
      });
  }

  private drawDecorations(): void {
    const colors = colorsForFloor(this.snapshot.floor);
    this.snapshot.mazeFloor.decorations.forEach((decoration) => {
      const pixel = gridToPixels(decoration);
      const color: Record<MazeDecorationKind, number> = {
        torch: colors.gold,
        rubble: colors.wallTop,
        rune: colors.query,
      };
      const size = decoration.kind === "torch" ? 5 : decoration.kind === "rune" ? 8 : 7;
      const marker = this.add.rectangle(pixel.x, pixel.y, size, size, color[decoration.kind], 0.7);
      if (decoration.kind === "rune") marker.setAngle(45);
      this.entityLayer.add(marker);
    });
    this.snapshot.guidedMap.routeMarkers.forEach((routeMarker) => {
      const pixel = gridToPixels(routeMarker);
      const marker = this.add.polygon(
        pixel.x,
        pixel.y,
        [0, -8, 7, 0, 0, 8, -7, 0],
        colors.query,
        0.26,
      ).setStrokeStyle(1, colors.query, 0.78);
      marker.setData("cell", positionKey(routeMarker));
      this.entityLayer.add(marker);
    });
    this.snapshot.biomePlan.features.forEach((feature) => {
      const pixel = gridToPixels(feature);
      const parts: Phaser.GameObjects.GameObject[] = [];
      if (feature.kind === "water") {
        parts.push(
          this.add.ellipse(pixel.x, pixel.y + 3, 22, 10, 0x4b9fbe, 0.7)
            .setStrokeStyle(1, 0x8bd9eb, 0.72),
          this.add.rectangle(pixel.x + 2, pixel.y, 10, 2, 0xb5eff7, 0.55),
        );
      } else if (feature.kind === "reeds") {
        parts.push(
          this.add.rectangle(pixel.x - 5, pixel.y + 2, 3, 15, 0x718d43).setAngle(-14),
          this.add.rectangle(pixel.x + 2, pixel.y, 3, 18, 0x92ad58).setAngle(9),
          this.add.rectangle(pixel.x + 7, pixel.y + 3, 3, 13, 0x5b7739).setAngle(18),
        );
      } else if (feature.kind === "tree") {
        parts.push(
          this.add.rectangle(pixel.x, pixel.y + 6, 5, 14, 0x765035),
          this.add.rectangle(pixel.x - 6, pixel.y - 2, 13, 13, 0x356a43),
          this.add.rectangle(pixel.x + 6, pixel.y - 4, 15, 14, 0x468351),
        );
      } else if (feature.kind === "slime") {
        parts.push(
          this.add.ellipse(pixel.x, pixel.y + 4, 19, 10, 0x5ead75, 0.72)
            .setStrokeStyle(1, 0x8cdda0, 0.7),
          this.add.rectangle(pixel.x + 3, pixel.y + 1, 4, 3, 0xd5f2c9, 0.72),
        );
      } else if (feature.kind === "ember") {
        parts.push(
          this.add.rectangle(pixel.x, pixel.y + 4, 13, 4, 0x6a4932),
          this.add.triangle(pixel.x, pixel.y - 4, -5, 8, 0, -7, 5, 8, 0xd87b3f, 0.82),
        );
      } else if (feature.kind === "bones") {
        parts.push(
          this.add.rectangle(pixel.x - 4, pixel.y, 16, 4, 0xd7ccb0).setAngle(32),
          this.add.rectangle(pixel.x + 5, pixel.y + 1, 14, 4, 0xbcae91).setAngle(-38),
        );
      } else if (feature.kind === "grave") {
        parts.push(
          this.add.rectangle(pixel.x, pixel.y + 2, 13, 20, 0x655f58)
            .setStrokeStyle(1, 0xa39b8c),
          this.add.rectangle(pixel.x, pixel.y - 8, 8, 3, 0x918879),
        );
      } else if (feature.kind === "ghost-flame") {
        parts.push(
          this.add.ellipse(pixel.x, pixel.y + 3, 15, 9, 0x7250a1, 0.54),
          this.add.triangle(pixel.x, pixel.y - 4, -6, 8, 0, -9, 6, 8, 0xb985dc, 0.85),
        );
      } else if (feature.kind === "lava") {
        parts.push(
          this.add.rectangle(pixel.x, pixel.y + 2, 22, 8, 0x9d3124, 0.86)
            .setStrokeStyle(1, 0xff7a3d),
          this.add.rectangle(pixel.x + 4, pixel.y, 8, 2, 0xffc15b, 0.88),
        );
      } else if (feature.kind === "ice") {
        parts.push(
          this.add.polygon(
            pixel.x,
            pixel.y,
            [0, -12, 8, -2, 5, 11, -6, 9, -9, -2],
            0x75cbe8,
            0.72,
          ).setStrokeStyle(1, 0xc7f3ff),
        );
      } else if (feature.kind === "crystal") {
        parts.push(
          this.add.triangle(pixel.x - 4, pixel.y, -5, 9, 0, -12, 5, 9, 0x9d78dc, 0.9),
          this.add.triangle(pixel.x + 5, pixel.y + 3, -4, 7, 0, -8, 4, 7, 0x6fdbe6, 0.86),
        );
      } else if (feature.kind === "iron") {
        parts.push(
          this.add.rectangle(pixel.x - 4, pixel.y, 18, 5, 0x85939a).setAngle(36),
          this.add.rectangle(pixel.x + 4, pixel.y, 18, 5, 0x59656b).setAngle(-36),
          this.add.rectangle(pixel.x, pixel.y + 7, 14, 3, 0xd0a94d),
        );
      } else if (feature.kind === "banner") {
        parts.push(
          this.add.rectangle(pixel.x - 6, pixel.y, 3, 25, 0xa7a08e),
          this.add.rectangle(pixel.x + 3, pixel.y - 6, 15, 13, 0x99453d)
            .setStrokeStyle(1, 0xd5aa52),
        );
      } else if (feature.kind === "battlement") {
        parts.push(
          this.add.rectangle(pixel.x, pixel.y + 4, 24, 14, 0x4d5559)
            .setStrokeStyle(1, 0x899397),
          this.add.rectangle(pixel.x - 8, pixel.y - 5, 6, 8, 0x697378),
          this.add.rectangle(pixel.x + 8, pixel.y - 5, 6, 8, 0x697378),
        );
      } else if (feature.kind === "egg") {
        parts.push(
          this.add.ellipse(pixel.x, pixel.y + 2, 16, 23, 0xc8b58b)
            .setStrokeStyle(2, 0xe96845),
          this.add.rectangle(pixel.x + 3, pixel.y - 2, 4, 6, 0x754b47, 0.76),
        );
      } else if (feature.kind === "magma") {
        parts.push(
          this.add.ellipse(pixel.x, pixel.y + 3, 25, 12, 0xa93424, 0.88)
            .setStrokeStyle(1, 0xff7b40),
          this.add.rectangle(pixel.x - 3, pixel.y + 1, 11, 2, 0xffc257, 0.92),
        );
      } else if (feature.kind === "dragon-bone") {
        parts.push(
          this.add.rectangle(pixel.x, pixel.y + 3, 24, 4, 0xd9c7a2).setAngle(-18),
          this.add.triangle(pixel.x - 11, pixel.y - 2, -5, 6, 0, -7, 5, 6, 0xbda782),
          this.add.triangle(pixel.x + 11, pixel.y + 3, -4, 5, 0, -6, 4, 5, 0xbda782),
        );
      } else if (feature.kind === "crystal-tree") {
        parts.push(
          this.add.rectangle(pixel.x, pixel.y + 6, 4, 15, 0x47745f),
          this.add.triangle(pixel.x - 5, pixel.y - 3, -6, 8, 0, -11, 6, 8, 0x74d7c1, 0.88),
          this.add.triangle(pixel.x + 5, pixel.y, -5, 7, 0, -9, 5, 7, 0xa5f0dd, 0.82),
        );
      } else if (feature.kind === "root") {
        parts.push(
          this.add.rectangle(pixel.x - 5, pixel.y, 18, 4, 0x7b6943).setAngle(28),
          this.add.rectangle(pixel.x + 5, pixel.y + 2, 18, 4, 0x5e5738).setAngle(-31),
        );
      } else if (feature.kind === "index-rune") {
        parts.push(
          this.add.polygon(pixel.x, pixel.y, [0, -10, 9, 0, 0, 10, -9, 0], 0x5fcdbb, 0.55)
            .setStrokeStyle(2, 0xb7f4e6),
          this.add.rectangle(pixel.x, pixel.y, 3, 13, 0xe5d76d, 0.85),
        );
      } else if (feature.kind === "obsidian") {
        parts.push(
          this.add.polygon(pixel.x, pixel.y, [0, -11, 8, -4, 7, 9, -7, 9, -9, -3], 0x272334)
            .setStrokeStyle(1, 0x817691),
        );
      } else if (feature.kind === "void-flame") {
        parts.push(
          this.add.ellipse(pixel.x, pixel.y + 4, 14, 8, 0x42205f, 0.55),
          this.add.triangle(pixel.x, pixel.y - 4, -6, 8, 0, -10, 6, 8, 0x9b55be, 0.86),
        );
      } else if (feature.kind === "gold-throne") {
        parts.push(
          this.add.rectangle(pixel.x, pixel.y + 4, 19, 12, 0x4b3521)
            .setStrokeStyle(2, 0xd9b84f),
          this.add.rectangle(pixel.x, pixel.y - 5, 15, 9, 0x71512a),
        );
      } else {
        parts.push(
          this.add.rectangle(pixel.x, pixel.y, 18, 8, 0x385563, 0.56)
            .setStrokeStyle(1, 0x6b909c, 0.65),
          this.add.rectangle(pixel.x, pixel.y, 3, 8, 0x101820, 0.8),
        );
      }
      parts.forEach((part) => {
        part.setData("cell", positionKey(feature));
        this.entityLayer.add(part);
      });
    });
  }

  private drawZoneLabels(): void {
    this.snapshot.mazeFloor.zones.forEach((zone) => {
      const room = this.snapshot.roomGraph.nodes.find((node) => node.id === zone.roomNodeId);
      const pixel = gridToPixels({ x: zone.x + 0.35, y: zone.y + 0.35 });
      const label = this.add.text(pixel.x, pixel.y, room?.title ?? "未知区域", {
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

  private syncZoneLabels(): void {
    this.zoneLabelViews.forEach((view) => {
      view.label.setVisible(view.roomNodeId === this.snapshot.currentRoomId);
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

  private createShortcutViews(): void {
    const colors = colorsForFloor(this.snapshot.floor);
    this.snapshot.guidedMap.shortcuts.forEach((shortcut) => {
      const views = [shortcut.entry, shortcut.exit].map((position, index) => {
        const pixel = gridToPixels(position);
        const isPrimaryFloodgate = this.snapshot.floor === 1 && index === 0;
        const block = this.add.rectangle(
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
              this.add.rectangle(
                pixel.x + offset,
                pixel.y,
                3,
                TILE_SIZE - 5,
                0xa7b5b8,
              ).setDepth(19),
            );
          });
          parts.push(
            this.add.rectangle(
              pixel.x,
              pixel.y + 12,
              TILE_SIZE - 7,
              5,
              0x3a91ad,
              0.78,
            ).setDepth(19),
          );
        }
        const label = this.add.text(
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

  private createCampfireViews(): void {
    this.snapshot.campfires.forEach((campfire) => {
      const pixel = gridToPixels(campfire);
      const colors = colorsForFloor(this.snapshot.floor);
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
    this.setpieceLayer?.sync(this.snapshot);
  }

  private syncCampfireViews(): void {
    const discovered = new Set(this.snapshot.discoveredCells);
    this.snapshot.campfires.forEach((campfire) => {
      const view = this.campfireViews.get(campfire.id);
      if (!view) return;
      const checkpoint = this.snapshot.respawnCampfireId === campfire.id;
      const visible = discovered.has(positionKey(campfire));
      view.container.setVisible(visible);
      view.checkpointRing.setVisible(checkpoint);
      view.label.setText(checkpoint ? "复活点 · 篝火" : "E · 篝火");
      view.label.setColor(checkpoint ? "#8ff5e1" : "#f1d28b");
      view.label.setVisible(
        visible &&
        isNearPlayer(this.snapshot.player, campfire, INTERACTION_LABEL_DISTANCE),
      );
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
    this.playerView = createPlayerActor(
      this,
      playerActorProfile(this.snapshot.floor, this.snapshot.player),
      { x: pixel.x, y: pixel.y, depth: 30 },
    ).container;
    this.entityLayer.add(this.playerView);
  }

  private createMonsterViews(): void {
    this.snapshot.worldActors.forEach((actor) => {
      const monster = this.snapshot.monsters.find((entry) => entry.id === actor.monsterId);
      if (!monster) return;
      const pixel = gridToPixels(actor);
      const container = this.add.container(pixel.x, pixel.y).setDepth(25);
      const body = this.createMonsterBody(monster);
      const bodyScale = monster.rank === "boss"
        ? 0.88
        : monster.rank === "elite"
          ? 0.76
          : 0.68;
      const bodyContainer = this.add.container(0, 0, body).setScale(bodyScale);
      const infoRailY = monster.rank === "boss"
        ? -38
        : monster.rank === "elite"
          ? -32
          : -28;
      const hpBack = this.add.rectangle(0, infoRailY, 42, 5, 0x090a0e).setOrigin(0.5)
        .setStrokeStyle(1, 0x676d7c);
      const hpFill = this.add.rectangle(-20, infoRailY, 40, 3, COLORS.ember).setOrigin(0, 0.5);
      const identity = monsterIdentityPresentation(
        monster,
        this.snapshot.profile.discoveredMonsterIds,
      );
      const label = this.add.text(0, infoRailY - 14, identity.worldLabel, {
        color: "#f1d28b",
        fontFamily: "monospace",
        fontSize: "7px",
        backgroundColor: "#08090cdd",
        padding: { x: 3, y: 2 },
      }).setOrigin(0.5);
      container.add([bodyContainer, hpBack, hpFill, label]);
      this.entityLayer.add(container);
      this.monsterViews.set(monster.id, { container, hpBack, hpFill, label });
    });
  }

  private createObjectiveBeacon(): void {
    const objective = tutorialObjective(this.snapshot);
    if (!objective) {
      this.objectiveBeacon = null;
      return;
    }
    const pixel = gridToPixels(objective.position);
    const beacon = this.add.container(pixel.x, pixel.y - 47).setDepth(45);
    const arrow = this.add.triangle(
      0,
      0,
      -7,
      -6,
      7,
      -6,
      0,
      6,
      COLORS.query,
      0.94,
    ).setStrokeStyle(2, COLORS.paper, 0.9);
    const beaconLabels: Record<GameSnapshot["floor"], string> = {
      1: "SELECT → ID #001",
      2: "ORDER BY → 目标",
      3: "INNER JOIN → 目标",
      4: "SUBQUERY → 目标",
      5: "OVER → 目标",
      6: "INSERT → 目标",
      7: "INDEX → 目标",
      8: "MVCC → 目标",
    };
    const label = this.add.text(0, -16, beaconLabels[this.snapshot.floor], {
      color: this.snapshot.floor === 1 ? "#91e3d1" : "#9eeeff",
      fontFamily: "monospace",
      fontSize: "7px",
      fontStyle: "bold",
      backgroundColor: "#08090cee",
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5);
    beacon.add([arrow, label]);
    if (!this.reducedMotion) {
      this.tweens.add({
        targets: beacon,
        alpha: 0.68,
        yoyo: true,
        repeat: -1,
        duration: 620,
        ease: "Sine.inOut",
      });
    }
    this.objectiveBeacon = beacon;
    this.syncObjectiveBeacon();
  }

  private syncObjectiveBeacon(): void {
    const objective = tutorialObjective(this.snapshot);
    if (!this.objectiveBeacon || !objective) {
      this.objectiveBeacon?.setVisible(false);
      return;
    }
    const pixel = gridToPixels(objective.position);
    this.objectiveBeacon.setPosition(pixel.x, pixel.y - 47);
    this.objectiveBeacon.setVisible(shouldShowTutorialBeacon(this.snapshot, objective));
  }

  private createMonsterBody(monster: Monster): Phaser.GameObjects.GameObject[] {
    return createMonsterActorParts(this, monster);
  }

  private syncViews(): void {
    if (this.renderedTopology !== this.snapshot.mazeFloor.topologyHash) return;
    if (!this.moveLocked && this.playerView) {
      const pixel = gridToPixels(this.snapshot.player);
      this.playerView.setPosition(pixel.x, pixel.y);
    }
    const discovered = new Set(this.snapshot.discoveredCells);
    this.syncObjectiveBeacon();
    this.monsterViews.forEach((view, monsterId) => {
      const actor = this.snapshot.worldActors.find((entry) => entry.monsterId === monsterId);
      const monster = this.snapshot.monsters.find((entry) => entry.id === monsterId);
      if (!actor || !monster) return;
      const pixel = gridToPixels(actor);
      if (!this.tweens.isTweening(view.container)) view.container.setPosition(pixel.x, pixel.y);
      view.hpFill.setScale(monster.hp / monster.maxHp, 1);
      const identity = monsterIdentityPresentation(
        monster,
        this.snapshot.profile.discoveredMonsterIds,
      );
      view.label.setText(identity.worldLabel);
      const visible = monster.hp > 0 && discovered.has(positionKey(actor));
      const showDetails = visible && isNearPlayer(
        this.snapshot.player,
        actor,
        MONSTER_LABEL_DISTANCE,
      );
      view.container.setVisible(visible);
      view.hpBack.setVisible(showDetails);
      view.hpFill.setVisible(showDetails);
      view.label.setVisible(visible);
    });
    this.syncItemViews();
    this.syncGateViews();
    this.syncShortcutViews();
    this.syncCampfireViews();
    this.setpieceLayer?.sync(this.snapshot);
    this.syncZoneLabels();
    this.drawFog();
  }

  private syncGateViews(): void {
    const colors = colorsForFloor(this.snapshot.floor);
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
      view.label.setVisible(
        view.block.visible &&
        !open &&
        isNearPlayer(this.snapshot.player, gate, INTERACTION_LABEL_DISTANCE),
      );
    });
  }

  private syncShortcutViews(): void {
    const colors = colorsForFloor(this.snapshot.floor);
    const discovered = new Set(this.snapshot.discoveredCells);
    this.snapshot.guidedMap.shortcuts.forEach((shortcut) => {
      const views = this.shortcutViews.get(shortcut.id);
      if (!views) return;
      const open = this.snapshot.openedGateIds.includes(shortcut.id);
      const hasKey = this.snapshot.keyItems.includes(shortcut.keyId);
      [shortcut.entry, shortcut.exit].forEach((position, index) => {
        const view = views[index];
        if (!view) return;
        const isPrimaryFloodgate = this.snapshot.floor === 1 && index === 0;
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
        const visible = discovered.has(positionKey(position));
        view.block.setVisible(visible);
        view.parts?.forEach((part) => {
          part.setVisible(visible && !open);
        });
        view.label.setVisible(
          visible &&
          isNearPlayer(
            this.snapshot.player,
            position,
            INTERACTION_LABEL_DISTANCE,
          ),
        );
      });
    });
  }

  private syncItemViews(): void {
    const routeTransit = floorMapBlueprint(this.snapshot.floor).routeTransit;
    const transitPresentation = floorTransitPresentation(routeTransit);
    const regionTransitLabel =
      transitPresentation.regionLabel ?? transitPresentation.label;
    const portalItems: GroundItem[] = this.snapshot.biomePlan.portals.flatMap(
      (portal) => [
        {
          id: `${portal.id}:entry`,
          sourceRoomId: portal.fromRegionId,
          ...portal.entry,
          name: regionTransitLabel,
          description: `${regionTransitLabel} · ${portal.name}`,
          kind: "event" as const,
          collection: "interact" as const,
          rewardId: null,
        },
        {
          id: `${portal.id}:exit`,
          sourceRoomId: portal.toRegionId,
          ...portal.exit,
          name: regionTransitLabel,
          description: `${regionTransitLabel} · ${portal.name}`,
          kind: "event" as const,
          collection: "interact" as const,
          rewardId: null,
        },
      ],
    );
    const guidedItems: GroundItem[] = [
      ...this.snapshot.guidedMap.shortcuts
        .filter((shortcut) => !this.snapshot.keyItems.includes(shortcut.keyId))
        .map((shortcut) => ({
          id: shortcut.keyId,
          sourceRoomId: shortcut.keyRoomNodeId,
          ...shortcut.keyPosition,
          name: "捷径钥匙",
          description: `保证开启${shortcut.name}，不依赖随机掉落。`,
          kind: "key" as const,
          collection: "interact" as const,
          rewardId: null,
        })),
      ...this.snapshot.guidedMap.deadEndCaches
        .filter((cache) => !this.snapshot.openedGateIds.includes(cache.id))
        .map((cache) => ({
          id: cache.id,
          sourceRoomId: cache.sourceRoomId,
          x: cache.x,
          y: cache.y,
          name: "死路补给",
          description: "空支路改为可选探索收益。",
          kind: "event" as const,
          collection: "interact" as const,
          rewardId: cache.rewardId,
        })),
    ];
    const currentIds = new Set([
      ...this.snapshot.groundItems.map((item) => item.id),
      ...guidedItems.map((item) => item.id),
      ...portalItems.map((item) => item.id),
      ...this.snapshot.lootBundles.map((bundle) => `loot-bundle:${bundle.id}`),
    ]);
    this.itemViews.forEach((view, id) => {
      if (currentIds.has(id)) return;
      view.tween?.destroy();
      view.container.destroy(true);
      this.itemViews.delete(id);
    });
    [...this.snapshot.groundItems, ...guidedItems, ...portalItems].forEach((item) => {
      let view = this.itemViews.get(item.id);
      if (!view) {
        const pixel = gridToPixels(item);
        const container = this.add.container(pixel.x, pixel.y).setDepth(24);
        const sourceRoom = this.snapshot.roomGraph.nodes.find(
          (room) => room.id === item.sourceRoomId,
        );
        const isChest = item.collection === "interact" && (
          item.id.startsWith("lesson-drop:") ||
          (item.id.startsWith("room-reward:") && Boolean(sourceRoom?.lessonId)) ||
          item.id.startsWith("guided-cache:") ||
          sourceRoom?.type === "treasure"
        );
        const isPortal = item.id.startsWith("biome-portal:");
        const parts: Phaser.GameObjects.GameObject[] = [];
        if (isPortal) {
          parts.push(...this.createRouteTransitParts(routeTransit, true));
        } else if (isChest) {
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
        const label = this.add.text(
          0,
          -24,
          isPortal
            ? `E · ${regionTransitLabel}`
            : isChest
              ? "E · 战利品宝箱"
              : item.name,
          {
            color: "#f1d28b",
            fontFamily: "monospace",
            fontSize: "7px",
            backgroundColor: "#08090cdd",
            padding: { x: 3, y: 2 },
            wordWrap: { width: 82, useAdvancedWrap: true },
            align: "center",
          },
        ).setOrigin(0.5);
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
        view = {
          container,
          label,
          position: { x: item.x, y: item.y },
          tween,
        };
        this.itemViews.set(item.id, view);
      }
      const visible = this.snapshot.discoveredCells.includes(positionKey(item));
      view.container.setVisible(visible);
      view.label.setVisible(
        visible &&
        isNearPlayer(
          this.snapshot.player,
          view.position,
          INTERACTION_LABEL_DISTANCE,
        ),
      );
    });
    this.snapshot.lootBundles.forEach((bundle) => {
      const viewId = `loot-bundle:${bundle.id}`;
      let view = this.itemViews.get(viewId);
      if (!view) {
        const pixel = gridToPixels(bundle);
        const container = this.add.container(pixel.x, pixel.y).setDepth(24);
        const colors = colorsForFloor(this.snapshot.floor);
        const label = this.add.text(0, -27, `E · 战利品 ×${bundle.items.length}`, {
          color: "#ffe09a",
          fontFamily: "monospace",
          fontSize: "7px",
          fontStyle: "bold",
          backgroundColor: "#08090cdd",
          padding: { x: 4, y: 2 },
        }).setOrigin(0.5);
        const parts: Phaser.GameObjects.GameObject[] = [
          this.add.rectangle(0, 3, 28, 16, 0x8f6338)
            .setStrokeStyle(2, colors.gold),
          this.add.rectangle(0, -7, 28, 9, 0xb88745)
            .setStrokeStyle(2, colors.paper),
          this.add.rectangle(0, 1, 6, 8, colors.gold)
            .setStrokeStyle(1, colors.paper),
          label,
        ];
        container.add(parts);
        this.entityLayer.add(container);
        const tween = this.reducedMotion
          ? undefined
          : this.tweens.add({
              targets: container,
              y: pixel.y - 3,
              yoyo: true,
              repeat: -1,
              duration: 720,
              ease: "Sine.inOut",
            });
        view = {
          container,
          label,
          position: { x: bundle.x, y: bundle.y },
          tween,
        };
        this.itemViews.set(viewId, view);
      }
      const visible = this.snapshot.discoveredCells.includes(positionKey(bundle));
      view.container.setVisible(visible);
      view.label.setVisible(
        visible &&
        isNearPlayer(
          this.snapshot.player,
          view.position,
          INTERACTION_LABEL_DISTANCE,
        ),
      );
    });
  }

  private createRouteTransitParts(
    kind: FloorTransitKind,
    regionPortal = false,
  ): Phaser.GameObjects.GameObject[] {
    if (kind === "floodgate" && regionPortal) {
      return [
        this.add.ellipse(0, 7, 30, 12, 0x2a6574, 0.58)
          .setStrokeStyle(2, 0x78c9b8),
        this.add.rectangle(0, 2, 23, 5, 0x446b75, 0.82),
        this.add.rectangle(0, -4, 9, 9, 0x78c9b8, 0.82)
          .setAngle(45)
          .setStrokeStyle(1, 0xd8fff8),
      ];
    }
    if (kind === "floodgate") {
      return [
        this.add.rectangle(0, 1, 29, 34, 0x24313a, 0.96)
          .setStrokeStyle(2, 0x78c9b8),
        this.add.rectangle(-7, 1, 3, 29, 0xa7b5b8),
        this.add.rectangle(0, 1, 3, 29, 0xa7b5b8),
        this.add.rectangle(7, 1, 3, 29, 0xa7b5b8),
        this.add.rectangle(0, 12, 25, 5, 0x3a91ad, 0.78),
      ];
    }
    if (kind === "skiff") {
      return [
        this.add.polygon(0, 6, [-17, -4, 16, -4, 10, 8, -10, 8], 0x765035)
          .setStrokeStyle(2, 0xd7ad55),
        this.add.rectangle(-2, -6, 2, 23, 0xe8dfc7),
        this.add.triangle(5, -11, -6, 8, -6, -9, 8, 8, 0x78c9b8, 0.9)
          .setStrokeStyle(1, 0xd8fff8),
        this.add.ellipse(0, 13, 34, 6, 0x397e9d, 0.55),
      ];
    }
    if (kind === "tomb-gate") {
      return [
        this.add.rectangle(-10, 4, 7, 29, 0x696d75)
          .setStrokeStyle(1, 0xbec9cf),
        this.add.rectangle(10, 4, 7, 29, 0x696d75)
          .setStrokeStyle(1, 0xbec9cf),
        this.add.rectangle(0, -11, 27, 7, 0x838891)
          .setStrokeStyle(1, 0xd7e5e9),
        this.add.triangle(0, -17, -14, 7, 0, -6, 14, 7, 0xa9cbd7, 0.72),
      ];
    }
    if (kind === "element-switch") {
      return [
        this.add.polygon(0, 1, [0, -17, 17, 0, 0, 17, -17, 0], 0x29243a)
          .setStrokeStyle(3, 0x9d78dc),
        this.add.triangle(-5, 1, -5, 8, 0, -10, 5, 8, 0x63bfe0, 0.94),
        this.add.triangle(6, 1, -5, 8, 0, -10, 5, 8, 0xe36a48, 0.94),
      ];
    }
    if (kind === "drawbridge") {
      return [
        this.add.rectangle(0, 3, 31, 19, 0x765035)
          .setStrokeStyle(2, 0xd7ad55),
        this.add.rectangle(-10, 3, 2, 18, 0xc49a61),
        this.add.rectangle(0, 3, 2, 18, 0xc49a61),
        this.add.rectangle(10, 3, 2, 18, 0xc49a61),
        this.add.rectangle(-13, -10, 2, 15, 0x9ca4aa).setAngle(-24),
        this.add.rectangle(13, -10, 2, 15, 0x9ca4aa).setAngle(24),
      ];
    }
    if (kind === "minecart") {
      return [
        this.add.polygon(0, 2, [-16, -9, 16, -9, 11, 8, -11, 8], 0x59656b)
          .setStrokeStyle(2, 0xd7ad55),
        this.add.rectangle(0, -3, 23, 3, 0x89959b),
        this.add.ellipse(-9, 12, 8, 8, 0x171b22)
          .setStrokeStyle(2, 0xa7b0b4),
        this.add.ellipse(9, 12, 8, 8, 0x171b22)
          .setStrokeStyle(2, 0xa7b0b4),
      ];
    }
    if (kind === "crystal-gate") {
      return [
        this.add.triangle(-10, 2, -6, 15, 0, -17, 6, 15, 0x55b9b0, 0.88)
          .setStrokeStyle(2, 0xb7f4e6),
        this.add.triangle(10, 2, -6, 15, 0, -17, 6, 15, 0x8568b0, 0.88)
          .setStrokeStyle(2, 0xe1c8ff),
        this.add.polygon(0, -13, [0, -7, 8, 0, 0, 7, -8, 0], 0xe0bf63, 0.92),
      ];
    }
    return [
      this.add.rectangle(0, 1, 28, 35, 0x332719, 0.97)
        .setStrokeStyle(3, 0xd7ad55),
      this.add.rectangle(-7, 1, 11, 29, 0x5d4323)
        .setStrokeStyle(1, 0xe0bf63),
      this.add.rectangle(7, 1, 11, 29, 0x5d4323)
        .setStrokeStyle(1, 0xe0bf63),
      this.add.rectangle(0, -11, 19, 3, 0xf0c75e, 0.86),
      this.add.ellipse(-2, 2, 3, 3, 0xf4e5a1),
      this.add.ellipse(2, 2, 3, 3, 0xf4e5a1),
    ];
  }

  private drawFog(): void {
    this.fog.clear();
    const discovered = new Set(this.snapshot.discoveredCells);
    const floor = this.snapshot.mazeFloor;
    this.fog.fillStyle(colorsForFloor(this.snapshot.floor).fog, 0.94);
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
    this.syncObjectiveBeacon();
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
