import { useEffect, useState } from "react";
import { ArrowLeft, FlipHorizontal2, ImagePlus, Loader2, RotateCw, WandSparkles } from "lucide-react";
import { openAiCompatibleProvider } from "../ai/openAiCompatibleProvider";
import type { AiGenerationProgress, AiGenerationStyle } from "../ai/types";
import { buildGenerationPrompt, generationStyles } from "../ai/promptTemplates";
import { createDebugSession, renderPixelGridToPng, renderRasterGridToPng, saveDebugArtifact, updateDebugSession } from "../debug/generationDebug";
import { CANVAS_PRESETS, type CanvasPreset, type PatternDocument } from "../domain/pattern";
import { loadMard221Palette } from "../domain/palette";
import { canvasToPngBlob, decodeImageBlob, encodeRgbaImageToPng, transformImageBlob, type ImageTransform } from "../image/browserImage";
import { renderPatternToCanvas } from "../export/patternPng";
import { convertGeneratedImageToPattern } from "../processing/pipeline";
import { autoGridRecoveryAdapter } from "../processing/autoGridAdapter";
import { preferredCanvasPixelizerAdapter } from "../processing/fallbackGridAdapter";
import { createNativeGridAdapter } from "../processing/nativeGridAdapter";
import { perfectPixelAdapter } from "../processing/perfectPixelAdapter";

interface GenerationPageProps {
  onBack: () => void;
  onCreatePattern: (pattern: PatternDocument) => void;
}

const initialTransform: ImageTransform = {
  rotation: 0,
  flipHorizontal: false,
  cropToSquare: true,
};

function jsonBlob(value: unknown): Blob {
  if (typeof value === "string") {
    return new Blob([value], { type: "application/json" });
  }
  return new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
}

function sourceExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : "img";
}

