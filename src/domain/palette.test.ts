import { describe, expect, it } from "vitest";
import mapping from "../../data/colorSystemMapping.json";
import { loadMard291Palette, MARD291_GROUP_COUNTS } from "./palette";

describe("MARD291 palette", () => {
  it("loads exactly 291 unique colors from the shared mapping data", () => {
    const palette = loadMard291Palette();
    expect(palette).toHaveLength(291);
    expect(new Set(palette.map((color) => color.code)).size).toBe(291);
  });

  it("contains all confirmed groups in the expected counts", () => {
    const palette = loadMard291Palette();
    const counts = palette.reduce<Record<string, number>>((result, color) => {
      const group = color.code.match(/^[A-Z]+/)?.[0] ?? "";
      result[group] = (result[group] ?? 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual(MARD291_GROUP_COUNTS);
  });

  it("keeps every original 221 code and its mapped hex unchanged", () => {
    const palette = loadMard291Palette();
    const paletteByCode = new Map(palette.map((color) => [color.code, color.hex]));
    const originalGroups = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "M"]);
    const originalEntries = Object.entries(mapping as Record<string, Record<string, string>>)
      .map(([hex, brands]) => ({ code: brands.MARD, hex: hex.toUpperCase() }))
      .filter((color) => originalGroups.has(color.code?.match(/^[A-Z]+/)?.[0] ?? ""));

    expect(originalEntries).toHaveLength(221);
    for (const color of originalEntries) {
      expect(paletteByCode.get(color.code)).toBe(color.hex);
    }
  });

  it("includes added groups and sorts multi-letter ZG codes correctly", () => {
    const codes = loadMard291Palette().map((color) => color.code);
    expect(codes).toContain("P01");
    expect(codes).toContain("Q05");
    expect(codes).toContain("R28");
    expect(codes).toContain("T01");
    expect(codes).toContain("Y05");
    expect(codes.slice(-8)).toEqual(["ZG1", "ZG2", "ZG3", "ZG4", "ZG5", "ZG6", "ZG7", "ZG8"]);
  });
});
