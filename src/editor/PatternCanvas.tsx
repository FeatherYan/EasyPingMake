import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { PaletteColor } from "../domain/palette";
import type { PatternDocument } from "../domain/pattern";
import { findColorRegions, getShapeBounds, type CellPosition, type ShapeKind } from "../domain/patternOperations";
import { getColorDisplayOpacity, getReadableTextColor } from "./colorDisplay";
import {
  calculateCanvasCellPixels,
  clampCanvasPan,
  panCanvas,
  shouldShowCellLabels,
  zoomCanvasAtPoint,
  type CanvasPoint,
  type CanvasSize,
  type CanvasViewport,
} from "./vectorCanvasNavigation";

export type CanvasTool = "brush" | "eraser" | "picker" | "fill" | "shape" | "pan";

interface PatternCanvasProps {
  pattern: PatternDocument;
  palette: PaletteColor[];
  viewport: CanvasViewport;
  tool: CanvasTool;
  spacePressed: boolean;
  cursorShape: ShapeKind;
  highlightCode: string | null;
  shapePreview: { start: CellPosition; end: CellPosition; constrain: boolean } | null;
  onViewportChange: (viewport: CanvasViewport) => void;
  onCellPointerDown: (x: number, y: number, shiftKey: boolean) => void;
  onCellPointerMove: (x: number, y: number, shiftKey: boolean) => void;
  onCellPointerUp: (cell: CellPosition | null, shiftKey: boolean) => void;
}

interface PanPointerState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const LABEL_CELLS = 1;
const COLOR_HIGHLIGHT_HALO = "rgba(255, 255, 255, 0.95)";
const COLOR_HIGHLIGHT_STROKE = "#ff9800";
const CELL_HOVER_FILL = "rgba(0, 229, 255, 0.2)";
const CELL_HOVER_STROKE = "#00a6b8";
const LABEL_FILL = "#eef2f7";
const CONTENT_BORDER = "#94a3b8";
const GRID_STROKE = "rgba(30, 41, 59, 0.5)";
const FIVE_GRID_STROKE = "rgba(30, 41, 59, 0.72)";
const TEN_GRID_STROKE = "rgba(30, 41, 59, 0.92)";

function getGridStyle(localIndex: number, size: number): { stroke: string; dash?: string; width: number } {
  if (localIndex > 0 && localIndex < size && localIndex % 10 === 0) {
    return { stroke: TEN_GRID_STROKE, width: 0.14 };
  }
  if (localIndex > 0 && localIndex < size && localIndex % 5 === 0) {
    return { stroke: FIVE_GRID_STROKE, dash: "0.16 0.16", width: 0.1 };
  }
  return { stroke: GRID_STROKE, width: 0.06 };
}

function regionBoundaryPath(cells: PatternDocument["cells"], region: CellPosition[]): string {
  const hasColor = (x: number, y: number) => y >= 0 && y < cells.length && x >= 0 && x < cells[y].length;
  const isSameColor = (x: number, y: number, code: string) => hasColor(x, y) && cells[y][x] === code;
  const code = region.length ? cells[region[0].y][region[0].x] : null;
  if (!code) {
    return "";
  }

  const segments: string[] = [];
  region.forEach(({ x, y }) => {
    const left = x + LABEL_CELLS;
    const top = y + LABEL_CELLS;
    const right = left + 1;
    const bottom = top + 1;
    if (!isSameColor(x, y - 1, code)) segments.push(`M ${left} ${top} H ${right}`);
    if (!isSameColor(x + 1, y, code)) segments.push(`M ${right} ${top} V ${bottom}`);
    if (!isSameColor(x, y + 1, code)) segments.push(`M ${right} ${bottom} H ${left}`);
    if (!isSameColor(x - 1, y, code)) segments.push(`M ${left} ${bottom} V ${top}`);
  });
  return segments.join(" ");
}

function getBoardPoint(rootPoint: CanvasPoint, board: CanvasSize, viewport: CanvasViewport): CanvasPoint {
  const center = { x: board.width / 2, y: board.height / 2 };
  return {
    x: (rootPoint.x - center.x - viewport.panX) / viewport.zoom + center.x,
    y: (rootPoint.y - center.y - viewport.panY) / viewport.zoom + center.y,
  };
}

