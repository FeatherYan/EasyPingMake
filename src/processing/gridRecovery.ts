import type { GridRecoveryAdapter, GridRecoveryAttempt, GridRecoveryOptions, GridRecoveryResult, RgbaImage } from "./types";

export async function recoverWithBestAdapter(
  image: RgbaImage,
  options: GridRecoveryOptions,
  adapters: GridRecoveryAdapter[],
): Promise<GridRecoveryResult> {
  if (!adapters.length) {
    throw new Error("至少需要一个像素网格还原适配器。");
  }

  const outcomes = await Promise.all(adapters.map(async (adapter): Promise<{
    attempt: GridRecoveryAttempt;
    result?: GridRecoveryResult;
  }> => {
    try {
      const result = await adapter.recover(image, options);
      return {
        result,
        attempt: {
          adapterId: adapter.id,
          status: "fulfilled",
          geometry: result.geometry,
          grid: result.grid,
          diagnostics: result.diagnostics,
        },
      };
    } catch (error) {
      return {
        attempt: {
          adapterId: adapter.id,
          status: "rejected",
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }));
  const attempts = outcomes.map(({ attempt }) => attempt);
  const successful = outcomes.flatMap(({ result }) => result ? [result] : []);

  if (!successful.length) {
    throw new Error("无法从生成图片中还原真实像素网格。");
  }

  const selected = successful.sort((a, b) => {
    const confidenceA = a.diagnostics.confidence ?? a.geometry.confidence ?? -1;
    const confidenceB = b.diagnostics.confidence ?? b.geometry.confidence ?? -1;
    return confidenceB - confidenceA;
  })[0];

  return { ...selected, attempts };
}
