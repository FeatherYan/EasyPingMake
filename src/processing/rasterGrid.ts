import type { GridGeometry, RasterGrid, RgbaColor, RgbaImage } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPixel(image: RgbaImage, x: number, y: number): RgbaColor {
  const offset = (y * image.width + x) * 4;
  return {
    r: image.data[offset],
    g: image.data[offset + 1],
    b: image.data[offset + 2],
    a: image.data[offset + 3],
  };
}

function weightedMedian(values: Array<{ value: number; weight: number }>): number {
  values.sort((a, b) => a.value - b.value);
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  let accumulatedWeight = 0;

  for (const item of values) {
    accumulatedWeight += item.weight;
    if (accumulatedWeight >= totalWeight / 2) {
      return item.value;
    }
  }

  return values.at(-1)?.value ?? 0;
}

function sampleCell(image: RgbaImage, x0: number, y0: number, x1: number, y1: number): RgbaColor | null {
  const startX = clamp(Math.floor(x0), 0, image.width - 1);
  const startY = clamp(Math.floor(y0), 0, image.height - 1);
  const endX = clamp(Math.ceil(x1), startX + 1, image.width);
  const endY = clamp(Math.ceil(y1), startY + 1, image.height);
  const centerX = (x0 + x1) / 2;
  const centerY = (y0 + y1) / 2;
  const samples: Array<{ color: RgbaColor; weight: number }> = [];


  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const color = getPixel(image, x, y);
      if (color.a < 128) {
        continue;
      }

      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      samples.push({ color, weight: 1 / (1 + distance) });
    }
  }

  if (samples.length === 0) {
    return null;
  }


  return {
    r: weightedMedian(samples.map(({ color, weight }) => ({ value: color.r, weight }))),
    g: weightedMedian(samples.map(({ color, weight }) => ({ value: color.g, weight }))),
    b: weightedMedian(samples.map(({ color, weight }) => ({ value: color.b, weight }))),
    a: weightedMedian(samples.map(({ color, weight }) => ({ value: color.a, weight }))),
  };
}

function validateGeometry(image: RgbaImage, geometry: GridGeometry): void {
  if (geometry.columns < 1 || geometry.rows < 1) {
    throw new Error("网格行列数必须是正整数。");
  }
  if (geometry.xEdges.length !== geometry.columns + 1 || geometry.yEdges.length !== geometry.rows + 1) {
    throw new Error("网格边界数量与网格尺寸不一致。");
  }
  if (geometry.xEdges[0] < 0 || geometry.xEdges.at(-1)! > image.width || geometry.yEdges[0] < 0 || geometry.yEdges.at(-1)! > image.height) {
    throw new Error("网格边界超出图片范围。");
  }
}

export function sampleRasterGrid(image: RgbaImage, geometry: GridGeometry): RasterGrid {
  validateGeometry(image, geometry);

  return {
    width: geometry.columns,
    height: geometry.rows,
    cells: Array.from({ length: geometry.rows }, (_, row) =>
      Array.from({ length: geometry.columns }, (_, column) =>
        sampleCell(image, geometry.xEdges[column], geometry.yEdges[row], geometry.xEdges[column + 1], geometry.yEdges[row + 1]),
      ),
    ),
  };
}
