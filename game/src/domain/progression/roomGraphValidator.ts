import {
  REQUIRED_PREREQUISITES,
  lessonsForFloor,
  type RunLessonId,
} from "./runLessons";
import type { RoomGraph, RoomNode } from "./roomGraphGenerator";

export interface RoomGraphValidation {
  valid: boolean;
  errors: string[];
}

function reachableIds(startId: string, nodesById: Map<string, RoomNode>): Set<string> {
  const visited = new Set<string>();
  const pending = [startId];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const node = nodesById.get(id);
    if (!node) continue;
    node.next.forEach((nextId) => {
      if (!visited.has(nextId)) pending.push(nextId);
    });
  }
  return visited;
}

function hasPathToBoss(startId: string, bossId: string, nodesById: Map<string, RoomNode>): boolean {
  return reachableIds(startId, nodesById).has(bossId);
}

export function validateRoomGraph(graph: RoomGraph): RoomGraphValidation {
  const errors: string[] = [];
  if (
    graph.version !== 2 ||
    !([1, 2, 3, 4, 5, 6, 7, 8] as const).includes(graph.floor)
  ) {
    errors.push("课程图版本或楼层无效。");
  }
  if (graph.nodes.length < 8 || graph.nodes.length > 11) {
    errors.push("每层房间数必须在 8 到 11 之间。");
  }

  const nodesById = new Map<string, RoomNode>();
  graph.nodes.forEach((node) => {
    if (nodesById.has(node.id)) errors.push(`房间 ID 重复：${node.id}`);
    nodesById.set(node.id, node);
  });

  const entry = nodesById.get(graph.entryId);
  const boss = nodesById.get(graph.bossId);
  if (!entry || entry.type !== "entry") errors.push("入口房不存在或类型错误。");
  if (!boss || boss.type !== "boss") errors.push("Boss 房不存在或类型错误。");

  graph.nodes.forEach((node) => {
    const uniqueNext = new Set(node.next);
    if (uniqueNext.size !== node.next.length) {
      errors.push(`房间 ${node.id} 存在重复出口。`);
    }
    node.next.forEach((nextId) => {
      if (!nodesById.has(nextId)) errors.push(`房间 ${node.id} 指向未知房间 ${nextId}。`);
    });
    if (node.type !== "boss" && node.next.length === 0) {
      errors.push(`非 Boss 房 ${node.id} 没有出口。`);
    }
  });

  if (entry && boss) {
    const fromEntry = reachableIds(entry.id, nodesById);
    if (!fromEntry.has(boss.id)) errors.push("入口无法到达 Boss。");
    graph.nodes.forEach((node) => {
      if (!fromEntry.has(node.id)) errors.push(`房间 ${node.id} 无法从入口到达。`);
      if (node.type !== "boss" && !hasPathToBoss(node.id, boss.id, nodesById)) {
        errors.push(`非 Boss 房 ${node.id} 无法继续到达 Boss。`);
      }
    });
  }

  const roomsByLesson = new Map<RunLessonId, RoomNode[]>();
  graph.nodes.forEach((node) => {
    if (!node.lessonId) return;
    const rooms = roomsByLesson.get(node.lessonId) ?? [];
    rooms.push(node);
    roomsByLesson.set(node.lessonId, rooms);
  });

  lessonsForFloor(graph.floor).forEach((lessonId) => {
    const rooms = roomsByLesson.get(lessonId) ?? [];
    if (rooms.length === 0) {
      errors.push(`缺少必修课程房：${lessonId}`);
      return;
    }
    if (!rooms.some((node) => node.required)) {
      errors.push(`必修课程房未标记为 required：${lessonId}`);
    }
    const requiredPrerequisites = REQUIRED_PREREQUISITES[lessonId];
    const hasValidPrerequisites = rooms.some((node) =>
      requiredPrerequisites.every((required) => node.prerequisiteLessons.includes(required))
    );
    if (!hasValidPrerequisites) {
      errors.push(`课程房 ${lessonId} 缺少前置课程约束。`);
    }
  });

  const whereRoom = graph.floor === 1 ? roomsByLesson.get("where")?.[0] : undefined;
  const nullRoom = graph.floor === 1 ? roomsByLesson.get("is-null")?.[0] : undefined;
  if (graph.floor === 1 && whereRoom && nullRoom) {
    const hasCommonEntry = graph.nodes.some(
      (node) => node.next.includes(whereRoom.id) && node.next.includes(nullRoom.id),
    );
    if (
      !hasCommonEntry ||
      whereRoom.prerequisiteLessons.includes("is-null") ||
      nullRoom.prerequisiteLessons.includes("where")
    ) {
      errors.push("WHERE 与 IS NULL 必须可以自由选择完成顺序。");
    }
  }

  (["rest", "treasure", "event", "elite"] as const).forEach((type) => {
    if (!graph.nodes.some((node) => node.type === type)) {
      errors.push(`缺少 ${type} 房。`);
    }
  });

  return { valid: errors.length === 0, errors };
}
