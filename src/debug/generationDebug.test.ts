import { afterEach, describe, expect, it, vi } from "vitest";
import { createDebugSession, renderRasterGridToPng, saveDebugArtifact, updateDebugSession } from "./generationDebug";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generation debug API", () => {
  it("creates, updates, and uploads artifacts through the local debug endpoints", async () => {
    const session = {
      id: "generation-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "running" as const,
      metadata: {},
      artifacts: [],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createDebugSession({ model: "test" })).resolves.toEqual(session);
    await saveDebugArtifact(session.id, {
      filename: "result.png",
      blob: new Blob(["png"], { type: "image/png" }),
      description: "测试图片",
    });
    await updateDebugSession(session.id, { status: "completed" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/debug/session", expect.objectContaining({ method: "POST" }));
    expect(fetchMock.mock.calls[1][0]).toContain("/api/debug/session/generation-1/artifact/result.png?description=");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/debug/session/generation-1", expect.objectContaining({ method: "PATCH" }));
  });
});

describe("debug grid rendering", () => {
  it("writes RGBA grid cells into a PNG canvas", async () => {
    const putImageData = vi.fn();
    let renderedData: Uint8ClampedArray | undefined;
    const context = {
      createImageData(width: number, height: number) {
        return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData;
      },
      putImageData(imageData: ImageData) {
        renderedData = imageData.data;
        putImageData(imageData, 0, 0);
      },
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" }))),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });

    const result = await renderRasterGridToPng({
      width: 2,
      height: 1,
      cells: [[{ r: 10, g: 20, b: 30, a: 255 }, null]],
    });

    expect(result.type).toBe("image/png");
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect(Array.from(renderedData ?? [])).toEqual([10, 20, 30, 255, 0, 0, 0, 0]);
    expect(putImageData).toHaveBeenCalledOnce();
  });
});
