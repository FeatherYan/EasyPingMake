import { describe, expect, it } from "vitest";
import type { PatternDocument } from "../domain/pattern";
import { calculatePatternSheetLayout, getPatternColorCounts } from "./patternPng";

const palette = [
  { code: "A1", hex: "#ffffff" },
  { code: "A2", hex: "#000000" },
  { code: "B1", hex: "#ff0000" },
];

function createPattern(cells: (string | null)[][]): PatternDocument {
  return {
    id: "test-pattern",
    name: "测试图纸",
    paletteId: "MARD291",
    cellSizeMm: 2.8,
    canvas: { width: cells[0].length, height: cells.length },
    cells,
    bounds: null,
    workSize: null,
  };
}

describe("pattern sheet export helpers", () => {
  it("counts only non-empty cells and sorts by usage", () => {
    const pattern = createPattern([
      ["A2", "A1", null],
      ["A2", "B1", "A2"],
    ]);

    expect(getPatternColorCounts(pattern, palette).map(({ code, count }) => ({ code, count }))).toEqual([
      { code: "A2", count: 3 },
      { code: "A1", count: 1 },
      { code: "B1", count: 1 },
    ]);
  });

  it("keeps empty sheets measurable and reserves legend space", () => {
    const pattern = createPattern([[null, null], [null, null]]);
    const layout = calculatePatternSheetLayout(pattern, 0, 24, true);

    expect(layout.width).toBe(960);
    expect(layout.gridWidth).toBe(96);
    expect(layout.gridHeight).toBe(96);
    expect(layout.height).toBeGreaterThan(layout.gridY + layout.gridHeight);
  });

  it("wraps the legend when the used color count exceeds one row", () => {
    const pattern = createPattern(Array.from({ length: 52 }, () => Array<string | null>(52).fill(null)));
    const layout = calculatePatternSheetLayout(pattern, 40, 24, true);

    expect(layout.legendRows).toBeGreaterThan(1);
    expect(layout.height).toBeGreaterThan(layout.gridY + layout.gridHeight + 100);
  });
});
