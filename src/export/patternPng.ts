import logoUrl from "../assets/easy-ping-make-logo.svg";
import { formatPhysicalSizeCm, type PatternDocument } from "../domain/pattern";
import type { PaletteColor } from "../domain/palette";

const EXPORT_CELL_SIZE = 16;
const SHEET_CELL_SIZE = 24;
const LABEL_CELLS = 1;
const SHEET_MARGIN = 48;
const SHEET_HEADER_HEIGHT = 156;
const SHEET_SECTION_GAP = 32;
const LEGEND_CARD_WIDTH = 120;
const LEGEND_CARD_HEIGHT = 72;
const LEGEND_GAP = 12;

export interface PatternRenderOptions {
  includeLabels?: boolean;
}

export interface PatternSheetRenderOptions {
  cellSize?: number;
  includeLabels?: boolean;
}

export interface PatternColorCount {
  code: string;
  count: number;
  color: PaletteColor;
}

export interface PatternSheetLayout {
  width: number;
  height: number;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
  legendX: number;
  legendY: number;
  legendColumns: number;
  legendRows: number;
  legendWidth: number;
  legendHeight: number;
  cellSize: number;
}

function getTextColor(hex: string): "#1e293b" | "#ffffff" {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return "#1e293b";
  }
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const toLinear = (value: number) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
  return luminance > 0.42 ? "#1e293b" : "#ffffff";
}

function drawGridLine(context: CanvasRenderingContext2D, position: number, length: number, vertical: boolean, style: "normal" | "five" | "ten"): void {
  context.save();
  context.strokeStyle = style === "ten" ? "rgba(30, 41, 59, 0.72)" : style === "five" ? "rgba(30, 41, 59, 0.48)" : "rgba(30, 41, 59, 0.35)";
  context.lineWidth = style === "ten" ? 2 : 1;
  context.setLineDash(style === "five" ? [3, 3] : []);
  context.beginPath();
  if (vertical) {
    context.moveTo(position + 0.5, 0);
    context.lineTo(position + 0.5, length);
  } else {
    context.moveTo(0, position + 0.5);
    context.lineTo(length, position + 0.5);
  }
  context.stroke();
  context.restore();
}

function getPaletteMap(palette: PaletteColor[]): Map<string, string> {
  return new Map(palette.map((color) => [color.code, color.hex]));
}

