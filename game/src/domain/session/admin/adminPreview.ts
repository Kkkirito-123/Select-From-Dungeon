/**
 * 管理员预览的确定性状态计算。
 *
 * 本模块不持有会话状态，也不发送快照。GameSession 负责校验管理员模式、
 * 逐字段提交计算结果、补齐隐藏区域奖励、揭示地图并发送通知。
 */
import { floorExperience, hasFloorExperience } from "../../../content/world/floorExperience";
import { isFloorOneChestItem } from "../../exploration/floorOneTreasure";
import { generateCampfires } from "../../exploration/campfire";
import {
  biomeRegionAt,
  generateBiomePlan,
  type BiomePlan,
} from "../../exploration/biome";
import {
  generateGuidedMapPlan,
  type GuidedMapPlan,
} from "../../exploration/guidedMap";
import {
  generateMazeFloor,
  isMazeWalkable,
  type MazeFloor,
} from "../../exploration/mazeGenerator";
import type { WorldActor } from "../../exploration/monsterRoaming";
import {
  INITIAL_SAFE_STEPS,
  type EncounterMeter,
} from "../../exploration/encounterDirector";
import {
  createCampaignProgress,
  type CampaignProgress,
} from "../../progression/campaign";
import {
  generateRoomGraph,
  type FloorNumber,
  type RoomGraph,
} from "../../progression/runGraph";
import type {
  Campfire,
  GroundItem,
  LessonId,
  Monster,
  PlayerState,
  Position,
} from "../../shared/types";
import {
  initialActors,
  initialGroundItems,
  monstersForFloor,
} from "../lifecycle/sessionWorld";
import { allMapCellKeys, distance } from "../sessionState";

export interface AdminFloorPreview {
  campaign: CampaignProgress;
  floor: FloorNumber;
  graph: RoomGraph;
  mazeFloor: MazeFloor;
  campfires: Campfire[];
  guidedMap: GuidedMapPlan;
  biomePlan: BiomePlan;
  currentRoomId: string;
  player: PlayerState;
  monsters: Monster[];
  worldActors: WorldActor[];
  groundItems: GroundItem[];
  encounterMeter: EncounterMeter;
}

export function createAdminFloorPreview(
  baseSeed: string,
  floor: FloorNumber,
  currentPlayer: PlayerState,
): AdminFloorPreview | null {
  const campaign = createCampaignProgress(baseSeed, floor);
  const floorSeed = campaign.floors.find((slot) => slot.floor === floor)?.seed;
  if (!floorSeed) return null;
  const graph = generateRoomGraph(floorSeed, floor);
  const mazeFloor = generateMazeFloor(graph);
  const campfires = generateCampfires(graph, mazeFloor);
  const guidedMap = generateGuidedMapPlan(graph, mazeFloor, campfires);
  const biomePlan = generateBiomePlan(graph, mazeFloor, campfires, guidedMap);
  const monsters = monstersForFloor(floor);
  return {
    campaign,
    floor,
    graph,
    mazeFloor,
    campfires,
    guidedMap,
    biomePlan,
    currentRoomId: graph.entryId,
    player: {
      ...currentPlayer,
      ...mazeFloor.spawn,
      hp: currentPlayer.maxHp,
      heat: 0,
      weapon: { ...currentPlayer.weapon },
      armor: currentPlayer.armor ? { ...currentPlayer.armor } : null,
    },
    monsters,
    worldActors: initialActors(graph, mazeFloor, monsters, biomePlan),
    groundItems: initialGroundItems(graph, mazeFloor, campfires, guidedMap),
    encounterMeter: {
      totalMoves: 0,
      stepsSinceEncounter: 0,
      safeStepsRemaining: INITIAL_SAFE_STEPS,
    },
  };
}

export interface AdminPresetInput {
  floor: FloorNumber;
  presetId: string;
  graph: RoomGraph;
  mazeFloor: MazeFloor;
  campfires: readonly Campfire[];
  guidedMap: GuidedMapPlan;
  monsters: readonly Monster[];
  worldActors: readonly WorldActor[];
}

export type AdminPresetResolution =
  | { ok: false; message: string }
  | {
      ok: true;
      label: string;
      landmarkName: string;
      completedLessons: Set<LessonId>;
      openedGateIds: Set<string>;
      keyItems: string[];
      adminIdentityMonsterIds: Set<number>;
      monsters: Monster[];
      visitedRoomIds: Set<string>;
      completedRoomIds: Set<string>;
      groundItems: GroundItem[];
      destination: Position;
      currentRoomId: string;
    };

function livingActorAt(
  worldActors: readonly WorldActor[],
  monsters: readonly Monster[],
  position: Position,
): boolean {
  return worldActors.some((actor) => {
    const monster = monsters.find((entry) => entry.id === actor.monsterId);
    return monster && monster.hp > 0 && actor.x === position.x && actor.y === position.y;
  });
}

