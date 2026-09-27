import { describe, expect, it } from "vitest";
import {
  calculateCanvasCellPixels,
  clampCanvasPan,
  clampCanvasZoom,
  panCanvas,
  shouldShowCellLabels,
  zoomCanvasAtPoint,
} from "./vectorCanvasNavigation";

describe("vector canvas navigation", () => {
  const board = { width: 54, height: 54 };

  it("clamps zoom and allows a smaller board to move within the workspace", () => {
    expect(clampCanvasZoom(0)).toBe(0.5);
    expect(clampCanvasZoom(20)).toBe(8);
    expect(clampCanvasPan({ zoom: 0.75, panX: 999, panY: -999 }, board)).toEqual({ zoom: 0.75, panX: 6.75, panY: -6.75 });
    expect(panCanvas({ zoom: 0.75, panX: 0, panY: 0 }, { x: 3, y: -3 }, board)).toEqual({ zoom: 0.75, panX: 3, panY: -3 });
  });

  it("limits panning to the visible board bounds", () => {
    expect(clampCanvasPan({ zoom: 2, panX: 999, panY: -999 }, board)).toEqual({ zoom: 2, panX: 27, panY: -27 });
    expect(panCanvas({ zoom: 2, panX: 0, panY: 0 }, { x: 10, y: -10 }, board)).toEqual({ zoom: 2, panX: 10, panY: -10 });
  });

  it("keeps the point beneath the cursor stable during zoom", () => {
    const next = zoomCanvasAtPoint({ zoom: 1, panX: 0, panY: 0 }, { x: 38, y: 20 }, board, 2);
    expect(next.panX).toBeCloseTo(-11);
    expect(next.panY).toBeCloseTo(7);
  });

  it("shows cell labels only when cells have enough screen space", () => {
    expect(calculateCanvasCellPixels(board, { width: 540, height: 540 }, 1)).toBe(10);
    expect(calculateCanvasCellPixels(board, { width: 540, height: 540 }, 3)).toBe(30);
    expect(shouldShowCellLabels(23.99)).toBe(false);
    expect(shouldShowCellLabels(24)).toBe(true);
  });
});
