import { describe, expect, it } from "vitest";
import { drawRectangle, floodFill, mirrorHorizontal } from "./patternOperations";

describe("pattern operations", () => {
  it("fills a contiguous region without crossing another color", () => {
    const cells = [
      [null, null, "A01"],
      [null, "A01", "A01"],
      [null, null, null],
    ];

    expect(floodFill(cells, { x: 0, y: 0 }, "H07")).toEqual([
      ["H07", "H07", "A01"],
      ["H07", "A01", "A01"],
      ["H07", "H07", "H07"],
    ]);
  });

  it("draws a rectangular shape and mirrors rows", () => {
    const cells = [
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ];

    expect(drawRectangle(cells, { x: 0, y: 1 }, { x: 1, y: 2 }, "A01")).toEqual([
      [null, null, null],
      ["A01", "A01", null],
      ["A01", "A01", null],
    ]);
    expect(mirrorHorizontal(cells)).toEqual(cells);
  });
});