export function getPatternColorCounts(pattern: PatternDocument, palette: PaletteColor[]): PatternColorCount[] {
  const counts = new Map<string, number>();
  pattern.cells.flat().forEach((code) => {
    if (code) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  });

  return [...counts.entries()]
    .map(([code, count]) => ({
      code,
      count,
      color: palette.find((item) => item.code === code) ?? { code, hex: "#ffffff" },
    }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

export function calculatePatternSheetLayout(
  pattern: PatternDocument,
  colorCount: number,
  cellSize = SHEET_CELL_SIZE,
  includeLabels = true,
): PatternSheetLayout {
  const offset = includeLabels ? LABEL_CELLS : 0;
  const gridWidth = (pattern.canvas.width + offset * 2) * cellSize;
  const gridHeight = (pattern.canvas.height + offset * 2) * cellSize;
  const width = Math.max(gridWidth + SHEET_MARGIN * 2, 960);
  const legendWidth = width - SHEET_MARGIN * 2;
  const legendColumns = Math.max(1, Math.floor((legendWidth + LEGEND_GAP) / (LEGEND_CARD_WIDTH + LEGEND_GAP)));
  const legendRows = colorCount > 0 ? Math.ceil(colorCount / legendColumns) : 0;
  const legendHeight = legendRows * LEGEND_CARD_HEIGHT + Math.max(0, legendRows - 1) * LEGEND_GAP;
  const gridY = SHEET_MARGIN + SHEET_HEADER_HEIGHT + SHEET_SECTION_GAP;
  const legendY = gridY + gridHeight + SHEET_SECTION_GAP;

  return {
    width,
    height: legendY + legendHeight + SHEET_MARGIN,
    gridX: Math.round((width - gridWidth) / 2),
    gridY,
    gridWidth,
    gridHeight,
    legendX: SHEET_MARGIN,
    legendY,
    legendColumns,
    legendRows,
    legendWidth,
    legendHeight,
    cellSize,
  };
}

function drawPatternGrid(
  context: CanvasRenderingContext2D,
  pattern: PatternDocument,
  palette: PaletteColor[],
  originX: number,
  originY: number,
  cellSize: number,
  includeLabels: boolean,
): void {
  const offset = includeLabels ? LABEL_CELLS : 0;
  const displayWidth = pattern.canvas.width + offset * 2;
  const displayHeight = pattern.canvas.height + offset * 2;
  const colors = getPaletteMap(palette);

  context.save();
  context.translate(originX, originY);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, displayWidth * cellSize, displayHeight * cellSize);

  pattern.cells.forEach((row, y) => {
    row.forEach((code, x) => {
      if (!code) {
        return;
      }
      context.fillStyle = colors.get(code) ?? "#ffffff";
      context.fillRect((x + offset) * cellSize, (y + offset) * cellSize, cellSize, cellSize);
    });
  });

  if (includeLabels) {
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, displayWidth * cellSize, cellSize);
    context.fillRect(0, (displayHeight - 1) * cellSize, displayWidth * cellSize, cellSize);
    context.fillRect(0, cellSize, cellSize, pattern.canvas.height * cellSize);
    context.fillRect((displayWidth - 1) * cellSize, cellSize, cellSize, pattern.canvas.height * cellSize);
    context.fillStyle = "#1e293b";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${Math.max(9, Math.min(16, cellSize * 0.56))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    for (let x = 1; x <= pattern.canvas.width; x += 1) {
      context.fillText(String(x), (x + 0.5) * cellSize, cellSize / 2);
      context.fillText(String(x), (x + 0.5) * cellSize, (displayHeight - 0.5) * cellSize);
    }
    for (let y = 1; y <= pattern.canvas.height; y += 1) {
      context.fillText(String(y), cellSize / 2, (y + 0.5) * cellSize);
      context.fillText(String(y), (displayWidth - 0.5) * cellSize, (y + 0.5) * cellSize);
    }
  }

  for (let index = 0; index <= displayWidth; index += 1) {
    const localIndex = index - offset;
    const style = includeLabels && localIndex > 0 && localIndex < pattern.canvas.width && localIndex % 10 === 0
      ? "ten"
      : includeLabels && localIndex > 0 && localIndex < pattern.canvas.width && localIndex % 5 === 0
        ? "five"
        : "normal";
    drawGridLine(context, index * cellSize, displayHeight * cellSize, true, style);
  }
  for (let index = 0; index <= displayHeight; index += 1) {
    const localIndex = index - offset;
    const style = includeLabels && localIndex > 0 && localIndex < pattern.canvas.height && localIndex % 10 === 0
      ? "ten"
      : includeLabels && localIndex > 0 && localIndex < pattern.canvas.height && localIndex % 5 === 0
        ? "five"
        : "normal";
    drawGridLine(context, index * cellSize, displayWidth * cellSize, false, style);
  }

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${Math.max(8, Math.min(13, cellSize * 0.48))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  pattern.cells.forEach((row, y) => {
    row.forEach((code, x) => {
      if (!code) {
        return;
      }
      const hex = colors.get(code) ?? "#ffffff";
      context.fillStyle = getTextColor(hex);
      context.fillText(code, (x + offset + 0.5) * cellSize, (y + offset + 0.5) * cellSize);
    });
  });
  context.restore();
}

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawLegend(context: CanvasRenderingContext2D, layout: PatternSheetLayout, colorCounts: PatternColorCount[]): void {
  if (colorCounts.length === 0) {
    return;
  }

  colorCounts.forEach((item, index) => {
    const column = index % layout.legendColumns;
    const row = Math.floor(index / layout.legendColumns);
    const x = layout.legendX + column * (LEGEND_CARD_WIDTH + LEGEND_GAP);
    const y = layout.legendY + row * (LEGEND_CARD_HEIGHT + LEGEND_GAP);
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#cbd5e1";
    context.lineWidth = 1;
    drawRoundedRect(context, x, y, LEGEND_CARD_WIDTH, LEGEND_CARD_HEIGHT, 8);
    context.fill();
    context.stroke();

    context.fillStyle = item.color.hex;
    drawRoundedRect(context, x + 8, y + 8, LEGEND_CARD_WIDTH - 16, 34, 6);
    context.fill();
    context.fillStyle = getTextColor(item.color.hex);
    context.font = "800 14px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(item.code, x + LEGEND_CARD_WIDTH / 2, y + 25);
    context.fillStyle = "#475569";
    context.font = "600 12px system-ui, sans-serif";
    context.fillText(String(item.count), x + LEGEND_CARD_WIDTH / 2, y + 57);
  });
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = logoUrl;
  });
}

function drawSheetHeader(
  context: CanvasRenderingContext2D,
  pattern: PatternDocument,
  layout: PatternSheetLayout,
  logo: HTMLImageElement | null,
): void {
  const headerX = SHEET_MARGIN;
  const headerY = SHEET_MARGIN;
  context.fillStyle = "#1e293b";
  context.font = "700 24px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";

  if (logo) {
    const logoWidth = 250;
    const logoHeight = logoWidth * (logo.height / logo.width);
    context.drawImage(logo, headerX, headerY, logoWidth, logoHeight);
  } else {
    context.font = "800 30px system-ui, sans-serif";
    context.fillText("EasyPingMake", headerX, headerY + 48);
  }

  const gridRight = layout.gridX + layout.gridWidth;
  const metadataWidth = 340;
  const metadataX = gridRight - metadataWidth;
  const metadata = [
    ["图纸名称", pattern.name.trim() || "未命名图纸"],
    ["色板", pattern.paletteId],
    ["总数", `${pattern.cells.flat().filter(Boolean).length} 颗`],
    ["成品大小", formatPhysicalSizeCm(pattern.workSize)],
  ] as const;
  const logoHeight = logo ? 250 * (logo.height / logo.width) : metadata.length * 29;
  const metadataBottom = headerY + logoHeight;
  const metadataStart = metadataBottom - (metadata.length - 1) * 29;
  metadata.forEach(([label, value], index) => {
    const y = metadataStart + index * 29;
    context.fillStyle = "#64748b";
    context.font = "600 13px system-ui, sans-serif";
    context.fillText(label, metadataX, y);
    context.fillStyle = "#1e293b";
    context.font = "800 16px system-ui, sans-serif";
    context.fillText(value, metadataX + 92, y);
  });
}

export function renderPatternToCanvas(
  pattern: PatternDocument,
  palette: PaletteColor[],
  cellSize = EXPORT_CELL_SIZE,
  options: PatternRenderOptions = {},
): HTMLCanvasElement {
  const includeLabels = options.includeLabels ?? false;
  const offset = includeLabels ? LABEL_CELLS : 0;
  const displayWidth = pattern.canvas.width + offset * 2;
  const displayHeight = pattern.canvas.height + offset * 2;
  const canvas = document.createElement("canvas");
  canvas.width = displayWidth * cellSize;
  canvas.height = displayHeight * cellSize;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建图纸导出画布。");
  }
  drawPatternGrid(context, pattern, palette, 0, 0, cellSize, includeLabels);
  return canvas;
}

