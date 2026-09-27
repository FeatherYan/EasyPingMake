import type { CanvasPreset } from "../domain/pattern";

export type AiGenerationStyle = "pet-avatar";

export interface AiGenerationRequest {
  sourceImage: Blob;
  style: AiGenerationStyle;
  preferredCanvasSize: CanvasPreset;
  paletteId: "MARD291";
}

export interface AiGenerationProgress {
  stage: "uploading" | "generating" | "processing";
  percent: number;
  message: string;
}

export interface AiGenerationResult {
  image: Blob;
  providerId: string;
  /** Images and raw responses for each AI generation stage, in execution order. */
  stages?: AiGenerationStageResult[];
  /** Optional prior from a provider; the converter must still validate/recover the grid. */
  nativeGridHint?: {
    columns: number;
    rows: number;
  };
  rawResponse?: string;
}

export interface AiGenerationStageResult {
  id: string;
  label: string;
  image: Blob;
  rawResponse?: string;
}

export type AiProgressListener = (progress: AiGenerationProgress) => void;

export interface AiImageProvider {
  id: string;
  generate(request: AiGenerationRequest, onProgress?: AiProgressListener): Promise<AiGenerationResult>;
}
