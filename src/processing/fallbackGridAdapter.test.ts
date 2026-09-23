import { describe, expect, it } from "vitest";
import { preferredCanvasPixelizerAdapter } from "./fallbackGridAdapter";

describe("preferredCanvasPixelizerAdapter", () => {
  it("creates one editable cell per requested abstraction canvas slot", async () => {
    const result = await preferredCanvasPixelizerAdapter.recover({
      width: 100,
      height: 80,
      data: new Uint8ClampedArray(100 * 80 * 4),
    }, { preferredCanvasSize: 52 });

    expect(result.geometry.columns).toBe(52);
    expect(result.geometry.rows).toBe(52);
    expect(result.grid.width).toBe(52);
    expect(result.grid.height).toBe(52);
    expect(result.geometry.xEdges.at(-1)).toBe(100);
    expect(result.geometry.yEdges.at(-1)).toBe(80);
  });
});
