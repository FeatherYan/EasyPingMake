import type { AiGenerationRequest, AiGenerationResult, AiImageProvider } from "./types";

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("演示生成图片失败。")), "image/png");
  });
}

export const demoAiProvider: AiImageProvider = {
  id: "local-demo",
  async generate(request, onProgress): Promise<AiGenerationResult> {
    onProgress?.({ stage: "uploading", percent: 20, message: "读取参考图片" });
    if (typeof createImageBitmap !== "function") {
      throw new Error("当前浏览器不支持本地图片生成演示。");
    }

    const bitmap = await createImageBitmap(request.sourceImage);
    const nativeGridSize = Math.max(12, Math.min(64, Math.round(request.preferredCanvasSize * 0.6)));
    const pixelCanvas = document.createElement("canvas");
    pixelCanvas.width = nativeGridSize;
    pixelCanvas.height = nativeGridSize;
    const pixelContext = pixelCanvas.getContext("2d");
    if (!pixelContext) {
      bitmap.close();
      throw new Error("无法创建本地生成画布。");
    }

    onProgress?.({ stage: "generating", percent: 55, message: "生成本地伪像素预览" });
    pixelContext.imageSmoothingEnabled = true;
    pixelContext.drawImage(bitmap, 0, 0, nativeGridSize, nativeGridSize);
    bitmap.close();

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = 512;
    outputCanvas.height = 512;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) {
      throw new Error("无法创建本地生成结果画布。");
    }
    outputContext.imageSmoothingEnabled = false;
    outputContext.drawImage(pixelCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
    onProgress?.({ stage: "processing", percent: 85, message: "准备真实像素还原" });

    return {
      image: await canvasToBlob(outputCanvas),
      providerId: "local-demo",
      nativeGridHint: { columns: nativeGridSize, rows: nativeGridSize },
    };
  },
};