export async function renderPatternSheetToCanvas(
  pattern: PatternDocument,
  palette: PaletteColor[],
  options: PatternSheetRenderOptions = {},
): Promise<HTMLCanvasElement> {
  const cellSize = options.cellSize ?? SHEET_CELL_SIZE;
  const includeLabels = options.includeLabels ?? true;
  const colorCounts = getPatternColorCounts(pattern, palette);
  const layout = calculatePatternSheetLayout(pattern, colorCounts.length, cellSize, includeLabels);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建完整图纸导出画布。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const logo = await loadLogo();
  drawSheetHeader(context, pattern, layout, logo);
  drawPatternGrid(context, pattern, palette, layout.gridX, layout.gridY, cellSize, includeLabels);
  drawLegend(context, layout, colorCounts);
  return canvas;
}

export async function downloadPatternPng(pattern: PatternDocument, palette: PaletteColor[]): Promise<void> {
  const canvas = await renderPatternSheetToCanvas(pattern, palette);
  const safeName = pattern.name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "") || "未命名图纸";
  const fileName = `${safeName}.png`;

  function triggerDownload(href: string, revoke = false): void {
    const link = document.createElement("a");
    link.download = fileName;
    link.href = href;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (revoke) {
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
    }
  }

  if (typeof canvas.toBlob !== "function") {
    triggerDownload(canvas.toDataURL("image/png"));
    return;
  }

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        triggerDownload(canvas.toDataURL("image/png"));
        resolve();
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, true);
      resolve();
    }, "image/png");
  });
}
