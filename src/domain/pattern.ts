export const BEAD_SIZE_MM = 2.8;
export const CANVAS_PRESETS = [52, 78, 104] as const;

export type CanvasPreset = (typeof CANVAS_PRESETS)[number];
export type PatternCell = string | null;

export interface PixelGrid {
  width: number;
  height: number;
  cells: PatternCell[][];
}

export interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface PhysicalWorkSize {
  widthMm: number;
  heightMm: number;
}

export interface PatternDocument {
  id: string;
  name: string;
  paletteId: "MARD221";
  cellSizeMm: typeof BEAD_SIZE_MM;
  canvas: {
    width: number;
    height: number;
  };
  cells: PatternCell[][];
  bounds: PixelBounds | null;
  workSize: PhysicalWorkSize | null;
}

function createPatternId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `pattern-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assertValidGrid(grid: PixelGrid): void {
  if (!Number.isInteger(grid.width) || !Number.isInteger(grid.height) || grid.width < 1 || grid.height < 1) {
    throw new Error("像素网格尺寸必须是正整数。");
  }

  if (grid.cells.length !== grid.height || grid.cells.some((row) => row.length !== grid.width)) {
    throw new Error("像素网格数据与声明的宽高不一致。");
  }
}

export function createEmptyCells(width: number, height: number): PatternCell[][] {
  return Array.from({ length: height }, () => Array<PatternCell>(width).fill(null));
}

export function calculateBounds(cells: PatternCell[][]): PixelBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === null) {
        return;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });

  if (!Number.isFinite(minX)) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function calculatePhysicalWorkSize(bounds: PixelBounds | null): PhysicalWorkSize | null {
  if (!bounds) {
    return null;
  }

  return {
    widthMm: bounds.width * BEAD_SIZE_MM,
    heightMm: bounds.height * BEAD_SIZE_MM,
  };
}

function normalizePreferredCanvasSize(preferredCanvasSize: number): number {
  if (!CANVAS_PRESETS.includes(preferredCanvasSize as CanvasPreset)) {
    throw new Error("首选画板尺寸必须是 52、78 或 104。");
  }
  return preferredCanvasSize;
}

export function chooseCanvasSize(
  contentWidth: number,
  contentHeight: number,
  preferredCanvasSize: CanvasPreset = 52,
): number {
  normalizePreferredCanvasSize(preferredCanvasSize);
  const requiredSize = Math.max(contentWidth, contentHeight, 1);
  const minimumSize = Math.max(requiredSize, preferredCanvasSize);

  return CANVAS_PRESETS.find((preset) => preset >= minimumSize) ?? Math.ceil(minimumSize);
}

function cropToBounds(grid: PixelGrid, bounds: PixelBounds): PatternCell[][] {
  return Array.from({ length: bounds.height }, (_, y) =>
    Array.from({ length: bounds.width }, (_, x) => grid.cells[bounds.minY + y][bounds.minX + x]),
  );
}

function placeCentered(content: PatternCell[][], canvasSize: number): PatternCell[][] {
  const canvas = createEmptyCells(canvasSize, canvasSize);
  const offsetX = Math.floor((canvasSize - content[0].length) / 2);
  const offsetY = Math.floor((canvasSize - content.length) / 2);

  content.forEach((row, y) => {
    row.forEach((cell, x) => {
      canvas[offsetY + y][offsetX + x] = cell;
    });
  });

  return canvas;
}

export function createPatternDocumentFromGrid(options: {
  id?: string;
  name?: string;
  grid: PixelGrid;
  preferredCanvasSize?: CanvasPreset;
}): PatternDocument {
  assertValidGrid(options.grid);

  const sourceBounds = calculateBounds(options.grid.cells);
  const content = sourceBounds ? cropToBounds(options.grid, sourceBounds) : createEmptyCells(1, 1);
  const canvasSize = chooseCanvasSize(content[0].length, content.length, options.preferredCanvasSize ?? 52);
  const cells = placeCentered(content, canvasSize);
  const bounds = calculateBounds(cells);

  return {
    id: options.id ?? createPatternId(),
    name: options.name ?? "未命名图纸",
    paletteId: "MARD221",
    cellSizeMm: BEAD_SIZE_MM,
    canvas: { width: canvasSize, height: canvasSize },
    cells,
    bounds,
    workSize: calculatePhysicalWorkSize(bounds),
  };
}

export function createBlankPatternDocument(options: {
  name: string;
  preferredCanvasSize?: CanvasPreset;
}): PatternDocument {
  return createPatternDocumentFromGrid({
    id: createPatternId(),
    name: options.name.trim() || "未命名图纸",
    preferredCanvasSize: options.preferredCanvasSize ?? CANVAS_PRESETS[0],
    grid: {
      width: 1,
      height: 1,
      cells: [[null]],
    },
  });
}
