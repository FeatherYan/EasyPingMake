import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RgbaImage } from "./types";

const mocks = vi.hoisted(() => ({
  encodeRgbaImageToPng: vi.fn(),
  decodeImageBlob: vi.fn(),
  removeConnectedBackground: vi.fn(),
}));

vi.mock("../image/browserImage", () => mocks);
vi.mock("./backgroundRemoval", () => ({ removeConnectedBackground: mocks.removeConnectedBackground }));

import { perfectPixelAdapter } from "./perfectPixelAdapter";

const fallbackImage: RgbaImage = {
  width: 4,
  height: 4,
  data: new Uint8ClampedArray(4 * 4 * 4),
};

const originalImage: RgbaImage = {
  width: 8,
  height: 8,
  data: new Uint8ClampedArray(8 * 8 * 4),
};

const perfectPixelImage: RgbaImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ]),
};

describe("perfectPixelAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.encodeRgbaImageToPng.mockResolvedValue(new Blob(["input"], { type: "image/png" }));
    mocks.decodeImageBlob.mockResolvedValue(perfectPixelImage);
    mocks.removeConnectedBackground.mockReturnValue({
      image: perfectPixelImage,
      removedPixelCount: 0,
      backgroundColor: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ width: 2, height: 2, imageBase64: "AA==", logs: [] }),
      text: async () => "",
    }));
  });

  it("uses the original opaque raster when one is supplied", async () => {
    const result = await perfectPixelAdapter.recover(fallbackImage, {
      preferredCanvasSize: 52,
      sourceImage: originalImage,
    });

    expect(mocks.encodeRgbaImageToPng).toHaveBeenCalledWith(originalImage);
    expect(result.geometry).toMatchObject({ columns: 2, rows: 2, detectorId: "perfectPixel" });
    expect(result.processedImage).toBe(perfectPixelImage);
  });
});
