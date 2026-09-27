import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from "react";
import { ArrowLeft, Check, FlipHorizontal2, FlipVertical2, ImagePlus, Loader2, Pencil, RotateCcw, RotateCw, Trash2, Upload, WandSparkles, X } from "lucide-react";
import { openAiCompatibleProvider } from "../ai/openAiCompatibleProvider";
import type { AiGenerationProgress, AiGenerationStyle } from "../ai/types";
import { buildGenerationPromptStages, generationStyles } from "../ai/promptTemplates";
import { createDebugSession, renderPixelGridToPng, renderRasterGridToPng, saveDebugArtifact, updateDebugSession } from "../debug/generationDebug";
import { CANVAS_PRESETS, type CanvasPreset, type PatternDocument } from "../domain/pattern";
import { loadMard291Palette } from "../domain/palette";
import { canvasToPngBlob, decodeImageBlob, encodeRgbaImageToPng, transformImageBlob, updateImageCrop, type CropHandle, type ImageCrop, type ImageTransform } from "../image/browserImage";
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
  flipVertical: false,
  cropToSquare: false,
  crop: null,
};

interface ImageSize {
  width: number;
  height: number;
}

interface DisplayImageRect extends ImageSize {
  left: number;
  top: number;
}

interface CropPointerState {
  pointerId: number;
  mode: "move" | "resize";
  handle?: CropHandle;
  startX: number;
  startY: number;
  origin: ImageCrop;
}

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

function cloneTransform(transform: ImageTransform): ImageTransform {
  return {
    ...transform,
    crop: transform.crop ? { ...transform.crop } : null,
  };
}


