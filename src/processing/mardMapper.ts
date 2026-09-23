import { loadMard221Palette } from "../domain/palette";
import type { RasterGrid, RgbaColor } from "./types";
import type { PatternBuildResult } from "./types";

interface PaletteRgb {
  code: string;
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): PaletteRgb {
  const normalized = hex.replace("#", "");
  return {
    code: "",
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function distance(a: RgbaColor, b: PaletteRgb): number {
  const redMean = (a.r + b.r) / 2;
  const red = a.r - b.r;
  const green = a.g - b.g;
  const blue = a.b - b.b;
  return (2 + redMean / 256) * red * red + 4 * green * green + (2 + (255 - redMean) / 256) * blue * blue;
}

function buildPalette(): PaletteRgb[] {
  return loadMard221Palette().map((color) => ({ ...parseHex(color.hex), code: color.code }));
}

function nearestColor(color: RgbaColor, palette: PaletteRgb[]): PaletteRgb {
  return palette.reduce((best, candidate) => (distance(color, candidate) < distance(color, best) ? candidate : best));
}

function validateMaxColors(maxColors: number): void {
  if (!Number.isInteger(maxColors) || maxColors < 10 || maxColors > 50) {
    throw new Error("最大颜色数量必须是 10～50 的整数。");
  }
}

export function mapRasterGridToMard221(rasterGrid: RasterGrid, maxColors: number): PatternBuildResult {
  validateMaxColors(maxColors);
  const palette = buildPalette();
  const preliminary = rasterGrid.cells.map((row) => row.map((cell) => (cell ? nearestColor(cell, palette) : null)));
  const frequencies = new Map<string, number>();

  preliminary.flat().forEach((color) => {
    if (color) {
      frequencies.set(color.code, (frequencies.get(color.code) ?? 0) + 1);
    }
  });

  const selectedPalette = palette.filter((color) => frequencies.has(color.code)).sort((a, b) => {
    const frequencyDifference = (frequencies.get(b.code) ?? 0) - (frequencies.get(a.code) ?? 0);
    return frequencyDifference || a.code.localeCompare(b.code);
  }).slice(0, maxColors);

  const selected = selectedPalette.length > 0 ? selectedPalette : palette.slice(0, maxColors);
  const cells = preliminary.map((row, y) => row.map((color, x) => {
    const source = rasterGrid.cells[y][x];
    return color && source ? nearestColor(source, selected).code : null;
  }));
  const colorCodes = new Set(cells.flat().filter((code): code is string => code !== null));

  return {
    pixelGrid: { width: rasterGrid.width, height: rasterGrid.height, cells },
    colorCodes,
    emptyCellCount: cells.flat().filter((cell) => cell === null).length,
  };
}
