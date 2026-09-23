import type { CanvasPreset, PatternCell, PixelGrid } from "../domain/pattern";

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface GridGeometry {
  columns: number;
  rows: number;
  xEdges: number[];
  yEdges: number[];
  confidence?: number;
  detectorId?: string;
  xPeriodPx?: number;
  yPeriodPx?: number;
  xOffsetPx?: number;
  yOffsetPx?: number;
}

export interface RasterGrid {
  width: number;
  height: number;
  cells: Array<Array<RgbaColor | null>>;
}

export interface GridRecoveryOptions {
  preferredCanvasSize: CanvasPreset;
  /** Optional original raster for adapters that must not consume transparent pixels. */
  sourceImage?: RgbaImage;
}

export interface GridRecoveryResult {
  geometry: GridGeometry;
  grid: RasterGrid;
  diagnostics: {
    detectorId: string;
    confidence: number | null;
    metadata?: Record<string, unknown>;
  };
  processedImage?: RgbaImage;
  attempts?: GridRecoveryAttempt[];
}

export interface GridRecoveryAttempt {
  adapterId: string;
  status: "fulfilled" | "rejected";
  geometry?: GridGeometry;
  grid?: RasterGrid;
  diagnostics?: GridRecoveryResult["diagnostics"];
  error?: string;
}

export interface GridRecoveryAdapter {
  id: string;
  recover(image: RgbaImage, options: GridRecoveryOptions): Promise<GridRecoveryResult>;
}

export interface PatternBuildResult {
  pixelGrid: PixelGrid;
  colorCodes: Set<string>;
  emptyCellCount: number;
}

export type PatternCodeGrid = Array<Array<PatternCell>>;
