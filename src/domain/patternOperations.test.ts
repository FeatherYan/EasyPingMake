import { describe, expect, it } from "vitest";
import { centerContent, constrainShapeEnd, drawRectangle, drawShape, expandCanvas, findColorRegions, floodFill, mirrorHorizontal, replaceColor } from "./patternOperations";

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

  it("draws a filled circle and constrains a rectangle to a square", () => {
    const cells = Array.from({ length: 5 }, () => Array<null>(5).fill(null));

    expect(drawShape(cells, { x: 0, y: 0 }, { x: 4, y: 4 }, "A01", "circle", false)).toEqual([
      [null, "A01", "A01", "A01", null],
      ["A01", "A01", "A01", "A01", "A01"],
      ["A01", "A01", "A01", "A01", "A01"],
      ["A01", "A01", "A01", "A01", "A01"],
      [null, "A01", "A01", "A01", null],
    ]);
    expect(constrainShapeEnd({ x: 3, y: 3 }, { x: 0, y: 1 })).toEqual({ x: 0, y: 0 });
    expect(drawShape(cells, { x: 1, y: 1 }, { x: 3, y: 2 }, "H07", "rectangle", true)).toEqual([
      [null, null, null, null, null],
      [null, "H07", "H07", "H07", null],
      [null, "H07", "H07", "H07", null],
      [null, "H07", "H07", "H07", null],
      [null, null, null, null, null],
    ]);
  });

  it("merges one color into another", () => {
    expect(replaceColor([["A01", "H07"], [null, "A01"]], "A01", "H07")).toEqual([
      ["H07", "H07"],
      [null, "H07"],
    ]);
  });

  it("groups touching cells into connected color regions", () => {
    expect(findColorRegions([
      ["A01", "A01", null, "A01"],
      [null, "A01", null, "A01"],
    ], "A01")).toEqual([
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      [{ x: 3, y: 0 }, { x: 3, y: 1 }],
    ]);
  });

  it("expands a canvas from the top-left without shrinking", () => {
    const cells = [
      ["A01", null],
      [null, "H07"],
    ];

    expect(expandCanvas(cells, 4, 3)).toEqual([
      ["A01", null, null, null],
      [null, "H07", null, null],
      [null, null, null, null],
    ]);
    expect(expandCanvas(cells, 1, 1)).toEqual(cells);
  });

  it("supports the 78 and 104 editor expansion targets", () => {
    const cells = Array.from({ length: 52 }, () => Array<string | null>(52).fill(null));
    cells[0][0] = "A01";

    const expandedTo78 = expandCanvas(cells, 78, 78);
    expect(expandedTo78).toHaveLength(78);
    expect(expandedTo78[0]).toHaveLength(78);
    expect(expandedTo78[0][0]).toBe("A01");
    expect(expandedTo78[77][77]).toBeNull();

    const expandedTo104 = expandCanvas(cells, 104, 104);
    expect(expandedTo104).toHaveLength(104);
    expect(expandedTo104[0]).toHaveLength(104);
    expect(expandedTo104[0][0]).toBe("A01");
    expect(expandCanvas(expandedTo104, 78, 78)).toEqual(expandedTo104);
  });

  it("centers the painted content horizontally and vertically", () => {
    const cells = Array.from({ length: 8 }, () => Array<string | null>(6).fill(null));
    cells[1][0] = "A01";
    cells[2][2] = "H07";

    expect(centerContent(cells)).toEqual([
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, "A01", null, null, null, null],
      [null, null, null, "H07", null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
    ]);
    expect(centerContent(Array.from({ length: 4 }, () => Array<string | null>(4).fill(null)))).toEqual(
      Array.from({ length: 4 }, () => Array<string | null>(4).fill(null)),
    );
  });
});
