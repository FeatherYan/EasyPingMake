import { describe, expect, it } from "vitest";
import {
  calculateMiniMapViewport,
  calculatePreviewDialogWidth,
  calculatePreviewFitScale,
  clampPreviewPan,
  clampPreviewZoom,
  panToMiniMapPoint,
  zoomPreviewAtPoint,
} from "./previewNavigation";

describe("preview navigation", () => {
  const image = { width: 1200, height: 800 };
  const viewport = { width: 600, height: 400 };

  it("fits the complete image inside the initial viewport", () => {
    expect(calculatePreviewFitScale(image, viewport)).toBeCloseTo(0.47);
  });

  it("chooses a compact width from the sheet aspect ratio", () => {
    const available = { width: 1920, height: 1080 };
    expect(calculatePreviewDialogWidth({ width: 1200, height: 1800 }, available)).toBe(720);
    expect(calculatePreviewDialogWidth({ width: 2200, height: 900 }, available)).toBe(1100);
  });

  it("respects the available viewport on small screens", () => {
    expect(calculatePreviewDialogWidth({ width: 1200, height: 800 }, { width: 800, height: 700 })).toBe(752);
    expect(calculatePreviewDialogWidth({ width: 1200, height: 800 }, { width: 600, height: 700 })).toBe(552);
  });

  it("clamps zoom and pan to valid bounds", () => {
    expect(clampPreviewZoom(0)).toBe(0.25);
    expect(clampPreviewZoom(9)).toBe(4);
    expect(clampPreviewPan({ x: 999, y: -999 }, image, viewport, 0.5, 2)).toEqual({ x: 300, y: -200 });
    expect(clampPreviewPan({ x: 999, y: 999 }, image, viewport, 0.5, 1)).toEqual({ x: 0, y: 0 });
  });

  it("keeps the point beneath the cursor stable during zoom", () => {
    const nextPan = zoomPreviewAtPoint({ x: 0, y: 0 }, { x: 450, y: 250 }, image, viewport, 0.5, 1, 2);
    expect(nextPan.x).toBeCloseTo(-150);
    expect(nextPan.y).toBeCloseTo(-50);
  });

  it("maps the current viewport to a minimap rectangle and supports minimap positioning", () => {
    const mini = { width: 180, height: 120 };
    const rect = calculateMiniMapViewport(image, viewport, { x: 0, y: 0 }, 0.5, 2, mini);
    expect(rect.width).toBeCloseTo(90);
    expect(rect.height).toBeCloseTo(60);
    const centeredPan = panToMiniMapPoint({ x: 90, y: 60 }, image, viewport, 0.5, 2, mini);
    expect(centeredPan).toEqual({ x: 0, y: 0 });
  });
});
