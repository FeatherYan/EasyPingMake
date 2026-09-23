import { describe, expect, it } from "vitest";
import { loadMard221Palette } from "../domain/palette";
import { mapRasterGridToMard221 } from "./mardMapper";

function hexToRgb(hex: string) {
  const normalized = hex.slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: 255,
  };
}

describe("MARD221 mapping", () => {
  it("maps raster colors to valid MARD221 codes", () => {
    const palette = loadMard221Palette();
    const first = hexToRgb(palette[0].hex);
    const second = hexToRgb(palette[1].hex);
    const result = mapRasterGridToMard221({ width: 2, height: 2, cells: [[first, second], [second, null]] }, 10);

    expect(result.pixelGrid.cells[0][0]).toBe(palette[0].code);
    expect(result.pixelGrid.cells[0][1]).toBe(palette[1].code);
    expect(result.pixelGrid.cells[1][1]).toBeNull();
    expect(result.colorCodes.size).toBeLessThanOrEqual(10);
  });

  it("rejects a color limit outside the PRD range", () => {
    expect(() => mapRasterGridToMard221({ width: 1, height: 1, cells: [[null]] }, 9)).toThrow();
    expect(() => mapRasterGridToMard221({ width: 1, height: 1, cells: [[null]] }, 51)).toThrow();
  });
});