export function resolveAdminPreset(
  input: AdminPresetInput,
): AdminPresetResolution {
  if (!hasFloorExperience(input.floor)) {
    return { ok: false, message: "当前楼层还没有可用的精修状态预设。" };
  }
  const experience = floorExperience(input.floor);
  const preset = experience.adminPresets.find((entry) => entry.id === input.presetId);
  if (!preset) return { ok: false, message: "未知管理员状态预设。" };
  const focusLandmark = experience.landmarks.find(
    (landmark) => landmark.id === preset.focusLandmarkId,
  );
  if (!focusLandmark) {
    return { ok: false, message: "管理员预设缺少有效地标落点。" };
  }
  const focusZone = input.mazeFloor.zones.find(
    (zone) => zone.roomNodeId === focusLandmark.anchor.roomNodeId,
  );
  if (!focusZone) {
    return { ok: false, message: "管理员预设地标没有对应的物理房间。" };
  }

  const completedLessons = new Set<LessonId>(preset.completedLessonIds);
  const adminIdentityMonsterIds = new Set(preset.defeatedMonsterIds);
  const monsters = input.monsters.map((monster) => ({
    ...monster,
    hp: adminIdentityMonsterIds.has(monster.id) ? 0 : monster.maxHp,
  }));
  const completedRoomIds = new Set<string>([
    input.graph.entryId,
    ...(preset.keepFocusRoomIncomplete ? [] : [focusLandmark.anchor.roomNodeId]),
    ...input.graph.nodes
      .filter((room) => room.lessonId && completedLessons.has(room.lessonId))
      .map((room) => room.id),
  ]);
  const target = {
    x: Math.round(
      focusZone.x + focusLandmark.anchor.position.x * Math.max(1, focusZone.width - 1),
    ),
    y: Math.round(
      focusZone.y + focusLandmark.anchor.position.y * Math.max(1, focusZone.height - 1),
    ),
  };
  const candidates: Position[] = [];
  for (let radius = 0; radius <= Math.max(focusZone.width, focusZone.height); radius += 1) {
    for (let y = target.y - radius; y <= target.y + radius; y += 1) {
      for (let x = target.x - radius; x <= target.x + radius; x += 1) {
        if (Math.abs(x - target.x) + Math.abs(y - target.y) !== radius) continue;
        candidates.push({ x, y });
      }
    }
  }
  const openedGateIds = new Set(preset.openedGateIds);
  const destination = candidates.find((position) => (
    position.x >= focusZone.x &&
    position.x < focusZone.x + focusZone.width &&
    position.y >= focusZone.y &&
    position.y < focusZone.y + focusZone.height &&
    isMazeWalkable(
      input.mazeFloor,
      position.x,
      position.y,
      completedLessons,
      openedGateIds,
    ) &&
    !livingActorAt(input.worldActors, monsters, position)
  )) ?? input.mazeFloor.anchors[focusZone.roomNodeId] ?? input.mazeFloor.spawn;

  return {
    ok: true,
    label: preset.label,
    landmarkName: focusLandmark.name,
    completedLessons,
    openedGateIds,
    keyItems: [...preset.collectedKeyItems],
    adminIdentityMonsterIds,
    monsters,
    visitedRoomIds: new Set([...completedRoomIds, focusLandmark.anchor.roomNodeId]),
    completedRoomIds,
    groundItems: initialGroundItems(
      input.graph,
      input.mazeFloor,
      input.campfires,
      input.guidedMap,
    ).filter(
      (item) => isFloorOneChestItem(item) || !completedRoomIds.has(item.sourceRoomId),
    ),
    destination,
    currentRoomId: focusZone.roomNodeId,
  };
}

export interface AdminRegionInput {
  regionId: string;
  biomePlan: BiomePlan;
  mazeFloor: MazeFloor;
  campfires: readonly Campfire[];
  monsters: readonly Monster[];
  worldActors: readonly WorldActor[];
  player: Position;
}

export type AdminRegionResolution =
  | { ok: false; message: string }
  | {
      ok: true;
      destination: Position;
      fromName: string;
      toName: string;
    };

export function resolveAdminRegion(
  input: AdminRegionInput,
): AdminRegionResolution {
  const region = input.biomePlan.regions.find((entry) => entry.id === input.regionId);
  if (!region) return { ok: false, message: "未知生态区域。" };
  const candidates = [
    region.anchor,
    ...input.biomePlan.portals.flatMap((portal) => {
      const positions: Position[] = [];
      if (portal.fromRegionId === input.regionId) positions.push(portal.entry);
      if (portal.toRegionId === input.regionId) positions.push(portal.exit);
      return positions;
    }),
    ...allMapCellKeys(input.mazeFloor)
      .map((key) => {
        const [x, y] = key.split(":").map(Number);
        return { x, y };
      })
      .filter((position) => input.mazeFloor.tiles[position.y]?.[position.x] === ".")
      .sort((left, right) => distance(left, region.anchor) - distance(right, region.anchor)),
  ];
  const destination = candidates.find((position) => (
    input.mazeFloor.tiles[position.y]?.[position.x] === "." &&
    !livingActorAt(input.worldActors, input.monsters, position) &&
    !input.campfires.some(
      (campfire) => campfire.x === position.x && campfire.y === position.y,
    )
  ));
  if (!destination) return { ok: false, message: "该区域没有可用的管理员落点。" };
  return {
    ok: true,
    destination: { ...destination },
    fromName: biomeRegionAt(input.biomePlan, input.player).name,
    toName: region.name,
  };
}
