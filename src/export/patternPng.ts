import type { PaletteColor } from "../domain/palette";
import type { PatternDocument } from "../domain/pattern";

const EXPORT_CELL_SIZE = 16;

export function renderPatternToCanvas(pattern: PatternDocument, palette: PaletteColor[], cellSize = EXPORT_CELL_SIZE): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = pattern.canvas.width * cellSize;
  canvas.height = pattern.canvas.height * cellSize;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建图纸导出画布。");
  }

  const colors = new Map(palette.map((color) => [color.code, color.hex]));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  pattern.cells.forEach((row, y) => {
    row.forEach((code, x) => {
      if (!code) {
        return;
      }
      context.fillStyle = colors.get(code) ?? "#ffffff";
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    });
  });

  context.strokeStyle = "rgba(30, 41, 59, 0.35)";
  context.lineWidth = 1;
  for (let index = 0; index <= pattern.canvas.width; index += 1) {
    const position = index * cellSize + 0.5;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, canvas.height);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(canvas.width, position);
    context.stroke();
  }

  return canvas;
}

export function downloadPatternPng(pattern: PatternDocument, palette: PaletteColor[]): void {
  const canvas = renderPatternToCanvas(pattern, palette);
  const link = document.createElement("a");
  link.download = `${pattern.name || "未命名图纸"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
