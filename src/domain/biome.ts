import {
  BIOME_ENCOUNTERS,
  type BiomeKind,
} from "../content/biomeContent";
import type { Campfire, Position } from "./types";
import type { GuidedMapPlan } from "./guidedMap";
import {
  mazeTileAt,
  type MazeFloor,
} from "./mazeGenerator";
import {
  stableStringHash,
  type RoomGraph,
  type RunLessonId,
} from "./runGraph";
import { safeZoneCellKeys } from "./campfire";

export const BIOME_PLAN_VERSION = 1 as const;

export type BiomeFeatureKind =
  | "drain"
  | "slime"
  | "ember"
  | "water"
  | "reeds"
  | "tree"
  | "bones"
  | "grave"
  | "ghost-flame"
  | "lava"
  | "ice"
  | "crystal"
  | "iron"
  | "banner"
  | "battlement"
  | "egg"
  | "magma"
  | "dragon-bone";

export interface BiomeRegion {
  id: string;
  kind: BiomeKind;
  name: string;
  anchor: Position;
  sourceRoomNodeId: string;
  areaBossId: number | null;
  areaBossPosition: Position | null;
}

export interface BiomeFeature extends Position {
  id: string;
  kind: BiomeFeatureKind;
  biome: BiomeKind;
}

export interface BiomePlan {
  version: 1;
  seed: string;
  floor: RoomGraph["floor"];
  regions: BiomeRegion[];
  features: BiomeFeature[];
}

interface RegionTemplate {
  kind: BiomeKind;
  name: string;
  lessonId: RunLessonId;
  feature: BiomeFeatureKind;
}

const FLOOR_ONE_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "drainage", name: "青石排水渠", lessonId: "select", feature: "drain" },
  { kind: "slime-pool", name: "软泥水池", lessonId: "where", feature: "slime" },
  { kind: "ember-cellar", name: "余烬仓窖", lessonId: "having", feature: "ember" },
];

const FLOOR_TWO_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "lake", name: "月影湖泊", lessonId: "distinct", feature: "water" },
  { kind: "swamp", name: "毒雾泥沼", lessonId: "left-join", feature: "reeds" },
  { kind: "forest", name: "古树森林", lessonId: "join-boss", feature: "tree" },
];

const FLOOR_THREE_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "bone-yard", name: "遗骨荒地", lessonId: "f3-inner", feature: "bones" },
  { kind: "grave-mire", name: "腐土墓园", lessonId: "f3-chain", feature: "grave" },
  { kind: "spirit-crypt", name: "幽火地宫", lessonId: "f3-union", feature: "ghost-flame" },
];

const FLOOR_FOUR_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "fire-forge", name: "烈焰熔炉", lessonId: "f4-cte", feature: "lava" },
  { kind: "frost-vault", name: "寒霜冰库", lessonId: "f4-in", feature: "ice" },
  { kind: "storm-core", name: "雷晶核心", lessonId: "f4-exists", feature: "crystal" },
];

const FLOOR_FIVE_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "iron-yard", name: "黑铁外城", lessonId: "f5-over", feature: "iron" },
  { kind: "barracks", name: "兽人兵营", lessonId: "f5-lag-lead", feature: "banner" },
  { kind: "black-citadel", name: "要塞内城", lessonId: "f5-top-n", feature: "battlement" },
];

const FLOOR_SIX_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "magma-nest", name: "岩浆孵化场", lessonId: "f6-insert", feature: "egg" },
  { kind: "crystal-cavern", name: "龙晶洞窟", lessonId: "f6-constraint", feature: "magma" },
  { kind: "dragon-throne", name: "古龙王巢", lessonId: "f6-savepoint", feature: "dragon-bone" },
];

const TEMPLATES_BY_FLOOR: Readonly<Record<RoomGraph["floor"], readonly RegionTemplate[]>> = {
  1: FLOOR_ONE_TEMPLATES,
  2: FLOOR_TWO_TEMPLATES,
  3: FLOOR_THREE_TEMPLATES,
  4: FLOOR_FOUR_TEMPLATES,
  5: FLOOR_FIVE_TEMPLATES,
  6: FLOOR_SIX_TEMPLATES,
};

function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}

function distance(left: Position, right: Position): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function nearestRegion(
  regions: readonly BiomeRegion[],
  position: Position,
): BiomeRegion {
  return [...regions].sort((left, right) => (
    distance(position, left.anchor) - distance(position, right.anchor) ||
    left.id.localeCompare(right.id)
  ))[0];
}

function neighborCount(floor: MazeFloor, position: Position): number {
  return [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ].filter((step) => (
    mazeTileAt(floor, position.x + step.x, position.y + step.y) === "."
  )).length;
}

function excludedCells(
  floor: MazeFloor,
  campfires: readonly Campfire[],
  guidedMap: GuidedMapPlan,
): Set<string> {
  return new Set([
    ...safeZoneCellKeys(floor, campfires),
    ...floor.gates.map(positionKey),
    ...Object.values(floor.anchors).map(positionKey),
    ...guidedMap.routeMarkers.map(positionKey),
    ...guidedMap.shortcuts.flatMap((shortcut) => [
      positionKey(shortcut.entry),
      positionKey(shortcut.exit),
      positionKey(shortcut.keyPosition),
    ]),
    ...guidedMap.deadEndCaches.map(positionKey),
  ]);
}

