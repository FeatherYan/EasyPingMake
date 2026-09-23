import { useEffect, useRef } from "react";
import type { PaletteColor } from "../domain/palette";
import type { PatternDocument } from "../domain/pattern";

interface PatternCanvasProps {
  pattern: PatternDocument;
  palette: PaletteColor[];
  zoom: number;
  onCellPointerDown: (x: number, y: number) => void;
  onCellPointerMove: (x: number, y: number) => void;
  onCellPointerUp: (x: number, y: number) => void;
}

const RENDER_SIZE = 780;

export default function PatternCanvas({ pattern, palette, zoom, onCellPointerDown, onCellPointerMove, onCellPointerUp }: PatternCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteMap = new Map(palette.map((color) => [color.code, color.hex]));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = RENDER_SIZE * devicePixelRatio;
    canvas.height = RENDER_SIZE * devicePixelRatio;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, RENDER_SIZE, RENDER_SIZE);

    const cellSize = RENDER_SIZE / pattern.canvas.width;
    pattern.cells.forEach((row, y) => {
      row.forEach((code, x) => {
        if (!code) {
          return;
        }
        context.fillStyle = paletteMap.get(code) ?? "#ffffff";
        context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      });
    });

    context.strokeStyle = "rgba(30, 41, 59, 0.24)";
    context.lineWidth = pattern.canvas.width > 78 ? 0.35 : 0.55;
    for (let index = 0; index <= pattern.canvas.width; index += 1) {
      const position = index * cellSize;
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, RENDER_SIZE);
      context.stroke();
      context.beginPath();
      context.moveTo(0, position);
      context.lineTo(RENDER_SIZE, position);
      context.stroke();
    }
  }, [paletteMap, pattern]);

  function getCellFromPointer(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const bounds = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * pattern.canvas.width);
    const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * pattern.canvas.height);
    if (x >= 0 && x < pattern.canvas.width && y >= 0 && y < pattern.canvas.height) {
      return { x, y };
    }
    return null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const cell = getCellFromPointer(event);
    if (!cell) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    onCellPointerDown(cell.x, cell.y);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const cell = getCellFromPointer(event);
    if (cell) {
      onCellPointerMove(cell.x, cell.y);
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const cell = getCellFromPointer(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (cell) {
      onCellPointerUp(cell.x, cell.y);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="pattern-canvas"
      style={{ width: `${Math.max(100, zoom * 100)}%`, maxWidth: "none" }}
      aria-label={`${pattern.canvas.width}×${pattern.canvas.height} 拼豆画板`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
