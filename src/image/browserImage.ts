import type { RgbaImage } from "../processing/types";

export interface ImageTransform {
  rotation: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  flipVertical: boolean;
  cropToSquare: boolean;
  crop?: ImageCrop | null;
}

export interface ImageCrop {
  /** Normalized crop origin and size, each constrained to the range 0..1. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropHandle = "nw" | "ne" | "sw" | "se";
export const MIN_IMAGE_CROP_SIZE = 0.12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Updates a normalized crop rectangle from a move or corner resize gesture. */
export function updateImageCrop(
  origin: ImageCrop,
  mode: "move" | "resize",
  handle: CropHandle | undefined,
  deltaX: number,
  deltaY: number,
): ImageCrop {
  if (mode === "move") {
    return {
      ...origin,
      x: clamp(origin.x + deltaX, 0, 1 - origin.width),
      y: clamp(origin.y + deltaY, 0, 1 - origin.height),
    };
  }

  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;
  if (handle?.includes("w")) left = clamp(origin.x + deltaX, 0, right - MIN_IMAGE_CROP_SIZE);
  if (handle?.includes("e")) right = clamp(origin.x + origin.width + deltaX, left + MIN_IMAGE_CROP_SIZE, 1);
  if (handle?.includes("n")) top = clamp(origin.y + deltaY, 0, bottom - MIN_IMAGE_CROP_SIZE);
  if (handle?.includes("s")) bottom = clamp(origin.y + origin.height + deltaY, top + MIN_IMAGE_CROP_SIZE, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function createCenteredSquareCrop(width: number, height: number): ImageCrop {
  if (width <= 0 || height <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  if (width >= height) {
    const cropWidth = height / width;
    return { x: (1 - cropWidth) / 2, y: 0, width: cropWidth, height: 1 };
  }
  const cropHeight = width / height;
  return { x: 0, y: (1 - cropHeight) / 2, width: 1, height: cropHeight };
}

function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    return Promise.reject(new Error("当前浏览器不支持图片解码。"));
  }

  return createImageBitmap(blob);
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("图片处理失败，无法生成图片数据。"));
      }
    }, "image/png");
  });
}

export async function transformImageBlob(blob: Blob, transform: ImageTransform): Promise<Blob> {
  const bitmap = await loadBitmap(blob);
  const crop = transform.crop ?? (transform.cropToSquare ? createCenteredSquareCrop(bitmap.width, bitmap.height) : { x: 0, y: 0, width: 1, height: 1 });
  const cropX = Math.max(0, Math.min(1, crop.x));
  const cropY = Math.max(0, Math.min(1, crop.y));
  const cropWidth = Math.max(0.01, Math.min(1 - cropX, crop.width));
  const cropHeight = Math.max(0.01, Math.min(1 - cropY, crop.height));
  const sourceX = Math.round(cropX * bitmap.width);
  const sourceY = Math.round(cropY * bitmap.height);
  const sourceWidth = Math.max(1, Math.round(cropWidth * bitmap.width));
  const sourceHeight = Math.max(1, Math.round(cropHeight * bitmap.height));
  const isQuarterTurn = transform.rotation === 90 || transform.rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = isQuarterTurn ? sourceHeight : sourceWidth;
  canvas.height = isQuarterTurn ? sourceWidth : sourceHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器无法创建图片处理画布。");
  }

  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.scale(transform.flipHorizontal ? -1 : 1, transform.flipVertical ? -1 : 1);
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
  context.restore();
  bitmap.close();

  return canvasToPngBlob(canvas);
}

export function encodeRgbaImageToPng(image: RgbaImage): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("当前浏览器无法创建图像调试画布"));
  }

  const imageData = context.createImageData(image.width, image.height);
  imageData.data.set(image.data);
  context.putImageData(imageData, 0, 0);
  return canvasToPngBlob(canvas);
}

export async function decodeImageBlob(blob: Blob): Promise<RgbaImage> {
  const bitmap = await loadBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("当前浏览器无法读取图片像素。");
  }

  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}
