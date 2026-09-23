import { describe, expect, it } from "vitest";
import { sampleRasterGrid } from "./rasterGrid";

describe("raster grid sampling", () => {
  it("turns each detected cell into one representative color", () => {
    const red = [255, 0, 0, 255];
    const green = [0, 255, 0, 255];
    const blue = [0, 0, 255, 255];
    const white = [255, 255, 255, 255];
    const pixels = [
      [red, red, green, green],
      [red, red, green, green],
      [blue, blue, white, white],
      [blue, blue, white, white],
    ];
    const image = {
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(pixels.flat(2)),
    };

    const grid = sampleRasterGrid(image, {
      columns: 2,
      rows: 2,
      xEdges: [0, 2, 4],
      yEdges: [0, 2, 4],
    });

    expect(grid.width).toBe(2);
    expect(grid.height).toBe(2);
    expect(grid.cells[0][0]).toMatchObject({ r: 255, g: 0, b: 0, a: 255 });
    expect(grid.cells[0][1]).toMatchObject({ r: 0, g: 255, b: 0, a: 255 });
    expect(grid.cells[1][0]).toMatchObject({ r: 0, g: 0, b: 255, a: 255 });
  });

  it("keeps a fully transparent cell empty", () => {
    const image = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        255, 0, 0, 0, 255, 0, 0, 0,
        255, 0, 0, 0, 255, 0, 0, 0,
      ]),
    };

    const grid = sampleRasterGrid(image, {
      columns: 1,
      rows: 1,
      xEdges: [0, 2],
      yEdges: [0, 2],
    });

    expect(grid.cells[0][0]).toBeNull();
  });
});
