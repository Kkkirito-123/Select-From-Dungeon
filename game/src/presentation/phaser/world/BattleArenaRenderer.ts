import Phaser from "phaser";
import { biomeEncounterFor, type BiomeKind } from "../../../content/world/biomeContent";
import { monsterIdentityPresentation } from "../../../domain/progression/monsterIdentity";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { Monster } from "../../../domain/shared/types";

const HUD_COLORS = { query: 0x78c9b8, ember: 0xc75248 } as const;

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

export interface BattleArenaView {
  roundText: Phaser.GameObjects.Text;
  monsterHp: Phaser.GameObjects.Rectangle;
  monsterHpText: Phaser.GameObjects.Text;
  playerHp: Phaser.GameObjects.Rectangle;
  intentText: Phaser.GameObjects.Text;
}

export function createBattleArena(
  scene: Phaser.Scene,
  snapshot: GameSnapshot,
  target: Monster | undefined,
): BattleArenaView {
    const biome = target
      ? biomeEncounterFor(target.id)?.biome ?? snapshot.currentBiome
      : snapshot.currentBiome;
    const palette = BIOME_ARENA[biome];
    scene.cameras.main.setBackgroundColor(palette.void);
    scene.add.rectangle(320, 208, 640, 416, palette.void);
    for (let y = 0; y < 13; y += 1) {
      for (let x = 0; x < 20; x += 1) {
        scene.add.rectangle(
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
    drawBiomeSilhouette(scene, biome, palette.line);
    scene.add.rectangle(320, 198, 610, 5, palette.line, 0.65);
    scene.add.rectangle(470, 270, 240, 34, palette.platform, 0.96)
      .setStrokeStyle(3, palette.edge);
    scene.add.ellipse(470, 253, 214, 46, 0x12151b, 0.82);
    scene.add.rectangle(150, 345, 220, 31, palette.platform, 0.96)
      .setStrokeStyle(3, palette.edge);
    scene.add.ellipse(150, 329, 192, 40, 0x12151b, 0.82);

    const lesson = snapshot.lessonId.toUpperCase();
    scene.add.text(22, 18, `ENCOUNTER / ${lesson} / ${biome.toUpperCase()}`, {
      color: palette.accent,
      fontFamily: "monospace",
      fontSize: "10px",
      fontStyle: "bold",
      backgroundColor: "#08090cdd",
      padding: { x: 6, y: 4 },
    });
    const roundText = scene.add.text(618, 18, "ROUND 1", {
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
        snapshot.profile.discoveredMonsterIds,
      )
      : null;
    scene.add.text(352, 64, identity?.worldLabel ?? "未知记录", {
      color: "#e8dfc7",
      fontFamily: "Georgia, serif",
      fontSize: target?.isBoss ? "18px" : "15px",
      fontStyle: "bold",
      backgroundColor: "#08090ccc",
      padding: { x: 7, y: 4 },
    });
    scene.add.rectangle(352, 101, 258, 10, 0x0a0c10).setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x626779);
    const monsterHp = scene.add.rectangle(353, 101, 256, 8, HUD_COLORS.ember)
      .setOrigin(0, 0.5);
    const monsterHpText = scene.add.text(
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

    scene.add.text(24, 252, "SQL 探索者", {
      color: "#e8dfc7",
      fontFamily: "Georgia, serif",
      fontSize: "14px",
      fontStyle: "bold",
      backgroundColor: "#08090ccc",
      padding: { x: 6, y: 4 },
    });
    scene.add.rectangle(25, 286, 204, 9, 0x0a0c10).setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x626779);
    const playerHp = scene.add.rectangle(26, 286, 202, 7, HUD_COLORS.query)
      .setOrigin(0, 0.5);

    const intentText = scene.add.text(320, 386, "敌方意图载入中", {
      color: "#f1c8bf",
      fontFamily: "monospace",
      fontSize: "10px",
      backgroundColor: "#241419ee",
      padding: { x: 9, y: 5 },
    }).setOrigin(0.5);

  return { roundText, monsterHp, monsterHpText, playerHp, intentText };
}

function drawBiomeSilhouette(
  scene: Phaser.Scene,
  biome: BiomeKind,
  color: number,
): void {
    if (biome === "lake") {
      [82, 118, 154].forEach((y, index) => {
        scene.add.rectangle(320 + (index % 2 === 0 ? -28 : 34), y, 520, 3, color, 0.22);
      });
      return;
    }
    if (biome === "swamp") {
      for (let x = 44; x < 620; x += 48) {
        scene.add.rectangle(x, 157, 4, 58 + (x % 3) * 5, color, 0.22)
          .setOrigin(0.5, 1)
          .setAngle(x % 2 === 0 ? -7 : 9);
      }
      return;
    }
    if (biome === "forest") {
      for (let x = 46; x < 620; x += 72) {
        scene.add.rectangle(x, 160, 13, 104, color, 0.18).setOrigin(0.5, 1);
        scene.add.rectangle(x - 12, 77, 34, 34, color, 0.13);
        scene.add.rectangle(x + 13, 67, 38, 38, color, 0.13);
      }
      return;
    }
    if (biome === "slime-pool") {
      for (let x = 70; x < 620; x += 82) {
        scene.add.ellipse(x, 171, 50, 14, color, 0.18);
      }
      return;
    }
    if (biome === "ember-cellar") {
      for (let x = 76; x < 620; x += 112) {
        scene.add.triangle(x, 165, -8, 12, 0, -16, 8, 12, color, 0.22);
      }
      return;
    }
    if (biome === "bone-yard" || biome === "grave-mire") {
      for (let x = 58; x < 620; x += 76) {
        scene.add.rectangle(x, 157, 18, 48, color, 0.18).setOrigin(0.5, 1);
        scene.add.rectangle(x, 113, 28, 5, color, 0.22);
      }
      return;
    }
    if (biome === "spirit-crypt" || biome === "storm-core") {
      for (let x = 70; x < 620; x += 94) {
        scene.add.polygon(x, 132, [0, -19, 10, 0, 5, 20, -7, 17, -11, 0], color, 0.18);
      }
      return;
    }
    if (biome === "fire-forge") {
      for (let x = 70; x < 620; x += 102) {
        scene.add.triangle(x, 163, -12, 17, 0, -23, 12, 17, color, 0.24);
      }
      return;
    }
    if (biome === "frost-vault") {
      for (let x = 64; x < 620; x += 86) {
        scene.add.triangle(x, 154, -13, 20, 0, -25, 13, 20, color, 0.2);
      }
      return;
    }
    if (biome === "iron-yard" || biome === "barracks" || biome === "black-citadel") {
      for (let x = 54; x < 620; x += 78) {
        scene.add.rectangle(x, 155, 42, 50, color, 0.14).setOrigin(0.5, 1);
        scene.add.rectangle(x - 13, 102, 12, 15, color, 0.2);
        scene.add.rectangle(x + 13, 102, 12, 15, color, 0.2);
      }
      return;
    }
    if (biome === "magma-nest") {
      for (let x = 72; x < 620; x += 96) {
        scene.add.ellipse(x, 157, 54, 22, color, 0.18);
        scene.add.ellipse(x, 137, 20, 31, color, 0.14)
          .setStrokeStyle(2, color, 0.2);
      }
      return;
    }
    if (biome === "crystal-cavern") {
      for (let x = 62; x < 620; x += 83) {
        scene.add.polygon(x, 133, [0, -27, 13, -5, 8, 26, -10, 22, -14, -4], color, 0.18);
      }
      return;
    }
    if (biome === "dragon-throne") {
      for (let x = 64; x < 620; x += 110) {
        scene.add.rectangle(x, 146, 70, 7, color, 0.16).setAngle(x % 3 === 0 ? -14 : 14);
        scene.add.triangle(x - 29, 131, -8, 11, 0, -13, 8, 11, color, 0.2);
      }
      return;
    }
    scene.add.rectangle(320, 142, 536, 22, color, 0.11)
      .setStrokeStyle(3, color, 0.22);
}
