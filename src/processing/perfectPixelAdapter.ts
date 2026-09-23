import { decodeImageBlob, encodeRgbaImageToPng } from "../image/browserImage";
import { removeConnectedBackground } from "./backgroundRemoval";
import { sampleRasterGrid } from "./rasterGrid";
import type { GridRecoveryAdapter, GridRecoveryOptions, GridRecoveryResult, RgbaImage } from "./types";

const ENDPOINT = "/api/pixelize/perfect-pixel";

interface PerfectPixelResponse {
  width: number;
  height: number;
  imageBase64: string;
  logs?: string[];
}

function decodeBase64Png(value: string): Blob {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "image/png" });
}

async function requestPerfectPixel(image: RgbaImage): Promise<PerfectPixelResponse> {
  const inputPng = await encodeRgbaImageToPng(image);
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: inputPng,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`PerfectPixel 转换失败（${response.status}）：${message || response.statusText}`);
  }

  const result = await response.json() as Partial<PerfectPixelResponse>;
  if (typeof result.imageBase64 !== "string" || !result.imageBase64 || typeof result.width !== "number" || typeof result.height !== "number" || !Number.isInteger(result.width) || !Number.isInteger(result.height)) {
    throw new Error("PerfectPixel 返回的数据不完整。");
  }
  return {
    width: result.width,
    height: result.height,
    imageBase64: result.imageBase64,
    logs: Array.isArray(result.logs) ? result.logs.filter((log): log is string => typeof log === "string") : [],
  };
}

/** Uses the local PerfectPixel runtime to turn a pseudo-pixel image into a true pixel grid. */
export const perfectPixelAdapter: GridRecoveryAdapter = {
  id: "perfectPixel",
  async recover(image, options: GridRecoveryOptions): Promise<GridRecoveryResult> {
    // The shared recovery input may have transparent background pixels. For this
    // first integration version, PerfectPixel receives the original opaque raster
    // and treats it as an ordinary RGB image.
    const inputImage = options.sourceImage ?? image;
    const response = await requestPerfectPixel(inputImage);
    const decoded = await decodeImageBlob(decodeBase64Png(response.imageBase64));
    if (decoded.width !== response.width || decoded.height !== response.height) {
      throw new Error("PerfectPixel 返回的图像尺寸与元数据不一致。");
    }

    const backgroundRemoval = removeConnectedBackground(decoded);
    const processedImage = backgroundRemoval.image;
    const geometry = {
      columns: processedImage.width,
      rows: processedImage.height,
      xEdges: Array.from({ length: processedImage.width + 1 }, (_, index) => index),
      yEdges: Array.from({ length: processedImage.height + 1 }, (_, index) => index),
      confidence: 0.95,
      detectorId: "perfectPixel",
    };

    return {
      geometry,
      grid: sampleRasterGrid(processedImage, geometry),
      processedImage,
      diagnostics: {
        detectorId: "perfectPixel",
        confidence: 0.95,
        metadata: {
          outputWidth: response.width,
          outputHeight: response.height,
          logs: response.logs ?? [],
          removedPixelCount: backgroundRemoval.removedPixelCount,
          backgroundColor: backgroundRemoval.backgroundColor,
        },
      },
    };
  },
};
