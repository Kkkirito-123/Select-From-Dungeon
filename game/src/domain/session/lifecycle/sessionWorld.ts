import { INITIAL_MONSTERS } from "../../../content/curriculum/mvpLevel";
import { rewardDetails } from "../../../content/world/runContent";
import { counterDamageForMonster } from "../../combat/combatBalance";
import type { BiomePlan } from "../../exploration/biome";
import { generateFloorOneChestItems } from "../../exploration/floorOneTreasure";
import type { GuidedMapPlan } from "../../exploration/guidedMap";
import type { MazeFloor } from "../../exploration/mazeGenerator";
import { cloneWorldActor, type WorldActor } from "../../exploration/monsterRoaming";
import type { FloorNumber, RoomGraph, RoomReward } from "../../progression/runGraph";
import type {
  Campfire,
  ClaimableReward,
  GroundItem,
  Monster,
} from "../../shared/types";
import { cloneMonsters } from "../sessionState";
import { stableStringHash } from "../../progression/runGraph";

/** GameSession 构造/恢复阶段使用的世界对象工厂，不处理玩家输入或规则结算。 */
export const INITIAL_EXPLORATION_BANNER =
  "迷宫已经生成。沿青色箭头找到 ID #001，触碰它进入 SELECT 战斗。";
const LEGACY_INSPECTION_BANNER_PREFIXES = [
  "抄写员：",
  "档案水轮",
  "无名宿舍",
] as const;

export function createRunInstanceId(seed: string): string {
  // UUID 用于区分同一 seed 的不同 Run；旧环境才使用 seed+时间的可追踪回退值。
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `run-${stableStringHash(seed).toString(36)}-${Date.now().toString(36)}`;
}

export function restoredWorldBanner(banner: string): string {
  // 旧版本可能把地标长文案存进 banner；恢复时替换为稳定的探索提示。
  return LEGACY_INSPECTION_BANNER_PREFIXES.some((prefix) => banner.startsWith(prefix))
    ? INITIAL_EXPLORATION_BANNER
    : banner;
}

function rewardItemKind(reward: ClaimableReward): GroundItem["kind"] {
  // 将内容层奖励分类映射为地图物品类型，避免 UI 直接理解 reward.kind。
  if (reward.kind === "weapon") return "weapon";
  if (reward.kind === "relic") return "relic";
  if (reward.kind === "heal" || reward.kind === "cool") return "heal";
  if (reward.kind === "key") return "key";
  return "event";
}

export function monstersForFloor(floor: FloorNumber): Monster[] {
  // 每次从作者初始表复制，再按楼层战斗矩阵计算反击伤害，绝不复用可变对象。
  return cloneMonsters(INITIAL_MONSTERS.filter((monster) => monster.floor === floor))
    .map((monster) => ({
      ...monster,
      damage: counterDamageForMonster(monster),
    }));
}

export function restoredMonstersForFloor(
  savedMonsters: readonly Monster[],
  floor: FloorNumber,
): Monster[] {
  // 以当前作者怪物列表为基线，只恢复 hp；这样新增字段仍由当前内容补齐。
  const savedById = new Map(savedMonsters.map((monster) => [monster.id, monster]));
  return monstersForFloor(floor).map((canonical) => {
    const saved = savedById.get(canonical.id);
    return saved
      ? { ...canonical, hp: Math.min(canonical.maxHp, Math.max(0, saved.hp)) }
      : { ...canonical };
  });
}

export function initialActors(
  graph: RoomGraph,
  floor: MazeFloor,
  monsters: readonly Monster[],
  biomePlan: BiomePlan,
): WorldActor[] {
  // 课程怪物与区域首领都转换为世界 Actor；行为由 Boss/教程/课程类型决定。
  const curriculumActors: WorldActor[] = monsters
    .filter((monster) => monster.encounterType === "curriculum")
    .map((monster) => {
      const room = graph.nodes.find((node) => node.lessonId === monster.lessonId);
      const home = room ? floor.anchors[room.id] : floor.spawn;
      const isTutorialTarget = room?.type === "tutorial";
      return {
        monsterId: monster.id,
        roomNodeId: room?.id ?? graph.entryId,
        x: home.x,
        y: home.y,
        home: { ...home },
        behavior: monster.isBoss || isTutorialTarget
          ? "anchored"
          : monster.lessonId === "group-by" ? "guard" : "wander",
        roamRadius: isTutorialTarget ? 0 : 4,
        moveTick: 0,
      };
    });
  const areaBossActors = biomePlan.regions.flatMap((region) => {
    if (region.areaBossId === null || region.areaBossPosition === null) return [];
    const monster = monsters.find((entry) => entry.id === region.areaBossId);
    const room = graph.nodes.find((entry) => entry.lessonId === monster?.lessonId);
    if (!monster || !room) return [];
    return [{
      monsterId: monster.id,
      roomNodeId: room.id,
      ...region.areaBossPosition,
      home: { ...region.areaBossPosition },
      behavior: "anchored" as const,
      roamRadius: 0,
      moveTick: 0,
    }];
  });
  return [...curriculumActors, ...areaBossActors];
}

export function restoredActorsForFloor(
  savedActors: readonly WorldActor[],
  expectedActors: readonly WorldActor[],
): WorldActor[] {
  // 保存的 Actor 只恢复位置等运行状态，home/behavior/radius 以当前作者定义为准。
  const savedByMonster = new Map(savedActors.map((actor) => [actor.monsterId, actor]));
  return expectedActors.map((expected) => {
    const saved = savedByMonster.get(expected.monsterId);
    if (!saved) return cloneWorldActor(expected);
    const shouldRestoreAnchor = expected.behavior === "anchored"
      && saved.behavior !== "anchored";
    return cloneWorldActor({
      ...saved,
      x: shouldRestoreAnchor ? expected.home.x : saved.x,
      y: shouldRestoreAnchor ? expected.home.y : saved.y,
      home: { ...expected.home },
      behavior: expected.behavior,
      roamRadius: expected.roamRadius,
    });
  });
}

export function initialGroundItems(
  graph: RoomGraph,
  floor: MazeFloor,
  campfires: readonly Campfire[] = [],
  guidedMap?: GuidedMapPlan,
): GroundItem[] {
  // 房间奖励按图节点生成；重复的唯一武器/遗物降级为热量恢复品，避免同层冲突。
  const items: GroundItem[] = [];
  const uniqueRewardIds = new Set<RoomReward>();
  graph.nodes.forEach((node) => {
    if (node.type === "rest" || !node.reward) return;
    let rewardId = node.reward;
    let reward = rewardDetails(rewardId);
    const position = floor.anchors[node.id];
    if (!reward || !position) return;
    let kind = rewardItemKind(reward);
    if ((kind === "weapon" || kind === "relic") && uniqueRewardIds.has(rewardId)) {
      rewardId = kind === "weapon" ? "cool-8-heat" : "cool-12-heat";
      reward = rewardDetails(rewardId);
      if (!reward) return;
      kind = rewardItemKind(reward);
    } else if (kind === "weapon" || kind === "relic") {
      uniqueRewardIds.add(rewardId);
    }
    items.push({
      id: `room-reward:${node.id}`,
      sourceRoomId: node.id,
      ...position,
      name: reward.name,
      description: reward.description,
      kind,
      collection: "interact",
      rewardId,
    });
  });
  if (graph.floor === 1 && guidedMap && campfires.length > 0) {
    items.push(...generateFloorOneChestItems(floor, campfires, guidedMap));
  }
  return items;
}
