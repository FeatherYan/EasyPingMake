import { useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, Circle, Eraser, Expand, FlipHorizontal, Hand, Info, Minus, PaintBucket, Pipette, Plus, Redo2, Square, Undo2, WandSparkles } from "lucide-react";
import { loadMard291Palette, type PaletteColor } from "../domain/palette";
import { CANVAS_PRESETS, calculateBounds, calculatePhysicalWorkSize, formatPhysicalSizeCm, type PatternCell, type PatternDocument } from "../domain/pattern";
import { centerContent, drawShape, expandCanvas, floodFill, mirrorHorizontal, replaceColor as replacePatternColor, type CellPosition, type ShapeKind } from "../domain/patternOperations";
import { renderPatternSheetToCanvas } from "../export/patternPng";
import { getReadableTextColor } from "./colorDisplay";
import PatternCanvas, { type CanvasTool } from "./PatternCanvas";
import { clampCanvasZoom, type CanvasViewport } from "./vectorCanvasNavigation";
import {
  calculateMiniMapViewport,
  calculatePreviewDialogWidth,
  calculatePreviewFitScale,
  clampPreviewPan,
  clampPreviewZoom,
  panToMiniMapPoint,
  zoomPreviewAtPoint,
  type PreviewPoint,
  type PreviewSize,
} from "./previewNavigation";

interface EditorPageProps {
  initialPattern: PatternDocument;
  onBack: () => void;
  onSave: (pattern: PatternDocument) => void;
  onExport: (pattern: PatternDocument) => void;
}

interface DrawingDraft {
  before: PatternDocument;
  cells: PatternCell[][];
  changed: boolean;
}

interface PreviewPointerState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const PALETTE_GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "M", "P", "Q", "R", "T", "Y", "ZG"] as const;
const PREVIEW_MINIMAP_SIZE: PreviewSize = { width: 180, height: 120 };
const DEFAULT_EXPORT_PREVIEW_DIALOG_WIDTH = 900;

function cloneCells(cells: PatternCell[][]): PatternCell[][] {
  return cells.map((row) => [...row]);
}

function cellsEqual(left: PatternCell[][], right: PatternCell[][]): boolean {
  return left.length === right.length && left.every((row, y) => row.length === right[y].length && row.every((cell, x) => cell === right[y][x]));
}

function patternWithCells(pattern: PatternDocument, cells: PatternCell[][]): PatternDocument {
  const bounds = calculateBounds(cells);
  return {
    ...pattern,
    cells,
    bounds,
    workSize: calculatePhysicalWorkSize(bounds),
  };
}

