import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

interface DebugArtifactSummary {
  filename: string;
  mimeType: string;
  byteSize: number;
  description: string;
  createdAt: string;
}

interface DebugSessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "completed" | "failed";
  metadata: Record<string, unknown>;
  artifacts: DebugArtifactSummary[];
  error?: string;
}

interface PerfectPixelRunnerResult {
  width: number;
  height: number;
  imageBase64: string;
  logs?: string[];
}

const debugRoot = path.resolve(process.cwd(), "debug", "generations");
const sessionManifest = "session.json";

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        reject(new Error("debug request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function isSafeSegment(value: string, filename = false): boolean {
  if (filename) {
    return value.length > 0 && value.length < 180 && value !== "." && value !== ".." && !value.includes("..") && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
  }
  return /^[A-Za-z0-9_-]{1,160}$/.test(value);
}

function sessionDirectory(sessionId: string): string {
  return path.join(debugRoot, sessionId);
}

async function readSession(sessionId: string): Promise<DebugSessionRecord | null> {
  try {
    return JSON.parse(await readFile(path.join(sessionDirectory(sessionId), sessionManifest), "utf8")) as DebugSessionRecord;
  } catch {
    return null;
  }
}

async function writeSession(session: DebugSessionRecord): Promise<void> {
  await writeFile(path.join(sessionDirectory(session.id), sessionManifest), JSON.stringify(session, null, 2), "utf8");
}

function runPerfectPixel(image: Buffer, configuredPython?: string): Promise<PerfectPixelRunnerResult> {
  return new Promise((resolve, reject) => {
    const runnerPath = path.resolve(process.cwd(), "scripts", "perfect_pixel_runner.py");
    const pythonProject = path.resolve(process.cwd(), "python");
    const command = configuredPython || (process.platform === "win32" ? "uv.exe" : "uv");
    const args = configuredPython ? [runnerPath] : ["run", "--project", pythonProject, "python", runnerPath];
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new Error("PerfectPixel 处理超时（超过 120 秒）。"));
    }, 120_000);

    child.stdout.on("data", (chunk: Buffer | string) => stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.stderr.on("data", (chunk: Buffer | string) => stderr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const errorOutput = Buffer.concat(stderr).toString("utf8").trim();
      const resultOutput = Buffer.concat(stdout).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(errorOutput || `PerfectPixel 进程退出，状态码：${code ?? "unknown"}`));
        return;
      }
      try {
        const result = JSON.parse(resultOutput) as Partial<PerfectPixelRunnerResult>;
        if (typeof result.width !== "number" || typeof result.height !== "number" || typeof result.imageBase64 !== "string") {
          throw new Error("PerfectPixel 运行器返回的数据不完整。");
        }
        resolve({
          width: result.width,
          height: result.height,
          imageBase64: result.imageBase64,
          logs: Array.isArray(result.logs) ? result.logs.filter((log): log is string => typeof log === "string") : [],
        });
      } catch (error) {
        reject(new Error(`无法解析 PerfectPixel 输出：${error instanceof Error ? error.message : String(error)}`));
      }
    });

    child.stdin.end(JSON.stringify({
      imageBase64: image.toString("base64"),
      sampleMethod: "center",
    }));
  });
}

function perfectPixelPlugin(configuredPython?: string): Plugin {
  return {
    name: "easypingmake-perfect-pixel",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?", 1)[0] !== "/api/pixelize/perfect-pixel" || request.method !== "POST") {
          next();
          return;
        }

        try {
          const image = await readBody(request, 20 * 1024 * 1024);
          const result = await runPerfectPixel(image, configuredPython);
          sendJson(response, 200, result);
        } catch (error) {
          sendJson(response, 502, {
            error: error instanceof Error ? error.message : "PerfectPixel 处理失败。",
          });
        }
      });
    },
  };
}

