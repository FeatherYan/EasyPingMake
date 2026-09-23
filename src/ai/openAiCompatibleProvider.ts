import { buildGenerationPrompt } from "./promptTemplates";
import type { AiGenerationRequest, AiGenerationResult, AiImageProvider } from "./types";

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
    let imageResponse: Response;
    try {
      imageResponse = await fetch(imageUrl);
    } catch {
      throw new Error("AI 返回了图片地址，但浏览器无法读取该地址；请让中转站返回 b64_json，或配置图片代理。");
    }
    if (!imageResponse.ok) {
      throw new Error("AI 返回的图片地址无法读取。");
    }
    return { image: await imageResponse.blob(), rawBody };
  }

  throw new Error("AI 返回结果中没有找到图片数据。");
}

export const openAiCompatibleProvider: AiImageProvider = {
  id: "openai-compatible-relay",
  async generate(request, onProgress): Promise<AiGenerationResult> {
    const model = import.meta.env.VITE_AI_IMAGE_MODEL;
    const size = import.meta.env.VITE_AI_IMAGE_SIZE || "1024x1024";
    if (!model) {
      throw new Error("尚未配置 VITE_AI_IMAGE_MODEL，请在项目根目录 .env.local 中填写模型名称。" );
    }

    const prompt = buildGenerationPrompt(request.style, request);
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", prompt);
    formData.append("size", size);
    formData.append("image[]", request.sourceImage, "reference.png");

    onProgress?.({ stage: "uploading", percent: 20, message: "上传参考图片" });
    let response: Response;
    try {
      response = await fetch(LOCAL_AI_ENDPOINT, { method: "POST", body: formData });
    } catch {
      throw new Error("无法连接本地 AI 代理。请确认已重启 npm.cmd run dev，并检查 AI_API_BASE_URL 是否可访问。");
    }
    onProgress?.({ stage: "generating", percent: 60, message: "AI 正在生成伪像素图" });
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

    const parsed = await parseImageResponse(response);
    onProgress?.({ stage: "processing", percent: 85, message: "准备真实像素还原" });
    return { image: parsed.image, providerId: "openai-compatible-relay", rawResponse: parsed.rawBody };
  },
};
