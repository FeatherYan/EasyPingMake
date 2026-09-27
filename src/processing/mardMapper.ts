import { loadMard291Palette, type PaletteColor } from "../domain/palette";
import type { PixelGrid } from "../domain/pattern";
import type { PaletteMappingDiagnostics, PatternBuildResult, RasterGrid, RgbaColor } from "./types";

interface LabColor {
  l: number;
  a: number;
  b: number;
  chroma: number;
}

interface PaletteLabColor extends LabColor {
  code: string;
}

interface ColorSample {
  key: string;
  lab: LabColor;
  count: number;
  weight: number;
  nearestPaletteIndex: number;
}

function srgbToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function labPivot(value: number): number {
  return value > 0.008856451679 ? Math.cbrt(value) : 7.787037037 * value + 16 / 116;
}

function rgbToLab(red: number, green: number, blue: number): LabColor {
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);
  const x = labPivot((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = labPivot(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = labPivot((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  const a = 500 * (x - y);
  const labB = 200 * (y - z);
  return { l: 116 * y - 16, a, b: labB, chroma: Math.hypot(a, labB) };
}

function labDistance(first: LabColor, second: LabColor): number {
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}

function parseHexToLab(hex: string): PaletteLabColor {
  const normalized = hex.replace("#", "");
  const lab = rgbToLab(
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  );
  return { ...lab, code: "" };
}

function buildPalette(): PaletteLabColor[] {
  return loadMard291Palette().map((color: PaletteColor) => ({ ...parseHexToLab(color.hex), code: color.code }));
}

function colorKey(color: RgbaColor): string {
  return `${color.r},${color.g},${color.b}`;
}

function findNearestPaletteIndex(lab: LabColor, palette: PaletteLabColor[]): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  palette.forEach((candidate, index) => {
    const candidateDistance = labDistance(lab, candidate);
    if (candidateDistance < nearestDistance) {
      nearestDistance = candidateDistance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function validateMaxColors(maxColors: number, paletteLength: number): void {
  if (!Number.isInteger(maxColors) || maxColors < 1 || maxColors > paletteLength) {
    throw new Error(`颜色数量必须是 1～${paletteLength} 的整数。`);
  }
}

function createSamples(rasterGrid: RasterGrid, palette: PaletteLabColor[]): {
  samples: ColorSample[];
  nearestPaletteGrid: PixelGrid;
} {
  const sampleMap = new Map<string, ColorSample>();
  const nearestCells = rasterGrid.cells.map((row) => row.map((color) => {
    if (!color || color.a < 128) {
      return null;
    }
    const key = colorKey(color);
    let sample = sampleMap.get(key);
    if (!sample) {
      const lab = rgbToLab(color.r, color.g, color.b);
      sample = {
        key,
        lab,
        count: 0,
        weight: 0,
        nearestPaletteIndex: findNearestPaletteIndex(lab, palette),
      };
      sampleMap.set(key, sample);
    }
    sample.count += 1;
    return sample.nearestPaletteIndex;
  }));

  const samples = [...sampleMap.values()];
  samples.forEach((sample) => {
    // Increase the influence of chromatic accents while retaining their true pixel area.
    sample.weight = sample.count * (1 + 1.2 * Math.min(sample.lab.chroma / 100, 1));
  });

  return {
    samples,
    nearestPaletteGrid: {
      width: rasterGrid.width,
      height: rasterGrid.height,
      cells: nearestCells.map((row) => row.map((index) => index === null ? null : palette[index].code)),
    },
  };
}

function choosePaletteSubset(samples: ColorSample[], palette: PaletteLabColor[], maxColors: number): number[] {
  if (samples.length === 0) {
    return [];
  }

  const distances = palette.map((candidate) => {
    const candidateDistances = new Float64Array(samples.length);
    samples.forEach((sample, index) => {
      candidateDistances[index] = labDistance(sample.lab, candidate);
    });
    return candidateDistances;
  });

  const selected = new Set<number>();
  const nearestDistances = new Float64Array(samples.length).fill(Number.POSITIVE_INFINITY);
  const accentFrequencies = new Map<number, number>();
  samples.forEach((sample) => {
    accentFrequencies.set(sample.nearestPaletteIndex, (accentFrequencies.get(sample.nearestPaletteIndex) ?? 0) + sample.count);
  });

  // Reserve up to four slots for distinct high-chroma details such as eyes and noses.
  const accents = [...accentFrequencies.entries()]
    .filter(([index]) => palette[index].chroma >= 38)
    .sort(([firstIndex, firstCount], [secondIndex, secondCount]) => {
      const firstScore = palette[firstIndex].chroma * Math.log2(firstCount + 1);
      const secondScore = palette[secondIndex].chroma * Math.log2(secondCount + 1);
      return secondScore - firstScore || palette[firstIndex].code.localeCompare(palette[secondIndex].code);
    })
    .slice(0, Math.min(4, maxColors));
  const protectedAccents = new Set(accents.map(([index]) => index));

  const addCandidate = (candidateIndex: number) => {
    selected.add(candidateIndex);
    const candidateDistances = distances[candidateIndex];
    samples.forEach((_, sampleIndex) => {
      nearestDistances[sampleIndex] = Math.min(nearestDistances[sampleIndex], candidateDistances[sampleIndex]);
    });
  };
  accents.forEach(([index]) => addCandidate(index));

  const targetSize = Math.min(maxColors, palette.length);
  while (selected.size < targetSize) {
    let bestIndex = -1;
    let bestScore = selected.size === 0 ? Number.POSITIVE_INFINITY : 0;

    palette.forEach((candidate, candidateIndex) => {
      if (selected.has(candidateIndex)) {
        return;
      }
      let score = 0;
      for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
        const distance = distances[candidateIndex][sampleIndex];
        if (selected.size === 0) {
          score += samples[sampleIndex].weight * distance;
        } else if (distance < nearestDistances[sampleIndex]) {
          score += samples[sampleIndex].weight * (nearestDistances[sampleIndex] - distance);
        }
      }

      const isBetter = selected.size === 0 ? score < bestScore : score > bestScore;
      if (isBetter) {
        bestIndex = candidateIndex;
        bestScore = score;
      }
    });

    if (bestIndex < 0 || (selected.size > 0 && bestScore <= 1e-9)) {
      break;
    }
    addCandidate(bestIndex);
  }

  // Refine the whole image-wide subset with two deterministic one-color swap passes.
  for (let pass = 0; pass < 2; pass += 1) {
    let bestReplacement: { removed: number; added: number } | null = null;
    let currentScore = samples.reduce((sum, sample, index) => sum + sample.weight * nearestDistances[index], 0);

    for (const removedIndex of selected) {
      if (protectedAccents.has(removedIndex)) {
        continue;
      }
      const remaining = [...selected].filter((index) => index !== removedIndex);
      const withoutDistances = new Float64Array(samples.length).fill(Number.POSITIVE_INFINITY);
      remaining.forEach((index) => {
        samples.forEach((_, sampleIndex) => {
          withoutDistances[sampleIndex] = Math.min(withoutDistances[sampleIndex], distances[index][sampleIndex]);
        });
      });

      for (let candidateIndex = 0; candidateIndex < palette.length; candidateIndex += 1) {
        if (selected.has(candidateIndex)) {
          continue;
        }
        let score = 0;
        for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
          const sample = samples[sampleIndex];
          score += sample.weight * Math.min(withoutDistances[sampleIndex], distances[candidateIndex][sampleIndex]);
        }
        if (score + 1e-9 < currentScore) {
          currentScore = score;
          bestReplacement = { removed: removedIndex, added: candidateIndex };
        }
      }
    }

    if (!bestReplacement) {
      break;
    }
    selected.delete(bestReplacement.removed);
    selected.add(bestReplacement.added);
    nearestDistances.fill(Number.POSITIVE_INFINITY);
    selected.forEach((index) => {
      samples.forEach((_, sampleIndex) => {
        nearestDistances[sampleIndex] = Math.min(nearestDistances[sampleIndex], distances[index][sampleIndex]);
      });
    });
  }

  return [...selected];
}

function getMappingStats(source: RasterGrid, mapped: PixelGrid, paletteByCode: Map<string, PaletteLabColor>): { mean: number; max: number } {
  let total = 0;
  let count = 0;
  let max = 0;
  source.cells.forEach((row, y) => row.forEach((color, x) => {
    const targetCode = mapped.cells[y]?.[x];
    if (!color || color.a < 128 || !targetCode) {
      return;
    }
    const target = paletteByCode.get(targetCode);
    if (!target) {
      return;
    }
    const difference = labDistance(rgbToLab(color.r, color.g, color.b), target);
    total += difference;
    max = Math.max(max, difference);
    count += 1;
  }));
  return { mean: count ? total / count : 0, max };
}

export function mapRasterGridToMard291(rasterGrid: RasterGrid, maxColors: number): PatternBuildResult {
  const palette = buildPalette();
  validateMaxColors(maxColors, palette.length);
  const { samples, nearestPaletteGrid } = createSamples(rasterGrid, palette);
  const selectedIndices = choosePaletteSubset(samples, palette, maxColors);
  const selectedPalette = selectedIndices.map((index) => palette[index]);
  const sampleByKey = new Map(samples.map((sample) => [sample.key, sample]));
  const selectedIndexBySample = new Map<string, number>();

  samples.forEach((sample) => {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    selectedPalette.forEach((candidate, index) => {
      const candidateDistance = labDistance(sample.lab, candidate);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearestIndex = index;
      }
    });
    selectedIndexBySample.set(sample.key, nearestIndex);
  });

  const cells = rasterGrid.cells.map((row) => row.map((color) => {
    if (!color || color.a < 128 || selectedPalette.length === 0) {
      return null;
    }
    const sample = sampleByKey.get(colorKey(color));
    const selectedIndex = sample ? selectedIndexBySample.get(sample.key) : undefined;
    return selectedIndex === undefined ? null : selectedPalette[selectedIndex].code;
  }));
  const pixelGrid: PixelGrid = { width: rasterGrid.width, height: rasterGrid.height, cells };
  const colorCounts = new Map<string, number>();
  cells.flat().forEach((code) => {
    if (code) {
      colorCounts.set(code, (colorCounts.get(code) ?? 0) + 1);
    }
  });
  const paletteByCode = new Map(palette.map((color) => [color.code, color]));
  const nearestStats = getMappingStats(rasterGrid, nearestPaletteGrid, paletteByCode);
  const limitedStats = getMappingStats(rasterGrid, pixelGrid, paletteByCode);
  const mappingDiagnostics: PaletteMappingDiagnostics = {
    selectedColors: [...colorCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((first, second) => second.count - first.count || first.code.localeCompare(second.code)),
    nearestPaletteMeanDeltaE: nearestStats.mean,
    nearestPaletteMaxDeltaE: nearestStats.max,
    limitedPaletteMeanDeltaE: limitedStats.mean,
    limitedPaletteMaxDeltaE: limitedStats.max,
  };
  const colorCodes = new Set(colorCounts.keys());

  return {
    pixelGrid,
    colorCodes,
    emptyCellCount: cells.flat().filter((cell) => cell === null).length,
    nearestPaletteGrid,
    mappingDiagnostics,
  };
}
