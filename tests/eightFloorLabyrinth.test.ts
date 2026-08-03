import { describe, expect, it } from "vitest";
import { floorExperience } from "../src/content/floorExperience";
import { floorLabyrinth } from "../src/content/floorLabyrinth";
import {
  floorMapBlueprint,
  regionPortalsEnabledForFloor,
} from "../src/content/floorMapBlueprints";
import {
  biomeGuardianIdForStep,
  generateBiomePlan,
} from "../src/domain/biome";
import {
  generateCampfires,
  safeZoneCellKeys,
} from "../src/domain/campfire";
import {
  crossesIntoFloorLabyrinth,
  floorCurrentSightCellKeys,
  floorLabyrinthAreaAt,
  generateFloorHazards,
} from "../src/domain/floorLabyrinth";
import { generateGuidedMapPlan } from "../src/domain/guidedMap";
import { generateMazeFloor, mazeTileAt } from "../src/domain/mazeGenerator";
import {
  reachableMazeCells,
  validateMazeFloor,
} from "../src/domain/mazeValidation";
import {
  generateRoomGraph,
  lessonsForFloor,
  type FloorNumber,
  type RunLessonId,
} from "../src/domain/runGraph";
import type { Position } from "../src/domain/types";

const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly FloorNumber[];
const SEED_SAMPLES = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"] as const;
const DIRECTIONS: readonly Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}

function createFixture(floorNumber: FloorNumber, seedName: string) {
  const seed = `eight-floor-labyrinth:${floorNumber}:${seedName}`;
  const graph = generateRoomGraph(seed, floorNumber);
  const maze = generateMazeFloor(graph);
  const campfires = generateCampfires(graph, maze);
  const guidedMap = generateGuidedMapPlan(graph, maze, campfires);
  const biome = generateBiomePlan(graph, maze, campfires, guidedMap);
  return {
    seed,
    graph,
    maze,
    campfires,
    guidedMap,
    biome,
    experience: floorExperience(floorNumber),
  };
}

type LabyrinthFixture = ReturnType<typeof createFixture>;

const FIXTURE_CACHE = new Map<string, LabyrinthFixture>();

function fixture(floorNumber: FloorNumber, seedName: string): LabyrinthFixture {
  const cacheKey = `${floorNumber}:${seedName}`;
  const cached = FIXTURE_CACHE.get(cacheKey);
  if (cached) return cached;
  const created = createFixture(floorNumber, seedName);
  FIXTURE_CACHE.set(cacheKey, created);
  return created;
}

function completedThrough(
  orderedLessons: readonly RunLessonId[],
  requiredLessons: readonly RunLessonId[],
): Set<RunLessonId> {
  const lastRequiredIndex = Math.max(
    -1,
    ...requiredLessons.map((lessonId) => orderedLessons.indexOf(lessonId)),
  );
  return new Set(orderedLessons.slice(0, lastRequiredIndex + 1));
}

function findSafeToLabyrinthStep(
  current: ReturnType<typeof fixture>,
): { from: Position; to: Position } | null {
  for (let y = 0; y < current.maze.height; y += 1) {
    for (let x = 0; x < current.maze.width; x += 1) {
      const from = { x, y };
      if (
        mazeTileAt(current.maze, x, y) !== "." ||
        floorLabyrinthAreaAt(
          current.graph.floor,
          current.maze,
          current.campfires,
          from,
        ) !== "safe"
      ) continue;
      for (const direction of DIRECTIONS) {
        const to = { x: x + direction.x, y: y + direction.y };
        if (
          mazeTileAt(current.maze, to.x, to.y) === "." &&
          floorLabyrinthAreaAt(
            current.graph.floor,
            current.maze,
            current.campfires,
            to,
          ) === "labyrinth"
        ) {
          return { from, to };
        }
      }
    }
  }
  return null;
}

function findUnclippedLabyrinthCell(
  current: ReturnType<typeof fixture>,
  radius: number,
): Position | null {
  for (let y = radius; y < current.maze.height - radius; y += 1) {
    for (let x = radius; x < current.maze.width - radius; x += 1) {
      const position = { x, y };
      if (
        mazeTileAt(current.maze, x, y) === "." &&
        floorLabyrinthAreaAt(
          current.graph.floor,
          current.maze,
          current.campfires,
          position,
        ) === "labyrinth"
      ) {
        return position;
      }
    }
  }
  return null;
}

