/**
 * 楼层生物群系和区域首领的纯领域计算。
 * 根据地图、篝火和稳定 seed 推导区域，不直接生成怪物、不修改通关状态。
 */
import {
  BIOME_ENCOUNTERS,
  type BiomeKind,
} from "../../content/world/biomeContent";
import {
  floorMapBlueprint,
  regionPortalsEnabledForFloor,
} from "../../content/world/floorMapBlueprints";
import type { Campfire, Position } from "../shared/types";
import type { GuidedMapPlan } from "./guidedMap";
import {
  mazeTileAt,
  type MazeFloor,
} from "./mazeGenerator";
import {
  stableStringHash,
  type RoomGraph,
  type RunLessonId,
} from "../progression/runGraph";
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
  | "dragon-bone"
  | "crystal-tree"
  | "root"
  | "index-rune"
  | "obsidian"
  | "void-flame"
  | "gold-throne";

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

export interface BiomePortal {
  id: string;
  name: string;
  entry: Position;
  exit: Position;
  fromRegionId: string;
  toRegionId: string;
  requiredBossId: number | null;
}

export interface BiomePlan {
  version: 1;
  seed: string;
  floor: RoomGraph["floor"];
  regions: BiomeRegion[];
  features: BiomeFeature[];
  portals: BiomePortal[];
}

interface RegionTemplate {
  kind: BiomeKind;
  feature: BiomeFeatureKind;
}

const FLOOR_ONE_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "drainage", feature: "drain" },
  { kind: "slime-pool", feature: "slime" },
  { kind: "ember-cellar", feature: "ember" },
];

const FLOOR_TWO_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "lake", feature: "water" },
  { kind: "swamp", feature: "reeds" },
  { kind: "forest", feature: "tree" },
];

const FLOOR_THREE_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "bone-yard", feature: "bones" },
  { kind: "grave-mire", feature: "grave" },
  { kind: "spirit-crypt", feature: "ghost-flame" },
];

const FLOOR_FOUR_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "fire-forge", feature: "lava" },
  { kind: "frost-vault", feature: "ice" },
  { kind: "storm-core", feature: "crystal" },
];

const FLOOR_FIVE_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "iron-yard", feature: "iron" },
  { kind: "barracks", feature: "banner" },
  { kind: "black-citadel", feature: "battlement" },
];

const FLOOR_SIX_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "magma-nest", feature: "egg" },
  { kind: "crystal-cavern", feature: "magma" },
  { kind: "dragon-throne", feature: "dragon-bone" },
];

const FLOOR_SEVEN_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "crystal-grove", feature: "crystal-tree" },
  { kind: "root-maze", feature: "root" },
  { kind: "index-heart", feature: "index-rune" },
];

const FLOOR_EIGHT_TEMPLATES: readonly RegionTemplate[] = [
  { kind: "obsidian-hall", feature: "obsidian" },
  { kind: "void-court", feature: "void-flame" },
  { kind: "data-throne", feature: "gold-throne" },
];

const TEMPLATES_BY_FLOOR: Readonly<Record<RoomGraph["floor"], readonly RegionTemplate[]>> = {
  1: FLOOR_ONE_TEMPLATES,
  2: FLOOR_TWO_TEMPLATES,
  3: FLOOR_THREE_TEMPLATES,
  4: FLOOR_FOUR_TEMPLATES,
  5: FLOOR_FIVE_TEMPLATES,
  6: FLOOR_SIX_TEMPLATES,
  7: FLOOR_SEVEN_TEMPLATES,
  8: FLOOR_EIGHT_TEMPLATES,
};

/**
 * 区域按作者定义的守卫分段：中段锚点位于区域首领之前，后段锚点位于
 * 该首领保护的第一节课程。
 */
const REGION_LESSONS: Readonly<Record<
  RoomGraph["floor"],
  readonly [RunLessonId, RunLessonId, RunLessonId]
>> = {
  1: ["select", "group-by", "having"],
  2: ["order-by", "left-join", "join-boss"],
  3: ["f3-inner", "f3-chain", "f3-union"],
  4: ["f4-scalar", "f4-in", "f4-exists"],
  5: ["f5-over", "f5-lag-lead", "f5-frame"],
  6: ["f6-insert", "f6-constraint", "f6-transaction"],
  7: ["f7-btree", "f7-invalid", "f7-plan"],
  8: ["f8-mvcc", "f8-modeling", "f8-replication"],
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
  let nearest = regions[0];
  let nearestDistance = distance(position, nearest.anchor);
  for (let index = 1; index < regions.length; index += 1) {
    const candidate = regions[index];
    const candidateDistance = distance(position, candidate.anchor);
    if (
      candidateDistance < nearestDistance ||
      (
        candidateDistance === nearestDistance &&
        candidate.id.localeCompare(nearest.id) < 0
      )
    ) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }
  return nearest;
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
  return candidates
    .map((position) => ({
      position,
      score: stableStringHash(
        `${planSeed}:boss:${region.kind}:${positionKey(position)}`,
      ),
    }))
    .sort((left, right) => (
      left.score - right.score ||
      left.position.y - right.position.y ||
      left.position.x - right.position.x
    ))[0]?.position ?? null;
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
      .map((position) => ({
        position,
        score: stableStringHash(
          `${planSeed}:feature:${region.kind}:${positionKey(position)}`,
        ),
      }))
      .sort((left, right) => (
        left.score - right.score ||
        left.position.y - right.position.y ||
        left.position.x - right.position.x
      ))
      .slice(0, 14)
      .map(({ position }, index) => ({
        id: `biome:${region.kind}:${index + 1}`,
        kind: featureKind,
        biome: region.kind,
        ...position,
      }));
  });
}

