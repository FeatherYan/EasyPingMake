import type { AiGenerationStyle, AiGenerationRequest } from "./types";

export interface GenerationStyleConfig {
  id: AiGenerationStyle;
  label: string;
  prompt: (request: Pick<AiGenerationRequest, "preferredCanvasSize" | "maxColors">) => string;
}

export const generationStyles: GenerationStyleConfig[] = [
  {
    id: "pet-avatar",
    label: "宠物头像",
    prompt: ({ preferredCanvasSize, maxColors }) => [
      "将参考图片中的宠物转换为适合制作拼豆图纸的高度抽象伪像素风格图片。",
      "主体要求：仅保留宠物头部，包括耳朵、脸部、眼睛、鼻子、嘴部和下巴。",
      "不要生成身体、脖子、胸部、四肢、衣物、项圈、牵引绳或复杂背景。",
      "宠物头部完整呈现，主体居中，优先使用正面或接近正面的视角。",
      "保留宠物最有辨识度的特征，包括头部轮廓、耳朵形状、主要毛色分区、脸部花纹、眼睛特征和鼻口区域特征。",
      "去除真实照片中的细小毛发、复杂纹理、照片噪声、写实高光和过细节阴影。",
      `整体抽象程度应参考 ${preferredCanvasSize}×${preferredCanvasSize} 的像素画板。`,
      "如果画板更小，则使用更强的概括和更大的色块，减少细节；如果画板更大，则可以适当保留更多关键花纹和结构，但仍需保持清晰简化。",
      `颜色数量不超过 ${maxColors} 种。`,
      "颜色使用应参考常见拼豆色卡的可用颜色范围，优先使用基础、明确、稳定的颜色。",
      "避免生成超出常见拼豆色卡范围的复杂中间色、脏色、低对比过渡色和难以映射的细微颜色差异。",
      "尽量减少非常接近的相似颜色，不要用多个近似颜色表达同一局部区域。",
      "使用大面积纯色色块表达结构，颜色边界清晰明确，方便后续自动像素化和色卡映射。",
      "避免渐变、模糊、半透明、空气感阴影、细碎高光和噪点。",
      "整体风格应接近低分辨率像素艺术：轮廓简洁、色块清楚、形状明确、便于离散化。",
      "输出无文字、无水印、无边框、无装饰、无网格线。",
    ].join(" "),
  },
];

export function buildGenerationPrompt(style: AiGenerationStyle, request: Pick<AiGenerationRequest, "preferredCanvasSize" | "maxColors">): string {
  const config = generationStyles.find((item) => item.id === style);
  if (!config) {
    throw new Error(`不支持的生成风格：${style}`);
  }
  return config.prompt(request);
}
