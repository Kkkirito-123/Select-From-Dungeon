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
import { GameSession } from "../../features/game-session/GameSession";
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
import { WorldRuntimeLayer } from "./world/WorldRuntimeLayer";
import {
  BIOME_COLORS,
  COLORS,
  colorsForFloor,
  zoneColorsForFloor,
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
  private worldRuntimeLayer!: WorldRuntimeLayer;
  private readonly playerRenderer = new PlayerRenderer();
  private readonly monsterRenderer = new MonsterRenderer();
  private readonly interactionOverlay = new InteractionOverlay();
  private readonly sceneEffects: SceneEffects;
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
    this.worldRuntimeLayer = new WorldRuntimeLayer(
      this,
      this.entityLayer,
      this.reducedMotion,
      this.worldObjectRenderer,
    );
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
    this.worldRuntimeLayer.destroy();
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
    this.worldRuntimeLayer.destroy();
    this.setpieceLayer?.destroy();
    this.worldItemRenderer.clear();
    this.entityLayer?.removeAll(true);
    this.setpieceLayer = new FloorSetpieceLayer(
      this,
      this.entityLayer,
      this.reducedMotion,
    );
    this.monsterViews.clear();

    const floor = this.snapshot.mazeFloor;
    const worldWidth = floor.width * TILE_SIZE;
    const worldHeight = floor.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.drawTerrain();
    this.worldDecorationRenderer.render(this, this.entityLayer, this.snapshot);
    this.setpieceLayer.build(this.snapshot);
    this.worldRuntimeLayer.build(this.snapshot);
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
    this.worldRuntimeLayer.sync(this.snapshot);
    this.setpieceLayer?.sync(this.snapshot);
    this.drawFog();
  }

  private drawFog(): void {
    this.fogRenderer.render(
      this.fog,
      this.snapshot,
      colorsForFloor(this.snapshot.floor).fog,
    );
  }

  /**
   * 把一个方向输入交给 GameSession 判定，再根据结构化结果播放空间反馈。
   * 场景只负责锁输入、动画和音画效果，不自行判断墙、门、遭遇或伤害。
   */
  private tryMove(dx: number, dy: number): void {
    if (!canStartMovement(this.moveLocked, this.snapshot.mode)) return;
    this.moveLocked = true;

    // 规则层一次性返回是否移动、阻挡原因、遭遇、拾取和机关结果。
    let resolution: MoveResolution;
    try {
      resolution = this.session.attemptPlayerMove(dx, dy);
    } catch (error) {
      this.moveLocked = false;
      throw error;
    }

    // 阻挡只播放碰撞反馈；玩家坐标仍由 Session 保持不变。
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

    // 成功移动后，场景消费规则结果并同步音效、镜头和角色补间动画。
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
