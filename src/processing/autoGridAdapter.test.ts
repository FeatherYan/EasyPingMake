import { describe, expect, it } from "vitest";
import { autoGridRecoveryAdapter } from "./autoGridAdapter";
import type { RgbaImage } from "./types";

function createBlockImage(blocks: string[][], blockSize: number): RgbaImage {
  const height = blocks.length * blockSize;
  const width = blocks[0].length * blockSize;
  const data = new Uint8ClampedArray(width * height * 4);
  const colors: Record<string, [number, number, number]> = {
    r: [240, 40, 40],
    g: [40, 200, 80],
    b: [40, 80, 220],
    y: [240, 200, 40],
  };

  blocks.forEach((row, blockY) => row.forEach((code, blockX) => {
    const color = colors[code];
    for (let y = blockY * blockSize; y < (blockY + 1) * blockSize; y += 1) {
      for (let x = blockX * blockSize; x < (blockX + 1) * blockSize; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = 255;
      }
    }
  }));

  return { width, height, data };
}

describe("autoGridRecoveryAdapter", () => {
  it("recovers the native grid from repeated pixel blocks", async () => {
    const image = createBlockImage([
      ["r", "g", "b"],
      ["g", "b", "y"],
      ["b", "y", "r"],
    ], 4);

    const result = await autoGridRecoveryAdapter.recover(image, { preferredCanvasSize: 52 });
    expect(result.geometry.columns).toBe(3);
    expect(result.geometry.rows).toBe(3);
    expect(result.geometry.xPeriodPx).toBe(4);
    expect(result.geometry.yPeriodPx).toBe(4);
    expect(result.diagnostics.confidence).toBeGreaterThan(0.5);
  });
});
