import { useState } from "react";
import { ArrowRight, Pencil, Plus, Trash2, WandSparkles } from "lucide-react";
import EditorPage from "./editor/EditorPage";
import GenerationPage from "./generation/GenerationPage";
import { CANVAS_PRESETS, createBlankPatternDocument, createPatternDocumentFromGrid, type CanvasPreset, type PatternDocument } from "./domain/pattern";
import { loadMard221Palette } from "./domain/palette";
import { downloadPatternPng } from "./export/patternPng";
import { deletePattern, readPatterns, savePattern } from "./storage/patternStorage";
import logoUrl from "./assets/easy-ping-make-logo.svg";

const palette = loadMard221Palette();
const paletteMap = new Map(palette.map((color) => [color.code, color.hex]));
const foundationPattern = createPatternDocumentFromGrid({
  id: "foundation-preview",
  name: "示例图纸",
  grid: {
    width: 3,
    height: 3,
    cells: [
      [null, "A01", null],
      ["A01", "H07", "A01"],
      [null, "A01", null],
    ],
  },
});

/*
function formatBytes(byteSize: number): string {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }
  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function DebugSessionsPanel() {
  const [sessions, setSessions] = useState<DebugSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setSessions(await listDebugSessions());
      setError(null);
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "无法读取调试记录");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function downloadSession(session: DebugSessionRecord) {
    try {
      await downloadDebugSession(session);
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "下载调试文件失败");
    }
  }

  async function downloadArtifact(session: DebugSessionRecord, filename: string) {
    try {
      await downloadDebugArtifact(session.id, filename);
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "下载调试文件失败");
    }
  }

  async function removeSession(session: DebugSessionRecord) {
    if (!window.confirm("确定删除这条调试记录及其全部中间文件吗？")) {
      return;
    }
    try {
      await deleteDebugSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : "删除调试记录失败");
    }
  }

  return (
    <section className="debug-section">
      <div className="section-heading">
        <div>
          <span className="status-label">Generation debug</span>
          <h2><Bug size={22} />调试中间文件</h2>
        </div>
        <button className="secondary-button" onClick={() => void refresh()} disabled={loading}>刷新记录</button>
      </div>
      <p className="debug-note">每次 AI 生成会自动保存到当前浏览器的 IndexedDB。清除浏览器站点数据会同时清除这些记录。</p>
      {error && <p className="error-message" role="alert">{error}</p>}
      {loading ? (
        <p className="debug-empty">正在读取调试记录……</p>
      ) : sessions.length ? (
        <div className="debug-session-list">
          {sessions.map((session) => (
            <article className="debug-session-card" key={session.id}>
              <div className="debug-session-heading">
                <div>
                  <strong>{new Date(session.createdAt).toLocaleString()}</strong>
                  <span className={`debug-status is-${session.status}`}>{session.status === "completed" ? "已完成" : session.status === "failed" ? "失败" : "进行中"}</span>
                </div>
                <div className="debug-session-actions">
                  <button className="secondary-button" onClick={() => void downloadSession(session)} disabled={!session.artifacts.length}><Download size={16} />下载全部</button>
                  <button className="icon-button danger-button" aria-label="删除调试记录" onClick={() => void removeSession(session)}><Trash2 size={17} /></button>
                </div>
              </div>
              {session.error && <p className="debug-error">错误：{session.error}</p>}
              <div className="debug-artifact-list">
                {session.artifacts.map((artifact) => (
                  <button className="debug-artifact" key={artifact.filename} onClick={() => void downloadArtifact(session, artifact.filename)}>
                    <span>{artifact.filename}</span>
                    <small>{formatBytes(artifact.byteSize)}</small>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="debug-empty">还没有调试记录。完成一次 AI 生成后，这里会出现所有中间文件。</p>
      )}
    </section>
  );
}

*/
function NewPatternDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (pattern: PatternDocument) => void }) {
  const [name, setName] = useState("我的新图纸");
  const [canvasSize, setCanvasSize] = useState<CanvasPreset>(CANVAS_PRESETS[0]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate(createBlankPatternDocument({ name, preferredCanvasSize: canvasSize }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="new-pattern-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-heading">
          <div>
            <span className="status-label">New pattern</span>
            <h2>新建图纸</h2>
          </div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>×</button>
        </div>
        <label className="field-label">
          图纸名称
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <fieldset className="canvas-options">
          <legend>进入编辑器的首选画板</legend>
          <div className="canvas-option-grid">
            {CANVAS_PRESETS.map((size) => (
              <label className={`canvas-option ${canvasSize === size ? "is-selected" : ""}`} key={size}>
                <input type="radio" name="canvas-size" value={size} checked={canvasSize === size} onChange={() => setCanvasSize(size)} />
                <strong>{size}×{size}</strong>
                <span>AI 抽象程度参考</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="dialog-note">最终画板会根据还原后的有效像素区域自动扩展，最大画板仍可动态覆盖超出 104×104 的内容。</p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button"><Plus size={18} />创建并编辑</button>
        </div>
      </form>
    </div>
  );
}

function DeletePatternDialog({ pattern, onClose, onConfirm }: { pattern: PatternDocument; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="new-pattern-dialog delete-pattern-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-pattern-title">
        <div className="dialog-heading">
          <div>
            <span className="status-label">Delete pattern</span>
            <h2 id="delete-pattern-title">删除图纸</h2>
          </div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>×</button>
        </div>
        <div className="delete-dialog-copy">
          <p>确定要删除“{pattern.name || "未命名图纸"}”吗？</p>
          <span>删除后无法恢复。</span>
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="button" className="primary-button danger-action-button" onClick={onConfirm}><Trash2 size={17} />删除图纸</button>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<"home" | "editor" | "generation">("home");
  const [activePattern, setActivePattern] = useState<PatternDocument | null>(null);
  const [savedPatterns, setSavedPatterns] = useState<PatternDocument[]>(() => readPatterns());
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editingPatternId, setEditingPatternId] = useState<string | null>(null);
  const [editingPatternName, setEditingPatternName] = useState("");
  const [deletingPattern, setDeletingPattern] = useState<PatternDocument | null>(null);

  function openEditor(pattern: PatternDocument) {
    setActivePattern(pattern);
    setView("editor");
  }

  function handleSave(pattern: PatternDocument) {
    setSavedPatterns(savePattern(pattern));
    setActivePattern(pattern);
  }

  function startRename(pattern: PatternDocument) {
    setEditingPatternId(pattern.id);
    setEditingPatternName(pattern.name || "未命名图纸");
  }

  function cancelRename() {
    setEditingPatternId(null);
    setEditingPatternName("");
  }

  function commitRename(pattern: PatternDocument) {
    const nextName = editingPatternName.trim();
    if (nextName && nextName !== pattern.name) {
      handleSave({ ...pattern, name: nextName });
    }
    cancelRename();
  }

  function requestDelete(pattern: PatternDocument) {
    setDeletingPattern(pattern);
  }

  function confirmDelete() {
    if (!deletingPattern) {
      return;
    }
    setSavedPatterns(deletePattern(deletingPattern.id));
    setDeletingPattern(null);
  }

  if (view === "editor" && activePattern) {
    return (
      <EditorPage
        key={activePattern.id}
        initialPattern={activePattern}
        onBack={() => setView("home")}
        onSave={handleSave}
        onExport={(pattern) => downloadPatternPng(pattern, palette)}
      />
    );
  }

  if (view === "generation") {
    return <GenerationPage onBack={() => setView("home")} onCreatePattern={(pattern) => openEditor(pattern)} />;
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-heading">
          <div className="hero-brand">
            <img className="hero-logo" src={logoUrl} alt="EasyPingMake" />
            <p className="hero-tagline">让图片转拼豆图纸更简单</p>
            <div className="hero-actions">
              <button className="primary-button hero-action" onClick={() => setView("generation")}><WandSparkles size={18} />AI 生成图纸</button>
            </div>
          </div>
          <div className="hero-showcase-slot" aria-label="拼豆效果图展示区域">
            <div className="hero-showcase-frame">
              <div className="hero-showcase-placeholder">展示效果图</div>
            </div>
          </div>
        </div>
      </section>

      <section className="project-section">
        <div className="section-heading">
          <div>
            <span className="status-label">My patterns</span>
            <h2>我的图纸</h2>
          </div>
        </div>
        <div className="project-grid">
          {savedPatterns.map((pattern) => {
            const bounds = pattern.bounds;
            const previewWidth = bounds?.width ?? 1;
            const previewHeight = bounds?.height ?? 1;
            const previewCells = bounds
              ? pattern.cells.slice(bounds.minY, bounds.maxY + 1).map((row) => row.slice(bounds.minX, bounds.maxX + 1))
              : [[null]];
            const previewRatio = previewWidth / previewHeight;

            return (
              <article className="project-card" key={pattern.id}>
                <button className="project-card-open" type="button" onClick={() => openEditor(pattern)} aria-label={`打开 ${pattern.name || "未命名图纸"}`}>
                  <div className="project-preview" aria-hidden="true">
                    <div
                      className="project-preview-grid"
                      style={{
                        gridTemplateColumns: `repeat(${previewWidth}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${previewHeight}, minmax(0, 1fr))`,
                        width: `${Math.min(100, previewRatio * 100)}%`,
                        aspectRatio: `${previewWidth} / ${previewHeight}`,
                      }}
                    >
                      {previewCells.map((row, y) => row.map((cell, x) => (
                        <span key={`${x}-${y}`} style={{ background: cell ? paletteMap.get(cell) : "transparent" }} />
                      )))}
                    </div>
                  </div>
                </button>
                <div className="project-card-body">
                  <div className="project-card-title">
                    {editingPatternId === pattern.id ? (
                      <input
                        className="project-card-name-input"
                        value={editingPatternName}
                        onChange={(event) => setEditingPatternName(event.target.value)}
                        onBlur={() => commitRename(pattern)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRename();
                          }
                        }}
                        aria-label="编辑图纸名称"
                        autoFocus
                        maxLength={80}
                      />
                    ) : (
                      <>
                        <h3 title={pattern.name || "未命名图纸"}>{pattern.name || "未命名图纸"}</h3>
                        <button className="rename-button" type="button" aria-label={`重命名 ${pattern.name || "未命名图纸"}`} title="重命名" onClick={(event) => { event.stopPropagation(); startRename(pattern); }}><Pencil size={17} /></button>
                      </>
                    )}
                  </div>
                  <div className="project-card-actions">
                    <button className="icon-button danger-button" type="button" aria-label={`删除 ${pattern.name || "未命名图纸"}`} title="删除" onClick={() => requestDelete(pattern)}><Trash2 size={17} /></button>
                    <button className="secondary-button project-edit-button" type="button" onClick={() => openEditor(pattern)}><Pencil size={16} />编辑</button>
                  </div>
                </div>
              </article>
            );
          })}
          <button className="new-pattern-card" type="button" onClick={() => setShowNewDialog(true)}>
            <span className="new-pattern-card-icon"><Plus size={30} strokeWidth={2.5} /></span>
            <strong>新建图纸</strong>
          </button>
        </div>
        {!savedPatterns.length && (
          <div className="empty-project-card">
            <p>还没有保存的图纸</p>
            <button className="primary-button" onClick={() => openEditor(foundationPattern)}>打开示例编辑器 <ArrowRight size={18} /></button>
          </div>
        )}
      </section>

      {showNewDialog && <NewPatternDialog onClose={() => setShowNewDialog(false)} onCreate={(pattern) => { setShowNewDialog(false); openEditor(pattern); }} />}
      {deletingPattern && <DeletePatternDialog pattern={deletingPattern} onClose={() => setDeletingPattern(null)} onConfirm={confirmDelete} />}
    </main>
  );
}
