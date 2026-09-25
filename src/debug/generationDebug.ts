import { loadMard221Palette } from "../domain/palette";
import type { PixelGrid } from "../domain/pattern";
import { canvasToPngBlob } from "../image/browserImage";
import type { RasterGrid } from "../processing/types";

export interface DebugArtifactSummary {
  filename: string;
  mimeType: string;
  byteSize: number;
  description: string;
  createdAt: string;
}

export interface DebugSessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "completed" | "failed";
  metadata: Record<string, unknown>;
  artifacts: DebugArtifactSummary[];
  error?: string;
}

export interface DebugSessionUpdate {
  status?: DebugSessionRecord["status"];
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface DebugArtifactInput {
  filename: string;
  blob: Blob;
  description: string;
}

async function readError(response: Response): Promise<string> {
  const body = await response.text();
  if (!body) {
    return `${response.status} ${response.statusText}`.trim();
  }

  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    // 非 JSON 错误响应直接使用响应正文。
  }
  return body.slice(0, 300);
}

async function expectOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    throw new Error(`${action}失败：${await readError(response)}`);
  }
}

export async function createDebugSession(metadata: Record<string, unknown>): Promise<DebugSessionRecord> {
  const response = await fetch("/api/debug/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata }),
  });
  await expectOk(response, "创建调试会话");
  return response.json() as Promise<DebugSessionRecord>;
}

export async function saveDebugArtifact(sessionId: string, artifact: DebugArtifactInput): Promise<void> {
  const path = `/api/debug/session/${encodeURIComponent(sessionId)}/artifact/${encodeURIComponent(artifact.filename)}`;
  const query = new URLSearchParams({ description: artifact.description });
  const response = await fetch(`${path}?${query}`, {
    method: "PUT",
    headers: { "Content-Type": artifact.blob.type || "application/octet-stream" },
    body: artifact.blob,
  });
  await expectOk(response, `保存调试文件 ${artifact.filename}`);
}

export async function updateDebugSession(sessionId: string, patch: DebugSessionUpdate): Promise<void> {
  const response = await fetch(`/api/debug/session/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  await expectOk(response, "更新调试会话");
}

function createGridCanvas(width: number, height: number): { canvas: HTMLCanvasElement; imageData: ImageData } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("调试网格尺寸必须是正整数。");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器无法创建调试图片画布。");
  }
  return { canvas, imageData: context.createImageData(width, height) };
}

function finishGridCanvas(canvas: HTMLCanvasElement, imageData: ImageData): Promise<Blob> {
  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("当前浏览器无法写入调试图片画布。"));
  }
  context.putImageData(imageData, 0, 0);
  return canvasToPngBlob(canvas);
}

function setPixel(data: Uint8ClampedArray, index: number, red: number, green: number, blue: number, alpha: number): void {
  const offset = index * 4;
  data[offset] = red;
  data[offset + 1] = green;
  data[offset + 2] = blue;
  data[offset + 3] = alpha;
}

function parseHexColor(hex: string): [number, number, number] {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    throw new Error(`无效的色板颜色：${hex}`);
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

export async function renderRasterGridToPng(grid: RasterGrid): Promise<Blob> {
  if (grid.cells.length !== grid.height || grid.cells.some((row) => row.length !== grid.width)) {
    throw new Error("RGBA 网格数据与声明的宽高不一致。");
  }

  const { canvas, imageData } = createGridCanvas(grid.width, grid.height);
  grid.cells.forEach((row, y) => {
    row.forEach((color, x) => {
      if (color) {
        setPixel(imageData.data, y * grid.width + x, color.r, color.g, color.b, color.a);
      }
    });
  });
  return finishGridCanvas(canvas, imageData);
}

export async function renderPixelGridToPng(grid: PixelGrid): Promise<Blob> {
  if (grid.cells.length !== grid.height || grid.cells.some((row) => row.length !== grid.width)) {
    throw new Error("色号网格数据与声明的宽高不一致。");
  }

  const palette = new Map(loadMard221Palette().map((color) => [color.code, parseHexColor(color.hex)]));
  const { canvas, imageData } = createGridCanvas(grid.width, grid.height);
  grid.cells.forEach((row, y) => {
    row.forEach((code, x) => {
      if (!code) {
        return;
      }
      const color = palette.get(code);
      if (!color) {
        throw new Error(`未找到 MARD221 色号：${code}`);
      }
      setPixel(imageData.data, y * grid.width + x, color[0], color[1], color[2], 255);
    });
  });
  return finishGridCanvas(canvas, imageData);
}
