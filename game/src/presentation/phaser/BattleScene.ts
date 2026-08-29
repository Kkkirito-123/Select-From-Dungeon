/**
 * SQL 战斗场景：显示当前目标、阶段和结算事件，并把场景生命周期交给
 * AppShell/GameSession 协调。它不执行 SQL、不决定命中或扣血，只呈现领域
 * 层已经返回的 TurnResolution。
 */
import Phaser from "phaser";
import { ArcadeAudio } from "../../infrastructure/audio/ArcadeAudio";
import { biomeEncounterFor } from "../../content/world/biomeContent";
import { playerActorProfile } from "../../content/world/actorVisuals";
import { GameSession } from "../../features/game-session/GameSession";
import {
  monsterIdLabel,
  monsterIntentName,
} from "../../domain/progression/monsterIdentity";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { TurnResolution } from "../../contracts/game/results";
import type { Monster } from "../../domain/shared/types";
import {
  createMonsterActor,
  createPlayerActor,
  startActorIdle,
} from "./PixelActorFactory";
import { createBattleArena } from "./world/BattleArenaRenderer";

const COLORS = {
  void: 0x08090c,
  stone: 0x242832,
  stoneLight: 0x494f5e,
  gold: 0xd7ad55,
  query: 0x78c9b8,
  plum: 0x7f5a87,
  ember: 0xc75248,
  paper: 0xe8dfc7,
} as const;

const IMPACT_DELAY_MS = 190;
const LOCAL_HIT_STOP_MS = 55;
const PLAYER_REST_X = 150;
const MONSTER_REST_X = 470;

export class BattleScene extends Phaser.Scene {
  private snapshot: GameSnapshot;
  private unsubscribe: (() => void) | null = null;
  private monsterContainer!: Phaser.GameObjects.Container;
  private monsterHp!: Phaser.GameObjects.Rectangle;
  private monsterHpText!: Phaser.GameObjects.Text;
  private playerContainer!: Phaser.GameObjects.Container;
  private playerHp!: Phaser.GameObjects.Rectangle;
  private intentText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private readonly effectTimers = new Set<Phaser.Time.TimerEvent>();
  private readonly effectTweens = new Set<Phaser.Tweens.Tween>();
  private readonly transientObjects = new Set<Phaser.GameObjects.GameObject>();
  private readonly pendingTurnSettlers = new Set<() => void>();
  private failActiveTurn: ((error: unknown) => void) | null = null;
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  constructor(
    private readonly session: GameSession,
    private readonly audio: ArcadeAudio,
  ) {
    super("BattleScene");
    this.snapshot = session.snapshot();
  }

