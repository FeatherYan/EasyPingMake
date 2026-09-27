export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_CANVAS_ZOOM = 0.5;
export const MAX_CANVAS_ZOOM = 8;
export const CELL_LABEL_MIN_PX = 24;

export function clampCanvasZoom(value: number): number {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, value));
}

export function clampCanvasPan(viewport: CanvasViewport, board: CanvasSize): CanvasViewport {
  // Keep the board visible while still allowing it to move inside the
  // infinite-looking workspace when zoomed below the fitted size.
  const maxX = board.width * Math.abs(viewport.zoom - 1) / 2;
  const maxY = board.height * Math.abs(viewport.zoom - 1) / 2;
  const clamp = (value: number, max: number) => {
    const result = Math.min(max, Math.max(-max, value));
    return Object.is(result, -0) ? 0 : result;
  };
  return {
    zoom: clampCanvasZoom(viewport.zoom),
    panX: clamp(viewport.panX, maxX),
    panY: clamp(viewport.panY, maxY),
  };
}

export function calculateCanvasCellPixels(board: CanvasSize, viewport: CanvasSize, zoom: number): number {
  if (board.width <= 0 || board.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return 0;
  }
  return Math.min(viewport.width / board.width, viewport.height / board.height) * clampCanvasZoom(zoom);
}

export function shouldShowCellLabels(cellPixels: number): boolean {
  return cellPixels >= CELL_LABEL_MIN_PX;
}

export function panCanvas(viewport: CanvasViewport, delta: CanvasPoint, board: CanvasSize): CanvasViewport {
  return clampCanvasPan({
    ...viewport,
    panX: viewport.panX + delta.x,
    panY: viewport.panY + delta.y,
  }, board);
}

export function zoomCanvasAtPoint(
  viewport: CanvasViewport,
  point: CanvasPoint,
  board: CanvasSize,
  nextZoom: number,
): CanvasViewport {
  const currentZoom = clampCanvasZoom(viewport.zoom);
  const zoom = clampCanvasZoom(nextZoom);
  if (currentZoom <= 0 || zoom <= 0) {
    return { ...viewport, zoom };
  }
  const center = { x: board.width / 2, y: board.height / 2 };
  const boardPoint = {
    x: (point.x - center.x - viewport.panX) / currentZoom + center.x,
    y: (point.y - center.y - viewport.panY) / currentZoom + center.y,
  };
  return clampCanvasPan({
    zoom,
    panX: point.x - center.x - (boardPoint.x - center.x) * zoom,
    panY: point.y - center.y - (boardPoint.y - center.y) * zoom,
  }, board);
}
