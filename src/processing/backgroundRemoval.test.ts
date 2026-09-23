import { describe, expect, it } from "vitest";
import { removeConnectedBackground } from "./backgroundRemoval";

function createImage(): { width: number; height: number; data: Uint8ClampedArray } {
  const width = 5;
  const height = 5;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = 254;
    data[index * 4 + 1] = 254;
    data[index * 4 + 2] = 254;
    data[index * 4 + 3] = 255;
  }

  for (let y = 1; y < 4; y += 1) {
    for (let x = 1; x < 4; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 180;
      data[offset + 1] = 80;
      data[offset + 2] = 40;
    }
  }
  const center = (2 * width + 2) * 4;
  data[center] = 254;
  data[center + 1] = 254;
  data[center + 2] = 254;

  return { width, height, data };
}

describe("removeConnectedBackground", () => {
  it("removes border-connected background but preserves enclosed subject pixels", () => {
    const result = removeConnectedBackground(createImage());

    expect(result.removedPixelCount).toBe(16);
    expect(result.image.data[3]).toBe(0);
    expect(result.image.data[(2 * 5 + 2) * 4 + 3]).toBe(255);
  });
});