export default function EditorPage({ initialPattern, onBack, onSave, onExport }: EditorPageProps) {
  const palette = useMemo(() => loadMard291Palette(), []);
  const [pattern, setPattern] = useState(initialPattern);
  const [selectedCode, setSelectedCode] = useState(palette[0].code);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<CanvasTool>("brush");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const [search, setSearch] = useState("");
  const [paletteGroup, setPaletteGroup] = useState<(typeof PALETTE_GROUPS)[number] | "all">("all");
  const [history, setHistory] = useState<PatternDocument[]>([]);
  const [future, setFuture] = useState<PatternDocument[]>([]);
  const [shapePreview, setShapePreview] = useState<{ start: CellPosition; end: CellPosition; constrain: boolean } | null>(null);
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport>({ zoom: 1, panX: 0, panY: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [exportPreviewUrl, setExportPreviewUrl] = useState("");
  const [exportPreviewZoom, setExportPreviewZoom] = useState(1);
  const [exportPreviewPan, setExportPreviewPan] = useState<PreviewPoint>({ x: 0, y: 0 });
  const [exportPreviewFitScale, setExportPreviewFitScale] = useState(1);
  const [exportPreviewImageSize, setExportPreviewImageSize] = useState<PreviewSize>({ width: 0, height: 0 });
  const [exportPreviewViewportSize, setExportPreviewViewportSize] = useState<PreviewSize>({ width: 0, height: 0 });
  const [exportPreviewDialogWidth, setExportPreviewDialogWidth] = useState(DEFAULT_EXPORT_PREVIEW_DIALOG_WIDTH);
  const [isExportPreviewPanning, setIsExportPreviewPanning] = useState(false);
  const [draggedCode, setDraggedCode] = useState<string | null>(null);
  const drawingRef = useRef<DrawingDraft | null>(null);
  const exportDialogRef = useRef<HTMLDialogElement | null>(null);
  const exportPreviewViewportRef = useRef<HTMLDivElement | null>(null);
  const exportPreviewImageRef = useRef<HTMLImageElement | null>(null);
  const exportPreviewPointerRef = useRef<PreviewPointerState | null>(null);
  const exportMiniMapPointerRef = useRef<number | null>(null);

  const exportPreviewMiniMapSize = useMemo(() => {
    if (!exportPreviewViewportSize.width) {
      return PREVIEW_MINIMAP_SIZE;
    }
    const width = Math.min(PREVIEW_MINIMAP_SIZE.width, Math.max(120, exportPreviewViewportSize.width * 0.32));
    return { width, height: width * (PREVIEW_MINIMAP_SIZE.height / PREVIEW_MINIMAP_SIZE.width) };
  }, [exportPreviewViewportSize.width]);

  const filteredPalette = useMemo(() => {
    const query = search.trim().toUpperCase();
    return palette.filter((color) => {
      const matchesGroup = paletteGroup === "all" || color.code.startsWith(paletteGroup);
      const matchesQuery = !query || color.code.includes(query) || color.hex.includes(query);
      return matchesGroup && matchesQuery;
    });
  }, [palette, paletteGroup, search]);

  const usedColors = useMemo(() => {
    const counts = new Map<string, number>();
    pattern.cells.flat().forEach((code) => {
      if (code) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    });
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count, color: palette.find((item) => item.code === code) }))
      .filter((item): item is { code: string; count: number; color: PaletteColor } => Boolean(item.color))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  }, [palette, pattern.cells]);

  const groupedPalette = useMemo(() => PALETTE_GROUPS.map((group) => ({
    group,
    colors: filteredPalette.filter((color) => color.code.startsWith(group)),
  })).filter((item) => item.colors.length > 0), [filteredPalette]);

  function commitPattern(nextPattern: PatternDocument, previousPattern = pattern) {
    if (cellsEqual(nextPattern.cells, previousPattern.cells)) {
      return;
    }
    setHistory((items) => [...items.slice(-49), previousPattern]);
    setFuture([]);
    setPattern(nextPattern);
  }

  function updatePattern(nextCells: PatternCell[][]) {
    commitPattern(patternWithCells(pattern, nextCells));
  }

  function updateDrawingDraft(x: number, y: number) {
    const draft = drawingRef.current;
    if (!draft || y < 0 || y >= draft.cells.length || x < 0 || x >= draft.cells[y].length) {
      return;
    }
    const nextValue = selectedTool === "eraser" ? null : selectedCode;
    if (draft.cells[y][x] === nextValue) {
      return;
    }
    draft.cells[y][x] = nextValue;
    draft.changed = true;
    setPattern(patternWithCells(draft.before, cloneCells(draft.cells)));
  }

  function selectTool(tool: CanvasTool) {
    setSelectedTool(tool);
    if (tool !== "shape") {
      setShapePreview(null);
    }
  }

  function selectShape(kind: ShapeKind) {
    setShapeKind(kind);
    selectTool("shape");
  }

  function handlePointerDown(x: number, y: number, shiftKey: boolean) {
    if (selectedTool === "pan") {
      return;
    }
    if (selectedTool === "shape") {
      setShapePreview({ start: { x, y }, end: { x, y }, constrain: shiftKey });
      return;
    }

    const current = pattern.cells[y][x];
    if (selectedTool === "picker") {
      if (current) {
        setSelectedCode(current);
        setHighlightCode(null);
        setSelectedTool("brush");
      }
      return;
    }

    if (selectedTool === "fill") {
      updatePattern(floodFill(pattern.cells, { x, y }, selectedCode));
      return;
    }

    drawingRef.current = {
      before: pattern,
      cells: cloneCells(pattern.cells),
      changed: false,
    };
    updateDrawingDraft(x, y);
  }

  function handlePointerMove(x: number, y: number, shiftKey: boolean) {
    if (selectedTool === "shape" && shapePreview) {
      setShapePreview({ ...shapePreview, end: { x, y }, constrain: shiftKey });
      return;
    }
    if (selectedTool === "brush" || selectedTool === "eraser") {
      updateDrawingDraft(x, y);
    }
  }

  function finishDrawing() {
    const draft = drawingRef.current;
    drawingRef.current = null;
    if (!draft?.changed) {
      return;
    }
    const nextPattern = patternWithCells(draft.before, cloneCells(draft.cells));
    setHistory((items) => [...items.slice(-49), draft.before]);
    setFuture([]);
    setPattern(nextPattern);
  }

  function handlePointerUp(cell: CellPosition | null, shiftKey: boolean) {
    if (drawingRef.current) {
      finishDrawing();
    }
    if (selectedTool === "shape" && shapePreview) {
      if (cell) {
        const nextCells = drawShape(pattern.cells, shapePreview.start, cell, selectedCode, shapeKind, shiftKey || shapePreview.constrain);
        updatePattern(nextCells);
      }
      setShapePreview(null);
    }
  }

  function mirrorPattern() {
    updatePattern(mirrorHorizontal(pattern.cells));
  }

  function expandPattern(targetSize: number) {
    if (targetSize <= Math.max(pattern.canvas.width, pattern.canvas.height)) {
      return;
    }
    const nextCells = expandCanvas(pattern.cells, targetSize, targetSize);
    const nextPattern = {
      ...patternWithCells(pattern, nextCells),
      canvas: { width: targetSize, height: targetSize },
    };
    commitPattern(nextPattern);
  }

  function centerPatternContent() {
    updatePattern(centerContent(pattern.cells));
  }

  function replaceColor(sourceCode: string, targetCode: string) {
    if (sourceCode === targetCode) {
      return;
    }
    updatePattern(replacePatternColor(pattern.cells, sourceCode, targetCode));
    if (highlightCode === sourceCode) {
      setHighlightCode(targetCode);
    }
    if (selectedCode === sourceCode) {
      setSelectedCode(targetCode);
    }
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) {
      return;
    }
    setFuture((items) => [pattern, ...items]);
    setPattern(previous);
    setHistory((items) => items.slice(0, -1));
  }

  function redo() {
    const next = future[0];
    if (!next) {
      return;
    }
    setHistory((items) => [...items, pattern]);
    setPattern(next);
    setFuture((items) => items.slice(1));
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (!event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [future, history, pattern]);

  useEffect(() => {
    function handleSpaceKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.code !== "Space" || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      setSpacePressed(true);
    }

    function handleSpaceKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setSpacePressed(false);
      }
    }

    window.addEventListener("keydown", handleSpaceKeyDown);
    window.addEventListener("keyup", handleSpaceKeyUp);
    return () => {
      window.removeEventListener("keydown", handleSpaceKeyDown);
      window.removeEventListener("keyup", handleSpaceKeyUp);
    };
  }, []);

  function chooseColor(color: PaletteColor, highlight = false) {
    setSelectedCode(color.code);
    setSelectedTool("brush");
    setHighlightCode(highlight ? (highlightCode === color.code ? null : color.code) : null);
  }

  function handleUsedColorDrop(event: React.DragEvent<HTMLDivElement>, targetCode: string) {
    event.preventDefault();
    const sourceCode = event.dataTransfer.getData("text/plain") || draggedCode;
    if (sourceCode) {
      replaceColor(sourceCode, targetCode);
    }
    setDraggedCode(null);
  }

  function confirmExport() {
    onExport(pattern);
    closeExportPreview();
  }

  function closeExportPreview() {
    setShowExportPreview(false);
    setExportPreviewZoom(1);
    setExportPreviewPan({ x: 0, y: 0 });
    setExportPreviewFitScale(1);
    setExportPreviewImageSize({ width: 0, height: 0 });
    setExportPreviewViewportSize({ width: 0, height: 0 });
    setExportPreviewDialogWidth(DEFAULT_EXPORT_PREVIEW_DIALOG_WIDTH);
    exportPreviewPointerRef.current = null;
    exportMiniMapPointerRef.current = null;
    setIsExportPreviewPanning(false);
    const dialog = exportDialogRef.current;
    if (dialog?.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }

  function openExportPreview() {
    // Open the dialog first. Preview rendering can be relatively expensive and
    // must not delay (or prevent) the state update that makes the dialog
    // visible.
    setExportPreviewUrl("");
    setExportPreviewZoom(1);
    setExportPreviewPan({ x: 0, y: 0 });
    setExportPreviewFitScale(1);
    setExportPreviewImageSize({ width: 0, height: 0 });
    setExportPreviewDialogWidth(DEFAULT_EXPORT_PREVIEW_DIALOG_WIDTH);
    exportPreviewPointerRef.current = null;
    exportMiniMapPointerRef.current = null;
    setIsExportPreviewPanning(false);
    setShowExportPreview(true);
    const dialog = exportDialogRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute("open", "");
        }
      } else {
        dialog.setAttribute("open", "");
      }
    }
  }

  function handleExportPreviewImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    setExportPreviewImageSize({
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    });
  }

  function getExportPreviewViewportSize(): PreviewSize {
    const element = exportPreviewViewportRef.current;
    return element ? { width: element.clientWidth, height: element.clientHeight } : exportPreviewViewportSize;
  }

  function handleExportPreviewWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!exportPreviewImageSize.width || !exportPreviewViewportSize.width) {
      return;
    }
    const nextZoom = clampPreviewZoom(exportPreviewZoom * (event.deltaY < 0 ? 1.1 : 0.9));
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setExportPreviewPan(zoomPreviewAtPoint(
      exportPreviewPan,
      point,
      exportPreviewImageSize,
      exportPreviewViewportSize,
      exportPreviewFitScale,
      exportPreviewZoom,
      nextZoom,
    ));
    setExportPreviewZoom(nextZoom);
  }

  function handleExportPreviewPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !exportPreviewImageSize.width) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    exportPreviewPointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: exportPreviewPan.x,
      originY: exportPreviewPan.y,
    };
    setIsExportPreviewPanning(true);
  }

  function handleExportPreviewPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pointer = exportPreviewPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      return;
    }
    const viewport = getExportPreviewViewportSize();
    setExportPreviewPan(clampPreviewPan({
      x: pointer.originX + event.clientX - pointer.startX,
      y: pointer.originY + event.clientY - pointer.startY,
    }, exportPreviewImageSize, viewport, exportPreviewFitScale, exportPreviewZoom));
  }

  function finishExportPreviewPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (exportPreviewPointerRef.current?.pointerId === event.pointerId) {
      exportPreviewPointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setIsExportPreviewPanning(false);
    }
  }

  function updatePanFromMiniMap(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewport = getExportPreviewViewportSize();
    setExportPreviewPan(panToMiniMapPoint({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }, exportPreviewImageSize, viewport, exportPreviewFitScale, exportPreviewZoom, exportPreviewMiniMapSize));
  }

  function handleMiniMapPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !exportPreviewImageSize.width) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    exportMiniMapPointerRef.current = event.pointerId;
    updatePanFromMiniMap(event);
  }

  function handleMiniMapPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (exportMiniMapPointerRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updatePanFromMiniMap(event);
  }

  function finishMiniMapPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (exportMiniMapPointerRef.current === event.pointerId) {
      exportMiniMapPointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }

  useEffect(() => {
    if (!showExportPreview) {
      return;
    }
    const element = exportPreviewViewportRef.current;
    if (!element) {
      return;
    }
    const updateSize = () => {
      setExportPreviewViewportSize({ width: element.clientWidth, height: element.clientHeight });
    };
    updateSize();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateSize) : null;
    observer?.observe(element);
    window.addEventListener("resize", updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [showExportPreview, exportPreviewUrl]);

  useEffect(() => {
    if (!showExportPreview) {
      return;
    }

    const updateDialogWidth = () => {
      const nextWidth = calculatePreviewDialogWidth(
        exportPreviewImageSize,
        { width: window.innerWidth, height: window.innerHeight },
      );
      if (nextWidth !== exportPreviewDialogWidth) {
        setExportPreviewDialogWidth(nextWidth);
        setExportPreviewPan({ x: 0, y: 0 });
      }
    };

    updateDialogWidth();
    window.addEventListener("resize", updateDialogWidth);
    return () => window.removeEventListener("resize", updateDialogWidth);
  }, [exportPreviewDialogWidth, exportPreviewImageSize, showExportPreview]);

  useEffect(() => {
    if (!exportPreviewImageSize.width || !exportPreviewViewportSize.width) {
      return;
    }
    const fitScale = calculatePreviewFitScale(exportPreviewImageSize, exportPreviewViewportSize);
    setExportPreviewFitScale(fitScale);
    setExportPreviewPan((pan) => clampPreviewPan(pan, exportPreviewImageSize, exportPreviewViewportSize, fitScale, exportPreviewZoom));
  }, [exportPreviewImageSize, exportPreviewViewportSize, exportPreviewZoom]);

  useEffect(() => {
    if (!showExportPreview) {
      return;
    }

    let cancelled = false;
    // Defer canvas work by one task so the browser can paint the dialog even
    // when a large pattern takes a moment to rasterize.
    const timer = window.setTimeout(async () => {
      try {
        const previewCanvas = await renderPatternSheetToCanvas(pattern, palette, { includeLabels: true });
        const previewUrl = previewCanvas.toDataURL("image/png");
        if (!cancelled) {
          setExportPreviewUrl(previewUrl);
        }
      } catch {
        if (!cancelled) {
          setExportPreviewUrl("");
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [palette, pattern, showExportPreview]);

  const contentSize = formatPhysicalSizeCm(pattern.workSize);
  const currentCanvasSize = Math.max(pattern.canvas.width, pattern.canvas.height);
  const expandableCanvasSizes = CANVAS_PRESETS.filter((size) => size > currentCanvasSize);
  const selectedColor = palette.find((color) => color.code === selectedCode);
  const showsColorSwatch = selectedTool === "brush" || selectedTool === "fill" || selectedTool === "shape";
  const selectedColorHex = showsColorSwatch ? selectedColor?.hex ?? "#ffffff" : "#ffffff";
  const selectedToolLabel = selectedTool === "eraser" ? "橡皮擦" : selectedTool === "picker" ? "取色中" : selectedTool === "pan" ? "拖动画布" : "取色中";

  return (
    <main className="editor-page">
      <header className="editor-header">
        <button className="secondary-button" onClick={onBack}>返回首页</button>
        <label className="pattern-name">
          <span className="sr-only">图纸名称</span>
          <input value={pattern.name} onChange={(event) => setPattern({ ...pattern, name: event.target.value })} />
        </label>
        <div className="header-actions">
          <button className="icon-button" aria-label="撤销" onClick={undo} disabled={!history.length}><Undo2 /></button>
          <button className="icon-button" aria-label="重做" onClick={redo} disabled={!future.length}><Redo2 /></button>
          <button className="icon-button" aria-label="水平镜像" title="水平镜像" onClick={mirrorPattern}><FlipHorizontal /></button>
          <div className="header-operation-menu">
            <button className="icon-button" type="button" aria-label="扩展画板" aria-haspopup="menu" title="扩展画板" disabled={!expandableCanvasSizes.length}><Expand /></button>
            {expandableCanvasSizes.length > 0 && <div className="header-operation-dropdown" role="menu" aria-label="扩展画板尺寸">
              {expandableCanvasSizes.map((size) => (
                <button
                  className="header-operation-menu-item"
                  key={size}
                  type="button"
                  role="menuitem"
                  onClick={() => expandPattern(size)}
                >
                  {size} × {size}
                </button>
              ))}
            </div>}
          </div>
          <button className="icon-button" type="button" aria-label="内容水平垂直居中" title="内容水平垂直居中" onClick={centerPatternContent} disabled={!pattern.bounds}><AlignCenter /></button>
          <button className="secondary-button" onClick={() => onSave(pattern)}>保存</button>
          <button
            type="button"
            className="primary-button"
            aria-haspopup="dialog"
            onClick={(event) => {
              event.stopPropagation();
              openExportPreview();
            }}
          >
            <WandSparkles size={18} />导出图纸
          </button>
        </div>
      </header>

      <section className="editor-layout">
        <div className="tool-sidebar">
          <section className="current-color-panel" aria-label="当前颜色">
            <div className="panel-title">当前颜色</div>
            <div
              className={`current-color-preview ${showsColorSwatch ? "is-color" : `is-${selectedTool}`}`}
              aria-label={showsColorSwatch ? `当前颜色 ${selectedCode}` : selectedToolLabel}
            >
              <span
                className="current-color-swatch color-code-swatch"
                style={{ background: selectedColorHex, color: getReadableTextColor(selectedColorHex) }}
              >
                {showsColorSwatch ? selectedCode : selectedToolLabel}
              </span>
            </div>
          </section>

          <aside className="tool-panel">
          <div className="panel-title">工具栏</div>
          <button className={`tool-button ${selectedTool === "brush" ? "is-selected" : ""}`} onClick={() => selectTool("brush")}><span className="tool-dot" style={{ background: palette.find((color) => color.code === selectedCode)?.hex }} />画笔</button>
          <button className={`tool-button ${selectedTool === "eraser" ? "is-selected" : ""}`} onClick={() => selectTool("eraser")}><Eraser />橡皮擦</button>
          <button className={`tool-button ${selectedTool === "picker" ? "is-selected" : ""}`} onClick={() => selectTool("picker")}><Pipette />取色</button>
          <button className={`tool-button ${selectedTool === "fill" ? "is-selected" : ""}`} onClick={() => selectTool("fill")}><PaintBucket />填充</button>
          <div className="shape-tool-menu">
            <button
              className={`tool-button ${selectedTool === "shape" ? "is-selected" : ""}`}
              onClick={(event) => {
                selectTool("shape");
                event.currentTarget.blur();
              }}
            >
              {shapeKind === "circle" ? <Circle /> : <Square />}
              形状
            </button>
            <div className="shape-controls" aria-label="形状类型">
              <div className="shape-option-grid">
                <button
                  className={selectedTool === "shape" && shapeKind === "rectangle" ? "is-selected" : ""}
                  onClick={(event) => {
                    selectShape("rectangle");
                    event.currentTarget.blur();
                  }}
                >
                  <Square size={16} />矩形
                </button>
                <button
                  className={selectedTool === "shape" && shapeKind === "circle" ? "is-selected" : ""}
                  onClick={(event) => {
                    selectShape("circle");
                    event.currentTarget.blur();
                  }}
                >
                  <Circle size={16} />圆形
                </button>
              </div>
            </div>
          </div>
          <button className={`tool-button ${selectedTool === "pan" ? "is-selected" : ""}`} onClick={() => selectTool("pan")}><Hand />拖动</button>
          </aside>
        </div>

        <section className="canvas-panel">
          <div className="canvas-toolbar">
            <div className="canvas-size-summary">
              <span>画板：{pattern.canvas.width} × {pattern.canvas.height} 格</span>
              <span>成品预估尺寸：{contentSize}</span>
            </div>
            <div className="zoom-controls" aria-label="画布缩放">
              <button className="icon-button" aria-label="缩小" onClick={() => setCanvasViewport((value) => ({ zoom: clampCanvasZoom(Number((value.zoom - 0.25).toFixed(2))), panX: 0, panY: 0 }))} disabled={canvasViewport.zoom <= 0.5}><Minus size={18} /></button>
              <span>{Math.round(canvasViewport.zoom * 100)}%</span>
              <button className="icon-button" aria-label="放大" onClick={() => setCanvasViewport((value) => ({ zoom: clampCanvasZoom(Number((value.zoom + 0.25).toFixed(2))), panX: 0, panY: 0 }))} disabled={canvasViewport.zoom >= 8}><Plus size={18} /></button>
              <button className="secondary-button canvas-reset-button" type="button" aria-label="还原画板视图" onClick={() => setCanvasViewport({ zoom: 1, panX: 0, panY: 0 })}>还原</button>
            </div>
          </div>
          <div
            className={`canvas-frame ${selectedTool === "pan" || spacePressed ? "is-pan-mode" : ""}`}
            onWheel={(event) => event.preventDefault()}
          >
            <PatternCanvas
              pattern={pattern}
              palette={palette}
              viewport={canvasViewport}
              tool={selectedTool}
              spacePressed={spacePressed}
              cursorShape={shapeKind}
              highlightCode={highlightCode}
              shapePreview={shapePreview}
              onViewportChange={setCanvasViewport}
              onCellPointerDown={handlePointerDown}
              onCellPointerMove={handlePointerMove}
              onCellPointerUp={handlePointerUp}
            />
          </div>
        </section>

        <aside className="color-panel">
          <div className="color-panel-heading">
            <div className="panel-title">色彩管理</div>
          </div>
          <div className="used-colors">
            <div className="used-colors-heading">
              <div className="used-colors-title">
                <span className="tool-group-title">画板已有颜色</span>
                <button className="color-info-trigger" type="button" aria-label="颜色操作说明">
                  <Info size={13} aria-hidden="true" />
                  <span className="color-info-tooltip" role="tooltip">点击高亮，拖动颜色卡合并</span>
                </button>
              </div>
              <span>{usedColors.length} 色</span>
            </div>
            {usedColors.length ? (
              <div className="used-colors-grid">
                {usedColors.map(({ code, count, color }) => (
                  <div
                    className={`used-color-row ${highlightCode === code ? "is-highlighted" : ""}`}
                    key={code}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", code);
                      event.dataTransfer.effectAllowed = "move";
                      setDraggedCode(code);
                    }}
                    onDragEnd={() => setDraggedCode(null)}
                    onDragOver={(event) => {
                      if (draggedCode && draggedCode !== code) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }
                    }}
                    onDrop={(event) => handleUsedColorDrop(event, code)}
                  >
                    <button className="used-color-name" onClick={() => chooseColor(color, true)} aria-pressed={highlightCode === code}>
                      <span className="used-color-swatch color-code-swatch" style={{ background: color.hex, color: getReadableTextColor(color.hex) }}>{code}</span>
                      <span>{count}</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : <p className="no-used-colors">画板中还没有拼豆</p>}
          </div>
          <input className="color-search" placeholder="搜索色号或 HEX" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="palette-filter" aria-label="按首字母筛选颜色">
            <button className={paletteGroup === "all" ? "is-selected" : ""} onClick={() => setPaletteGroup("all")}>全部</button>
            {PALETTE_GROUPS.map((group) => <button className={paletteGroup === group ? "is-selected" : ""} key={group} onClick={() => setPaletteGroup(group)}>{group}</button>)}
          </div>
          <div className="palette-grid" aria-label="MARD291 色板">
            {groupedPalette.map(({ group, colors }) => (
              <section className="palette-group" key={group}>
                <h3>{group}</h3>
                <div className="palette-group-grid">
                  {colors.map((color) => (
                    <button
                      key={color.code}
                      className={`palette-swatch ${selectedCode === color.code ? "is-selected" : ""}`}
                      style={{ background: color.hex, color: getReadableTextColor(color.hex) }}
                      title={`${color.code} ${color.hex}`}
                      aria-label={`${color.code} ${color.hex}`}
                      onClick={() => chooseColor(color)}
                    >
                      <span>{color.code}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>
      </section>
      <dialog
        ref={exportDialogRef}
        className="export-preview-dialog"
        style={{ width: `${exportPreviewDialogWidth}px` }}
        aria-labelledby="export-preview-title"
        onClose={() => setShowExportPreview(false)}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            closeExportPreview();
          }
        }}
      >
        <div className="dialog-heading">
          <h2 id="export-preview-title">导出图纸预览</h2>
          <button className="icon-button" aria-label="关闭预览" onClick={closeExportPreview}>×</button>
        </div>
        <div
          ref={exportPreviewViewportRef}
          className={`export-image-frame ${isExportPreviewPanning ? "is-panning" : ""}`}
          onWheel={handleExportPreviewWheel}
          onPointerDown={handleExportPreviewPointerDown}
          onPointerMove={handleExportPreviewPointerMove}
          onPointerUp={finishExportPreviewPointer}
          onPointerCancel={finishExportPreviewPointer}
          onLostPointerCapture={(event) => finishExportPreviewPointer(event)}
          aria-label="图纸预览，可使用鼠标滚轮缩放并拖动"
        >
          {exportPreviewUrl && exportPreviewImageSize.width ? (
            <div
              className="export-preview-stage"
              style={{
                width: exportPreviewImageSize.width,
                height: exportPreviewImageSize.height,
                left: `calc(50% + ${exportPreviewPan.x}px)`,
                top: `calc(50% + ${exportPreviewPan.y}px)`,
                transform: `translate(-50%, -50%) scale(${exportPreviewFitScale * exportPreviewZoom})`,
              }}
            >
              <img
                ref={exportPreviewImageRef}
                src={exportPreviewUrl}
                alt={`${pattern.name} 图纸预览`}
                draggable={false}
                onLoad={handleExportPreviewImageLoad}
              />
            </div>
          ) : exportPreviewUrl ? (
            <img
              ref={exportPreviewImageRef}
              src={exportPreviewUrl}
              alt={`${pattern.name} 图纸预览`}
              className="export-preview-loading-image"
              draggable={false}
              onLoad={handleExportPreviewImageLoad}
            />
          ) : <p className="export-preview-empty">预览生成失败，但仍可尝试下载 PNG。</p>}
          {exportPreviewUrl && exportPreviewImageSize.width ? (() => {
            const miniMapViewport = calculateMiniMapViewport(
              exportPreviewImageSize,
              exportPreviewViewportSize,
              exportPreviewPan,
              exportPreviewFitScale,
              exportPreviewZoom,
              exportPreviewMiniMapSize,
            );
            return (
              <div
                className="export-preview-minimap"
                style={{ width: exportPreviewMiniMapSize.width, height: exportPreviewMiniMapSize.height }}
                aria-label="图纸位置缩略图，可点击或拖动定位"
                onPointerDown={handleMiniMapPointerDown}
                onPointerMove={handleMiniMapPointerMove}
                onPointerUp={finishMiniMapPointer}
                onPointerCancel={finishMiniMapPointer}
                onLostPointerCapture={finishMiniMapPointer}
              >
                <img src={exportPreviewUrl} alt="图纸缩略图" draggable={false} />
                <span
                  className="export-preview-minimap-viewport"
                  style={{
                    left: miniMapViewport.left,
                    top: miniMapViewport.top,
                    width: miniMapViewport.width,
                    height: miniMapViewport.height,
                  }}
                />
              </div>
            );
          })() : null}
        </div>
        <div className="dialog-actions">
          <button className="primary-button" onClick={confirmExport}><WandSparkles size={18} />下载 PNG</button>
        </div>
      </dialog>
    </main>
  );
}
