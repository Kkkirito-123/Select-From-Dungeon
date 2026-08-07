import Phaser from "phaser";
import type { GameSnapshot } from "../../contracts/game/snapshots";

type ArtFloor = Extract<GameSnapshot["floor"], 1 | 2>;

interface RuntimeTexture {
  key: string;
  path: string;
  frameWidth?: number;
  frameHeight?: number;
}

const FLOOR_ONE_ROOT = "assets/floors/01-ember-archive/sources/0x72-dungeontileset-ii";
const FLOOR_TWO_PUNY_ROOT =
  "assets/floors/02-tidal-archipelago/sources/shade-puny-world";
const FLOOR_TWO_WATER_ROOT =
  "assets/floors/02-tidal-archipelago/sources/foozle-scallywag-water-islands";

export const FLOOR_ART_KEYS = {
  floorOne: {
    floor: "f01-cc0-floor",
    walls: "f01-cc0-walls",
    doorClosed: "f01-cc0-door-closed",
    doorOpen: "f01-cc0-door-open",
    leverClosed: "f01-cc0-lever-closed",
    leverOpen: "f01-cc0-lever-open",
  },
  floorTwo: {
    overworld: "f02-cc0-puny-overworld",
    waterAndIslands: "f02-cc0-scallywag-water",
  },
} as const;

export const FLOOR_ART_FRAMES = {
  floorOne: {
    dryStone: 0,
    crackedStone: 1,
    wetStone: 2,
    stair: 16,
    drain: 17,
    trapDark: 21,
    trapLight: 24,
    emberLow: 37,
    emberHigh: 38,
    wallCap: 2,
    wallCorner: 36,
    wallRun: 37,
    wallBroken: 40,
  },
  floorTwo: {
    grass: 27,
    grassDetail: 28,
    sand: 13,
    sandDetail: 25,
    cliff: 128,
    tree: 217,
    treeAlt: 218,
    hut: 760,
    hutAlt: 762,
    sign: 841,
    deepWater: 14,
    deepWaterAlt: 15,
    shallowWater: 34,
    shallowWaterAlt: 38,
    coast: 24,
    coastAlt: 48,
    chest: 61,
    chestOpen: 64,
    boatLeft: 148,
    boatRight: 149,
    reedLeft: 150,
    reedRight: 151,
    reedLow: 152,
    reedWide: 153,
    rock: 144,
    rockAlt: 147,
    bridgeLog: 198,
    bridgeLogAlt: 199,
  },
} as const;

export const FLOOR_ART_ASSETS: Readonly<Record<ArtFloor, readonly RuntimeTexture[]>> = {
  1: [
    {
      key: FLOOR_ART_KEYS.floorOne.floor,
      path: `${FLOOR_ONE_ROOT}/atlas-floor-16x16.png`,
      frameWidth: 16,
      frameHeight: 16,
    },
    {
      key: FLOOR_ART_KEYS.floorOne.walls,
      path: `${FLOOR_ONE_ROOT}/atlas-walls-low-16x16.png`,
      frameWidth: 16,
      frameHeight: 16,
    },
    {
      key: FLOOR_ART_KEYS.floorOne.doorClosed,
      path: `${FLOOR_ONE_ROOT}/door-closed.png`,
    },
    {
      key: FLOOR_ART_KEYS.floorOne.doorOpen,
      path: `${FLOOR_ONE_ROOT}/door-open.png`,
    },
    {
      key: FLOOR_ART_KEYS.floorOne.leverClosed,
      path: `${FLOOR_ONE_ROOT}/lever-closed.png`,
    },
    {
      key: FLOOR_ART_KEYS.floorOne.leverOpen,
      path: `${FLOOR_ONE_ROOT}/lever-open.png`,
    },
  ],
  2: [
    {
      key: FLOOR_ART_KEYS.floorTwo.overworld,
      path: `${FLOOR_TWO_PUNY_ROOT}/overworld-16x16.png`,
      frameWidth: 16,
      frameHeight: 16,
    },
    {
      key: FLOOR_ART_KEYS.floorTwo.waterAndIslands,
      path: `${FLOOR_TWO_WATER_ROOT}/water-and-islands-16x16.png`,
      frameWidth: 16,
      frameHeight: 16,
    },
  ],
};

export function supportsFloorArt(floor: GameSnapshot["floor"]): floor is ArtFloor {
  return floor === 1 || floor === 2;
}

export function floorArtReady(scene: Phaser.Scene, floor: GameSnapshot["floor"]): boolean {
  if (!supportsFloorArt(floor)) return false;
  return FLOOR_ART_ASSETS[floor].every((asset) => scene.textures.exists(asset.key));
}

export function queueFloorArtAssets(
  scene: Phaser.Scene,
  floor: GameSnapshot["floor"],
): boolean {
  if (!supportsFloorArt(floor)) return false;
  let queued = false;
  FLOOR_ART_ASSETS[floor].forEach((asset) => {
    if (scene.textures.exists(asset.key)) return;
    if (asset.frameWidth && asset.frameHeight) {
      scene.load.spritesheet(asset.key, asset.path, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
      });
    } else {
      scene.load.image(asset.key, asset.path);
    }
    queued = true;
  });
  return queued;
}
