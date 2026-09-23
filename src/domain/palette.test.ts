import { describe, expect, it } from "vitest";
import { loadMard221Palette, MARD221_GROUP_COUNTS } from "./palette";

describe("MARD221 palette", () => {
  it("loads exactly 221 colors from the shared mapping data", () => {
    const palette = loadMard221Palette();
    expect(palette).toHaveLength(221);
    expect(new Set(palette.map((color) => color.code)).size).toBe(221);
  });

  it("contains only the confirmed MVP groups", () => {
    const palette = loadMard221Palette();
    const counts = palette.reduce<Record<string, number>>((result, color) => {
      const group = color.code.match(/^[A-Z]+/)?.[0] ?? "";
      result[group] = (result[group] ?? 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual(MARD221_GROUP_COUNTS);
  });
});