describe("eight-floor physical labyrinth acceptance", () => {
  it("多 Seed 下出生点能按课程顺序到达全部必经锚点，物理首领门严格复用课程前置", () => {
    const violations: string[] = [];

    for (const floorNumber of FLOORS) {
      for (const seedName of SEED_SAMPLES) {
        const current = fixture(floorNumber, seedName);
        const orderedLessons = lessonsForFloor(floorNumber);
        const validation = validateMazeFloor(current.maze, current.graph);
        if (!validation.valid) {
          violations.push(`${current.seed} 迷宫基础校验失败：${validation.errors.join("；")}`);
        }

        for (const node of current.graph.nodes.filter((entry) => entry.required)) {
          const anchor = current.maze.anchors[node.id];
          if (!anchor) {
            violations.push(`${current.seed} 缺少必经锚点 ${node.id}`);
            continue;
          }
          const completed = node.lessonId
            ? new Set(orderedLessons.slice(0, orderedLessons.indexOf(node.lessonId)))
            : new Set(orderedLessons);
          if (!reachableMazeCells(current.maze, completed).has(positionKey(anchor))) {
            violations.push(
              `${current.seed} 按课程顺序无法从出生点到达 ${node.id}`,
            );
          }
        }

        const bossNode = current.graph.nodes.find(
          (node) => node.id === current.graph.bossId,
        );
        const bossGate = current.maze.gates.find(
          (gate) => gate.roomNodeId === current.graph.bossId,
        );
        const bossAnchor = current.maze.anchors[current.graph.bossId];
        if (!bossNode || !bossGate || !bossAnchor) {
          violations.push(`${current.seed} 缺少物理首领房、首领门或首领锚点`);
          continue;
        }
        if (JSON.stringify(bossGate.requires) !== JSON.stringify(bossNode.prerequisiteLessons)) {
          violations.push(`${current.seed} 首领门前置与课程图不一致`);
        }
        const ready = new Set(orderedLessons);
        if (!reachableMazeCells(current.maze, ready).has(positionKey(bossAnchor))) {
          violations.push(`${current.seed} 完成课程后仍无法到达物理首领房`);
        }
        for (const requiredLesson of bossGate.requires) {
          const missingOne = new Set(orderedLessons);
          missingOne.delete(requiredLesson);
          if (reachableMazeCells(current.maze, missingOne).has(positionKey(bossAnchor))) {
            violations.push(
              `${current.seed} 缺少 ${requiredLesson} 仍能绕过物理首领门`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  }, 60_000);

  it("八层都只在从安全区跨入迷宫的那一步触发进入阈值", () => {
    const violations: string[] = [];

    for (const floorNumber of FLOORS) {
      for (const seedName of SEED_SAMPLES) {
        const current = fixture(floorNumber, seedName);
        const boundary = findSafeToLabyrinthStep(current);
        if (!boundary) {
          violations.push(`${current.seed} 找不到安全区与迷宫相邻的可行走边界`);
          continue;
        }
        if (!crossesIntoFloorLabyrinth(
          floorNumber,
          current.maze,
          current.campfires,
          boundary.from,
          boundary.to,
        )) {
          violations.push(`${current.seed} 离开安全区时没有触发迷宫进入阈值`);
        }
        if (crossesIntoFloorLabyrinth(
          floorNumber,
          current.maze,
          current.campfires,
          boundary.to,
          boundary.from,
        )) {
          violations.push(`${current.seed} 返回安全区时错误触发了迷宫进入阈值`);
        }
        if (crossesIntoFloorLabyrinth(
          floorNumber,
          current.maze,
          current.campfires,
          boundary.from,
          boundary.from,
        )) {
          violations.push(`${current.seed} 安全区内移动错误触发了迷宫进入阈值`);
        }
      }
    }

    expect(violations).toEqual([]);
  }, 30_000);

  it("安全房完整可见，八层迷宫视野严格使用各层半径", () => {
    const violations: string[] = [];
    const observedRadii: number[] = [];

    for (const floorNumber of FLOORS) {
      const contract = floorLabyrinth(floorNumber);
      observedRadii.push(contract.sightRadius);
      for (const seedName of SEED_SAMPLES) {
        const current = fixture(floorNumber, seedName);
        const entryZone = current.maze.zones.find(
          (zone) => zone.roomNodeId === contract.safeRoomIds[0],
        );
        if (!entryZone) {
          violations.push(`${current.seed} 缺少入口安全房`);
        } else {
          const safeSight = floorCurrentSightCellKeys(
            floorNumber,
            current.maze,
            current.campfires,
            current.maze.spawn,
          );
          if (safeSight.size !== entryZone.width * entryZone.height) {
            violations.push(`${current.seed} 入口安全房没有完整显示`);
          }
        }

        const origin = findUnclippedLabyrinthCell(current, contract.sightRadius);
        if (!origin) {
          violations.push(`${current.seed} 找不到可验证视野的迷宫格`);
          continue;
        }
        const sight = floorCurrentSightCellKeys(
          floorNumber,
          current.maze,
          current.campfires,
          origin,
        );
        const distances = [...sight].map((cell) => {
          const [x, y] = cell.split(":").map(Number);
          return Math.abs(x - origin.x) + Math.abs(y - origin.y);
        });
        const expectedCellCount = 1 + 2 * contract.sightRadius * (contract.sightRadius + 1);
        if (Math.max(...distances) !== contract.sightRadius) {
          violations.push(`${current.seed} 迷宫视野没有止于半径 ${contract.sightRadius}`);
        }
        if (sight.size !== expectedCellCount) {
          violations.push(
            `${current.seed} 迷宫视野格数 ${sight.size} 不符合半径 ${contract.sightRadius}`,
          );
        }
      }
    }

    expect(new Set(observedRadii).size).toBeGreaterThan(1);
    expect(violations).toEqual([]);
  }, 30_000);

  it("第二至八层的区域首领门既有正确要求，也确实阻断后区步行路线", () => {
    const violations: string[] = [];

    for (const floorNumber of FLOORS) {
      for (const seedName of SEED_SAMPLES) {
        const current = fixture(floorNumber, seedName);
        const portalsEnabled = regionPortalsEnabledForFloor(floorNumber);
        if (floorNumber === 1) {
          if (portalsEnabled) violations.push(`${current.seed} 第一层不应启用区域传送门`);
          continue;
        }
        if (!portalsEnabled) {
          violations.push(`${current.seed} 应启用区域传送门`);
          continue;
        }

        const [front, middle, rear] = current.biome.regions;
        const frontMiddle = current.biome.portals.find(
          (portal) => portal.id === `biome-portal:${floorNumber}:front-middle`,
        );
        const middleRear = current.biome.portals.find(
          (portal) => portal.id === `biome-portal:${floorNumber}:middle-rear`,
        );
        if (!front || !middle || !rear || !frontMiddle || !middleRear) {
          violations.push(`${current.seed} 缺少三段区域或两道区域门`);
          continue;
        }
        if (frontMiddle.requiredBossId !== null) {
          violations.push(`${current.seed} 前区到中区不应要求区域首领`);
        }
        if (
          middle.areaBossId === null ||
          middle.areaBossPosition === null ||
          middleRear.requiredBossId !== middle.areaBossId
        ) {
          violations.push(`${current.seed} 中后区门没有绑定中区首领`);
          continue;
        }
        if (
          middleRear.fromRegionId !== middle.id ||
          middleRear.toRegionId !== rear.id
        ) {
          violations.push(`${current.seed} 中后区门方向与区域顺序不一致`);
        }

        // 抽象区域边界没有对应素材，不能再形成空气墙。玩家可以提前探索
        // 后区走廊，但可见传送设施和跨区捷径仍由 requiredBossId 封锁。
        const walkingReachable = reachableMazeCells(
          current.maze,
          new Set(lessonsForFloor(floorNumber)),
          new Set<string>(),
          () => true,
        );
        if (!walkingReachable.has(positionKey(middle.areaBossPosition))) {
          violations.push(`${current.seed} 无法步行到达中区首领`);
        }
        if (!walkingReachable.has(positionKey(middleRear.entry))) {
          violations.push(`${current.seed} 无法步行到达中后区门前`);
        }
        if (
          !walkingReachable.has(positionKey(rear.anchor)) ||
          !walkingReachable.has(positionKey(middleRear.exit))
        ) {
          violations.push(
            `${current.seed} 抽象区域边界仍阻断后区步行探索`,
          );
        }
        if (
          biomeGuardianIdForStep(
            current.biome,
            middleRear.entry,
            middleRear.exit,
          ) !== middle.areaBossId
        ) {
          violations.push(`${current.seed} 可见中后区交通没有绑定区域首领`);
        }
      }
    }

    expect(violations).toEqual([]);
  }, 30_000);

  it("每层三道区域捷径、钥匙和隐藏入口都能由正常步行路线触达", () => {
    const violations: string[] = [];

    for (const floorNumber of FLOORS) {
      for (const seedName of SEED_SAMPLES) {
        const current = fixture(floorNumber, seedName);
        const allLessons = new Set(lessonsForFloor(floorNumber));
        const allReachable = reachableMazeCells(current.maze, allLessons);
        if (current.guidedMap.shortcuts.length !== 3) {
          violations.push(`${current.seed} 捷径数量不是 3`);
        } else {
          current.guidedMap.shortcuts.forEach((shortcut, shortcutIndex) => {
            if (shortcutIndex === 0 && shortcut.id !== `shortcut:${floorNumber}:return`) {
              violations.push(`${current.seed} 主捷径 ID 不稳定：${shortcut.id}`);
            }
            for (const [label, position] of [
              ["捷径入口", shortcut.entry],
              ["捷径出口", shortcut.exit],
              ["捷径钥匙", shortcut.keyPosition],
            ] as const) {
              if (!allReachable.has(positionKey(position))) {
                violations.push(`${current.seed} ${label}不可由出生点步行触达`);
              }
            }
          });
        }

        const hiddenArea = current.experience.hiddenAreas[0];
        const hiddenGate = hiddenArea
          ? current.maze.gates.find((gate) => gate.id === hiddenArea.gateId)
          : undefined;
        const hiddenAnchor = hiddenArea
          ? current.maze.anchors[hiddenArea.roomNodeId]
          : undefined;
        if (!hiddenArea || !hiddenGate || !hiddenAnchor) {
          violations.push(`${current.seed} 缺少隐藏区、实体入口门或内部锚点`);
          continue;
        }
        const prerequisiteClosure = completedThrough(
          lessonsForFloor(floorNumber),
          hiddenArea.requiredLessonIds,
        );
        const entranceReachable = reachableMazeCells(
          current.maze,
          prerequisiteClosure,
        );
        if (!entranceReachable.has(positionKey(hiddenGate.outside))) {
          violations.push(`${current.seed} 满足隐藏条件后仍无法走到隐藏入口门外`);
        }
        const openedReachable = reachableMazeCells(
          current.maze,
          prerequisiteClosure,
          new Set([hiddenArea.gateId]),
        );
        if (!openedReachable.has(positionKey(hiddenAnchor))) {
          violations.push(`${current.seed} 显式开门后仍无法进入隐藏区`);
        }
      }
    }

    expect(violations).toEqual([]);
  }, 30_000);

  it("出生区与两座篝火安全区不放置课程怪、区域首领或实体陷阱", () => {
    const violations: string[] = [];

    for (const floorNumber of FLOORS) {
      for (const seedName of SEED_SAMPLES) {
        const current = fixture(floorNumber, seedName);
        const safeCells = safeZoneCellKeys(current.maze, current.campfires);
        for (const cell of safeCells) {
          const [x, y] = cell.split(":").map(Number);
          if (mazeTileAt(current.maze, x, y) !== ".") {
            violations.push(`${current.seed} 安全区包含不可行走格 ${cell}`);
          }
        }
        for (const node of current.graph.nodes.filter((entry) => entry.lessonId)) {
          const anchor = current.maze.anchors[node.id];
          if (anchor && safeCells.has(positionKey(anchor))) {
            violations.push(`${current.seed} 课程怪锚点 ${node.id} 落入安全区`);
          }
        }
        for (const region of current.biome.regions) {
          if (
            region.areaBossPosition &&
            safeCells.has(positionKey(region.areaBossPosition))
          ) {
            violations.push(`${current.seed} 区域首领 ${region.areaBossId} 落入安全区`);
          }
        }
        for (const hazard of generateFloorHazards(
          floorNumber,
          current.maze,
          current.campfires,
          current.guidedMap,
          current.biome,
        )) {
          if (safeCells.has(positionKey(hazard))) {
            violations.push(`${current.seed} 陷阱 ${hazard.id} 落入安全区`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  }, 30_000);

  it("每层陷阱数量、伤害与类型符合契约，同 Seed 重建稳定且不侵入安全区", () => {
    const violations: string[] = [];

    for (const floorNumber of FLOORS) {
      const contract = floorLabyrinth(floorNumber);
      for (const seedName of SEED_SAMPLES) {
        const current = fixture(floorNumber, seedName);
        const first = generateFloorHazards(
          floorNumber,
          current.maze,
          current.campfires,
          current.guidedMap,
          current.biome,
        );
        const rebuilt = generateFloorHazards(
          floorNumber,
          current.maze,
          current.campfires,
          current.guidedMap,
          current.biome,
        );
        const safeCells = safeZoneCellKeys(current.maze, current.campfires);

        if (first.length !== contract.hazardCount) {
          violations.push(
            `${current.seed} 陷阱数量 ${first.length}，预期 ${contract.hazardCount}`,
          );
        }
        if (JSON.stringify(first) !== JSON.stringify(rebuilt)) {
          violations.push(`${current.seed} 同 Seed 重建后的陷阱发生漂移`);
        }
        if (new Set(first.map(positionKey)).size !== first.length) {
          violations.push(`${current.seed} 同一位置重复放置陷阱`);
        }
        for (const hazard of first) {
          if (
            hazard.damage !== contract.hazardDamage ||
            hazard.kind !== contract.hazardKind ||
            hazard.name !== contract.hazardName
          ) {
            violations.push(`${current.seed} 陷阱 ${hazard.id} 属性与楼层契约不一致`);
          }
          if (mazeTileAt(current.maze, hazard.x, hazard.y) !== ".") {
            violations.push(`${current.seed} 陷阱 ${hazard.id} 不在可行走格`);
          }
          if (safeCells.has(positionKey(hazard))) {
            violations.push(`${current.seed} 陷阱 ${hazard.id} 落入安全区`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  }, 30_000);

  it("八层拓扑签名逐层不同，且每层会随 Seed 产生非关键路线变化", () => {
    const hashesByFloor = new Map<FloorNumber, Set<number>>(
      FLOORS.map((floorNumber) => [floorNumber, new Set<number>()]),
    );

    for (const seedName of SEED_SAMPLES) {
      const crossFloorHashes = FLOORS.map((floorNumber) => {
        const current = fixture(floorNumber, seedName);
        expect(current.maze.topologyHash).toBeTypeOf("number");
        expect(current.maze.topologyHash).not.toBe(0);
        expect(current.maze.zones.map((zone) => zone.roomNodeId).sort()).toEqual(
          floorMapBlueprint(floorNumber).slots
            .map((slot) => slot.roomNodeId)
            .sort(),
        );
        hashesByFloor.get(floorNumber)?.add(current.maze.topologyHash);
        return current.maze.topologyHash;
      });
      expect(
        new Set(crossFloorHashes).size,
        `Seed ${seedName} 的八层拓扑不应复用同一签名`,
      ).toBe(FLOORS.length);
    }

    for (const floorNumber of FLOORS) {
      expect(
        hashesByFloor.get(floorNumber)?.size ?? 0,
        `第 ${floorNumber} 层的多个 Seed 应改变非关键路线`,
      ).toBeGreaterThan(1);
    }
  }, 30_000);
});
