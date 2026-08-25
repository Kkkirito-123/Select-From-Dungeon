/**
 * 探索场景：把 GameSession 的地图快照绘制成连续迷宫，并转发移动、巡逻、
 * 交互和遭遇事件。它负责 Phaser 生命周期、镜头和表现动画，不负责计算
 * 碰撞规则、伤害、SQL 判题或存档。
 */
import Phaser from "phaser";
import { TILE_SIZE } from "../../content/curriculum/mvpLevel";
import {
  floorExperience,
  hasFloorExperience,
  type StoryAction,
} from "../../content/world/floorExperience";
import { floorCurrentSightCellKeys } from "../../domain/exploration/floorLabyrinth";
import { GameSession } from "../../domain/session/GameSession";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { MoveResolution } from "../../contracts/game/results";
import type {
  GroundItem,
  Monster,
  Position,
} from "../../domain/shared/types";
import type { FeedbackDirector } from "../../infrastructure/feedback/FeedbackDirector";
import { canStartMovement } from "./interaction/MovementController";
import { DungeonInputController } from "./interaction/DungeonInputController";
import {
  advancePatrolTick,
  type PatrolTickState,
} from "./interaction/PatrolController";
import { monsterIdentityPresentation } from "../../domain/progression/monsterIdentity";
import { newlyOpenedGate, pickedItemsBetween } from "./snapshotFeedback";
import {
  INTERACTION_LABEL_DISTANCE,
  MONSTER_LABEL_DISTANCE,
  isNearPlayer,
  shouldShowTutorialBeacon,
  tutorialObjective,
} from "./worldOverlay";
import { FloorSetpieceLayer } from "./FloorSetpieceLayer";
import { TerrainRenderer } from "./world/TerrainRenderer";
import { FogRenderer } from "./world/FogRenderer";
import { WorldRenderer } from "./world/WorldRenderer";
import { WorldObjectRenderer } from "./world/WorldObjectRenderer";
import { WorldDecorationRenderer } from "./world/WorldDecorationRenderer";
import { WorldItemRenderer } from "./world/WorldItemRenderer";
import {
  BIOME_COLORS,
  COLORS,
  HAZARD_STYLES,
  colorsForFloor,
  zoneColorsForFloor,
  type HazardKind,
  type HazardStyle,
} from "./world/DungeonPalette";
import { SceneEffects } from "./effects/SceneEffects";
import { PlayerRenderer } from "./actors/PlayerRenderer";
import { MonsterRenderer } from "./actors/MonsterRenderer";
import { InteractionOverlay } from "./interaction/InteractionOverlay";
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
  private readonly terrainRenderer = new TerrainRenderer();
  private readonly fogRenderer = new FogRenderer();
  private readonly worldRenderer = new WorldRenderer();
  private readonly worldObjectRenderer = new WorldObjectRenderer();
  private readonly worldDecorationRenderer = new WorldDecorationRenderer();
  private readonly worldItemRenderer = new WorldItemRenderer();
  private readonly playerRenderer = new PlayerRenderer();
  private readonly monsterRenderer = new MonsterRenderer();
  private readonly interactionOverlay = new InteractionOverlay();
  private readonly sceneEffects: SceneEffects;
  private readonly gateViews = new Map<string, GateView>();
  private readonly shortcutViews = new Map<string, GateView[]>();
  private readonly campfireViews = new Map<string, CampfireView>();
  private readonly hazardViews = new Map<string, HazardView>();
  private readonly zoneLabelViews: ZoneLabelView[] = [];
  private readonly inputController: DungeonInputController;
  private renderedTopology = -1;
  private moveLocked = false;
  private battleTransitioning = false;
  private patrolTimer: Phaser.Time.TimerEvent | null = null;
  private pendingArtFloor: GameSnapshot["floor"] | null = null;
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  private handleInteract(): void {
    const resolution = this.session.interact();
    if (resolution.ok && resolution.kind === "inspection") {
      this.inputController.reset();
      window.dispatchEvent(new CustomEvent("dungeon:inspection", {
        detail: {
          message: resolution.message,
          landmarkId: resolution.landmarkId,
        },
      }));
    }
  }

  private handleStoryActions(
    actions: readonly StoryAction[],
  ): void {
    const focus = actions.find(
      (action) => action.type === "camera-focus",
    );
    const effect = actions.find(
      (action) => action.type === "world-effect",
    );
    const point = focus?.type === "camera-focus"
      ? this.storyLandmarkPoint(focus.landmarkId)
      : null;
    if (point) this.focusStoryCamera(point);
    if (effect?.type === "world-effect") {
      this.playStoryWorldEffect(point ?? {
        x: this.playerView.x,
        y: this.playerView.y,
      });
    }
  }

  private readonly wakeHandler = (): void => {
    this.battleTransitioning = false;
    this.inputController.reset();
    this.snapshot = this.session.snapshot();
    this.syncViews();
    this.cameras.main.startFollow(this.playerView, true, 0.18, 0.18);
  };

  private canAcceptGameplayInput(): boolean {
    if (
      !this.scene.isActive() ||
      this.snapshot.mode !== "explore" ||
      this.battleTransitioning ||
      this.inputController.pagePaused ||
      this.hasBlockingExplorationOverlay()
    ) return false;
    return true;
  }

  private hasBlockingExplorationOverlay(): boolean {
    const app = document.querySelector("#app");
    return app?.classList.contains("narrative-active") === true ||
      app?.classList.contains("inspection-active") === true;
  }

  constructor(
    private readonly session: GameSession,
    private readonly feedback: FeedbackDirector,
  ) {
    super("DungeonScene");
    this.snapshot = session.snapshot();
    this.sceneEffects = new SceneEffects(
      this,
      this.reducedMotion,
      () => this.playerView,
      { query: COLORS.query, gold: COLORS.gold },
    );
    this.inputController = new DungeonInputController({
      canAccept: () => this.canAcceptGameplayInput(),
      canMove: () => !this.moveLocked && this.canAcceptGameplayInput(),
      move: ({ x, y }) => this.tryMove(x, y),
      interact: () => this.handleInteract(),
      storyActions: (actions) => this.handleStoryActions(actions),
      resetMovement: () => this.resetPlayerVisual(),
    });
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

    this.inputController.bind();
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
    this.inputController.update(time);
  }

  private cleanup(): void {
    this.inputController.unbind();
    this.events.off(Phaser.Scenes.Events.WAKE, this.wakeHandler);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.patrolTimer?.destroy();
    this.patrolTimer = null;
    this.setpieceLayer?.destroy();
    this.setpieceLayer = null;
    this.worldItemRenderer.clear();
    this.clearCampfireViews();
  }

  private storyLandmarkPoint(landmarkId: string): Position | null {
    if (!hasFloorExperience(this.snapshot.floor)) return null;
    const experience = floorExperience(this.snapshot.floor);
    const anchor = experience.landmarks.find(
      (entry) => entry.id === landmarkId,
    )?.anchor ?? experience.npcPlacements.find(
      (entry) => entry.id === landmarkId,
    )?.anchor;
    if (!anchor) return null;
    const zone = this.snapshot.mazeFloor.zones.find(
      (entry) => entry.roomNodeId === anchor.roomNodeId,
    );
    if (!zone) return null;
    return {
      x: (
        Math.round(zone.x + anchor.position.x * zone.width) + 0.5
      ) * TILE_SIZE,
      y: (
        Math.round(zone.y + anchor.position.y * zone.height) + 0.5
      ) * TILE_SIZE,
    };
  }

  private focusStoryCamera(point: Position): void {
    this.sceneEffects.focusCamera(point);
  }

  private playStoryWorldEffect(point: Position): void {
    this.sceneEffects.playWorldPulse(point);
  }

  private receiveSnapshot(snapshot: GameSnapshot): void {
    const previous = this.snapshot;
    this.snapshot = snapshot;
    if (previous.floor !== snapshot.floor) {
      this.ensureFloorArt(snapshot.floor);
    }
    if (this.worldRenderer.shouldRebuild(previous, snapshot)) {
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
    this.worldItemRenderer.clear();
    this.entityLayer?.removeAll(true);
    this.setpieceLayer = new FloorSetpieceLayer(
      this,
      this.entityLayer,
      this.reducedMotion,
    );
    this.monsterViews.clear();
    this.gateViews.clear();
    this.shortcutViews.clear();
    this.hazardViews.clear();
    this.zoneLabelViews.length = 0;

    const floor = this.snapshot.mazeFloor;
    const worldWidth = floor.width * TILE_SIZE;
    const worldHeight = floor.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.drawTerrain();
    this.worldDecorationRenderer.render(this, this.entityLayer, this.snapshot);
    this.setpieceLayer.build(this.snapshot);
    this.drawZoneLabels();
    this.createGates();
    this.createShortcutViews();
    this.createHazardViews();
    this.createCampfireViews();
    this.createPlayer();
    this.createMonsterViews();
    this.createObjectiveBeacon();
    this.syncViews();
    this.cameras.main.startFollow(this.playerView, true, 0.18, 0.18);
    this.cameras.main.centerOn(this.playerView.x, this.playerView.y);
  }

  private drawTerrain(): void {
    const colors = colorsForFloor(this.snapshot.floor);
    const biomeStyle = (kind: string) => (
      BIOME_COLORS[kind as keyof typeof BIOME_COLORS] ?? BIOME_COLORS.drainage
    );
    this.cameras.main.setBackgroundColor(colors.void);
    this.terrainRenderer.render(this.terrain, this.snapshot, {
      ...colors,
      zoneColors: zoneColorsForFloor(this.snapshot.floor),
      biomeStyle,
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
      const room = this.snapshot.roomGraph.nodes.find(
        (node) => node.id === view.roomNodeId,
      );
      view.label
        .setText(room?.title ?? "未知区域")
        .setVisible(view.roomNodeId === this.snapshot.currentRoomId);
    });
  }

  private createGates(): void {
    const colors = colorsForFloor(this.snapshot.floor);
    this.snapshot.mazeFloor.gates.forEach((gate) => {
      const pixel = gridToPixels(gate);
      const block = this.add.rectangle(
        pixel.x,
        pixel.y + 2,
        18,
        TILE_SIZE - 6,
        0x15191d,
        0.94,
      )
        .setStrokeStyle(2, colors.gold, 0.86)
        .setDepth(18);
      const parts = [-5, 0, 5].map((offset) => this.add.rectangle(
        pixel.x + offset,
        pixel.y + 2,
        2,
        TILE_SIZE - 12,
        colors.wallTop,
        0.7,
      ).setDepth(19));
      parts.push(
        this.add.rectangle(
          pixel.x,
          pixel.y + 2,
          5,
          5,
          colors.gold,
          0.88,
        ).setAngle(45).setDepth(20),
      );
      const label = this.add.text(pixel.x, pixel.y - 22, "", {
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

  private createHazardViews(): void {
    this.snapshot.hazards.forEach((hazard) => {
      const style = HAZARD_STYLES[hazard.kind];
      const pixel = gridToPixels(hazard);
      const container = this.add.container(pixel.x, pixel.y).setDepth(22);
      const shadow = this.add.ellipse(0, 7, 27, 10, 0x020305, 0.55);
      const motion = this.createHazardSymbol(hazard.kind, style);
      const label = this.add.text(0, -24, hazard.name, {
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
          this.tweens.add({
            targets: motion,
            angle: 360,
            duration: style.duration,
            repeat: -1,
            ease: "Linear",
          });
        } else if (style.motion === "pulse") {
          this.tweens.add({
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
          this.tweens.add({
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
    const symbol = this.add.container(0, 1);
    const circleBase = () => this.add.circle(0, 0, 10, style.base, 1)
      .setStrokeStyle(2, style.accent, 0.95);

    if (kind === "archive-cutter") {
      symbol.add([
        circleBase(),
        this.add.rectangle(0, 0, 26, 4, style.blade, 0.9),
        this.add.rectangle(0, 0, 4, 26, style.blade, 0.9),
        this.add.circle(0, 0, 4, style.accent, 1)
          .setStrokeStyle(1, 0xf1d28b, 0.9),
      ]);
      return symbol;
    }

    if (kind === "tidal-current") {
      symbol.add([
        this.add.ellipse(0, 0, 27, 15, style.base, 1)
          .setStrokeStyle(2, style.accent, 0.95),
        this.add.ellipse(0, 0, 18, 8, style.base, 0)
          .setStrokeStyle(2, style.blade, 0.9),
        this.add.circle(-9, -5, 2, style.blade, 0.9),
        this.add.circle(8, 5, 2, style.accent, 0.95),
      ]);
      return symbol;
    }

    if (kind === "frost-crack") {
      symbol.add([
        this.add.rectangle(0, 0, 18, 18, style.base, 1)
          .setAngle(45)
          .setStrokeStyle(2, style.accent, 0.95),
        this.add.rectangle(-3, -4, 3, 12, style.blade, 0.95).setAngle(-28),
        this.add.rectangle(3, 4, 3, 12, style.blade, 0.95).setAngle(28),
        this.add.rectangle(4, -5, 2, 7, style.accent, 0.95).setAngle(62),
      ]);
      return symbol;
    }

    if (kind === "elemental-vent") {
      symbol.add([
        circleBase(),
        this.add.circle(0, -7, 4, style.blade, 0.95),
        this.add.circle(-7, 5, 4, style.accent, 0.95),
        this.add.circle(7, 5, 4, 0x78c9b8, 0.95),
        this.add.circle(0, 0, 3, style.base, 1),
      ]);
      return symbol;
    }

    if (kind === "alarm-wire") {
      symbol.add([
        this.add.rectangle(0, 2, 28, 10, style.base, 1)
          .setStrokeStyle(2, style.accent, 0.95),
        this.add.rectangle(-11, -2, 3, 22, style.blade, 0.95),
        this.add.rectangle(11, -2, 3, 22, style.blade, 0.95),
        this.add.rectangle(0, -5, 21, 2, style.accent, 1),
        this.add.circle(0, 1, 5, style.accent, 1)
          .setStrokeStyle(1, style.blade, 0.95),
        this.add.circle(0, 7, 2, style.blade, 1),
      ]);
      return symbol;
    }

    if (kind === "magma-fissure") {
      symbol.add([
        this.add.ellipse(0, 2, 28, 14, style.base, 1)
          .setStrokeStyle(2, style.accent, 0.95),
        this.add.rectangle(-6, -3, 4, 11, style.blade, 0.95).setAngle(34),
        this.add.rectangle(0, 2, 4, 12, style.accent, 1).setAngle(-28),
        this.add.rectangle(6, 6, 4, 10, style.blade, 0.95).setAngle(38),
      ]);
      return symbol;
    }

    if (kind === "root-snare") {
      symbol.add([
        this.add.ellipse(0, 2, 27, 14, style.base, 1)
          .setStrokeStyle(2, style.accent, 0.95),
        this.add.ellipse(-6, -2, 5, 24, style.blade, 0.85).setAngle(-28),
        this.add.ellipse(6, -2, 5, 24, style.accent, 0.9).setAngle(28),
        this.add.ellipse(0, 3, 5, 20, style.blade, 0.85),
      ]);
      return symbol;
    }

    symbol.add([
      this.add.rectangle(0, 0, 20, 20, style.base, 1)
        .setAngle(45)
        .setStrokeStyle(2, style.accent, 0.95),
      this.add.rectangle(0, 0, 12, 12, style.base, 0)
        .setAngle(45)
        .setStrokeStyle(2, style.blade, 0.95),
      this.add.rectangle(0, 0, 3, 16, style.accent, 1),
    ]);
    return symbol;
  }

  private syncCampfireViews(): void {
    const discovered = new Set(this.snapshot.discoveredCells);
    this.snapshot.campfires.forEach((campfire) => {
      const view = this.campfireViews.get(campfire.id);
      if (!view) return;
      const checkpoint = this.snapshot.respawnCampfireId === campfire.id;
      const visible = this.worldObjectRenderer.isDiscovered(discovered, campfire);
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
    this.playerView = this.playerRenderer.create(
      this,
      this.entityLayer,
      this.snapshot,
    );
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
      if (this.objectiveBeacon) this.interactionOverlay.setVisible(this.objectiveBeacon, false);
      return;
    }
    const pixel = gridToPixels(objective.position);
    this.objectiveBeacon.setPosition(pixel.x, pixel.y - 47);
    this.interactionOverlay.setVisible(
      this.objectiveBeacon,
      shouldShowTutorialBeacon(this.snapshot, objective),
    );
  }

  private createMonsterBody(monster: Monster): Phaser.GameObjects.GameObject[] {
    return this.monsterRenderer.createBody(this, monster);
  }

  private syncViews(): void {
    if (this.renderedTopology !== this.snapshot.mazeFloor.topologyHash) return;
    if (!this.moveLocked && this.playerView) {
      const pixel = gridToPixels(this.snapshot.player);
      this.playerView.setPosition(pixel.x, pixel.y);
    }
    const discovered = new Set(this.snapshot.discoveredCells);
    const currentSight = this.snapshot.adminMode
      ? discovered
      : floorCurrentSightCellKeys(
          this.snapshot.floor,
          this.snapshot.mazeFloor,
          this.snapshot.campfires,
          this.snapshot.player,
        );
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
      const visible = monster.hp > 0 &&
        this.worldObjectRenderer.isVisible(discovered, currentSight, actor);
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
    this.worldItemRenderer.sync(
      this,
      this.entityLayer,
      this.snapshot,
      this.reducedMotion,
      this.worldObjectRenderer,
    );
    this.syncGateViews();
    this.syncShortcutViews();
    this.syncCampfireViews();
    this.syncHazardViews();
    this.setpieceLayer?.sync(this.snapshot);
    this.syncZoneLabels();
    this.drawFog();
  }

  private syncGateViews(): void {
    const colors = colorsForFloor(this.snapshot.floor);
    const discovered = new Set(this.snapshot.discoveredCells);
    this.snapshot.mazeFloor.gates.forEach((gate) => {
      const view = this.gateViews.get(gate.id);
      if (!view) return;
      const missing = gate.requires.filter(
        (lesson) => !this.snapshot.completedLessons.includes(lesson),
      );
      const open = this.snapshot.availableRoomIds.includes(gate.roomNodeId);
      const challengeGate = gate.id === this.snapshot.challengeGateId;
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
      view.block.setVisible(this.worldObjectRenderer.isDiscovered(discovered, gate));
      view.parts?.forEach((part) => part.setVisible(view.block.visible && !open));
      view.label.setVisible(
        view.block.visible &&
        !open &&
        isNearPlayer(this.snapshot.player, gate, INTERACTION_LABEL_DISTANCE),
      );
    });
  }

  private syncHazardViews(): void {
    const discovered = new Set(this.snapshot.discoveredCells);
    const sight = this.snapshot.adminMode
      ? discovered
      : floorCurrentSightCellKeys(
          this.snapshot.floor,
          this.snapshot.mazeFloor,
          this.snapshot.campfires,
          this.snapshot.player,
        );
    this.snapshot.hazards.forEach((hazard) => {
      const view = this.hazardViews.get(hazard.id);
      if (!view) return;
      const triggered = this.snapshot.openedGateIds.includes(hazard.id);
      const visible = this.worldObjectRenderer.isVisible(discovered, sight, hazard);
      view.container.setVisible(visible);
      view.container.setAlpha(triggered ? 0.34 : 1);
      if (triggered) {
        this.tweens.killTweensOf(view.motion);
        view.motion.setAngle(0).setScale(1).setAlpha(1);
      }
      view.label.setText(triggered ? "已失效" : hazard.name);
      view.label.setVisible(
        visible && isNearPlayer(this.snapshot.player, hazard, INTERACTION_LABEL_DISTANCE),
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
        const visible = this.worldObjectRenderer.isDiscovered(discovered, position);
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


  private drawFog(): void {
    this.fogRenderer.render(
      this.fog,
      this.snapshot,
      colorsForFloor(this.snapshot.floor).fog,
    );
  }

  private tryMove(dx: number, dy: number): void {
    if (!canStartMovement(this.moveLocked, this.snapshot.mode)) return;
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
    if (resolution.hazard) {
      this.feedback.dispatch({
        type: "hazard-trigger",
        hazardName: resolution.hazard.name,
        amount: resolution.hazard.playerDamage + resolution.hazard.armorDamage,
      });
      this.cameras.main.shake(150, 0.006);
    }
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

  private resetPlayerVisual(): void {
    if (this.playerView) {
      this.tweens.killTweensOf(this.playerView);
      const pixel = gridToPixels(this.snapshot.player);
      this.playerView.setPosition(pixel.x, pixel.y);
    }
    this.moveLocked = false;
  }

  private advancePatrols(): void {
    const state: PatrolTickState = {
      locked: this.moveLocked,
      pagePaused: this.inputController.pagePaused,
      sceneActive: this.scene.isActive(),
      guidanceLevel: this.snapshot.navigationGuidance.level,
      blockingOverlay: this.hasBlockingExplorationOverlay(),
    };
    const result = advancePatrolTick(this.session, state, this.snapshot.mode);
    if (!result) return;
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
    this.inputController.clearHeldDirections();
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
