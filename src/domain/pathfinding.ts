/** 网格寻路基础设施：为路线提示、护送高亮和可达性验证提供纯函数。 */
import type { Position } from "./types";

const DIRECTIONS: readonly Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function findGridPath(
  start: Position,
  target: Position,
  isWalkable: (x: number, y: number) => boolean,
): Position[] {
  const key = (position: Position) => `${position.x},${position.y}`;
  const queue: Position[] = [start];
  let queueIndex = 0;
  const previous = new Map<string, Position | null>([[key(start), null]]);

  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];
    if (!current) break;
    if (current.x === target.x && current.y === target.y) {
      const path: Position[] = [];
      let cursor: Position | null = current;
      while (cursor) {
        path.push(cursor);
        cursor = previous.get(key(cursor)) ?? null;
      }
      return path.reverse();
    }

    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = key(next);
      const isTarget = next.x === target.x && next.y === target.y;
      if (previous.has(nextKey) || (!isTarget && !isWalkable(next.x, next.y))) {
        continue;
      }
      previous.set(nextKey, current);
      queue.push(next);
    }
  }

  return [];
}