export default function PatternCanvas({
  pattern,
  palette,
  viewport,
  tool,
  spacePressed,
  cursorShape,
  highlightCode,
  shapePreview,
  onViewportChange,
  onCellPointerDown,
  onCellPointerMove,
  onCellPointerUp,
}: PatternCanvasProps) {
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [viewportSize, setViewportSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [hoverCell, setHoverCell] = useState<CellPosition | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panPointerRef = useRef<PanPointerState | null>(null);
  const paletteMap = useMemo(() => new Map(palette.map((color) => [color.code, color])), [palette]);
  const displayWidth = pattern.canvas.width + LABEL_CELLS * 2;
  const displayHeight = pattern.canvas.height + LABEL_CELLS * 2;
  const boardSize = { width: displayWidth, height: displayHeight };
  const effectiveViewport = clampCanvasPan(viewport, boardSize);
  const cellPixels = calculateCanvasCellPixels(boardSize, viewportSize, effectiveViewport.zoom);
  const showCellLabels = shouldShowCellLabels(cellPixels);
  const panMode = tool === "pan" || spacePressed;

  useEffect(() => {
    if (!svg) {
      return;
    }
    const updateSize = () => setViewportSize({ width: svg.clientWidth, height: svg.clientHeight });
    updateSize();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateSize) : null;
    observer?.observe(svg);
    window.addEventListener("resize", updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [svg]);

  function getSvgPoint(event: { clientX: number; clientY: number }): CanvasPoint | null {
    if (!svg) {
      return null;
    }
    const matrix = svg.getScreenCTM();
    if (!matrix) {
      return null;
    }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  function getCellFromPointer(event: { clientX: number; clientY: number }): CellPosition | null {
    const rootPoint = getSvgPoint(event);
    if (!rootPoint) {
      return null;
    }
    const point = getBoardPoint(rootPoint, boardSize, effectiveViewport);
    const x = Math.floor(point.x) - LABEL_CELLS;
    const y = Math.floor(point.y) - LABEL_CELLS;
    if (x < 0 || x >= pattern.canvas.width || y < 0 || y >= pattern.canvas.height) {
      return null;
    }
    return { x, y };
  }

  function getRootPixelsPerUnit(): number {
    if (!svg || !viewportSize.width || !viewportSize.height) {
      return 1;
    }
    return Math.min(viewportSize.width / displayWidth, viewportSize.height / displayHeight);
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const point = getSvgPoint(event);
    if (!point) {
      return;
    }
    const nextZoom = effectiveViewport.zoom * (event.deltaY < 0 ? 1.1 : 0.9);
    onViewportChange(zoomCanvasAtPoint(effectiveViewport, point, boardSize, nextZoom));
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (panMode) {
      event.currentTarget.setPointerCapture(event.pointerId);
      panPointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: effectiveViewport.panX,
        originY: effectiveViewport.panY,
      };
      setIsPanning(true);
      return;
    }

    const cell = getCellFromPointer(event);
    if (!cell) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setHoverCell(cell);
    onCellPointerDown(cell.x, cell.y, event.shiftKey);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const panPointer = panPointerRef.current;
    if (panPointer?.pointerId === event.pointerId) {
      event.preventDefault();
      const pixelsPerUnit = getRootPixelsPerUnit();
      onViewportChange(panCanvas({
        ...effectiveViewport,
        panX: panPointer.originX,
        panY: panPointer.originY,
      }, {
        x: (event.clientX - panPointer.startX) / pixelsPerUnit,
        y: (event.clientY - panPointer.startY) / pixelsPerUnit,
      }, boardSize));
      return;
    }

    const cell = getCellFromPointer(event);
    setHoverCell(cell);
    if (!cell || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    onCellPointerMove(cell.x, cell.y, event.shiftKey);
  }

  function finishPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const panPointer = panPointerRef.current;
    if (panPointer?.pointerId === event.pointerId) {
      panPointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setIsPanning(false);
      return;
    }

    const cell = getCellFromPointer(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onCellPointerUp(cell, event.shiftKey);
  }

  const centerX = displayWidth / 2;
  const centerY = displayHeight / 2;
  const boardTransform = `translate(${centerX + effectiveViewport.panX} ${centerY + effectiveViewport.panY}) scale(${effectiveViewport.zoom}) translate(${-centerX} ${-centerY})`;
  const regions = highlightCode ? findColorRegions(pattern.cells, highlightCode) : [];

  return (
    <svg
      ref={setSvg}
      className={`pattern-canvas ${panMode ? "is-pan-mode" : ""} ${isPanning ? "is-panning" : ""}`}
      viewBox={`0 0 ${displayWidth} ${displayHeight}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${pattern.canvas.width}×${pattern.canvas.height} 拼豆画板`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onLostPointerCapture={finishPointer}
      onPointerLeave={() => {
        if (!panPointerRef.current) {
          setHoverCell(null);
        }
      }}
    >
      <g transform={boardTransform}>
        <rect width={displayWidth} height={displayHeight} fill="#ffffff" />
        <rect x={0} y={0} width={displayWidth} height={LABEL_CELLS} fill={LABEL_FILL} />
        <rect x={0} y={displayHeight - LABEL_CELLS} width={displayWidth} height={LABEL_CELLS} fill={LABEL_FILL} />
        <rect x={0} y={LABEL_CELLS} width={LABEL_CELLS} height={pattern.canvas.height} fill={LABEL_FILL} />
        <rect x={displayWidth - LABEL_CELLS} y={LABEL_CELLS} width={LABEL_CELLS} height={pattern.canvas.height} fill={LABEL_FILL} />
        <rect x={LABEL_CELLS} y={LABEL_CELLS} width={pattern.canvas.width} height={pattern.canvas.height} fill="#ffffff" stroke={CONTENT_BORDER} strokeWidth={0.1} vectorEffect="non-scaling-stroke" />

        {pattern.cells.map((row, y) => row.map((code, x) => code ? (
          <rect
            key={`cell-${x}-${y}`}
            x={x + LABEL_CELLS}
            y={y + LABEL_CELLS}
            width={1}
            height={1}
            fill={paletteMap.get(code)?.hex ?? "#ffffff"}
            opacity={getColorDisplayOpacity(code, highlightCode)}
          />
        ) : null))}

        {showCellLabels && pattern.cells.map((row, y) => row.map((code, x) => {
          if (!code) return null;
          const color = paletteMap.get(code);
          return (
            <text
              key={`code-${x}-${y}`}
              x={x + LABEL_CELLS + 0.5}
              y={y + LABEL_CELLS + 0.53}
              fill={getReadableTextColor(color?.hex ?? "#ffffff")}
              fontSize={0.36}
              fontFamily="SimHei, Microsoft YaHei, Noto Sans CJK SC, sans-serif"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
              opacity={getColorDisplayOpacity(code, highlightCode)}
              pointerEvents="none"
            >
              {code}
            </text>
          );
        }))}

        {Array.from({ length: displayWidth + 1 }, (_, index) => {
          const style = getGridStyle(index - LABEL_CELLS, pattern.canvas.width);
          return <line key={`vertical-${index}`} x1={index} y1={0} x2={index} y2={displayHeight} stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} vectorEffect="non-scaling-stroke" />;
        })}
        {Array.from({ length: displayHeight + 1 }, (_, index) => {
          const style = getGridStyle(index - LABEL_CELLS, pattern.canvas.height);
          return <line key={`horizontal-${index}`} x1={0} y1={index} x2={displayWidth} y2={index} stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} vectorEffect="non-scaling-stroke" />;
        })}

        {regions.map((region, index) => {
          const path = regionBoundaryPath(pattern.cells, region);
          return (
            <g key={`highlight-outline-${index}`} pointerEvents="none">
              <path d={path} fill="none" stroke={COLOR_HIGHLIGHT_HALO} strokeWidth={0.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="square" />
              <path d={path} fill="none" stroke={COLOR_HIGHLIGHT_STROKE} strokeWidth={0.3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="square" />
            </g>
          );
        })}

        <g fill="#1e293b" fontSize={0.52} fontFamily="SimHei, Microsoft YaHei, Noto Sans CJK SC, sans-serif" fontWeight="700" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
          {Array.from({ length: pattern.canvas.width }, (_, index) => (
            <g key={`column-label-${index}`}>
              <text x={index + LABEL_CELLS + 0.5} y={0.5}>{index + 1}</text>
              <text x={index + LABEL_CELLS + 0.5} y={displayHeight - 0.5}>{index + 1}</text>
            </g>
          ))}
          {Array.from({ length: pattern.canvas.height }, (_, index) => (
            <g key={`row-label-${index}`}>
              <text x={0.5} y={index + LABEL_CELLS + 0.5}>{index + 1}</text>
              <text x={displayWidth - 0.5} y={index + LABEL_CELLS + 0.5}>{index + 1}</text>
            </g>
          ))}
        </g>

        {hoverCell && (
          <rect x={hoverCell.x + LABEL_CELLS} y={hoverCell.y + LABEL_CELLS} width={1} height={1} fill={CELL_HOVER_FILL} stroke={CELL_HOVER_STROKE} strokeWidth={0.08} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}

        {shapePreview && (() => {
          const bounds = getShapeBounds(shapePreview.start, shapePreview.end, shapePreview.constrain);
          const x = bounds.minX + LABEL_CELLS;
          const y = bounds.minY + LABEL_CELLS;
          const width = bounds.maxX - bounds.minX + 1;
          const height = bounds.maxY - bounds.minY + 1;
          return cursorShape === "circle" ? (
            <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill="none" stroke="#f472b6" strokeWidth={0.12} strokeDasharray="0.28 0.18" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          ) : (
            <rect x={x} y={y} width={width} height={height} fill="none" stroke="#f472b6" strokeWidth={0.12} strokeDasharray="0.28 0.18" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          );
        })()}
      </g>
    </svg>
  );
}