export default function GenerationPage({ onBack, onCreatePattern }: GenerationPageProps) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [transform, setTransform] = useState(initialTransform);
  const [style, setStyle] = useState<AiGenerationStyle>(generationStyles[0].id);
  const [preferredCanvasSize, setPreferredCanvasSize] = useState<CanvasPreset>(CANVAS_PRESETS[0]);
  const [maxColors, setMaxColors] = useState(20);
  const [progress, setProgress] = useState<AiGenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(sourceFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  function selectFile(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("请选择 JPG、PNG 或其他浏览器支持的图片文件。");
      return;
    }
    setSourceFile(file);
    setTransform(initialTransform);
    setError(null);
  }

  function removeFile() {
    setSourceFile(null);
    setPreviewUrl(null);
    setProgress(null);
    setError(null);
  }

  function rotate() {
    setTransform((current) => ({ ...current, rotation: ((current.rotation + 90) % 360) as ImageTransform["rotation"] }));
  }

  async function generate() {
    if (!sourceFile) {
      setError("请先上传一张参考图片。");
      return;
    }

    setError(null);
    const debugMetadata: Record<string, unknown> = {
      app: "EasyPingMake",
      formatVersion: 1,
      source: {
        filename: sourceFile.name,
        mimeType: sourceFile.type,
        byteSize: sourceFile.size,
      },
      transform: { ...transform },
      request: {
        style,
        preferredCanvasSize,
        maxColors,
        paletteId: "MARD221",
        model: import.meta.env.VITE_AI_IMAGE_MODEL || null,
        size: import.meta.env.VITE_AI_IMAGE_SIZE || "1024x1024",
        prompt: buildGenerationPrompt(style, {
          preferredCanvasSize,
          maxColors,
        }),
      },
      stages: {},
    };
    const stages = debugMetadata.stages as Record<string, unknown>;
    let debugSessionId: string | undefined;

    try {
      const session = await createDebugSession(debugMetadata);
      debugSessionId = session.id;
    } catch {
      // 调试文件保存失败时不影响正常生成。
    }

    async function saveStage(filename: string, blob: Blob, description: string, details: Record<string, unknown> = {}): Promise<void> {
      if (!debugSessionId) {
        return;
      }

      try {
        await saveDebugArtifact(debugSessionId, { filename, blob, description });
        stages[filename] = {
          description,
          mimeType: blob.type || "application/octet-stream",
          byteSize: blob.size,
          ...details,
        };
        await updateDebugSession(debugSessionId, { metadata: debugMetadata });
      } catch {
        // 浏览器配额或 IndexedDB 异常不应阻断生成。
      }
    }

    async function saveJsonStage(filename: string, value: unknown, description: string, details: Record<string, unknown> = {}): Promise<void> {
      await saveStage(filename, jsonBlob(value), description, details);
    }

    try {
      await saveStage(`01-source-original.${sourceExtension(sourceFile)}`, sourceFile, "用户上传的原始图片");
      const preparedImage = await transformImageBlob(sourceFile, transform);
      await saveStage("02-prepared-input.png", preparedImage, "发送给 AI 接口前的裁剪、旋转和翻转结果");
      const generated = await openAiCompatibleProvider.generate({
        sourceImage: preparedImage,
        style,
        preferredCanvasSize,
        maxColors,
        paletteId: "MARD221",
      }, setProgress);
      await saveJsonStage("03-ai-response.json", generated.rawResponse ?? { note: "Provider 未返回原始响应文本" }, "AI 接口返回的原始 JSON 响应");
      await saveStage("04-ai-result.png", generated.image, "AI 返回的图片");
      const image = await decodeImageBlob(generated.image);
      await saveStage("05-decoded-raster.png", await encodeRgbaImageToPng(image), "浏览器解码后的 RGBA 像素图", {
        width: image.width,
        height: image.height,
      });
      const adapters = [perfectPixelAdapter, autoGridRecoveryAdapter, preferredCanvasPixelizerAdapter];
      if (generated.nativeGridHint) {
        adapters.push(createNativeGridAdapter(generated.nativeGridHint));
      }
      const result = await convertGeneratedImageToPattern({
        image,
        preferredCanvasSize,
        maxColors,
        name: "AI 生成图纸",
        adapters,
      });
      await saveStage("05b-background-removed.png", await encodeRgbaImageToPng(result.backgroundRemoval.image), "用于转换的去背景 RGBA 像素图", {
        width: result.backgroundRemoval.image.width,
        height: result.backgroundRemoval.image.height,
        removedPixelCount: result.backgroundRemoval.removedPixelCount,
        backgroundColor: result.backgroundRemoval.backgroundColor,
      });
      if (result.recovery.processedImage) {
        await saveStage(
          "05c-perfect-pixel-output.png",
          await encodeRgbaImageToPng(result.recovery.processedImage),
          "PerfectPixel 还原后的真实像素图",
          {
            width: result.recovery.processedImage.width,
            height: result.recovery.processedImage.height,
            detectorId: result.recovery.diagnostics.detectorId,
            confidence: result.recovery.diagnostics.confidence,
            logs: result.recovery.diagnostics.metadata?.logs ?? [],
          },
        );
      }
      await saveStage("06-recovery-selected.png", await renderRasterGridToPng(result.recovery.grid), "最终选中的网格恢复结果", {
        columns: result.recovery.geometry.columns,
        rows: result.recovery.geometry.rows,
        detectorId: result.recovery.diagnostics.detectorId,
        confidence: result.recovery.diagnostics.confidence,
        xPeriodPx: result.recovery.geometry.xPeriodPx ?? null,
        yPeriodPx: result.recovery.geometry.yPeriodPx ?? null,
        xOffsetPx: result.recovery.geometry.xOffsetPx ?? null,
        yOffsetPx: result.recovery.geometry.yOffsetPx ?? null,
      });
      for (const [index, attempt] of (result.recovery.attempts ?? []).entries()) {
        if (!attempt.grid || !attempt.geometry) {
          continue;
        }
        await saveStage(
          `07-recovery-attempt-${String(index + 1).padStart(2, "0")}-${attempt.adapterId}.png`,
          await renderRasterGridToPng(attempt.grid),
          `grid recovery adapter ${attempt.adapterId} result`,
          /*
          `网格恢复适配器 ${attempt.adapterId} 的尝试结果`,
          */
          {
            adapterId: attempt.adapterId,
            status: attempt.status,
            columns: attempt.geometry.columns,
            rows: attempt.geometry.rows,
            confidence: attempt.diagnostics?.confidence ?? attempt.geometry.confidence ?? null,
            xPeriodPx: attempt.geometry.xPeriodPx ?? null,
            yPeriodPx: attempt.geometry.yPeriodPx ?? null,
          },
        );
      }
      await saveJsonStage("08-recovery.json", {
        sourceImage: { width: image.width, height: image.height },
        selected: {
          geometry: result.recovery.geometry,
          diagnostics: result.recovery.diagnostics,
          grid: result.recovery.grid,
        },
        attempts: result.recovery.attempts ?? [],
      }, "网格恢复的几何参数、诊断信息和采样网格");
      await saveStage("09-mapped-mard221.png", await renderPixelGridToPng(result.mapped.pixelGrid), "映射到 MARD221 后的可编辑色号网格", {
        width: result.mapped.pixelGrid.width,
        height: result.mapped.pixelGrid.height,
        colorCount: result.mapped.colorCodes.size,
        emptyCellCount: result.mapped.emptyCellCount,
      });
      await saveJsonStage("10-mapped-mard221.json", result.mapped.pixelGrid, "MARD221 色号像素网格数据", {
        width: result.mapped.pixelGrid.width,
        height: result.mapped.pixelGrid.height,
      });
      await saveStage("11-final-pattern.png", await canvasToPngBlob(renderPatternToCanvas(result.pattern, loadMard221Palette())), "最终进入编辑器的图纸画布", {
        width: result.pattern.canvas.width,
        height: result.pattern.canvas.height,
      });
      await saveJsonStage("12-final-pattern.json", result.pattern, "最终 PatternDocument 数据");
      if (debugSessionId) {
        try {
          await updateDebugSession(debugSessionId, { status: "completed", metadata: debugMetadata });
        } catch {
          // 调试状态更新失败不应阻断进入编辑器。
        }
      }
      onCreatePattern(result.pattern);
    } catch (generationError) {
      if (debugSessionId) {
        const message = generationError instanceof Error ? generationError.message : "生成失败，请重试。";
        const providerError = generationError as Error & { responseBody?: string; status?: number };
        await saveJsonStage("99-error.json", {
          message,
          status: providerError.status ?? null,
          responseBody: providerError.responseBody ?? null,
        }, "生成失败时捕获的错误信息");
        try {
          await updateDebugSession(debugSessionId, {
            status: "failed",
            metadata: debugMetadata,
            error: message,
          });
        } catch {
          // 调试状态更新失败不应覆盖原始生成错误。
        }
      }
      setError(generationError instanceof Error ? generationError.message : "生成失败，请重试。");
    } finally {
      setProgress(null);
    }
  }

  return (
    <main className="generation-page">
      <header className="generation-header">
        <button className="secondary-button" onClick={onBack}><ArrowLeft size={18} />返回首页</button>
        <div>
          <span className="status-label">AI generation / pet avatar</span>
          <h1>生成拼豆图纸</h1>
        </div>
        <span className="generation-badge">MARD221 · 单格 2.8mm</span>
      </header>

      <section className="generation-layout">
        <section className="upload-panel">
          <div className="section-heading">
            <div>
              <span className="status-label">1 / Reference</span>
              <h2>上传宠物图片</h2>
            </div>
            <label className="upload-button">
              <ImagePlus size={18} />选择图片
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectFile(event.target.files?.[0])} />
            </label>
          </div>
          <div className={`image-preview ${previewUrl ? "has-image" : ""}`}>
            {previewUrl ? (
              <img src={previewUrl} alt="已上传的宠物图片预览" style={{ transform: `rotate(${transform.rotation}deg) scaleX(${transform.flipHorizontal ? -1 : 1})` }} />
            ) : (
              <div className="upload-empty"><ImagePlus size={40} /><p>选择一张 JPG、PNG 或 WebP 图片</p><span>建议使用主体清晰、光线充足的正面照片</span></div>
            )}
          </div>
          <div className="image-actions">
            <button className="secondary-button" disabled={!sourceFile} onClick={() => setTransform((current) => ({ ...current, cropToSquare: !current.cropToSquare }))}>{transform.cropToSquare ? "已居中裁剪" : "启用居中裁剪"}</button>
            <button className="secondary-button" disabled={!sourceFile} onClick={rotate}><RotateCw size={16} />旋转 90°</button>
            <button className="secondary-button" disabled={!sourceFile} onClick={() => setTransform((current) => ({ ...current, flipHorizontal: !current.flipHorizontal }))}><FlipHorizontal2 size={16} />水平翻转</button>
            <button className="secondary-button" disabled={!sourceFile} onClick={removeFile}>删除图片</button>
          </div>
        </section>

        <section className="generation-settings">
          <div>
            <span className="status-label">2 / Parameters</span>
            <h2>生成参数</h2>
          </div>
          <label className="field-label">
            生成风格
            <select value={style} onChange={(event) => setStyle(event.target.value as AiGenerationStyle)}>
              {generationStyles.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
          </label>
          <fieldset className="canvas-options generation-option-group">
            <legend>首选画板 / AI 抽象程度</legend>
            <div className="canvas-option-grid">
              {CANVAS_PRESETS.map((size) => (
                <label className={`canvas-option ${preferredCanvasSize === size ? "is-selected" : ""}`} key={size}>
                  <input type="radio" name="generation-canvas-size" value={size} checked={preferredCanvasSize === size} onChange={() => setPreferredCanvasSize(size)} />
                  <strong>{size}×{size}</strong>
                  <span>不是强制采样网格</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field-label">
            最大颜色数量：{maxColors} 色
            <input type="range" min="10" max="50" step="1" value={maxColors} onChange={(event) => setMaxColors(Number(event.target.value))} />
          </label>
          <div className="generation-explanation">
            <strong>处理流程</strong>
            <p>参考图 → 生成伪像素图 → 还原真实像素网格 → MARD221 映射 → 可编辑画板</p>
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button generate-button" onClick={generate} disabled={Boolean(progress)}>
            {progress ? <><Loader2 className="spin" size={18} />{progress.message} {progress.percent}%</> : <><WandSparkles size={18} />生成图纸</>}
          </button>
          <p className="demo-note">当前通过本地代理调用 OpenAI-compatible 图片接口；API Key 只放在项目根目录 .env.local。</p>
        </section>
      </section>
    </main>
  );
}
