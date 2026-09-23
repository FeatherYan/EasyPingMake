import { sampleRasterGrid } from "./rasterGrid";
import type { GridRecoveryAdapter, GridRecoveryOptions, GridRecoveryResult, RgbaImage } from "./types";

const FALLBACK_CONFIDENCE = 0.2;

/**
 * Pixelizes a pseudo-pixel image at the requested abstraction canvas size when
 * no reliable native grid can be recovered from the generated image.
 */
export const preferredCanvasPixelizerAdapter: GridRecoveryAdapter = {
  id: "preferred-canvas-pixelizer",
  async recover(image: RgbaImage, options: GridRecoveryOptions): Promise<GridRecoveryResult> {
    const size = options.preferredCanvasSize;
    if (!Number.isInteger(size) || size < 1) {
      throw new Error("Preferred canvas size must be a positive integer.");
    }

    const xEdges = Array.from({ length: size + 1 }, (_, index) => (index * image.width) / size);
    const yEdges = Array.from({ length: size + 1 }, (_, index) => (index * image.height) / size);
    const geometry = {
      columns: size,
      rows: size,
      xEdges,
      yEdges,
      confidence: FALLBACK_CONFIDENCE,
      detectorId: "preferred-canvas-pixelizer",
    };

    return {
      geometry,
      grid: sampleRasterGrid(image, geometry),
      diagnostics: {
        detectorId: "preferred-canvas-pixelizer",
        confidence: FALLBACK_CONFIDENCE,
      },
    };
  },
};