  create(): void {
    this.snapshot = this.session.snapshot();
    const arena = createBattleArena(this, this.snapshot, this.targetMonster());
    this.roundText = arena.roundText;
    this.monsterHp = arena.monsterHp;
    this.monsterHpText = arena.monsterHpText;
    this.playerHp = arena.playerHp;
    this.intentText = arena.intentText;
    this.createPlayer();
    this.createMonster();
    this.unsubscribe = this.session.subscribe((snapshot) => {
      const previous = this.snapshot;
      const previousTarget = this.monsterFromSnapshot(previous);
      const nextTarget = this.monsterFromSnapshot(snapshot);
      const turnChanged = previous.mode === "combat" && (
        previous.combat?.round !== snapshot.combat?.round ||
        previous.player.hp !== snapshot.player.hp ||
        previousTarget?.hp !== nextTarget?.hp
      );
      this.snapshot = snapshot;
      if (!turnChanged) this.syncBars();
    });
    this.syncBars();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.cleanupEffects();
      for (const settle of [...this.pendingTurnSettlers]) settle();
      this.pendingTurnSettlers.clear();
      this.failActiveTurn = null;
    });
  }

  animateTurn(resolution: TurnResolution): Promise<void> {
    if (!this.scene.isActive()) {
      if (resolution.mode !== "combat") this.abortEncounter();
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let finish!: (animationError?: unknown) => void;
      const settleAfterShutdown = (): void => {
        if (settled) return;
        settled = true;
        this.pendingTurnSettlers.delete(settleAfterShutdown);
        if (this.failActiveTurn === finish) this.failActiveTurn = null;
        resolve();
      };
      finish = (animationError?: unknown): void => {
        if (settled) return;
        settled = true;
        this.pendingTurnSettlers.delete(settleAfterShutdown);
        if (this.failActiveTurn === finish) this.failActiveTurn = null;
        this.cleanupEffects();

        let failure = animationError;
        try {
          if (this.sys.isActive()) this.syncBars(resolution);
        } catch (syncError) {
          failure ??= syncError;
        }

        if (resolution.mode !== "combat") {
          try {
            this.abortEncounter();
          } catch (abortError) {
            failure ??= abortError;
          }
        }

        if (failure === undefined) resolve();
        else reject(failure);
      };

      this.pendingTurnSettlers.add(settleAfterShutdown);
      this.failActiveTurn = finish;
      try {
        this.cleanupEffects();
        this.monsterContainer.setVisible(true).setAlpha(1);
        this.monsterContainer.setX(MONSTER_REST_X).setAngle(0);
        this.playerContainer.setX(PLAYER_REST_X).setAngle(0).setAlpha(1);

        const queryCast = resolution.events.some((event) => event.type === "query-cast");
        const hitEvent = resolution.events.find(
          (event) => event.type === "player-hit" || event.type === "enemy-hit",
        );
        const deathEvent = resolution.events.find((event) => event.type === "death");
        const lootEvent = resolution.events.find((event) => event.type === "loot-drop");

        if (queryCast) {
          this.playSound("query-cast");
          this.playQueryCast(resolution.accepted);
        } else if (!resolution.accepted) {
          this.playQueryFracture(238, 258);
        }

        if (hitEvent?.type === "enemy-hit" && !this.reducedMotion) {
          this.scheduleEffect(80, () => this.playEnemyAdvance());
        }
        if (hitEvent) {
          this.scheduleEffect(IMPACT_DELAY_MS, () => this.playEvent(hitEvent, resolution));
        }
        if (resolution.stageAdvanced) {
          this.scheduleEffect(IMPACT_DELAY_MS + 165, () => this.playStageClear());
        }
        if (deathEvent) {
          this.scheduleEffect(
            IMPACT_DELAY_MS + 120,
            () => this.playEvent(deathEvent, resolution),
          );
        }
        if (lootEvent) {
          this.scheduleEffect(
            IMPACT_DELAY_MS + 310,
            () => this.playEvent(lootEvent, resolution),
          );
        }
        if (resolution.mode === "victory") {
          this.scheduleEffect(IMPACT_DELAY_MS + 360, () => this.playOutcome("victory"));
        } else if (resolution.mode === "defeat") {
          this.scheduleEffect(IMPACT_DELAY_MS + 235, () => this.playOutcome("defeat"));
        }

        const terminalTurn = resolution.mode !== "combat";
        const settleDelay = this.reducedMotion
          ? (terminalTurn ? 540 : 430)
          : (terminalTurn ? 820 : 680);
        this.scheduleEffect(settleDelay, () => finish());
      } catch (error) {
        finish(error);
      }
    });
  }

  abortEncounter(): void {
    if (this.sys.isActive()) this.scene.stop();
    if (this.scene.isSleeping("DungeonScene")) this.scene.wake("DungeonScene");
  }


  private createPlayer(): void {
    this.playerContainer = createPlayerActor(
      this,
      playerActorProfile(this.snapshot.floor, this.snapshot.player),
      {
        x: PLAYER_REST_X,
        y: 312,
        scale: 1.45,
        depth: 8,
      },
    ).container;
  }

  private createMonster(): void {
    const monster = this.targetMonster();
    if (!monster) {
      this.monsterContainer = this.add.container(MONSTER_REST_X, 222).setDepth(8);
      return;
    }
    const encounterRole = biomeEncounterFor(monster.id)?.role;
    const encounterScale = monster.isBoss
      ? 1.35
      : encounterRole === "area-boss" ? 1.28 : encounterRole === "mini-elite" ? 1.12 : 1;
    const view = createMonsterActor(this, monster, {
      x: MONSTER_REST_X,
      y: 222,
      scale: 1.68 * encounterScale,
      depth: 8,
    });
    this.monsterContainer = view.container;
    startActorIdle(this, view, this.reducedMotion);
  }

  private syncBars(resolution?: TurnResolution): void {
    const monsterUpdate = resolution?.hpUpdates.at(-1);
    const monster = monsterUpdate
      ? this.snapshot.monsters.find((entry) => entry.id === monsterUpdate.id)
      : this.targetMonster();
    if (monster && this.monsterHp) {
      const hp = monsterUpdate?.id === monster.id ? monsterUpdate.hp : monster.hp;
      this.monsterHp.setScale(hp / monster.maxHp, 1);
      this.monsterHpText?.setText(`${hp} / ${monster.maxHp} HP`);
    }
    if (this.playerHp) {
      this.playerHp.setScale(this.snapshot.player.hp / this.snapshot.player.maxHp, 1);
    }
    if (this.intentText) {
      const target = this.targetMonster();
      this.intentText.setText(
        this.snapshot.combat && target
          ? `敌方预告：${
              monsterIntentName(
                target,
                this.snapshot.profile.discoveredMonsterIds,
              )
            } · 错误时最高 ${this.snapshot.combat.intent.damage} 伤害`
          : "遭遇已经结算",
      );
    }
    if (this.roundText) {
      this.roundText.setText(`ROUND ${this.snapshot.combat?.round ?? "—"}`);
    }
  }

  private playQueryCast(accepted: boolean): void {
    const color = accepted ? COLORS.query : COLORS.ember;
    const bolt = this.trackTransient(
      this.add.rectangle(205, 272, 22, 7, color, 0.95).setDepth(14),
    );
    if (this.reducedMotion) {
      this.destroyTransient(bolt);
      this.showQueryStatus(accepted ? "QUERY LOCKED" : "QUERY REJECTED");
      return;
    }

    this.addEffectTween({
      targets: bolt,
      x: accepted ? 430 : 340,
      y: accepted ? 218 : 236,
      scaleX: accepted ? 2.5 : 1.25,
      duration: accepted ? IMPACT_DELAY_MS : 145,
      ease: "Quad.in",
      onComplete: () => {
        const fractureX = bolt.x;
        const fractureY = bolt.y;
        this.destroyTransient(bolt);
        if (!accepted) this.playQueryFracture(fractureX, fractureY);
      },
    });
  }

  private playEvent(
    event: TurnResolution["events"][number],
    resolution: TurnResolution,
  ): void {
    this.showEventText(event);
    if (event.type === "player-hit") {
      this.playSound("enemy-hurt");
      this.updateMonsterHp(event, resolution);
      this.playImpact(470, 218, COLORS.query, 1);
      this.holdMonsterPose();
      if (!this.reducedMotion) this.cameras.main.shake(105, 0.006);
    } else if (event.type === "enemy-hit") {
      this.playSound("player-hurt");
      this.updatePlayerHp();
      this.playImpact(150, 306, COLORS.ember, -1);
      this.holdPlayerPose();
      if (!this.reducedMotion) this.cameras.main.shake(135, 0.009);
    } else if (event.type === "death") {
      this.playDeath(resolution);
    } else if (event.type === "loot-drop") {
      this.playLootDrop();
    }
  }

  private showEventText(event: TurnResolution["events"][number]): void {
    if (event.type !== "player-hit" && event.type !== "enemy-hit") return;
    const x = event.type === "player-hit" ? 470 : 150;
    const y = event.type === "player-hit" ? 146 : 250;
    const text = this.add.text(
      x,
      y,
      `${event.type === "player-hit" ? "SQL HIT" : "COUNTER"}  -${event.amount ?? 0}`,
      {
        color: event.type === "player-hit" ? "#91e3d1" : "#ff8279",
        fontFamily: "monospace",
        fontSize: "13px",
        fontStyle: "bold",
        backgroundColor: "#08090cee",
        padding: { x: 5, y: 3 },
      },
    ).setOrigin(0.5).setDepth(18);
    this.trackTransient(text);
    if (this.reducedMotion) {
      this.scheduleEffect(320, () => this.destroyTransient(text));
    } else {
      this.addEffectTween({
        targets: text,
        y: y - 26,
        alpha: 0,
        duration: 500,
        ease: "Cubic.out",
        onComplete: () => this.destroyTransient(text),
      });
    }
  }

  private playEnemyAdvance(): void {
    this.addEffectTween({
      targets: this.monsterContainer,
      x: 405,
      duration: IMPACT_DELAY_MS - 85,
      ease: "Cubic.in",
    });
  }

  private holdMonsterPose(): void {
    if (this.reducedMotion) return;
    this.monsterContainer.setX(MONSTER_REST_X + 10).setAngle(3).setAlpha(0.72);
    this.scheduleEffect(LOCAL_HIT_STOP_MS, () => {
      this.addEffectTween({
        targets: this.monsterContainer,
        x: MONSTER_REST_X,
        angle: 0,
        alpha: 1,
        duration: 105,
        ease: "Back.out",
      });
    });
  }

  private holdPlayerPose(): void {
    if (this.reducedMotion) return;
    this.playerContainer.setX(PLAYER_REST_X - 10).setAngle(-4).setAlpha(0.76);
    this.scheduleEffect(LOCAL_HIT_STOP_MS, () => {
      this.addEffectTween({
        targets: [this.playerContainer, this.monsterContainer],
        x: (target: Phaser.GameObjects.Container) => (
          target === this.playerContainer ? PLAYER_REST_X : MONSTER_REST_X
        ),
        angle: 0,
        alpha: 1,
        duration: 115,
        ease: "Back.out",
      });
    });
  }

  private playImpact(x: number, y: number, color: number, direction: 1 | -1): void {
    if (this.reducedMotion) return;

    const flash = this.trackTransient(
      this.add.rectangle(x, y, 68, 82, color, 0.42).setDepth(15),
    );
    this.addEffectTween({
      targets: flash,
      alpha: 0,
      scale: 1.35,
      duration: 150,
      ease: "Quad.out",
      onComplete: () => this.destroyTransient(flash),
    });

    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI * 0.85 + (index / 9) * Math.PI * 1.7;
      const distance = 24 + (index % 3) * 8;
      const particle = this.trackTransient(
        this.add.rectangle(
          x + direction * (index % 2) * 3,
          y + ((index % 3) - 1) * 3,
          4 + (index % 3) * 2,
          4 + ((index + 1) % 3) * 2,
          color,
          0.96,
        ).setDepth(17),
      );
      this.addEffectTween({
        targets: particle,
        x: particle.x + Math.cos(angle) * distance * direction,
        y: particle.y + Math.sin(angle) * distance,
        angle: (index % 2 === 0 ? 1 : -1) * 90,
        alpha: 0,
        duration: 230 + (index % 3) * 30,
        ease: "Quad.out",
        onComplete: () => this.destroyTransient(particle),
      });
    }
  }

  private playQueryFracture(x: number, y: number): void {
    this.showQueryStatus("QUERY REJECTED");
    if (this.reducedMotion) return;

    for (let index = 0; index < 8; index += 1) {
      const direction = index % 2 === 0 ? -1 : 1;
      const fragment = this.trackTransient(
        this.add.rectangle(
          x + direction * (index % 3) * 4,
          y + (index - 4) * 2,
          5 + (index % 2) * 3,
          4,
          COLORS.ember,
          0.92,
        ).setDepth(16),
      );
      this.addEffectTween({
        targets: fragment,
        x: fragment.x + direction * (20 + index * 3),
        y: fragment.y + (index - 3.5) * 8,
        angle: direction * 120,
        alpha: 0,
        duration: 240 + index * 12,
        ease: "Quad.out",
        onComplete: () => this.destroyTransient(fragment),
      });
    }
  }

  private showQueryStatus(label: string): void {
    const text = this.trackTransient(
      this.add.text(320, 224, label, {
        color: label.includes("REJECTED") ? "#ff8279" : "#91e3d1",
        fontFamily: "monospace",
        fontSize: "10px",
        fontStyle: "bold",
        backgroundColor: "#08090cee",
        padding: { x: 6, y: 3 },
      }).setOrigin(0.5).setDepth(18),
    );
    this.scheduleEffect(this.reducedMotion ? 320 : 430, () => this.destroyTransient(text));
  }

  private updateMonsterHp(
    event: TurnResolution["events"][number],
    resolution: TurnResolution,
  ): void {
    const targetId = event.targetId;
    const update = resolution.hpUpdates.find((entry) => entry.id === targetId);
    const monster = targetId === undefined
      ? undefined
      : this.snapshot.monsters.find((entry) => entry.id === targetId);
    if (!update || !monster) return;
    this.monsterHpText?.setText(`${update.hp} / ${monster.maxHp} HP`);
    this.setHealthBar(this.monsterHp, update.hp / monster.maxHp);
  }

  private updatePlayerHp(): void {
    this.setHealthBar(
      this.playerHp,
      this.snapshot.player.hp / this.snapshot.player.maxHp,
    );
  }

  private setHealthBar(bar: Phaser.GameObjects.Rectangle, scaleX: number): void {
    const targetScale = Phaser.Math.Clamp(scaleX, 0, 1);
    if (this.reducedMotion) {
      bar.setScale(targetScale, 1);
      return;
    }
    this.addEffectTween({
      targets: bar,
      scaleX: targetScale,
      duration: 135,
      ease: "Quad.out",
    });
  }

  private playDeath(resolution: TurnResolution): void {
    const experience = resolution.experience;
    const recovered = resolution.events.some(
      (event) => event.type === "identity-recovered",
    );
    const idText = this.trackTransient(
      this.add.text(
        470,
        166,
        experience ? monsterIdLabel(experience.monsterId) : "RECORD CLEARED",
        {
          color: "#b9c2cf",
          fontFamily: "monospace",
          fontSize: "12px",
          fontStyle: "bold",
          backgroundColor: "#08090cee",
          padding: { x: 7, y: 4 },
        },
      ).setOrigin(0.5).setDepth(23),
    );

    if (this.reducedMotion) {
      this.monsterContainer.setVisible(false);
      if (recovered && experience) {
        idText.setText(
          `${monsterIdLabel(experience.monsterId)} → ${experience.monsterName}`,
        ).setColor("#f0cf7a");
      }
      this.scheduleEffect(420, () => this.destroyTransient(idText));
      return;
    }

    for (let index = 0; index < 12; index += 1) {
      const direction = index % 2 === 0 ? -1 : 1;
      const fragment = this.trackTransient(
        this.add.rectangle(
          470 + direction * (index % 3) * 5,
          215 + (index - 6) * 3,
          5 + (index % 3) * 2,
          4 + ((index + 1) % 2) * 3,
          index % 3 === 0 ? COLORS.gold : COLORS.query,
          0.94,
        ).setDepth(22),
      );
      this.addEffectTween({
        targets: fragment,
        x: fragment.x + direction * (34 + index * 3),
        y: fragment.y + (index - 5.5) * 9,
        angle: direction * (90 + index * 7),
        alpha: 0,
        duration: 300 + (index % 4) * 35,
        ease: "Cubic.out",
        onComplete: () => this.destroyTransient(fragment),
      });
    }
    this.addEffectTween({
      targets: this.monsterContainer,
      alpha: 0,
      y: this.monsterContainer.y + 20,
      scaleY: 0.35,
      duration: 210,
      ease: "Cubic.in",
    });
    this.cameras.main.flash(125, 120, 201, 184, false);

    if (recovered && experience) {
      this.scheduleEffect(105, () => {
        idText.setText(`${monsterIdLabel(experience.monsterId)}  →`);
        const recoveredName = this.trackTransient(
          this.add.text(470, 193, experience.monsterName, {
            color: "#f0cf7a",
            fontFamily: "Georgia, serif",
            fontSize: "22px",
            fontStyle: "bold",
            backgroundColor: "#08090cf2",
            padding: { x: 11, y: 6 },
          }).setOrigin(0.5).setDepth(24),
        );
        const stamp = this.trackTransient(
          this.add.text(470, 235, "NAME RECOVERED · CODEX +1", {
            color: "#91e3d1",
            fontFamily: "monospace",
            fontSize: "10px",
            fontStyle: "bold",
            backgroundColor: "#0b1718ee",
            padding: { x: 7, y: 4 },
          }).setOrigin(0.5).setDepth(24),
        );
        recoveredName.setScale(0.78);
        this.addEffectTween({
          targets: recoveredName,
          scale: 1,
          duration: 180,
          ease: "Back.out",
        });
        this.scheduleEffect(390, () => {
          this.destroyTransient(recoveredName);
          this.destroyTransient(stamp);
        });
      });
    }
    this.scheduleEffect(475, () => this.destroyTransient(idText));
  }

  private playLootDrop(): void {
    this.playSound("drop");
    const chest = this.trackTransient(
      this.add.container(470, 244).setDepth(19),
    );
    chest.add([
      this.add.rectangle(0, 5, 28, 15, 0x8f6338).setStrokeStyle(2, COLORS.gold),
      this.add.rectangle(0, -6, 28, 8, 0xb88745).setStrokeStyle(2, COLORS.paper),
      this.add.rectangle(0, 2, 6, 8, COLORS.gold).setStrokeStyle(1, COLORS.paper),
    ]);
    const label = this.trackTransient(
      this.add.text(470, 273, "CHEST", {
        color: "#e8dfc7",
        fontFamily: "monospace",
        fontSize: "10px",
        fontStyle: "bold",
        backgroundColor: "#08090cee",
        padding: { x: 5, y: 2 },
      }).setOrigin(0.5).setDepth(19),
    );
    if (this.reducedMotion) return;
    this.addEffectTween({
      targets: [chest, label],
      y: "-=10",
      yoyo: true,
      duration: 145,
      ease: "Sine.inOut",
    });
  }

  private playStageClear(): void {
    this.playSound("stage-clear");
    this.showCenterBanner("SQL CRITICAL", "#d7ad55");
  }

  private playOutcome(mode: "victory" | "defeat"): void {
    this.playSound(mode);
    this.showCenterBanner(
      mode === "victory" ? "FLOOR CLEARED" : "YOU DIED",
      mode === "victory" ? "#91e3d1" : "#ff8279",
    );
  }

  private showCenterBanner(label: string, color: string): void {
    const text = this.trackTransient(
      this.add.text(320, 175, label, {
        color,
        fontFamily: "monospace",
        fontSize: "17px",
        fontStyle: "bold",
        backgroundColor: "#08090cf0",
        padding: { x: 12, y: 7 },
      }).setOrigin(0.5).setDepth(24),
    );
    if (this.reducedMotion) return;
    text.setScale(0.86);
    this.addEffectTween({
      targets: text,
      scale: 1,
      alpha: { from: 1, to: 0 },
      hold: 160,
      duration: 260,
      ease: "Back.out",
      onComplete: () => this.destroyTransient(text),
    });
  }

  private playSound(effect: Parameters<ArcadeAudio["playSfx"]>[0]): void {
    void this.audio.playSfx(effect).catch((error: unknown) => {
      console.error(`战斗音效 ${effect} 播放失败`, error);
    });
  }

  private scheduleEffect(delay: number, callback: () => void): Phaser.Time.TimerEvent {
    let timer!: Phaser.Time.TimerEvent;
    timer = this.time.delayedCall(delay, () => {
      this.effectTimers.delete(timer);
      try {
        callback();
      } catch (error) {
        this.handleEffectError(error);
      }
    });
    this.effectTimers.add(timer);
    return timer;
  }

  private addEffectTween(config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween {
    const configuredComplete = config.onComplete;
    const configuredStop = config.onStop;
    let tween!: Phaser.Tweens.Tween;
    tween = this.tweens.add({
      ...config,
      onComplete: (
        completedTween: Phaser.Tweens.Tween,
        targets: unknown | unknown[],
        ...params: unknown[]
      ) => {
        this.effectTweens.delete(completedTween);
        try {
          configuredComplete?.(completedTween, targets, ...params);
        } catch (error) {
          this.handleEffectError(error);
        }
      },
      onStop: (
        stoppedTween: Phaser.Tweens.Tween,
        targets: unknown | unknown[],
        ...params: unknown[]
      ) => {
        this.effectTweens.delete(stoppedTween);
        try {
          configuredStop?.(stoppedTween, targets, ...params);
        } catch (error) {
          this.handleEffectError(error);
        }
      },
    });
    this.effectTweens.add(tween);
    return tween;
  }

  private trackTransient<T extends Phaser.GameObjects.GameObject>(gameObject: T): T {
    this.transientObjects.add(gameObject);
    return gameObject;
  }

  private destroyTransient(gameObject: Phaser.GameObjects.GameObject): void {
    if (!this.transientObjects.delete(gameObject)) return;
    gameObject.destroy();
  }

  private handleEffectError(error: unknown): void {
    if (this.failActiveTurn) this.failActiveTurn(error);
    else console.error("战斗反馈播放失败", error);
  }

  private cleanupEffects(): void {
    for (const timer of this.effectTimers) timer.remove(false);
    this.effectTimers.clear();
    for (const tween of [...this.effectTweens]) {
      if (!tween.isDestroyed()) tween.stop();
    }
    this.effectTweens.clear();
    for (const gameObject of [...this.transientObjects]) this.destroyTransient(gameObject);
    this.cameras?.main?.resetFX();

    if (this.playerContainer) {
      this.playerContainer.setX(PLAYER_REST_X).setAngle(0).setAlpha(1);
    }
    if (this.monsterContainer) {
      this.monsterContainer.setX(MONSTER_REST_X).setAngle(0).setAlpha(1);
    }
  }

  private targetMonster(): Monster | undefined {
    return this.monsterFromSnapshot(this.snapshot);
  }

  private monsterFromSnapshot(snapshot: GameSnapshot): Monster | undefined {
    const id = snapshot.combat?.targetId ?? snapshot.focusMonsterId;
    return id === null ? undefined : snapshot.monsters.find((monster) => monster.id === id);
  }
}