function choosePortalPosition(
  planSeed: string,
  portalLabel: string,
  region: BiomeRegion,
  regions: readonly BiomeRegion[],
  floor: MazeFloor,
  excluded: ReadonlySet<string>,
  focus: Position,
): Position {
  const maxRadius = floor.width + floor.height;
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    let selected: Position | null = null;
    let selectedHash = Number.POSITIVE_INFINITY;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const dy = radius - Math.abs(dx);
      const candidates = dy === 0
        ? [{ x: focus.x + dx, y: focus.y }]
        : [
            { x: focus.x + dx, y: focus.y - dy },
            { x: focus.x + dx, y: focus.y + dy },
          ];
      for (const position of candidates) {
        if (
          position.x <= 0 ||
          position.y <= 0 ||
          position.x >= floor.width - 1 ||
          position.y >= floor.height - 1 ||
          mazeTileAt(floor, position.x, position.y) !== "." ||
          excluded.has(positionKey(position)) ||
          nearestRegion(regions, position).id !== region.id ||
          neighborCount(floor, position) < 2
        ) continue;
        const hash = stableStringHash(
          `${planSeed}:portal:${portalLabel}:${positionKey(position)}`,
        );
        if (
          hash < selectedHash ||
          (
            hash === selectedHash &&
            (
              selected === null ||
              position.y < selected.y ||
              (position.y === selected.y && position.x < selected.x)
            )
          )
        ) {
          selected = position;
          selectedHash = hash;
        }
      }
    }
    if (selected) return selected;
  }
  throw new Error(`生态 ${region.kind} 缺少区域传送门落点。`);
}

function createPortals(
  planSeed: string,
  floorNumber: RoomGraph["floor"],
  regions: readonly BiomeRegion[],
  floor: MazeFloor,
  excluded: Set<string>,
): BiomePortal[] {
  const [front, middle, rear] = regions;
  const definitions = [
    {
      id: `biome-portal:${floorNumber}:front-middle`,
      name: `${front.name} ⇄ ${middle.name}`,
      from: front,
      to: middle,
      entryFocus: floor.spawn,
      exitFocus: middle.anchor,
      requiredBossId: null,
    },
    {
      id: `biome-portal:${floorNumber}:middle-rear`,
      name: `${middle.name} ⇄ ${rear.name}`,
      from: middle,
      to: rear,
      entryFocus: middle.areaBossPosition ?? middle.anchor,
      exitFocus: rear.anchor,
      requiredBossId: middle.areaBossId,
    },
  ] as const;

  return definitions.map((definition) => {
    const entry = choosePortalPosition(
      planSeed,
      `${definition.id}:entry`,
      definition.from,
      regions,
      floor,
      excluded,
      definition.entryFocus,
    );
    excluded.add(positionKey(entry));
    const exit = choosePortalPosition(
      planSeed,
      `${definition.id}:exit`,
      definition.to,
      regions,
      floor,
      excluded,
      definition.exitFocus,
    );
    excluded.add(positionKey(exit));
    return {
      id: definition.id,
      name: definition.name,
      entry,
      exit,
      fromRegionId: definition.from.id,
      toRegionId: definition.to.id,
      requiredBossId: definition.requiredBossId,
    };
  });
}

export function generateBiomePlan(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[],
  guidedMap: GuidedMapPlan,
): BiomePlan {
  const templates = TEMPLATES_BY_FLOOR[graph.floor];
  const regionLessonIds = REGION_LESSONS[graph.floor];
  const regionNames = floorMapBlueprint(graph.floor).regionNames;
  const seed = `select-from-dungeon:biome:v1:floor-${graph.floor}:${graph.seed}`;
  const regions: BiomeRegion[] = templates.map((template, index) => {
    const sourceLessonId = regionLessonIds[index];
    const node = graph.nodes.find((entry) => entry.lessonId === sourceLessonId);
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
      name: regionNames[index],
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
  const portals = createPortals(seed, graph.floor, regions, floor, excluded);
  return {
    version: BIOME_PLAN_VERSION,
    seed,
    floor: graph.floor,
    regions,
    features: createFeatures(seed, regions, templates, floor, excluded),
    portals,
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
    portals: plan.portals.map((portal) => ({
      ...portal,
      entry: { ...portal.entry },
      exit: { ...portal.exit },
    })),
  };
}

export function biomeRegionAt(
  plan: BiomePlan,
  position: Position,
): BiomeRegion {
  return nearestRegion(plan.regions, position);
}

/**
 * 返回阻挡非步行跨区交通（例如捷径）的存活区域首领。
 * 相邻迷宫步行不能被不可见的抽象区域边界阻挡；可见传送门会在交互时
 * 单独检查 requiredBossId，因此玩家也不能借跨区交通绕过中区首领。
 */
export function biomeGuardianIdForStep(
  plan: BiomePlan,
  from: Position,
  to: Position,
): number | null {
  if (!regionPortalsEnabledForFloor(plan.floor)) return null;
  if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) <= 1) return null;
  const rearPortal = plan.portals.find(
    (portal) => portal.id === `biome-portal:${plan.floor}:middle-rear`,
  );
  if (rearPortal?.requiredBossId === null || rearPortal?.requiredBossId === undefined) {
    return null;
  }
  const fromRegion = biomeRegionAt(plan, from);
  const toRegion = biomeRegionAt(plan, to);
  if (
    fromRegion.id === toRegion.id ||
    toRegion.id !== rearPortal.toRegionId ||
    fromRegion.id === rearPortal.toRegionId
  ) {
    return null;
  }
  return rearPortal.requiredBossId;
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
  if (plan.portals.length !== 2) {
    errors.push("每层必须提供两条区域快速通道。");
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