function generationDebugFilePlugin(): Plugin {
  return {
    name: "easypingmake-generation-debug-files",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        const pathname = requestUrl.pathname;

        if (pathname === "/api/debug/session" && request.method === "POST") {
          try {
            const payload = JSON.parse((await readBody(request, 2 * 1024 * 1024)).toString("utf8")) as { metadata?: Record<string, unknown> };
            const id = `generation-${Date.now()}-${randomUUID()}`;
            const now = new Date().toISOString();
            const session: DebugSessionRecord = {
              id,
              createdAt: now,
              updatedAt: now,
              status: "running",
              metadata: payload.metadata ?? {},
              artifacts: [],
            };
            await mkdir(sessionDirectory(id), { recursive: true });
            await writeSession(session);
            sendJson(response, 201, session);
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid debug session" });
          }
          return;
        }

        const artifactMatch = /^\/api\/debug\/session\/([^/]+)\/artifact\/([^/]+)$/.exec(pathname);
        if (artifactMatch && request.method === "PUT") {
          const sessionId = decodeURIComponent(artifactMatch[1]);
          const filename = decodeURIComponent(artifactMatch[2]);
          if (!isSafeSegment(sessionId) || !isSafeSegment(filename, true)) {
            sendJson(response, 400, { error: "invalid debug path" });
            return;
          }
          try {
            const session = await readSession(sessionId);
            if (!session) {
              sendJson(response, 404, { error: "debug session not found" });
              return;
            }
            const body = await readBody(request, 100 * 1024 * 1024);
            await writeFile(path.join(sessionDirectory(sessionId), filename), body);
            const summary: DebugArtifactSummary = {
              filename,
              mimeType: String(request.headers["content-type"] ?? "application/octet-stream"),
              byteSize: body.byteLength,
              description: requestUrl.searchParams.get("description") ?? "",
              createdAt: new Date().toISOString(),
            };
            session.artifacts = [...session.artifacts.filter((artifact) => artifact.filename !== filename), summary]
              .sort((a, b) => a.filename.localeCompare(b.filename));
            session.updatedAt = new Date().toISOString();
            await writeSession(session);
            sendJson(response, 200, { ok: true });
          } catch (error) {
            sendJson(response, 500, { error: error instanceof Error ? error.message : "unable to save debug artifact" });
          }
          return;
        }

        const sessionMatch = /^\/api\/debug\/session\/([^/]+)$/.exec(pathname);
        if (sessionMatch && request.method === "PATCH") {
          const sessionId = decodeURIComponent(sessionMatch[1]);
          if (!isSafeSegment(sessionId)) {
            sendJson(response, 400, { error: "invalid debug session" });
            return;
          }
          try {
            const session = await readSession(sessionId);
            if (!session) {
              sendJson(response, 404, { error: "debug session not found" });
              return;
            }
            const patch = JSON.parse((await readBody(request, 2 * 1024 * 1024)).toString("utf8")) as Partial<DebugSessionRecord>;
            if (patch.status === "running" || patch.status === "completed" || patch.status === "failed") {
              session.status = patch.status;
            }
            if (patch.metadata && typeof patch.metadata === "object") {
              session.metadata = patch.metadata;
            }
            if (typeof patch.error === "string") {
              session.error = patch.error;
            }
            session.updatedAt = new Date().toISOString();
            await writeSession(session);
            sendJson(response, 200, { ok: true });
          } catch (error) {
            sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid debug update" });
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, ".", "");
  const aiTarget = environment.AI_API_BASE_URL;
  const aiEndpoint = environment.AI_IMAGE_ENDPOINT || "/v1/images/edits";
  const apiKey = environment.AI_API_KEY;
  const keyHeader = environment.AI_API_KEY_HEADER || "Authorization";
  const keyPrefix = environment.AI_API_KEY_PREFIX ?? "Bearer";

  const endpointUrl = aiTarget ? new URL(aiEndpoint, aiTarget) : null;

  return {
    plugins: [
      react(),
      perfectPixelPlugin(environment.PERFECT_PIXEL_PYTHON || process.env.PERFECT_PIXEL_PYTHON),
      generationDebugFilePlugin(),
    ],
    server: endpointUrl ? {
      proxy: {
        "/api/ai/generate": {
          target: endpointUrl.origin,
          changeOrigin: true,
          rewrite: () => `${endpointUrl.pathname}${endpointUrl.search}`,
          headers: apiKey ? { [keyHeader]: keyPrefix ? `${keyPrefix} ${apiKey}` : apiKey } : {},
        },
      },
    } : undefined,
  };
});
