import { useMemo, useState } from "react";
import { Eraser, FlipHorizontal, PaintBucket, Pipette, Redo2, Square, Undo2, WandSparkles, ZoomIn, ZoomOut } from "lucide-react";
import { loadMard221Palette, type PaletteColor } from "../domain/palette";
import { drawRectangle, floodFill, mirrorHorizontal, type CellPosition } from "../domain/patternOperations";
import type { PatternCell, PatternDocument } from "../domain/pattern";
import { calculateBounds, calculatePhysicalWorkSize } from "../domain/pattern";
import { renderPatternToCanvas } from "../export/patternPng";
import PatternCanvas from "./PatternCanvas";

interface EditorPageProps {
  initialPattern: PatternDocument;
  onBack: () => void;
  onSave: (pattern: PatternDocument) => void;
  onExport: (pattern: PatternDocument) => void;
}

type Tool = "brush" | "eraser" | "picker" | "fill" | "shape";

function cloneCells(cells: PatternCell[][]): PatternCell[][] {
  return cells.map((row) => [...row]);
}

export default function EditorPage({ initialPattern, onBack, onSave, onExport }: EditorPageProps) {
  const palette = useMemo(() => loadMard221Palette(), []);
  const [pattern, setPattern] = useState(initialPattern);
  const [selectedCode, setSelectedCode] = useState(palette[0].code);
  const [selectedTool, setSelectedTool] = useState<Tool>("brush");
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<PatternDocument[]>([]);
  const [future, setFuture] = useState<PatternDocument[]>([]);
  const [shapeStart, setShapeStart] = useState<CellPosition | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showExportPreview, setShowExportPreview] = useState(false);

  const filteredPalette = useMemo(() => {
    const query = search.trim().toUpperCase();
    return query ? palette.filter((color) => color.code.includes(query) || color.hex.includes(query)) : palette;
  }, [palette, search]);

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

  function updatePattern(nextCells: PatternCell[][]) {
    const bounds = calculateBounds(nextCells);
    setHistory((items) => [...items.slice(-49), pattern]);
    setFuture([]);
    setPattern({
      ...pattern,
      cells: nextCells,
      bounds,
      workSize: calculatePhysicalWorkSize(bounds),
    });
  }

  function handleCellChange(x: number, y: number) {
    const nextCells = cloneCells(pattern.cells);
    const current = nextCells[y][x];

    if (selectedTool === "picker") {
      if (current) {
        setSelectedCode(current);
        setSelectedTool("brush");
      }
      return;
    }

    if (selectedTool === "fill") {
      updatePattern(floodFill(pattern.cells, { x, y }, selectedCode));
      return;
    }

    nextCells[y][x] = selectedTool === "eraser" ? null : selectedCode;
    if (nextCells[y][x] !== current) {
      updatePattern(nextCells);
    }
  }

  function handlePointerDown(x: number, y: number) {
    if (selectedTool === "shape") {
      setShapeStart({ x, y });
      return;
    }
    handleCellChange(x, y);
  }

  function handlePointerMove(x: number, y: number) {
    if (selectedTool === "brush" || selectedTool === "eraser") {
      handleCellChange(x, y);
    }
  }

  function handlePointerUp(x: number, y: number) {
    if (selectedTool === "shape" && shapeStart) {
      updatePattern(drawRectangle(pattern.cells, shapeStart, { x, y }, selectedCode));
      setShapeStart(null);
    }
  }

  function mirrorPattern() {
    updatePattern(mirrorHorizontal(pattern.cells));
  }

  function replaceColor(sourceCode: string, targetCode: string) {
    if (sourceCode === targetCode) {
      return;
    }
    updatePattern(pattern.cells.map((row) => row.map((code) => code === sourceCode ? targetCode : code)));
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

  function chooseColor(color: PaletteColor) {
    setSelectedCode(color.code);
    setSelectedTool("brush");
  }

  function confirmExport() {
    onExport(pattern);
    setShowExportPreview(false);
  }

  const exportPreviewUrl = renderPatternToCanvas(pattern, palette).toDataURL("image/png");

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
          <button className="icon-button" aria-label="水平镜像" onClick={mirrorPattern}><FlipHorizontal /></button>
          <button className="secondary-button" onClick={() => onSave(pattern)}>保存</button>
          <button className="primary-button" onClick={() => setShowExportPreview(true)}><WandSparkles size={18} />导出图纸</button>
        </div>
      </header>

      <section className="editor-layout">
        <aside className="tool-panel">
          <div className="tool-group-title">工具</div>
          <button className={`tool-button ${selectedTool === "brush" ? "is-selected" : ""}`} onClick={() => setSelectedTool("brush")}><span className="tool-dot" style={{ background: palette.find((color) => color.code === selectedCode)?.hex }} />画笔</button>
          <button className={`tool-button ${selectedTool === "eraser" ? "is-selected" : ""}`} onClick={() => setSelectedTool("eraser")}><Eraser />橡皮擦</button>
          <button className={`tool-button ${selectedTool === "picker" ? "is-selected" : ""}`} onClick={() => setSelectedTool("picker")}><Pipette />取色</button>
          <button className={`tool-button ${selectedTool === "fill" ? "is-selected" : ""}`} onClick={() => setSelectedTool("fill")}><PaintBucket />填充</button>
          <button className={`tool-button ${selectedTool === "shape" ? "is-selected" : ""}`} onClick={() => setSelectedTool("shape")}><Square />形状</button>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-toolbar">
            <span>{pattern.canvas.width}×{pattern.canvas.height} 画板</span>
            <span>{pattern.workSize ? `${pattern.workSize.widthMm} × ${pattern.workSize.heightMm} mm` : "暂无有效拼豆"}</span>
            <div className="zoom-controls" aria-label="画布缩放">
              <button className="icon-button" aria-label="缩小" onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.25).toFixed(2))))} disabled={zoom <= 0.75}><ZoomOut size={16} /></button>
              <span>{Math.round(zoom * 100)}%</span>
              <button className="icon-button" aria-label="放大" onClick={() => setZoom((value) => Math.min(2, Number((value + 0.25).toFixed(2))))} disabled={zoom >= 2}><ZoomIn size={16} /></button>
            </div>
          </div>
          <div className="canvas-frame">
            <PatternCanvas
              pattern={pattern}
              palette={palette}
              zoom={zoom}
              onCellPointerDown={handlePointerDown}
              onCellPointerMove={handlePointerMove}
              onCellPointerUp={handlePointerUp}
            />
          </div>
        </section>

        <aside className="color-panel">
          <div className="color-panel-heading">
            <div>
              <div className="tool-group-title">颜色</div>
              <strong>当前：{selectedCode}</strong>
            </div>
            <span className="selected-color" style={{ background: palette.find((color) => color.code === selectedCode)?.hex }} />
          </div>
          <div className="used-colors">
            <div className="used-colors-heading">
              <span className="tool-group-title">当前使用颜色</span>
              <span>{usedColors.length} 种</span>
            </div>
            {usedColors.length ? usedColors.map(({ code, count, color }) => (
              <div className="used-color-row" key={code}>
                <button className="used-color-name" onClick={() => chooseColor(color)}>
                  <span className="used-color-dot" style={{ background: color.hex }} />
                  <strong>{code}</strong>
                  <span>{count} 颗</span>
                </button>
                <select aria-label={`将 ${code} 替换为`} value={code} onChange={(event) => replaceColor(code, event.target.value)}>
                  {palette.map((target) => <option value={target.code} key={target.code}>{target.code}</option>)}
                </select>
              </div>
            )) : <p className="no-used-colors">画板中还没有拼豆</p>}
          </div>
          <input className="color-search" placeholder="搜索色号或 HEX" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="palette-grid" aria-label="MARD221 色板">
            {filteredPalette.map((color) => (
              <button
                key={color.code}
                className={`palette-swatch ${selectedCode === color.code ? "is-selected" : ""}`}
                style={{ background: color.hex }}
                title={`${color.code} ${color.hex}`}
                aria-label={`${color.code} ${color.hex}`}
                onClick={() => chooseColor(color)}
              >
                <span>{color.code}</span>
              </button>
            ))}
          </div>
        </aside>
      </section>
      {showExportPreview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowExportPreview(false)}>
          <section className="export-preview-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-heading">
              <div>
                <span className="status-label">Export preview</span>
                <h2>导出图纸预览</h2>
              </div>
              <button className="icon-button" aria-label="关闭预览" onClick={() => setShowExportPreview(false)}>×</button>
            </div>
            <div className="export-preview-layout">
              <div className="export-image-frame"><img src={exportPreviewUrl} alt={`${pattern.name} 图纸预览`} /></div>
              <div className="export-summary">
                <p><strong>画板</strong><span>{pattern.canvas.width}×{pattern.canvas.height}</span></p>
                <p><strong>实际作品尺寸</strong><span>{pattern.workSize ? `${pattern.workSize.widthMm}×${pattern.workSize.heightMm}mm` : "暂无有效拼豆"}</span></p>
                <p><strong>拼豆总数</strong><span>{pattern.cells.flat().filter(Boolean).length} 颗</span></p>
                <p><strong>使用颜色</strong><span>{usedColors.length} 种</span></p>
              </div>
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setShowExportPreview(false)}>继续编辑</button>
              <button className="primary-button" onClick={confirmExport}><WandSparkles size={18} />下载 PNG</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
