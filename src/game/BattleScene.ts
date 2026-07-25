import Phaser from "phaser";
import { ArcadeAudio } from "../audio/ArcadeAudio";
import {
  biomeEncounterFor,
  type BiomeKind,
} from "../content/biomeContent";
import { playerActorProfile } from "../content/actorVisuals";
import { GameSession } from "../domain/GameSession";
import { monsterIdentityPresentation } from "../domain/monsterIdentity";
import type { GameSnapshot, Monster, TurnResolution } from "../domain/types";
import {
  createMonsterActor,
  createPlayerActor,
  startActorIdle,
} from "./PixelActorFactory";

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

const BIOME_ARENA: Readonly<Record<BiomeKind, {
  void: number;
  line: number;
  platform: number;
  edge: number;
  upperA: number;
  upperB: number;
  floor: number;
  accent: string;
}>> = {
  drainage: {
    void: 0x070b0e,
    line: 0x568491,
    platform: 0x26343a,
    edge: 0x668b95,
    upperA: 0x11191d,
    upperB: 0x172227,
    floor: 0x1d292e,
    accent: "#8dc5cf",
  },
  "slime-pool": {
    void: 0x07100c,
    line: 0x58a77c,
    platform: 0x20382c,
    edge: 0x70b58d,
    upperA: 0x102019,
    upperB: 0x152a20,
    floor: 0x1c3328,
    accent: "#91d7aa",
  },
  "ember-cellar": {
    void: 0x110907,
    line: 0xb06b43,
    platform: 0x3b2921,
    edge: 0xb77c55,
    upperA: 0x251510,
    upperB: 0x301a13,
    floor: 0x3a241b,
    accent: "#e3aa72",
  },
  lake: {
    void: 0x040b13,
    line: 0x4b9fbe,
    platform: 0x17384a,
    edge: 0x6ab9cf,
    upperA: 0x0a1b29,
    upperB: 0x0e2637,
    floor: 0x143247,
    accent: "#8bd9eb",
  },
  swamp: {
    void: 0x090c07,
    line: 0x85974d,
    platform: 0x2d3420,
    edge: 0x9cac5e,
    upperA: 0x161b10,
    upperB: 0x202615,
    floor: 0x292f1c,
    accent: "#bdcc7a",
  },
  forest: {
    void: 0x050a07,
    line: 0x438358,
    platform: 0x1e3527,
    edge: 0x62a373,
    upperA: 0x0d1811,
    upperB: 0x132219,
    floor: 0x1b2d21,
    accent: "#8bc99a",
  },
  "bone-yard": {
    void: 0x090806,
    line: 0xa99878,
    platform: 0x39332b,
    edge: 0xc9b78e,
    upperA: 0x191612,
    upperB: 0x211d18,
    floor: 0x302a24,
    accent: "#e1d3ad",
  },
  "grave-mire": {
    void: 0x070a07,
    line: 0x75896d,
    platform: 0x30372c,
    edge: 0x95a68a,
    upperA: 0x151a14,
    upperB: 0x1d231b,
    floor: 0x293126,
    accent: "#b5c8a8",
  },
  "spirit-crypt": {
    void: 0x09060e,
    line: 0x956cb4,
    platform: 0x382a43,
    edge: 0xb58bd0,
    upperA: 0x17101e,
    upperB: 0x201529,
    floor: 0x30233b,
    accent: "#d2a8e8",
  },
  "fire-forge": {
    void: 0x120503,
    line: 0xd65335,
    platform: 0x4e251c,
    edge: 0xf17a48,
    upperA: 0x27100a,
    upperB: 0x34150d,
    floor: 0x451d14,
    accent: "#ffad68",
  },
  "frost-vault": {
    void: 0x030b12,
    line: 0x58aeca,
    platform: 0x193b4b,
    edge: 0x85d3e8,
    upperA: 0x0a1b26,
    upperB: 0x0e2634,
    floor: 0x153442,
    accent: "#adf0ff",
  },
  "storm-core": {
    void: 0x080616,
    line: 0x8065c4,
    platform: 0x2d2856,
    edge: 0xae8bea,
    upperA: 0x131027,
    upperB: 0x1b1735,
    floor: 0x28234a,
    accent: "#d0b3ff",
  },
  "iron-yard": {
    void: 0x05080a,
    line: 0x72868d,
    platform: 0x29343a,
    edge: 0x91a4aa,
    upperA: 0x11171a,
    upperB: 0x182126,
    floor: 0x212c31,
    accent: "#b3cbd0",
  },
  barracks: {
    void: 0x0b0805,
    line: 0xa67745,
    platform: 0x3c3026,
    edge: 0xd09b5f,
    upperA: 0x1d1711,
    upperB: 0x282016,
    floor: 0x342a20,
    accent: "#e1b77e",
  },
  "black-citadel": {
    void: 0x050506,
    line: 0xa48c4a,
    platform: 0x333439,
    edge: 0xd0b65b,
    upperA: 0x151518,
    upperB: 0x1e1f23,
    floor: 0x2b2c31,
    accent: "#e5ca72",
  },
  "magma-nest": {
    void: 0x100302,
    line: 0xd84d2f,
    platform: 0x4a2119,
    edge: 0xff7845,
    upperA: 0x250d08,
    upperB: 0x321009,
    floor: 0x41180f,
    accent: "#ff9a69",
  },
  "crystal-cavern": {
    void: 0x03080e,
    line: 0x4fa8ad,
    platform: 0x27354a,
    edge: 0x76dad7,
    upperA: 0x0c1522,
    upperB: 0x111e2e,
    floor: 0x1d2b3e,
    accent: "#9ce8e4",
  },
  "dragon-throne": {
    void: 0x0f0204,
    line: 0xc89245,
    platform: 0x472027,
    edge: 0xecb557,
    upperA: 0x26090e,
    upperB: 0x340d14,
    floor: 0x40151c,
    accent: "#f5ca76",
  },
  "crystal-grove": {
    void: 0x020b09, line: 0x65c9b4, platform: 0x1d463e, edge: 0x8ee8d3,
    upperA: 0x0b211c, upperB: 0x103028, floor: 0x173a32, accent: "#a8f2df",
  },
  "root-maze": {
    void: 0x070b05, line: 0x80925b, platform: 0x34422c, edge: 0xa8bc76,
    upperA: 0x171d11, upperB: 0x222917, floor: 0x2e3926, accent: "#c5d991",
  },
  "index-heart": {
    void: 0x020a0b, line: 0x58bfc1, platform: 0x1c4245, edge: 0x83dfe0,
    upperA: 0x091e20, upperB: 0x0d2b2d, floor: 0x17383a, accent: "#a8eded",
  },
  "obsidian-hall": {
    void: 0x030205, line: 0x6d657d, platform: 0x272431, edge: 0x9287a5,
    upperA: 0x0e0c13, upperB: 0x16131d, floor: 0x201d29, accent: "#b4a9c3",
  },
  "void-court": {
    void: 0x050207, line: 0x84539c, platform: 0x34203e, edge: 0xae70c7,
    upperA: 0x15091b, upperB: 0x200e29, floor: 0x2d1738, accent: "#d19ae4",
  },
  "data-throne": {
    void: 0x070402, line: 0xb58b39, platform: 0x49351d, edge: 0xe1b553,
    upperA: 0x1e1408, upperB: 0x2b1d0c, floor: 0x3b2915, accent: "#f4d27a",
  },
};

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
    const target = this.targetMonster();
    const biome = target
      ? biomeEncounterFor(target.id)?.biome ?? this.snapshot.currentBiome
      : this.snapshot.currentBiome;
    const palette = BIOME_ARENA[biome];
    this.cameras.main.setBackgroundColor(palette.void);
    this.add.rectangle(320, 208, 640, 416, palette.void);
    for (let y = 0; y < 13; y += 1) {
      for (let x = 0; x < 20; x += 1) {
        this.add.rectangle(
          x * 32 + 16,
          y * 32 + 16,
          32,
          32,
          y < 7
            ? ((x + y) % 2 === 0 ? palette.upperA : palette.upperB)
            : palette.floor,
        ).setStrokeStyle(1, 0x0e1016, 0.55);
      }
    }
    this.drawBiomeSilhouette(biome, palette.line);
    this.add.rectangle(320, 198, 610, 5, palette.line, 0.65);
    this.add.rectangle(470, 270, 240, 34, palette.platform, 0.96)
      .setStrokeStyle(3, palette.edge);
    this.add.ellipse(470, 253, 214, 46, 0x12151b, 0.82);
    this.add.rectangle(150, 345, 220, 31, palette.platform, 0.96)
      .setStrokeStyle(3, palette.edge);
    this.add.ellipse(150, 329, 192, 40, 0x12151b, 0.82);

    const lesson = this.snapshot.lessonId.toUpperCase();
    this.add.text(22, 18, `ENCOUNTER / ${lesson} / ${biome.toUpperCase()}`, {
      color: palette.accent,
      fontFamily: "monospace",
      fontSize: "10px",
      fontStyle: "bold",
      backgroundColor: "#08090cdd",
      padding: { x: 6, y: 4 },
    });
    this.roundText = this.add.text(618, 18, "ROUND 1", {
      color: palette.accent,
      fontFamily: "monospace",
      fontSize: "10px",
      fontStyle: "bold",
      backgroundColor: "#08090cdd",
      padding: { x: 6, y: 4 },
    }).setOrigin(1, 0);

    const identity = target
      ? monsterIdentityPresentation(
        target,
        this.snapshot.profile.discoveredMonsterIds,
      )
      : null;
    this.add.text(352, 64, identity?.worldLabel ?? "未知记录", {
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

  private drawBiomeSilhouette(biome: BiomeKind, color: number): void {
    if (biome === "lake") {
      [82, 118, 154].forEach((y, index) => {
        this.add.rectangle(320 + (index % 2 === 0 ? -28 : 34), y, 520, 3, color, 0.22);
      });
      return;
    }
    if (biome === "swamp") {
      for (let x = 44; x < 620; x += 48) {
        this.add.rectangle(x, 157, 4, 58 + (x % 3) * 5, color, 0.22)
          .setOrigin(0.5, 1)
          .setAngle(x % 2 === 0 ? -7 : 9);
      }
      return;
    }
    if (biome === "forest") {
      for (let x = 46; x < 620; x += 72) {
        this.add.rectangle(x, 160, 13, 104, color, 0.18).setOrigin(0.5, 1);
        this.add.rectangle(x - 12, 77, 34, 34, color, 0.13);
        this.add.rectangle(x + 13, 67, 38, 38, color, 0.13);
      }
      return;
    }
    if (biome === "slime-pool") {
      for (let x = 70; x < 620; x += 82) {
        this.add.ellipse(x, 171, 50, 14, color, 0.18);
      }
      return;
    }
    if (biome === "ember-cellar") {
      for (let x = 76; x < 620; x += 112) {
        this.add.triangle(x, 165, -8, 12, 0, -16, 8, 12, color, 0.22);
      }
      return;
    }
    if (biome === "bone-yard" || biome === "grave-mire") {
      for (let x = 58; x < 620; x += 76) {
        this.add.rectangle(x, 157, 18, 48, color, 0.18).setOrigin(0.5, 1);
        this.add.rectangle(x, 113, 28, 5, color, 0.22);
      }
      return;
    }
    if (biome === "spirit-crypt" || biome === "storm-core") {
      for (let x = 70; x < 620; x += 94) {
        this.add.polygon(x, 132, [0, -19, 10, 0, 5, 20, -7, 17, -11, 0], color, 0.18);
      }
      return;
    }
    if (biome === "fire-forge") {
      for (let x = 70; x < 620; x += 102) {
        this.add.triangle(x, 163, -12, 17, 0, -23, 12, 17, color, 0.24);
      }
      return;
    }
    if (biome === "frost-vault") {
      for (let x = 64; x < 620; x += 86) {
        this.add.triangle(x, 154, -13, 20, 0, -25, 13, 20, color, 0.2);
      }
      return;
    }
    if (biome === "iron-yard" || biome === "barracks" || biome === "black-citadel") {
      for (let x = 54; x < 620; x += 78) {
        this.add.rectangle(x, 155, 42, 50, color, 0.14).setOrigin(0.5, 1);
        this.add.rectangle(x - 13, 102, 12, 15, color, 0.2);
        this.add.rectangle(x + 13, 102, 12, 15, color, 0.2);
      }
      return;
    }
    if (biome === "magma-nest") {
      for (let x = 72; x < 620; x += 96) {
        this.add.ellipse(x, 157, 54, 22, color, 0.18);
        this.add.ellipse(x, 137, 20, 31, color, 0.14)
          .setStrokeStyle(2, color, 0.2);
      }
      return;
    }
    if (biome === "crystal-cavern") {
      for (let x = 62; x < 620; x += 83) {
        this.add.polygon(x, 133, [0, -27, 13, -5, 8, 26, -10, 22, -14, -4], color, 0.18);
      }
      return;
    }
    if (biome === "dragon-throne") {
      for (let x = 64; x < 620; x += 110) {
        this.add.rectangle(x, 146, 70, 7, color, 0.16).setAngle(x % 3 === 0 ? -14 : 14);
        this.add.triangle(x - 29, 131, -8, 11, 0, -13, 8, 11, color, 0.2);
      }
      return;
    }
    this.add.rectangle(320, 142, 536, 22, color, 0.11)
      .setStrokeStyle(3, color, 0.22);
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
