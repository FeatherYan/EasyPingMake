import type { PatternCell } from "./pattern";

export interface CellPosition {
  x: number;
  y: number;
}

function cloneCells(cells: PatternCell[][]): PatternCell[][] {
  return cells.map((row) => [...row]);
}

function isInside(cells: PatternCell[][], position: CellPosition): boolean {
  return position.y >= 0 && position.y < cells.length && position.x >= 0 && position.x < cells[0].length;
}

export function floodFill(cells: PatternCell[][], start: CellPosition, replacement: PatternCell): PatternCell[][] {
  if (!isInside(cells, start)) {
    return cloneCells(cells);
  }

  const next = cloneCells(cells);
  const target = next[start.y][start.x];
  if (target === replacement) {
    return next;
  }

  const queue: CellPosition[] = [start];
  while (queue.length > 0) {
    const position = queue.shift()!;
    if (!isInside(next, position) || next[position.y][position.x] !== target) {
      continue;
    }

    next[position.y][position.x] = replacement;
    queue.push(
      { x: position.x - 1, y: position.y },
      { x: position.x + 1, y: position.y },
      { x: position.x, y: position.y - 1 },
      { x: position.x, y: position.y + 1 },
    );
  }

  return next;
}

export function drawRectangle(cells: PatternCell[][], start: CellPosition, end: CellPosition, value: PatternCell): PatternCell[][] {
  const next = cloneCells(cells);
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (isInside(next, { x, y })) {
        next[y][x] = value;
      }
    }
  }

  return next;
}

export function mirrorHorizontal(cells: PatternCell[][]): PatternCell[][] {
  return cells.map((row) => [...row].reverse());
}
