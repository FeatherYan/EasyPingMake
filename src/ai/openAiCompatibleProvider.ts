import { buildGenerationPromptStages } from "./promptTemplates";
import type { AiGenerationRequest, AiGenerationResult, AiGenerationStageResult, AiImageProvider } from "./types";

const LOCAL_AI_ENDPOINT = "/api/ai/generate";

interface ImageResponseItem {
  b64_json?: string;
  url?: string;
  image?: string;
}

function base64ToBlob(value: string, mimeType = "image/png"): Blob {
  const normalized = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function parseImageResponse(response: Response): Promise<{ image: Blob; rawBody: string }> {
  const rawBody = await response.text();
  let body: { data?: ImageResponseItem[]; image?: string; output?: string; mime_type?: string };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    throw new Error("AI 返回了非 JSON 响应，请检查 Base URL 和图片接口路径是否正确。");
  }
  const item = body.data?.[0];
  const encoded = item?.b64_json ?? body.image;
  if (encoded) {
    return { image: base64ToBlob(encoded, body.mime_type ?? "image/png"), rawBody };
  }

  const imageUrl = item?.url ?? item?.image ?? body.output;
  if (imageUrl) {
    let imageResponse: Response | null = null;
    try {
      imageResponse = await fetch(imageUrl);
      if (imageResponse.ok) {
        return { image: await imageResponse.blob(), rawBody };
      }
    } catch {
      // Cross-origin image URLs commonly fail here. The local proxy below is the fallback.
    }

    try {
      const proxyResponse = await fetch("/api/ai/image-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl }),
      });
      if (proxyResponse.ok) {
        return { image: await proxyResponse.blob(), rawBody };
      }
    } catch {
      // Keep the user-facing error below stable when the local proxy is unavailable.
    }

    throw new Error("AI 返回了图片地址，但浏览器无法读取该地址；请检查中转站图片代理配置。");
  }

  throw new Error("AI 返回结果中没有找到图片数据。");
}

async function generateStageImage(model: string, size: string, prompt: string, sourceImage: Blob, stageId: string): Promise<{ image: Blob; rawBody: string }> {
  const formData = new FormData();
  formData.append("model", model);
  formData.append("prompt", prompt);
  formData.append("size", size);
  formData.append("response_format", "b64_json");
  formData.append("image[]", sourceImage, `${stageId}.png`);

  let response: Response;
  try {
    response = await fetch(LOCAL_AI_ENDPOINT, { method: "POST", body: formData });
  } catch {
    throw new Error("无法连接本地 AI 代理。请确认已重启 npm.cmd run dev，并检查 AI_API_BASE_URL 是否可访问。");
  }
  if (!response.ok) {
    const message = await response.text();
    const error = new Error(`AI 请求失败（${response.status}）：${message.slice(0, 240)}`) as Error & {
      responseBody?: string;
      status?: number;
    };
    error.responseBody = message;
    error.status = response.status;
    throw error;
  }
  return parseImageResponse(response);
}

export const openAiCompatibleProvider: AiImageProvider = {
  id: "openai-compatible-relay",
  async generate(request, onProgress): Promise<AiGenerationResult> {
    const model = import.meta.env.VITE_AI_IMAGE_MODEL;
    const size = import.meta.env.VITE_AI_IMAGE_SIZE || "1024x1024";
    if (!model) {
      throw new Error("尚未配置 VITE_AI_IMAGE_MODEL，请在项目根目录 .env.local 中填写模型名称。");
    }

    const promptStages = buildGenerationPromptStages(request.style);
    let stageInput = request.sourceImage;
    const stageResults: AiGenerationStageResult[] = [];

    for (const [index, stage] of promptStages.entries()) {
      const isFirstStage = index === 0;
      onProgress?.({
        stage: isFirstStage ? "uploading" : "generating",
        percent: isFirstStage ? 20 : 55,
        message: isFirstStage ? "正在生成扁平卡通画" : "正在将卡通画像素风格化",
      });

      const result = await generateStageImage(model, size, stage.prompt, stageInput, stage.id);
      stageInput = result.image;
      stageResults.push({ id: stage.id, label: stage.label, image: result.image, rawResponse: result.rawBody });

      onProgress?.({
        stage: "generating",
        percent: index === promptStages.length - 1 ? 78 : 48,
        message: index === promptStages.length - 1 ? "像素风格化完成" : "扁平卡通画完成，准备像素风格化",
      });
    }

    onProgress?.({ stage: "processing", percent: 85, message: "准备真实像素还原" });
    const finalStage = stageResults.at(-1);
    if (!finalStage) {
      throw new Error("当前生成风格没有配置 AI 生成阶段。");
    }
    return {
      image: finalStage.image,
      providerId: "openai-compatible-relay",
      stages: stageResults,
      rawResponse: finalStage.rawResponse,
    };
  },
};
