/**
 * GameSession 的状态复制工具。
 *
 * 这些函数只做防御性复制、坐标格式化和只读结构准备，不包含游戏规则，
 * 也不读写浏览器存储、DOM 或 Phaser。快照和存档转换都依赖它们来避免把
 * 内部数组或嵌套对象直接暴露给调用方。
 */
import type { MazeFloor } from "../exploration/mazeGenerator";
import type { RoomGraph } from "../progression/runGraph";
import type {
  AnswerAttemptRecord,
  CombatState,
  ConsumableStack,
  EquipmentItem,
  GroundItem,
  LootBundle,
  LootItem,
  Monster,
  Position,
  ProfileProgress,
} from "../shared/types";

/* 纯状态复制与坐标工具位于 sessionState，避免门面混入无规则实现。 */
export function emptyProfile(): ProfileProgress {
  return {
    version: 3,
    masteredLessons: [],
    attempts: {
      select: 0,
      where: 0,
      "is-null": 0,
      "group-by": 0,
      having: 0,
      "order-by": 0,
      distinct: 0,
      "inner-join": 0,
      "left-join": 0,
      "join-boss": 0,
      "f3-inner": 0,
      "f3-left": 0,
      "f3-self": 0,
      "f3-chain": 0,
      "f3-union": 0,
      "f3-audit": 0,
      "f4-scalar": 0,
      "f4-in": 0,
      "f4-exists": 0,
      "f4-correlated": 0,
      "f4-cte": 0,
      "f4-recursive": 0,
      "f5-over": 0,
      "f5-row-number": 0,
      "f5-rank": 0,
      "f5-lag-lead": 0,
      "f5-frame": 0,
      "f5-top-n": 0,
      "f6-insert": 0,
      "f6-update": 0,
      "f6-delete": 0,
      "f6-constraint": 0,
      "f6-transaction": 0,
      "f6-savepoint": 0,
      "f7-btree": 0,
      "f7-composite": 0,
      "f7-covering": 0,
      "f7-invalid": 0,
      "f7-plan": 0,
      "f7-optimize": 0,
      "f8-mvcc": 0,
      "f8-lock": 0,
      "f8-isolation": 0,
      "f8-modeling": 0,
      "f8-replication": 0,
      "f8-sharding": 0,
      "f8-security": 0,
    },
    discoveredMonsterIds: [],
    victories: 0,
    bestRunQueries: null,
  };
}

export function cloneMonsters(monsters: readonly Monster[]): Monster[] {
  return monsters.map((monster) => ({ ...monster }));
}

export function cloneAnswerHistory(
  records: readonly AnswerAttemptRecord[],
): AnswerAttemptRecord[] {
  return records.map((record) => ({ ...record }));
}

export function cloneCombat(combat: CombatState | null): CombatState | null {
  return combat
    ? { ...combat, intent: { ...combat.intent, locks: [...combat.intent.locks] } }
    : null;
}

export function cloneGraph(graph: RoomGraph): RoomGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      prerequisiteLessons: [...node.prerequisiteLessons],
      next: [...node.next],
    })),
  };
}

export function cloneProfile(profile: ProfileProgress): ProfileProgress {
  return {
    version: 3,
    masteredLessons: [...profile.masteredLessons],
    attempts: { ...profile.attempts },
    discoveredMonsterIds: [...profile.discoveredMonsterIds],
    victories: profile.victories,
    bestRunQueries: profile.bestRunQueries,
  };
}

export function cloneItem(item: GroundItem): GroundItem {
  return {
    ...item,
    weapon: item.weapon ? { ...item.weapon } : undefined,
  };
}

export function cloneEquipment(item: EquipmentItem): EquipmentItem {
  return {
    ...item,
    weapon: item.weapon ? { ...item.weapon } : undefined,
    armor: item.armor ? { ...item.armor } : undefined,
  };
}

export function cloneConsumableStack(stack: ConsumableStack): ConsumableStack {
  return {
    item: { ...stack.item },
    quantity: stack.quantity,
  };
}

function cloneLootItem(item: LootItem): LootItem {
  return {
    ...item,
    weapon: item.weapon ? { ...item.weapon } : undefined,
    armor: item.armor ? { ...item.armor } : undefined,
    consumable: item.consumable ? { ...item.consumable } : undefined,
  };
}

export function cloneLootBundle(bundle: LootBundle): LootBundle {
  return {
    ...bundle,
    items: bundle.items.map(cloneLootItem),
  };
}

export function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}

export function allMapCellKeys(floor: MazeFloor): string[] {
  return floor.tiles.flatMap((row, y) => (
    [...row].map((_tile, x) => `${x}:${y}`)
  ));
}
