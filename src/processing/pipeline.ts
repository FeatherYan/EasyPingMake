import { createPatternDocumentFromGrid, type CanvasPreset, type PatternDocument } from "../domain/pattern";
import { removeConnectedBackground } from "./backgroundRemoval";
import { mapRasterGridToMard221 } from "./mardMapper";
import { recoverWithBestAdapter } from "./gridRecovery";
import { sampleRasterGrid } from "./rasterGrid";
import type { GridRecoveryAdapter, GridRecoveryResult, GridGeometry, RgbaImage } from "./types";

export function convertRasterToPattern(options: {
  image: RgbaImage;
  geometry: GridGeometry;
  preferredCanvasSize: CanvasPreset;
  maxColors: number;
  name?: string;
}): PatternDocument {
  const rasterGrid = sampleRasterGrid(removeConnectedBackground(options.image).image, options.geometry);
  const mapped = mapRasterGridToMard221(rasterGrid, options.maxColors);

  return createPatternDocumentFromGrid({
    name: options.name,
    preferredCanvasSize: options.preferredCanvasSize,
    grid: mapped.pixelGrid,
  });
}

export async function convertGeneratedImageToPattern(options: {
  image: RgbaImage;
  preferredCanvasSize: CanvasPreset;
  maxColors: number;
  adapters: GridRecoveryAdapter[];
  name?: string;
}): Promise<{
  pattern: PatternDocument;
  recovery: GridRecoveryResult;
  mapped: ReturnType<typeof mapRasterGridToMard221>;
  backgroundRemoval: ReturnType<typeof removeConnectedBackground>;
}> {
  const backgroundRemoval = removeConnectedBackground(options.image);
  const recovery = await recoverWithBestAdapter(
    backgroundRemoval.image,
    {
      preferredCanvasSize: options.preferredCanvasSize,
      sourceImage: options.image,
    },
    options.adapters,
  );
  const rasterGrid = recovery.grid;
  const mapped = mapRasterGridToMard221(rasterGrid, options.maxColors);

  return {
    recovery,
    mapped,
    backgroundRemoval,
    pattern: createPatternDocumentFromGrid({
      name: options.name,
      preferredCanvasSize: options.preferredCanvasSize,
      grid: mapped.pixelGrid,
    }),
  };
}
