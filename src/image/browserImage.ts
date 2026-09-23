import type { RgbaImage } from "../processing/types";

export interface ImageTransform {
  rotation: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  cropToSquare: boolean;
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
  const sourceSize = transform.cropToSquare ? Math.min(bitmap.width, bitmap.height) : undefined;
  const sourceX = sourceSize ? (bitmap.width - sourceSize) / 2 : 0;
  const sourceY = sourceSize ? (bitmap.height - sourceSize) / 2 : 0;
  const sourceWidth = sourceSize ?? bitmap.width;
  const sourceHeight = sourceSize ?? bitmap.height;
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
  context.scale(transform.flipHorizontal ? -1 : 1, 1);
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
