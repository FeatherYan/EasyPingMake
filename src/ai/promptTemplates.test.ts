import { describe, expect, it } from "vitest";
import { buildGenerationPrompt, generationStyles } from "./promptTemplates";

describe("generation prompt templates", () => {
  it("builds the pet avatar prompt from generation parameters", () => {
    const prompt = buildGenerationPrompt("pet-avatar", { preferredCanvasSize: 78, maxColors: 24 });

    expect(prompt).toContain("参考图片中的宠物");
    expect(prompt).toContain("仅保留宠物头部");
    expect(prompt).toContain("不要生成身体、脖子、胸部、四肢");
    expect(prompt).toContain("大面积纯色色块");
    expect(prompt).toContain("无水印、无边框、无装饰、无网格线");
    expect(prompt).toContain("78×78");
    expect(prompt).toContain("24");
    expect(generationStyles).toHaveLength(1);
  });

  it("rejects an unsupported style", () => {
    expect(() => buildGenerationPrompt("unknown-style" as never, { preferredCanvasSize: 52, maxColors: 20 })).toThrow("不支持的生成风格");
  });
});
