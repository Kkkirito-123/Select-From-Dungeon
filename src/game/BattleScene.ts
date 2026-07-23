import Phaser from "phaser";
import { ArcadeAudio } from "../audio/ArcadeAudio";
import { GameSession } from "../domain/GameSession";
import type { GameSnapshot, Monster, TurnResolution } from "../domain/types";

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
    this.drawArena();
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

  private drawArena(): void {
    const floorTwo = this.snapshot.floor === 2;
    const voidColor = floorTwo ? 0x050714 : COLORS.void;
    const lineColor = floorTwo ? 0x6551a5 : COLORS.plum;
    const platformColor = floorTwo ? 0x20295a : COLORS.stone;
    const platformEdge = floorTwo ? 0x526bb0 : COLORS.stoneLight;
    this.cameras.main.setBackgroundColor(voidColor);
    this.add.rectangle(320, 208, 640, 416, voidColor);
    for (let y = 0; y < 13; y += 1) {
      for (let x = 0; x < 20; x += 1) {
        this.add.rectangle(
          x * 32 + 16,
          y * 32 + 16,
          32,
          32,
          floorTwo
            ? y < 7
              ? ((x + y) % 2 === 0 ? 0x101637 : 0x161d47)
              : 0x171d3f
            : y < 7
              ? ((x + y) % 2 === 0 ? 0x171a22 : 0x1c1f29)
              : 0x20232b,
        ).setStrokeStyle(1, 0x0e1016, 0.55);
      }
    }
    this.add.rectangle(320, 198, 610, 5, lineColor, 0.65);
    this.add.rectangle(470, 270, 240, 34, platformColor, 0.96)
      .setStrokeStyle(3, platformEdge);
    this.add.ellipse(470, 253, 214, 46, 0x12151b, 0.82);
    this.add.rectangle(150, 345, 220, 31, platformColor, 0.96)
      .setStrokeStyle(3, platformEdge);
    this.add.ellipse(150, 329, 192, 40, 0x12151b, 0.82);

    const lesson = this.snapshot.lessonId.toUpperCase();
    this.add.text(22, 18, `ENCOUNTER / ${lesson}`, {
      color: floorTwo ? "#68e8ee" : "#78c9b8",
      fontFamily: "monospace",
      fontSize: "10px",
      fontStyle: "bold",
      backgroundColor: "#08090cdd",
      padding: { x: 6, y: 4 },
    });
    this.roundText = this.add.text(618, 18, "ROUND 1", {
      color: floorTwo ? "#d9a1ff" : "#d7ad55",
      fontFamily: "monospace",
      fontSize: "10px",
      fontStyle: "bold",
      backgroundColor: "#08090cdd",
      padding: { x: 6, y: 4 },
    }).setOrigin(1, 0);

    const target = this.targetMonster();
    this.add.text(352, 64, target ? `${target.name}  ·  ID #${target.id}` : "未知怪物", {
      color: "#e8dfc7",
      fontFamily: "Georgia, serif",
      fontSize: target?.isBoss ? "18px" : "15px",
      fontStyle: "bold",
      backgroundColor: "#08090ccc",
      padding: { x: 7, y: 4 },
    });
    this.add.rectangle(352, 101, 258, 10, 0x0a0c10).setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x626779);
    this.monsterHp = this.add.rectangle(353, 101, 256, 8, COLORS.ember)
      .setOrigin(0, 0.5);
    this.monsterHpText = this.add.text(
      610,
      110,
      target ? `${target.hp} / ${target.maxHp} HP` : "— / — HP",
      {
        color: "#f1c8bf",
        fontFamily: "monospace",
        fontSize: "9px",
        fontStyle: "bold",
        backgroundColor: "#08090ccc",
        padding: { x: 4, y: 2 },
      },
    ).setOrigin(1, 0);

    this.add.text(24, 252, "SQL 探索者", {
      color: "#e8dfc7",
      fontFamily: "Georgia, serif",
      fontSize: "14px",
      fontStyle: "bold",
      backgroundColor: "#08090ccc",
      padding: { x: 6, y: 4 },
    });
    this.add.rectangle(25, 286, 204, 9, 0x0a0c10).setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x626779);
    this.playerHp = this.add.rectangle(26, 286, 202, 7, COLORS.query)
      .setOrigin(0, 0.5);

    this.intentText = this.add.text(320, 386, "敌方意图载入中", {
      color: "#f1c8bf",
      fontFamily: "monospace",
      fontSize: "10px",
      backgroundColor: "#241419ee",
      padding: { x: 9, y: 5 },
    }).setOrigin(0.5);
  }

  private createPlayer(): void {
    this.playerContainer = this.add.container(PLAYER_REST_X, 312).setDepth(8);
    this.playerContainer.add([
      this.add.rectangle(-11, 5, 14, 32, 0x3d5078),
      this.add.rectangle(7, 5, 17, 32, 0x6a7fac),
      this.add.rectangle(0, -19, 28, 19, COLORS.paper),
      this.add.rectangle(-8, -20, 5, 5, 0x14161d),
      this.add.rectangle(8, -20, 5, 5, 0x14161d),
      this.add.rectangle(-15, 25, 13, 7, 0x14161d),
      this.add.rectangle(15, 25, 13, 7, 0x14161d),
      this.add.rectangle(24, -1, 5, 43, COLORS.gold).setAngle(26),
    ]);
  }

  private createMonster(): void {
    const monster = this.targetMonster();
    this.monsterContainer = this.add.container(MONSTER_REST_X, 222).setDepth(8);
    if (!monster) return;
    const scale = monster.isBoss ? 1.35 : 1;
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (monster.kind === "projection-slime") {
      parts.push(
        this.add.rectangle(0, 12, 68, 42, 0x4f9a8f),
        this.add.rectangle(-19, -15, 35, 32, 0x70c4b3),
        this.add.rectangle(18, -17, 38, 36, 0x84d2be),
        this.add.rectangle(-12, 0, 8, 8, 0x10141b),
        this.add.rectangle(15, -2, 8, 8, 0x10141b),
      );
    } else if (monster.kind === "filter-hound") {
      parts.push(
        this.add.rectangle(-5, 9, 75, 40, 0x9b6747),
        this.add.rectangle(32, -17, 35, 35, 0xc08b5f),
        this.add.triangle(32, -43, 0, 22, 16, 0, 32, 22, 0x6f4233),
        this.add.rectangle(42, -17, 8, 8, COLORS.ember),
        this.add.rectangle(-27, 39, 10, 22, 0x6f4233),
        this.add.rectangle(24, 39, 10, 22, 0x6f4233),
      );
    } else if (monster.kind === "null-ghost") {
      parts.push(
        this.add.rectangle(0, 3, 62, 58, COLORS.plum, 0.95),
        this.add.rectangle(-20, 42, 20, 20, COLORS.plum, 0.95),
        this.add.rectangle(20, 42, 20, 20, COLORS.plum, 0.95),
        this.add.rectangle(-14, -8, 9, 11, COLORS.paper),
        this.add.rectangle(14, -8, 9, 11, COLORS.paper),
      );
    } else if (monster.kind === "sort-drake") {
      parts.push(
        this.add.rectangle(0, 7, 58, 43, 0x3f67a8).setStrokeStyle(6, 0x17275b),
        this.add.triangle(-55, 4, 0, 21, 38, 0, 38, 42, 0x5ad9df),
        this.add.triangle(55, 4, 0, 0, 38, 21, 0, 42, 0x5ad9df),
        this.add.rectangle(-14, -4, 8, 8, 0xdffcff),
        this.add.rectangle(14, -4, 8, 8, 0xdffcff),
        this.add.rectangle(0, 32, 35, 8, 0xd483ff),
      );
    } else if (monster.kind === "distinct-mimic") {
      parts.push(
        this.add.rectangle(-20, 5, 49, 58, 0x6e4aa0).setStrokeStyle(6, 0x28184c),
        this.add.rectangle(20, -2, 49, 58, 0x465fc0).setStrokeStyle(6, 0x28184c),
        this.add.rectangle(-26, -8, 8, 8, 0xa8f8ff),
        this.add.rectangle(14, -16, 8, 8, 0xa8f8ff),
        this.add.rectangle(0, 35, 48, 8, 0x251638),
      );
    } else if (monster.kind === "join-spider") {
      parts.push(
        this.add.rectangle(0, 10, 60, 50, 0x68449a).setStrokeStyle(6, 0x211545),
        this.add.rectangle(0, -24, 43, 29, 0x4c6cca),
        ...[-1, 1].flatMap((side) => [
          this.add.rectangle(side * 44, -10, 44, 7, 0x68e8ee).setAngle(side * 20),
          this.add.rectangle(side * 49, 18, 46, 7, 0x68e8ee).setAngle(side * -18),
          this.add.rectangle(side * 40, 43, 36, 7, 0x68e8ee).setAngle(side * -35),
        ]),
        this.add.rectangle(-12, -26, 8, 8, 0xffffff),
        this.add.rectangle(12, -26, 8, 8, 0xffffff),
      );
    } else if (monster.kind === "left-join-wraith") {
      parts.push(
        this.add.rectangle(-14, 4, 54, 68, 0x7547a7, 0.94),
        this.add.rectangle(24, 12, 26, 54, 0x2b2d65, 0.7),
        this.add.rectangle(-28, 42, 20, 18, 0x7547a7, 0.94),
        this.add.rectangle(6, 42, 20, 18, 0x7547a7, 0.94),
        this.add.rectangle(-22, -10, 8, 10, 0xe4fbff),
        this.add.text(14, -20, "NULL", {
          color: "#68e8ee",
          fontFamily: "monospace",
          fontSize: "12px",
          fontStyle: "bold",
        }).setOrigin(0.5),
      );
    } else if (monster.kind === "relation-titan") {
      parts.push(
        this.add.rectangle(0, 5, 96, 86, 0x303e88).setStrokeStyle(7, 0x17163f),
        this.add.rectangle(-38, -42, 38, 24, 0x8d51bf),
        this.add.rectangle(38, -42, 38, 24, 0x8d51bf),
        this.add.rectangle(-23, -10, 13, 13, 0x68e8ee),
        this.add.rectangle(23, -10, 13, 13, 0xd483ff),
        this.add.rectangle(0, 28, 56, 9, 0x151637),
        this.add.rectangle(-64, 7, 29, 9, 0x68e8ee),
        this.add.rectangle(64, 7, 29, 9, 0xd483ff),
      );
    } else {
      parts.push(
        this.add.rectangle(0, 4, 82, 78, 0x725a43).setStrokeStyle(7, 0x392e29),
        this.add.rectangle(-26, -29, 24, 18, 0xb68a50),
        this.add.rectangle(26, -29, 24, 18, 0xb68a50),
        this.add.rectangle(-17, -7, 10, 10, COLORS.ember),
        this.add.rectangle(17, -7, 10, 10, COLORS.ember),
        this.add.rectangle(0, 27, 39, 9, 0x392e29),
        this.add.rectangle(-51, 5, 10, 10, COLORS.query, 0.74),
        this.add.rectangle(51, -9, 10, 10, COLORS.query, 0.74),
      );
    }
    this.monsterContainer.add(parts);
    this.monsterContainer.setScale(scale);
    if (!this.reducedMotion) {
      this.tweens.add({
        targets: this.monsterContainer,
        y: this.monsterContainer.y - 5,
        yoyo: true,
        repeat: -1,
        duration: monster.isBoss ? 620 : 900,
        ease: "Sine.inOut",
      });
    }
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
      this.intentText.setText(
        this.snapshot.combat
          ? `敌方预告：${this.snapshot.combat.intent.name} · 错误时最高 ${this.snapshot.combat.intent.damage} 伤害`
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
      this.playDeath();
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

  private playDeath(): void {
    if (this.reducedMotion) {
      this.monsterContainer.setVisible(false);
      return;
    }
    this.addEffectTween({
      targets: this.monsterContainer,
      alpha: 0,
      y: this.monsterContainer.y + 20,
      duration: 300,
      ease: "Cubic.in",
    });
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