function chooseAreaBossPosition(
  planSeed: string,
  region: BiomeRegion,
  regions: readonly BiomeRegion[],
  floor: MazeFloor,
  excluded: ReadonlySet<string>,
): Position | null {
  const candidates: Position[] = [];
  for (let y = 1; y < floor.height - 1; y += 1) {
    for (let x = 1; x < floor.width - 1; x += 1) {
      const position = { x, y };
      if (
        mazeTileAt(floor, x, y) !== "." ||
        excluded.has(positionKey(position)) ||
        floor.zones.some((zone) => (
          x >= zone.x &&
          x < zone.x + zone.width &&
          y >= zone.y &&
          y < zone.y + zone.height
        )) ||
        nearestRegion(regions, position).id !== region.id ||
        neighborCount(floor, position) < 3 ||
        distance(position, floor.spawn) < 8
      ) continue;
      candidates.push(position);
    }
  }
  return candidates.sort((left, right) => (
    stableStringHash(`${planSeed}:boss:${region.kind}:${positionKey(left)}`) -
      stableStringHash(`${planSeed}:boss:${region.kind}:${positionKey(right)}`) ||
    left.y - right.y ||
    left.x - right.x
  ))[0] ?? null;
}

function createFeatures(
  planSeed: string,
  regions: readonly BiomeRegion[],
  templates: readonly RegionTemplate[],
  floor: MazeFloor,
  excluded: ReadonlySet<string>,
): BiomeFeature[] {
  return regions.flatMap((region) => {
    const featureKind = templates.find((template) => template.kind === region.kind)?.feature;
    if (!featureKind) return [];
    const candidates: Position[] = [];
    for (let y = 1; y < floor.height - 1; y += 1) {
      for (let x = 1; x < floor.width - 1; x += 1) {
        const position = { x, y };
        if (
          mazeTileAt(floor, x, y) !== "." ||
          excluded.has(positionKey(position)) ||
          nearestRegion(regions, position).id !== region.id
        ) continue;
        candidates.push(position);
      }
    }
    return candidates
      .sort((left, right) => (
        stableStringHash(`${planSeed}:feature:${region.kind}:${positionKey(left)}`) -
          stableStringHash(`${planSeed}:feature:${region.kind}:${positionKey(right)}`) ||
        left.y - right.y ||
        left.x - right.x
      ))
      .slice(0, 14)
      .map((position, index) => ({
        id: `biome:${region.kind}:${index + 1}`,
        kind: featureKind,
        biome: region.kind,
        ...position,
      }));
  });
}

export function generateBiomePlan(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  guidedMap: GuidedMapPlan,
): BiomePlan {
  const templates = TEMPLATES_BY_FLOOR[graph.floor];
  const seed = `select-from-dungeon:biome:v1:floor-${graph.floor}:${graph.seed}`;
  const regions: BiomeRegion[] = templates.map((template, index) => {
    const node = graph.nodes.find((entry) => entry.lessonId === template.lessonId);
    const anchor = node ? floor.anchors[node.id] : floor.zones[index]?.center;
    if (!node || !anchor) {
      throw new Error(`生态 ${template.kind} 缺少课程锚点。`);
    }
    const areaBoss = BIOME_ENCOUNTERS.find((encounter) => (
      encounter.floor === graph.floor &&
      encounter.biome === template.kind &&
      encounter.role === "area-boss"
    ));
    return {
      id: `biome:${graph.floor}:${template.kind}`,
      kind: template.kind,
      name: template.name,
      anchor: { ...anchor },
      sourceRoomNodeId: node.id,
      areaBossId: areaBoss?.monsterId ?? null,
      areaBossPosition: null,
    };
  });
  const excluded = excludedCells(floor, campfires, guidedMap);
  regions.forEach((region) => {
    if (region.areaBossId === null) return;
    region.areaBossPosition = chooseAreaBossPosition(seed, region, regions, floor, excluded);
    if (region.areaBossPosition) excluded.add(positionKey(region.areaBossPosition));
  });
  return {
    version: BIOME_PLAN_VERSION,
    seed,
    floor: graph.floor,
    regions,
    features: createFeatures(seed, regions, templates, floor, excluded),
  };
}

export function cloneBiomePlan(plan: BiomePlan): BiomePlan {
  return {
    ...plan,
    regions: plan.regions.map((region) => ({
      ...region,
      anchor: { ...region.anchor },
      areaBossPosition: region.areaBossPosition
        ? { ...region.areaBossPosition }
        : null,
    })),
    features: plan.features.map((feature) => ({ ...feature })),
  };
}

export function biomeRegionAt(
  plan: BiomePlan,
  position: Position,
): BiomeRegion {
  return nearestRegion(plan.regions, position);
}

export function validateBiomePlan(
  plan: BiomePlan,
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  guidedMap: GuidedMapPlan,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let expected: BiomePlan;
  try {
    expected = generateBiomePlan(graph, floor, campfires, guidedMap);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "生态方案无法生成。"],
    };
  }
  if (JSON.stringify(plan) !== JSON.stringify(expected)) {
    errors.push("生态方案与当前 Seed、地图或安全区不一致。");
  }
  if (plan.regions.length !== 3 || new Set(plan.regions.map((region) => region.kind)).size !== 3) {
    errors.push("每层必须有三个不同生态区域。");
  }
  if (plan.features.length !== 42) {
    errors.push("每个生态区域必须提供 14 个低成本地标。");
  }
  const bosses = plan.regions.filter((region) => region.areaBossId !== null);
  const expectedBosses = BIOME_ENCOUNTERS.filter((encounter) => (
    encounter.floor === graph.floor && encounter.role === "area-boss"
  ));
  if (
    bosses.length !== expectedBosses.length ||
    bosses.some((region) => region.areaBossPosition === null)
  ) {
    errors.push(`第 ${graph.floor} 层区域首领数量或位置无效。`);
  }
  return { valid: errors.length === 0, errors };
}
