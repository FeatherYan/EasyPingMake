export interface PreviewPoint {
  x: number;
  y: number;
}

export interface PreviewSize {
  width: number;
  height: number;
}

export interface PreviewMiniMapRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const MIN_PREVIEW_ZOOM = 0.25;
export const MAX_PREVIEW_ZOOM = 4;

export interface PreviewDialogWidthOptions {
  outerMargin?: number;
  dialogPadding?: number;
  dialogMaxHeight?: number;
  headingHeight?: number;
  headingGap?: number;
  actionsHeight?: number;
  actionsGap?: number;
  viewportPadding?: number;
  minWidth?: number;
  maxWidth?: number;
  fallbackWidth?: number;
}

/**
 * Calculates a compact dialog width that can display the complete sheet at
 * the initial fit scale without reserving space for the minimap.
 */
export function calculatePreviewDialogWidth(
  image: PreviewSize,
  available: PreviewSize,
  options: PreviewDialogWidthOptions = {},
): number {
  const outerMargin = options.outerMargin ?? 48;
  const dialogPadding = options.dialogPadding ?? 40;
  const dialogMaxHeight = options.dialogMaxHeight ?? 900;
  const headingHeight = options.headingHeight ?? 40;
  const headingGap = options.headingGap ?? 16;
  const actionsHeight = options.actionsHeight ?? 40;
  const actionsGap = options.actionsGap ?? 16;
  const viewportPadding = options.viewportPadding ?? 24;
  const fallbackWidth = options.fallbackWidth ?? 900;
  const availableWidth = Math.max(320, available.width - outerMargin);
  const maxWidth = Math.min(options.maxWidth ?? 1100, availableWidth);
  const minWidth = Math.min(options.minWidth ?? 720, maxWidth);

  if (image.width <= 0 || image.height <= 0 || available.height <= 0) {
    return Math.min(maxWidth, Math.max(minWidth, fallbackWidth));
  }

  const dialogHeight = Math.max(320, Math.min(dialogMaxHeight, available.height - outerMargin));
  const previewHeight = Math.max(
    160,
    dialogHeight - dialogPadding - headingHeight - headingGap - actionsHeight - actionsGap,
  );
  const heightScale = Math.min(1, previewHeight / image.height);
  const desiredViewportWidth = image.width * heightScale + viewportPadding;
  const desiredDialogWidth = desiredViewportWidth + dialogPadding;

  return Math.min(maxWidth, Math.max(minWidth, Math.round(desiredDialogWidth)));
}

export function clampPreviewZoom(value: number): number {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, value));
}

export function calculatePreviewFitScale(image: PreviewSize, viewport: PreviewSize, padding = 24): number {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= padding || viewport.height <= padding) {
    return 1;
  }
  return Math.min((viewport.width - padding) / image.width, (viewport.height - padding) / image.height);
}

export function getScaledPreviewSize(image: PreviewSize, fitScale: number, zoom: number): PreviewSize {
  return {
    width: image.width * fitScale * zoom,
    height: image.height * fitScale * zoom,
  };
}

export function clampPreviewPan(
  pan: PreviewPoint,
  image: PreviewSize,
  viewport: PreviewSize,
  fitScale: number,
  zoom: number,
): PreviewPoint {
  const scaled = getScaledPreviewSize(image, fitScale, zoom);
  const maxX = Math.max(0, (scaled.width - viewport.width) / 2);
  const maxY = Math.max(0, (scaled.height - viewport.height) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

export function zoomPreviewAtPoint(
  pan: PreviewPoint,
  point: PreviewPoint,
  image: PreviewSize,
  viewport: PreviewSize,
  fitScale: number,
  currentZoom: number,
  nextZoom: number,
): PreviewPoint {
  const currentScale = fitScale * currentZoom;
  const nextScale = fitScale * nextZoom;
  if (currentScale <= 0 || nextScale <= 0) {
    return { ...pan };
  }
  const imagePoint = {
    x: (point.x - viewport.width / 2 - pan.x) / currentScale + image.width / 2,
    y: (point.y - viewport.height / 2 - pan.y) / currentScale + image.height / 2,
  };
  return clampPreviewPan({
    x: point.x - viewport.width / 2 - (imagePoint.x - image.width / 2) * nextScale,
    y: point.y - viewport.height / 2 - (imagePoint.y - image.height / 2) * nextScale,
  }, image, viewport, fitScale, nextZoom);
}

function getMiniMapImageRect(image: PreviewSize, miniMap: PreviewSize): PreviewMiniMapRect {
  const scale = Math.min(miniMap.width / image.width, miniMap.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    left: (miniMap.width - width) / 2,
    top: (miniMap.height - height) / 2,
    width,
    height,
  };
}

export function calculateMiniMapViewport(
  image: PreviewSize,
  viewport: PreviewSize,
  pan: PreviewPoint,
  fitScale: number,
  zoom: number,
  miniMap: PreviewSize,
): PreviewMiniMapRect {
  if (image.width <= 0 || image.height <= 0) {
    return { left: 0, top: 0, width: miniMap.width, height: miniMap.height };
  }
  const miniImage = getMiniMapImageRect(image, miniMap);
  const scale = fitScale * zoom;
  const scaled = getScaledPreviewSize(image, fitScale, zoom);
  const imageLeft = viewport.width / 2 + pan.x - scaled.width / 2;
  const imageTop = viewport.height / 2 + pan.y - scaled.height / 2;
  const sourceLeft = Math.max(0, Math.min(image.width, (0 - imageLeft) / scale));
  const sourceTop = Math.max(0, Math.min(image.height, (0 - imageTop) / scale));
  const sourceRight = Math.max(sourceLeft, Math.min(image.width, (viewport.width - imageLeft) / scale));
  const sourceBottom = Math.max(sourceTop, Math.min(image.height, (viewport.height - imageTop) / scale));
  return {
    left: miniImage.left + sourceLeft / image.width * miniImage.width,
    top: miniImage.top + sourceTop / image.height * miniImage.height,
    width: Math.max(2, (sourceRight - sourceLeft) / image.width * miniImage.width),
    height: Math.max(2, (sourceBottom - sourceTop) / image.height * miniImage.height),
  };
}

export function panToMiniMapPoint(
  point: PreviewPoint,
  image: PreviewSize,
  viewport: PreviewSize,
  fitScale: number,
  zoom: number,
  miniMap: PreviewSize,
): PreviewPoint {
  const miniImage = getMiniMapImageRect(image, miniMap);
  const miniX = Math.min(miniImage.left + miniImage.width, Math.max(miniImage.left, point.x));
  const miniY = Math.min(miniImage.top + miniImage.height, Math.max(miniImage.top, point.y));
  const sourceX = (miniX - miniImage.left) / miniImage.width * image.width;
  const sourceY = (miniY - miniImage.top) / miniImage.height * image.height;
  const scale = fitScale * zoom;
  return clampPreviewPan({
    x: (image.width / 2 - sourceX) * scale,
    y: (image.height / 2 - sourceY) * scale,
  }, image, viewport, fitScale, zoom);
}
