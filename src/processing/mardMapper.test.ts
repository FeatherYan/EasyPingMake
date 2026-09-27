import { describe, expect, it } from "vitest";
import { loadMard291Palette } from "../domain/palette";
import { mapRasterGridToMard291 } from "./mardMapper";

function hexToRgb(hex: string) {
  const normalized = hex.slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: 255,
  };
}

function rgbToLab(color: ReturnType<typeof hexToRgb>) {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const pivot = (value: number) => value > 0.008856451679 ? Math.cbrt(value) : 7.787037037 * value + 16 / 116;
  const r = linear(color.r);
  const g = linear(color.g);
  const b = linear(color.b);
  const x = pivot((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = pivot(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = pivot((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

function labDistance(first: ReturnType<typeof rgbToLab>, second: ReturnType<typeof rgbToLab>): number {
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}

function oldRgbDistance(first: ReturnType<typeof hexToRgb>, second: ReturnType<typeof hexToRgb>): number {
  const redMean = (first.r + second.r) / 2;
  const red = first.r - second.r;
  const green = first.g - second.g;
  const blue = first.b - second.b;
  return (2 + redMean / 256) * red * red + 4 * green * green + (2 + (255 - redMean) / 256) * blue * blue;
}

describe("MARD291 mapping", () => {
  it("maps raster colors to valid MARD291 codes", () => {
    const palette = loadMard291Palette();
    const first = hexToRgb(palette[0].hex);
    const second = hexToRgb(palette[1].hex);
    const result = mapRasterGridToMard291({ width: 2, height: 2, cells: [[first, second], [second, null]] }, 10);

    expect(result.pixelGrid.cells[0][0]).toBe(palette[0].code);
    expect(result.pixelGrid.cells[0][1]).toBe(palette[1].code);
    expect(result.pixelGrid.cells[1][1]).toBeNull();
    expect(result.colorCodes.size).toBeLessThanOrEqual(10);
  });

  it("preserves exact palette colors and reports zero color difference", () => {
    const palette = loadMard291Palette();
    const first = hexToRgb(palette[0].hex);
    const second = hexToRgb(palette[1].hex);
    const result = mapRasterGridToMard291({ width: 2, height: 1, cells: [[first, second]] }, 2);

    expect(result.pixelGrid.cells[0]).toEqual([palette[0].code, palette[1].code]);
    expect(result.mappingDiagnostics?.nearestPaletteMeanDeltaE).toBe(0);
    expect(result.mappingDiagnostics?.limitedPaletteMeanDeltaE).toBe(0);
    expect(result.mappingDiagnostics?.selectedColors).toEqual([
      { code: palette[0].code, count: 1 },
      { code: palette[1].code, count: 1 },
    ]);
  });

  it("keeps small high-chroma accents alongside a large neutral region", () => {
    const palette = loadMard291Palette();
    const gray = [...palette].sort((first, second) => {
      const firstRgb = hexToRgb(first.hex);
      const secondRgb = hexToRgb(second.hex);
      const firstChroma = Math.max(firstRgb.r, firstRgb.g, firstRgb.b) - Math.min(firstRgb.r, firstRgb.g, firstRgb.b);
      const secondChroma = Math.max(secondRgb.r, secondRgb.g, secondRgb.b) - Math.min(secondRgb.r, secondRgb.g, secondRgb.b);
      return firstChroma - secondChroma;
    })[0];
    const accents = palette
      .map((color) => ({ color, rgb: hexToRgb(color.hex) }))
      .filter(({ rgb }) => Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) > 130)
      .sort((first, second) => {
        const firstChroma = Math.max(first.rgb.r, first.rgb.g, first.rgb.b) - Math.min(first.rgb.r, first.rgb.g, first.rgb.b);
        const secondChroma = Math.max(second.rgb.r, second.rgb.g, second.rgb.b) - Math.min(second.rgb.r, second.rgb.g, second.rgb.b);
        return secondChroma - firstChroma;
      })
      .slice(0, 2);
    expect(accents).toHaveLength(2);

    const cells = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => ({ ...hexToRgb(gray.hex) })));
    cells[5][5] = accents[0].rgb;
    cells[6][6] = accents[1].rgb;
    const result = mapRasterGridToMard291({ width: 12, height: 12, cells }, 20);

    expect(result.pixelGrid.cells[5][5]).toBe(accents[0].color.code);
    expect(result.pixelGrid.cells[6][6]).toBe(accents[1].color.code);
    expect(result.colorCodes.size).toBeLessThanOrEqual(20);
  });

  it("chooses by Lab perceptual distance when RGB distance prefers a different bead", () => {
    const palette = loadMard291Palette();
    let disagreement: { color: ReturnType<typeof hexToRgb>; labCode: string; rgbCode: string } | null = null;

    for (let red = 0; red <= 255 && !disagreement; red += 17) {
      for (let green = 0; green <= 255 && !disagreement; green += 17) {
        for (let blue = 0; blue <= 255 && !disagreement; blue += 17) {
          const color = { r: red, g: green, b: blue, a: 255 };
          const lab = rgbToLab(color);
          const labNearest = [...palette].sort((first, second) =>
            labDistance(lab, rgbToLab(hexToRgb(first.hex))) - labDistance(lab, rgbToLab(hexToRgb(second.hex))),
          )[0];
          const rgbNearest = [...palette].sort((first, second) =>
            oldRgbDistance(color, hexToRgb(first.hex)) - oldRgbDistance(color, hexToRgb(second.hex)),
          )[0];
          if (labNearest.code !== rgbNearest.code) {
            disagreement = { color, labCode: labNearest.code, rgbCode: rgbNearest.code };
          }
        }
      }
    }

    expect(disagreement).not.toBeNull();
    const result = mapRasterGridToMard291({ width: 1, height: 1, cells: [[disagreement!.color]] }, 1);
    expect(disagreement!.labCode).not.toBe(disagreement!.rgbCode);
    expect(result.pixelGrid.cells[0][0]).toBe(disagreement!.labCode);
  });

  it("keeps final output within the configured palette limit and compares pre/post errors", () => {
    const palette = loadMard291Palette();
    const cells = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) =>
      hexToRgb(palette[(y * 8 + x) % 48].hex)));
    const result = mapRasterGridToMard291({ width: 8, height: 8, cells }, 20);

    expect(result.colorCodes.size).toBeLessThanOrEqual(20);
    expect(result.mappingDiagnostics?.limitedPaletteMeanDeltaE).toBeGreaterThanOrEqual(result.mappingDiagnostics?.nearestPaletteMeanDeltaE ?? 0);
    expect(result.nearestPaletteGrid?.cells).toHaveLength(8);
  });

  it("rejects a color limit outside the MARD291 palette size", () => {
    expect(() => mapRasterGridToMard291({ width: 1, height: 1, cells: [[null]] }, 0)).toThrow();
    expect(() => mapRasterGridToMard291({ width: 1, height: 1, cells: [[null]] }, 292)).toThrow();
  });
});
