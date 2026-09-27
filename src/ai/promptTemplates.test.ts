import { describe, expect, it } from "vitest";
import { buildGenerationPrompt, buildGenerationPromptStages, generationStyles } from "./promptTemplates";

describe("generation prompt templates", () => {
  it("defines an ordered cartoon-to-pixel-art pipeline with the supplied prompt bodies", () => {
    const stages = buildGenerationPromptStages("pet-avatar");

    expect(generationStyles).toHaveLength(1);
    expect(stages.map((stage) => stage.id)).toEqual(["flat-cartoon", "pixel-art"]);
    expect(stages[0].prompt).toContain("Create a controlled flat-cartoon reconstruction");
    expect(stages[0].prompt).toContain("SUBJECT AND COMPOSITION");
    expect(stages[0].prompt).toContain("stable front-facing design");
    expect(stages[0].prompt).toContain("near-bilateral balance, but do not mirror the design");
    expect(stages[0].prompt).toContain("jaw and chin shape");
    expect(stages[0].prompt).toContain("Do not replace a structurally distinctive contour with a generic circle");
    expect(stages[0].prompt).toContain("approximately 8 to 12 purposeful solid colors");
    expect(stages[0].prompt).not.toContain("5–8 major subject colors");
    expect(stages[0].prompt).toContain("Do not shift gray fur toward beige, brown, or yellow.");
    expect(stages[0].prompt).toContain("Do not globally increase or reduce saturation.");
    expect(stages[0].prompt).toContain("Do not generate pixel art or a visible pixel grid in this stage.");
    expect(stages[0].prompt).not.toContain("Strongly simplify the pet into a small number of large, complete graphic shapes.");
    expect(stages[1].prompt).toContain("Convert the supplied flat-cartoon pet image into highly simplified low-resolution pixel art.");
    expect(stages[1].prompt).toContain("SOURCE FIDELITY");
    expect(stages[1].prompt).toContain("32–40 visual grid cells");
    expect(stages[1].prompt).toContain("Pixelization may change region boundaries and resolution only.");
    expect(generationStyles[0].maxColors).toBe(20);
  });

  it("keeps prompt bodies free of markdown formatting characters", () => {
    const stages = buildGenerationPromptStages("pet-avatar");

    for (const stage of stages) {
      expect(stage.prompt).not.toMatch(/^#{1,6}\s/m);
      expect(stage.prompt).not.toMatch(/^[-+]\s/m);
      expect(stage.prompt).not.toContain("\\");
    }
  });

  it("returns all stage prompts for diagnostics", () => {
    const prompt = buildGenerationPrompt("pet-avatar");

    expect(prompt).toContain("Stage 1: 生成扁平卡通画");
    expect(prompt).toContain("Stage 2: 像素风格化");
  });

  it("rejects an unsupported style", () => {
    expect(() => buildGenerationPromptStages("unknown-style" as never)).toThrow("不支持的生成风格");
  });
});
