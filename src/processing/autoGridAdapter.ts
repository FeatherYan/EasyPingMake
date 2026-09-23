import { sampleRasterGrid } from "./rasterGrid";
import type { GridRecoveryAdapter, GridRecoveryResult, RgbaImage } from "./types";

const MIN_CONFIDENCE = 0.35;

interface AxisEstimate {
  count: number;
  confidence: number;
  period: number;
  offset: number;
  score: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pixelOffset(image: RgbaImage, x: number, y: number): number {
  return (y * image.width + x) * 4;
}

function colorDistance(image: RgbaImage, firstX: number, firstY: number, secondX: number, secondY: number): number {
  const first = pixelOffset(image, firstX, firstY);
  const second = pixelOffset(image, secondX, secondY);
  const firstAlpha = image.data[first + 3];
  const secondAlpha = image.data[second + 3];
  if (firstAlpha < 128 && secondAlpha < 128) {
    return 0;
  }
  if (firstAlpha < 128 || secondAlpha < 128) {
    return 1;
  }

  const red = image.data[first] - image.data[second];
  const green = image.data[first + 1] - image.data[second + 1];
  const blue = image.data[first + 2] - image.data[second + 2];
  return Math.sqrt(red * red + green * green + blue * blue) / (255 * Math.sqrt(3));
}

function buildAxisProfile(image: RgbaImage, vertical: boolean): number[] {
  const length = vertical ? image.width : image.height;
  const orthogonalLength = vertical ? image.height : image.width;
  const sampleStep = Math.max(1, Math.floor(orthogonalLength / 64));

  return Array.from({ length: Math.max(0, length - 1) }, (_, index) => {
    const position = index + 1;
    let total = 0;
    let samples = 0;
    for (let orthogonal = 0; orthogonal < orthogonalLength; orthogonal += sampleStep) {
      const firstX = vertical ? position - 1 : orthogonal;
      const firstY = vertical ? orthogonal : position - 1;
      const secondX = vertical ? position : orthogonal;
      const secondY = vertical ? orthogonal : position;
      total += colorDistance(image, firstX, firstY, secondX, secondY);
      samples += 1;
    }
    return samples ? total / samples : 0;
  });
}

function profileAt(profile: number[], coordinate: number): number {
  if (!profile.length) {
    return 0;
  }
  const center = Math.round(coordinate) - 1;
  return profile[clamp(center, 0, profile.length - 1)];
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function estimateAxis(profile: number[], length: number): AxisEstimate {
  const minPeriod = 2;
  const maxPeriod = Math.max(minPeriod, Math.min(256, Math.floor(length / 2)));
  let best: AxisEstimate | null = null;

  for (let period = minPeriod; period <= maxPeriod; period += 1) {
    for (let offset = 0; offset < period; offset += 1) {
      const boundaries: number[] = [];
      for (let coordinate = offset || period; coordinate < length; coordinate += period) {
        boundaries.push(coordinate);
      }
      if (boundaries.length < 2) {
        continue;
      }

      const boundaryMean = mean(boundaries.map((coordinate) => profileAt(profile, coordinate)));
      const excluded = new Set<number>();
      boundaries.forEach((boundary) => {
        for (let delta = -1; delta <= 1; delta += 1) {
          excluded.add(boundary + delta);
        }
      });
      const internalValues = profile
        .map((value, index) => ({ value, coordinate: index + 1 }))
        .filter(({ coordinate }) => !excluded.has(coordinate))
        .map(({ value }) => value);
      const internalMean = mean(internalValues);
      const score = boundaryMean - internalMean;
      const confidence = clamp(score * 1.5, 0, 1);
      const candidate = { count: boundaries.length, confidence, period, offset, score };

      // When two periods explain the image almost equally well, keep the
      // larger period. This prevents one visual pixel block being split into
      // several smaller editor cells because of anti-aliased edges.
      if (!best || score > best.score + 0.01 || (Math.abs(score - best.score) <= 0.01 && period > best.period)) {
        best = candidate;
      }
    }
  }

  return best ?? { count: 2, confidence: 0, period: Math.max(2, Math.floor(length / 2)), offset: 0, score: 0 };
}

function createAxisEdges(length: number, estimate: AxisEstimate): number[] {
  const edges = [0];
  if (estimate.offset > 0) {
    edges.push(estimate.offset);
  }
  for (let coordinate = estimate.offset || estimate.period; coordinate < length; coordinate += estimate.period) {
    if (coordinate > edges.at(-1)!) {
      edges.push(coordinate);
    }
  }
  if (edges.at(-1)! < length) {
    edges.push(length);
  }
  return edges;
}

export const autoGridRecoveryAdapter: GridRecoveryAdapter = {
  id: "mvp-edge-periodic-detector",
  async recover(image: RgbaImage): Promise<GridRecoveryResult> {
    if (image.width < 4 || image.height < 4) {
      throw new Error("图片尺寸太小，无法检测像素网格。");
    }

    const columns = estimateAxis(buildAxisProfile(image, true), image.width);
    const rows = estimateAxis(buildAxisProfile(image, false), image.height);
    const xEdges = createAxisEdges(image.width, columns);
    const yEdges = createAxisEdges(image.height, rows);
    const columnCount = xEdges.length - 1;
    const rowCount = yEdges.length - 1;
    const confidence = (columns.confidence + rows.confidence) / 2;
    if (confidence < MIN_CONFIDENCE) {
      throw new Error(`Native pixel grid confidence is too low (${confidence.toFixed(3)}).`);
    }
    const geometry = {
      columns: columnCount,
      rows: rowCount,
      xEdges,
      yEdges,
      confidence,
      detectorId: "mvp-edge-periodic-detector",
      xPeriodPx: columns.period,
      yPeriodPx: rows.period,
      xOffsetPx: columns.offset,
      yOffsetPx: rows.offset,
    };

    return {
      geometry,
      grid: sampleRasterGrid(image, geometry),
      diagnostics: { detectorId: "mvp-edge-periodic-detector", confidence },
    };
  },
};
