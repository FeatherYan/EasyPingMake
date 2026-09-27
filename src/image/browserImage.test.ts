import { describe, expect, it } from "vitest";
import { createCenteredSquareCrop, updateImageCrop } from "./browserImage";

describe("createCenteredSquareCrop", () => {
  it("centers a square crop inside a landscape image", () => {
    expect(createCenteredSquareCrop(1600, 900)).toEqual({
      x: 0.21875,
      y: 0,
      width: 0.5625,
      height: 1,
    });
  });

  it("centers a square crop inside a portrait image", () => {
    expect(createCenteredSquareCrop(900, 1600)).toEqual({
      x: 0,
      y: 0.21875,
      width: 1,
      height: 0.5625,
    });
  });

  it("uses the full image for invalid dimensions", () => {
    expect(createCenteredSquareCrop(0, 0)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("keeps moved crops inside the image bounds", () => {
    expect(updateImageCrop({ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }, "move", undefined, 0.6, -0.4)).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
  });

  it("keeps resized crops above the minimum size", () => {
    const crop = updateImageCrop({ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }, "resize", "nw", 0.8, 0.8);
    expect(crop.x + crop.width).toBeCloseTo(0.7);
    expect(crop.y + crop.height).toBeCloseTo(0.7);
    expect(crop.width).toBeGreaterThanOrEqual(0.12);
    expect(crop.height).toBeGreaterThanOrEqual(0.12);
  });
});
