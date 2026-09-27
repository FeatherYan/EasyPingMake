import { calculateBounds, type PatternCell } from "./pattern";

export interface CellPosition {
  x: number;
  y: number;
}

export type ShapeKind = "rectangle" | "circle";

export interface ShapeBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function cloneCells(cells: PatternCell[][]): PatternCell[][] {
  return cells.map((row) => [...row]);
}

export function expandCanvas(cells: PatternCell[][], targetWidth: number, targetHeight: number): PatternCell[][] {
  const currentHeight = cells.length;
  const currentWidth = cells[0]?.length ?? 0;
  if (
    !Number.isInteger(targetWidth) ||
    !Number.isInteger(targetHeight) ||
    targetWidth < currentWidth ||
    targetHeight < currentHeight ||
    targetWidth < 1 ||
    targetHeight < 1
  ) {
    return cloneCells(cells);
  }

  const next = Array.from({ length: targetHeight }, () => Array<PatternCell>(targetWidth).fill(null));
  cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      next[y][x] = cell;
    });
  });
  return next;
}

export function centerContent(cells: PatternCell[][]): PatternCell[][] {
  const bounds = calculateBounds(cells);
  if (!bounds || bounds.height > cells.length) {
    return cloneCells(cells);
  }

  const currentWidth = cells[0]?.length ?? 0;
  if (bounds.width > currentWidth) {
    return cloneCells(cells);
  }

  const targetMinX = Math.floor((currentWidth - bounds.width) / 2);
  const targetMinY = Math.floor((cells.length - bounds.height) / 2);
  const offsetX = targetMinX - bounds.minX;
  const offsetY = targetMinY - bounds.minY;
  if (offsetX === 0 && offsetY === 0) {
    return cloneCells(cells);
  }

  const next = Array.from({ length: cells.length }, () => Array<PatternCell>(currentWidth).fill(null));
  cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === null) {
        return;
      }
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX >= 0 && nextX < currentWidth && nextY >= 0 && nextY < next.length) {
        next[nextY][nextX] = cell;
      }
    });
  });
  return next;
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

export function constrainShapeEnd(start: CellPosition, end: CellPosition): CellPosition {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  return {
    x: start.x + (deltaX < 0 ? -size : size),
    y: start.y + (deltaY < 0 ? -size : size),
  };
}

export function getShapeBounds(start: CellPosition, end: CellPosition, constrain = false): ShapeBounds {
  const constrainedEnd = constrain ? constrainShapeEnd(start, end) : end;
  return {
    minX: Math.min(start.x, constrainedEnd.x),
    maxX: Math.max(start.x, constrainedEnd.x),
    minY: Math.min(start.y, constrainedEnd.y),
    maxY: Math.max(start.y, constrainedEnd.y),
  };
}

function isInsideEllipse(x: number, y: number, bounds: ShapeBounds): boolean {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const radiusX = Math.max(0.5, (width - 1) / 2 + 0.25);
  const radiusY = Math.max(0.5, (height - 1) / 2 + 0.25);
  const normalizedX = (x - centerX) / radiusX;
  const normalizedY = (y - centerY) / radiusY;
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
}

export function drawShape(
  cells: PatternCell[][],
  start: CellPosition,
  end: CellPosition,
  value: PatternCell,
  shape: ShapeKind,
  constrain = false,
): PatternCell[][] {
  const next = cloneCells(cells);
  const bounds = getShapeBounds(start, end, constrain);

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (!isInside(next, { x, y })) {
        continue;
      }
      if (shape === "circle" && !isInsideEllipse(x, y, bounds)) {
        continue;
      }
      next[y][x] = value;
    }
  }

  return next;
}

export function replaceColor(cells: PatternCell[][], sourceCode: string, targetCode: string): PatternCell[][] {
  if (sourceCode === targetCode) {
    return cloneCells(cells);
  }
  return cells.map((row) => row.map((code) => code === sourceCode ? targetCode : code));
}

export function findColorRegions(cells: PatternCell[][], code: string): CellPosition[][] {
  if (!cells.length || !cells[0].length || !code) {
    return [];
  }

  const visited = cells.map((row) => row.map(() => false));
  const regions: CellPosition[][] = [];
  const directions: CellPosition[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (visited[y][x] || cell !== code) {
        return;
      }

      const region: CellPosition[] = [];
      const queue: CellPosition[] = [{ x, y }];
      visited[y][x] = true;
      while (queue.length) {
        const position = queue.shift()!;
        region.push(position);
        directions.forEach((direction) => {
          const nextX = position.x + direction.x;
          const nextY = position.y + direction.y;
          if (
            nextY >= 0 && nextY < cells.length &&
            nextX >= 0 && nextX < cells[nextY].length &&
            !visited[nextY][nextX] && cells[nextY][nextX] === code
          ) {
            visited[nextY][nextX] = true;
            queue.push({ x: nextX, y: nextY });
          }
        });
      }
      regions.push(region);
    });
  });

  return regions;
}

export function mirrorHorizontal(cells: PatternCell[][]): PatternCell[][] {
  return cells.map((row) => [...row].reverse());
}
