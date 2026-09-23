import { describe, expect, it } from "vitest";
import {
  calculateBounds,
  calculatePhysicalWorkSize,
  chooseCanvasSize,
  createPatternDocumentFromGrid,
} from "./pattern";

describe("pattern sizing", () => {
  it("calculates the non-empty bounding box", () => {
    const bounds = calculateBounds([
      [null, null, null],
      [null, "A01", null],
      [null, null, "H07"],
    ]);

    expect(bounds).toMatchObject({ minX: 1, minY: 1, maxX: 2, maxY: 2, width: 2, height: 2 });
    expect(calculatePhysicalWorkSize(bounds)).toEqual({ widthMm: 5.6, heightMm: 5.6 });
  });

  it("uses the preferred canvas as a minimum and grows through presets", () => {
    expect(chooseCanvasSize(40, 30, 52)).toBe(52);
    expect(chooseCanvasSize(60, 40, 52)).toBe(78);
    expect(chooseCanvasSize(90, 70, 78)).toBe(104);
    expect(chooseCanvasSize(120, 90, 104)).toBe(120);
  });

  it("centers active pixels in the selected canvas without resampling", () => {
    const pattern = createPatternDocumentFromGrid({
      preferredCanvasSize: 52,
      grid: {
        width: 2,
        height: 2,
        cells: [
          ["A01", null],
          [null, "H07"],
        ],
      },
    });

    expect(pattern.canvas).toEqual({ width: 52, height: 52 });
    expect(pattern.bounds?.width).toBe(2);
    expect(pattern.bounds?.height).toBe(2);
    expect(pattern.workSize).toEqual({ widthMm: 5.6, heightMm: 5.6 });
  });
});
