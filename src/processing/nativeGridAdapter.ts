import { sampleRasterGrid } from "./rasterGrid";
import type { GridRecoveryAdapter, GridRecoveryOptions, GridRecoveryResult, RgbaImage } from "./types";

export function createNativeGridAdapter(nativeGridHint: { columns: number; rows: number }): GridRecoveryAdapter {
  return {
    id: "provider-native-grid-hint",
    async recover(image: RgbaImage, _options: GridRecoveryOptions): Promise<GridRecoveryResult> {
      if (!Number.isInteger(nativeGridHint.columns) || !Number.isInteger(nativeGridHint.rows) || nativeGridHint.columns < 1 || nativeGridHint.rows < 1) {
        throw new Error("AI 提供器返回的原生网格尺寸无效。");
      }

      const xEdges = Array.from({ length: nativeGridHint.columns + 1 }, (_, index) => (index * image.width) / nativeGridHint.columns);
      const yEdges = Array.from({ length: nativeGridHint.rows + 1 }, (_, index) => (index * image.height) / nativeGridHint.rows);
      const geometry = {
        columns: nativeGridHint.columns,
        rows: nativeGridHint.rows,
        xEdges,
        yEdges,
        confidence: 0.75,
        detectorId: "provider-native-grid-hint",
      };

      return {
        geometry,
        grid: sampleRasterGrid(image, geometry),
        diagnostics: { detectorId: "provider-native-grid-hint", confidence: 0.75 },
      };
    },
  };
}