export default function GenerationPage({ onBack, onCreatePattern }: GenerationPageProps) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null);
  const [transform, setTransform] = useState(initialTransform);
  const [editingTransform, setEditingTransform] = useState<ImageTransform | null>(null);
  const [editingSnapshot, setEditingSnapshot] = useState<ImageTransform | null>(null);
  const [style, setStyle] = useState<AiGenerationStyle>(generationStyles[0].id);
  const preferredCanvasSize: CanvasPreset = CANVAS_PRESETS[0];
  const activeGenerationStyle = generationStyles.find((item) => item.id === style) ?? generationStyles[0];
  const maxColors = activeGenerationStyle.maxColors;
  const [progress, setProgress] = useState<AiGenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [displayImageSize, setDisplayImageSize] = useState<ImageSize | null>(null);
  const [stageSize, setStageSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const imageStageRef = useRef<HTMLDivElement | null>(null);
  const cropPointerRef = useRef<CropPointerState | null>(null);
  const processedPreviewUrlRef = useRef<string | null>(null);

  function revokeProcessedPreviewUrl() {
    const previousUrl = processedPreviewUrlRef.current;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
      processedPreviewUrlRef.current = null;
    }
  }

  function replaceProcessedPreviewUrl(nextUrl: string | null) {
    revokeProcessedPreviewUrl();
    processedPreviewUrlRef.current = nextUrl;
    setProcessedPreviewUrl(nextUrl);
  }

  useEffect(() => {
    if (!sourceFile) {
      replaceProcessedPreviewUrl(null);
      setPreviewUrl(null);
      setImageSize(null);
      setDisplayImageSize(null);
      setIsEditing(false);
      setEditingTransform(null);
      setEditingSnapshot(null);
      return;
    }

    const url = URL.createObjectURL(sourceFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  useEffect(() => {
    let cancelled = false;
    if (!sourceFile || isEditing || !imageSize) {
      replaceProcessedPreviewUrl(null);
      return () => {
        cancelled = true;
      };
    }

    replaceProcessedPreviewUrl(null);
    transformImageBlob(sourceFile, transform)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        replaceProcessedPreviewUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!cancelled) {
          replaceProcessedPreviewUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sourceFile, transform, isEditing, imageSize]);

  useEffect(() => () => revokeProcessedPreviewUrl(), []);

  useEffect(() => {
    const stage = imageStageRef.current;
    if (!stage) {
      return;
    }
    const updateSize = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    updateSize();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateSize) : null;
    observer?.observe(stage);
    window.addEventListener("resize", updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [previewUrl, isEditing]);

  const activeImageSize = isEditing ? imageSize : displayImageSize ?? imageSize;
  const displayImageRect: DisplayImageRect | null = activeImageSize && stageSize.width > 0 && stageSize.height > 0
    ? (() => {
      const padding = 16;
      const scale = Math.min(
        Math.max(1, stageSize.width - padding * 2) / activeImageSize.width,
        Math.max(1, stageSize.height - padding * 2) / activeImageSize.height,
      );
      const width = activeImageSize.width * scale;
      const height = activeImageSize.height * scale;
      return {
        width,
        height,
        left: Math.max(padding, (stageSize.width - width) / 2),
        top: Math.max(padding, (stageSize.height - height) / 2),
      };
    })()
    : null;
  const previewTransform = isEditing && editingTransform ? editingTransform : transform;
  const activePreviewUrl = isEditing ? previewUrl : processedPreviewUrl ?? previewUrl;

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
    setImageSize(null);
    setDisplayImageSize(null);
    setIsEditing(false);
    setEditingTransform(null);
    setEditingSnapshot(null);
    cropPointerRef.current = null;
    setError(null);
  }

  function removeFile() {
    setSourceFile(null);
    setPreviewUrl(null);
    setImageSize(null);
    setDisplayImageSize(null);
    setIsEditing(false);
    setEditingTransform(null);
    setEditingSnapshot(null);
    cropPointerRef.current = null;
    setProgress(null);
    setError(null);
  }

  function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const width = event.currentTarget.naturalWidth;
    const height = event.currentTarget.naturalHeight;
    if (!width || !height) {
      return;
    }
    setImageSize({ width, height });
    setDisplayImageSize({ width, height });
  }

  function handleProcessedImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const width = event.currentTarget.naturalWidth;
    const height = event.currentTarget.naturalHeight;
    if (width && height) {
      setDisplayImageSize({ width, height });
    }
  }

  function startEditing() {
    const snapshot = cloneTransform(transform);
    setEditingSnapshot(snapshot);
    setEditingTransform(snapshot);
    setIsEditing(true);
  }

  function completeEditing() {
    if (editingTransform) {
      setTransform(cloneTransform(editingTransform));
    }
    setEditingTransform(null);
    setEditingSnapshot(null);
    setIsEditing(false);
    cropPointerRef.current = null;
  }

  function cancelEditing() {
    if (editingSnapshot) {
      setTransform(cloneTransform(editingSnapshot));
    }
    setEditingTransform(null);
    setEditingSnapshot(null);
    setIsEditing(false);
    cropPointerRef.current = null;
  }

  function rotate(direction: -1 | 1 = 1) {
    setEditingTransform((current) => current
      ? { ...current, rotation: ((current.rotation + direction * 90 + 360) % 360) as ImageTransform["rotation"] }
      : current);
  }

  function toggleFlip(axis: "horizontal" | "vertical") {
    setEditingTransform((current) => current && (axis === "horizontal"
      ? { ...current, flipHorizontal: !current.flipHorizontal }
      : { ...current, flipVertical: !current.flipVertical }));
  }

  function getCrop(): ImageCrop {
    return editingTransform?.crop ?? transform.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  }

  function beginCropPointer(event: ReactPointerEvent<HTMLElement>, mode: CropPointerState["mode"], handle?: CropHandle) {
    const stage = imageStageRef.current;
    if (!isEditing || !editingTransform || !displayImageRect || !stage) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    stage.setPointerCapture(event.pointerId);
    cropPointerRef.current = {
      pointerId: event.pointerId,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: getCrop(),
    };
  }

  function moveCropPointer(event: ReactPointerEvent<HTMLElement>) {
    const pointer = cropPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId || !displayImageRect || !editingTransform) {
      return;
    }
    event.preventDefault();
    const deltaX = (event.clientX - pointer.startX) / displayImageRect.width;
    const deltaY = (event.clientY - pointer.startY) / displayImageRect.height;
    setEditingTransform((current) => current ? {
      ...current,
      crop: updateImageCrop(pointer.origin, pointer.mode, pointer.handle, deltaX, deltaY),
      cropToSquare: false,
    } : current);
  }

  function finishCropPointer(event: ReactPointerEvent<HTMLElement>) {
    const pointer = cropPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      return;
    }
    const stage = imageStageRef.current;
    if (stage?.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
    cropPointerRef.current = null;
  }

  async function generate() {
    if (!sourceFile) {
      setError("请先上传一张参考图片。");
      return;
    }

    setError(null);
    const debugMetadata: Record<string, unknown> = {
      app: "EasyPingMake",
      formatVersion: 2,
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
        paletteId: "MARD291",
        model: import.meta.env.VITE_AI_IMAGE_MODEL || null,
        size: import.meta.env.VITE_AI_IMAGE_SIZE || "1024x1024",
        promptStages: buildGenerationPromptStages(style),
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
        paletteId: "MARD291",
      }, setProgress);
      const aiStages = generated.stages ?? [{
        id: "final",
        label: "AI 最终输出",
        image: generated.image,
        rawResponse: generated.rawResponse,
      }];
      for (const [index, aiStage] of aiStages.entries()) {
        const sequence = String(index + 1).padStart(2, "0");
        await saveJsonStage(
          `03-ai-stage-${sequence}-${aiStage.id}-response.json`,
          aiStage.rawResponse ?? { note: "Provider 未返回原始响应文本" },
          `${aiStage.label} 的 AI 接口响应`,
          { stageId: aiStage.id, stageLabel: aiStage.label },
        );
        await saveStage(
          `04-ai-stage-${sequence}-${aiStage.id}.png`,
          aiStage.image,
          aiStage.label,
          { stageId: aiStage.id, stageLabel: aiStage.label },
        );
      }
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
      if (result.mapped.nearestPaletteGrid) {
        await saveStage(
          "09a-nearest-mard291.png",
          await renderPixelGridToPng(result.mapped.nearestPaletteGrid),
          "未执行风格限色时的 MARD291 最近色结果",
        );
        await saveJsonStage(
          "09a-nearest-mard291.json",
          result.mapped.nearestPaletteGrid,
          "未执行风格限色时的 MARD291 最近色网格",
        );
      }
      await saveStage("09-mapped-mard291.png", await renderPixelGridToPng(result.mapped.pixelGrid), "映射到 MARD291 后的可编辑色号网格", {
        width: result.mapped.pixelGrid.width,
        height: result.mapped.pixelGrid.height,
        colorCount: result.mapped.colorCodes.size,
        emptyCellCount: result.mapped.emptyCellCount,
      });
      await saveJsonStage("10-mapped-mard291.json", result.mapped.pixelGrid, "MARD291 色号像素网格数据", {
        width: result.mapped.pixelGrid.width,
        height: result.mapped.pixelGrid.height,
      });
      await saveJsonStage("10-mapping-diagnostics.json", result.mapped.mappingDiagnostics ?? null, "色板限色前后色差与最终色号用量");
      await saveStage("11-final-pattern.png", await canvasToPngBlob(renderPatternToCanvas(result.pattern, loadMard291Palette())), "最终进入编辑器的图纸画布", {
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
        <span className="generation-badge">MARD291 · 单格 2.8mm</span>
      </header>

      <section className="generation-layout generation-layout-compact">
        <section className="upload-panel">
          <div className="section-heading">
            <div>
              <span className="status-label">1 / Reference</span>
              <h2>上传参考图片</h2>
            </div>
          </div>
          {sourceFile && (
            <div className="image-preview-toolbar" aria-label="图片操作">
              <button className={`secondary-button image-action-control ${isEditing ? "is-active" : ""}`} type="button" onClick={isEditing ? cancelEditing : startEditing} aria-pressed={isEditing}>
                <Pencil size={16} />编辑
              </button>
              <button className="icon-button image-action-icon" type="button" onClick={removeFile} aria-label="删除图片" title="删除图片">
                  <Trash2 size={16} />
              </button>
              <label className="secondary-button image-action-button">
                <Upload size={16} />重新上传
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              </label>
            </div>
          )}
          {isEditing && sourceFile && (
            <div className="image-edit-toolbar" aria-label="图片编辑工具">
              <button className="icon-button" type="button" onClick={() => rotate(-1)} aria-label="向左旋转" title="向左旋转"><RotateCcw size={17} /></button>
              <button className="icon-button" type="button" onClick={() => rotate(1)} aria-label="向右旋转" title="向右旋转"><RotateCw size={17} /></button>
              <button className="icon-button" type="button" onClick={() => toggleFlip("horizontal")} aria-label="水平翻转" title="水平翻转"><FlipHorizontal2 size={17} /></button>
              <button className="icon-button" type="button" onClick={() => toggleFlip("vertical")} aria-label="垂直翻转" title="垂直翻转"><FlipVertical2 size={17} /></button>
              <button className="icon-button" type="button" onClick={completeEditing} aria-label="完成编辑" title="完成编辑"><Check size={17} /></button>
              <button className="icon-button" type="button" onClick={cancelEditing} aria-label="取消编辑" title="取消编辑"><X size={17} /></button>
            </div>
          )}
          <div
            className={`image-preview ${activePreviewUrl ? "has-image" : ""} ${isEditing ? "is-editing" : ""}`}
            ref={imageStageRef}
            onPointerMove={moveCropPointer}
            onPointerUp={finishCropPointer}
            onPointerCancel={finishCropPointer}
            onLostPointerCapture={finishCropPointer}
          >
            {activePreviewUrl ? (
              <div
                className="image-stage-content"
                style={displayImageRect ? {
                  width: displayImageRect.width,
                  height: displayImageRect.height,
                  left: displayImageRect.left,
                  top: displayImageRect.top,
                } : undefined}
              >
                <img
                  src={activePreviewUrl}
                  alt="已上传的参考图片预览"
                  onLoad={(event) => {
                    if (isEditing || event.currentTarget.currentSrc === previewUrl) {
                      handleImageLoad(event);
                    } else {
                      handleProcessedImageLoad(event);
                    }
                  }}
                  style={isEditing ? { transform: `rotate(${previewTransform.rotation}deg) scale(${previewTransform.flipHorizontal ? -1 : 1}, ${previewTransform.flipVertical ? -1 : 1})` } : undefined}
                />
                {isEditing && (
                  <div
                    className="crop-selection"
                    style={{ left: `${getCrop().x * 100}%`, top: `${getCrop().y * 100}%`, width: `${getCrop().width * 100}%`, height: `${getCrop().height * 100}%` }}
                    onPointerDown={(event) => beginCropPointer(event, "move")}
                  >
                    <div className="crop-grid" aria-hidden="true" />
                    {(["nw", "ne", "sw", "se"] as CropHandle[]).map((handle) => (
                      <button
                        key={handle}
                        className={`crop-handle crop-handle-${handle}`}
                        type="button"
                        aria-label={`调整裁剪区域 ${handle}`}
                        onPointerDown={(event) => beginCropPointer(event, "resize", handle)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <label className="upload-empty" aria-label="上传参考图片">
                <span className="upload-empty-icon"><ImagePlus size={40} /></span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                <p>点击图片图标上传参考图片</p>
                <span>支持 JPG、PNG 和 WebP，建议使用主体清晰的图片</span>
              </label>
            )}
          </div>
        </section>

        <section className="generation-settings">
          <div>
            <span className="status-label">2 / Style</span>
            <h2>生成风格</h2>
          </div>
          <label className="field-label">
            生成风格
            <select value={style} onChange={(event) => setStyle(event.target.value as AiGenerationStyle)}>
              {generationStyles.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
          </label>
          <div className="style-reference-placeholder" aria-label="风格样式参考预留区域">
            <span>风格样式参考</span>
            <small>后续可在此展示当前风格示例</small>
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button generate-button" onClick={generate} disabled={Boolean(progress)}>
            {progress ? <><Loader2 className="spin" size={18} />{progress.message} {progress.percent}%</> : <><WandSparkles size={18} />生成图纸</>}
          </button>
        </section>
      </section>

    </main>
  );
}
