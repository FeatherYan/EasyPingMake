import { describe, expect, it } from "vitest";
import {
  DARK_COLOR_TEXT,
  DIMMED_COLOR_OPACITY,
  LIGHT_COLOR_TEXT,
  getColorDisplayOpacity,
  getReadableTextColor,
} from "./colorDisplay";

describe("getReadableTextColor", () => {
  it("uses dark text for light backgrounds", () => {
    expect(getReadableTextColor("#FFFFFF")).toBe(DARK_COLOR_TEXT);
    expect(getReadableTextColor("#FAF4C8")).toBe(DARK_COLOR_TEXT);
  });

  it("uses white text for dark backgrounds", () => {
    expect(getReadableTextColor("#000000")).toBe(LIGHT_COLOR_TEXT);
    expect(getReadableTextColor("#102A43")).toBe(LIGHT_COLOR_TEXT);
    expect(getReadableTextColor("#7F1D1D")).toBe(LIGHT_COLOR_TEXT);
  });

  it("falls back safely for malformed values", () => {
    expect(getReadableTextColor("not-a-color")).toBe(DARK_COLOR_TEXT);
    expect(getReadableTextColor("#FFF")).toBe(DARK_COLOR_TEXT);
  });
});

describe("getColorDisplayOpacity", () => {
  it("keeps every color fully visible when no color is highlighted", () => {
    expect(getColorDisplayOpacity("A01", null)).toBe(1);
    expect(getColorDisplayOpacity("H07", null)).toBe(1);
  });

  it("keeps the highlighted color fully visible", () => {
    expect(getColorDisplayOpacity("A01", "A01")).toBe(1);
  });

  it("dims non-highlighted colors to fifty percent", () => {
    expect(getColorDisplayOpacity("H07", "A01")).toBe(DIMMED_COLOR_OPACITY);
  });
});
