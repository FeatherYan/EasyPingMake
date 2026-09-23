import { describe, expect, it } from "vitest";
import { recoverWithBestAdapter } from "./gridRecovery";
import type { GridRecoveryAdapter, GridRecoveryResult, RgbaImage } from "./types";

const image: RgbaImage = {
  width: 4,
  height: 4,
  data: new Uint8ClampedArray(4 * 4 * 4),
};

function result(detectorId: string, confidence: number): GridRecoveryResult {
  return {
    geometry: { columns: 2, rows: 2, xEdges: [0, 2, 4], yEdges: [0, 2, 4], confidence, detectorId },
    grid: { width: 2, height: 2, cells: [[null, null], [null, null]] },
    diagnostics: { detectorId, confidence },
  };
}

describe("recoverWithBestAdapter", () => {
  it("chooses the successful result with the highest confidence", async () => {
    const adapters: GridRecoveryAdapter[] = [
      { id: "low", recover: async () => result("low", 0.4) },
      { id: "high", recover: async () => result("high", 0.9) },
    ];

    await expect(recoverWithBestAdapter(image, { preferredCanvasSize: 52 }, adapters)).resolves.toMatchObject({
      diagnostics: { detectorId: "high", confidence: 0.9 },
    });
  });

  it("keeps working when one detector fails", async () => {
    const adapters: GridRecoveryAdapter[] = [
      { id: "failed", recover: async () => { throw new Error("detector error"); } },
      { id: "fallback", recover: async () => result("fallback", 0.3) },
    ];

    await expect(recoverWithBestAdapter(image, { preferredCanvasSize: 52 }, adapters)).resolves.toMatchObject({
      diagnostics: { detectorId: "fallback" },
    });
  });
});
