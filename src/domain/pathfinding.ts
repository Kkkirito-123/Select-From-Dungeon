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
  const previous = new Map<string, Position | null>([[key(start), null]]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.x === target.x && current.y === target.y) {
      const path: Position[] = [];
      let cursor: Position | null = current;
      while (cursor) {
        path.unshift(cursor);
        cursor = previous.get(key(cursor)) ?? null;
      }
      return path;
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
