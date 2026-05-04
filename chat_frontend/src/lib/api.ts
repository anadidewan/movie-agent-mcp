import type { ErrorEnvelope, HealthStatus, ToolInfo } from "./types";

const BASE_URL = import.meta.env.VITE_AGENT_BASE_URL ?? "http://localhost:8000";

/**
 * Typed API error with code for error banner mapping.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;

  constructor(status: number, code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/**
 * POST /chat — returns a ReadableStream for SSE consumption.
 * Throws ApiError on non-200 HTTP status (pre-stream error).
 */
export async function postChatStream(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    const envelope: ErrorEnvelope = await res.json();
    throw new ApiError(res.status, envelope.error.code, envelope.error.message);
  }

  if (!res.body) {
    throw new ApiError(0, "NO_BODY", "Response body is null");
  }

  return res.body;
}

/**
 * GET /tools — returns the list of registered tools.
 */
export async function fetchTools(): Promise<ToolInfo[]> {
  const res = await fetch(`${BASE_URL}/tools`);
  if (!res.ok) throw new ApiError(res.status, "TOOLS_ERROR", "Failed to fetch tools");
  const data = await res.json();
  return data.tools;
}

/**
 * GET /health — returns backend health status.
 */
export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new ApiError(res.status, "HEALTH_ERROR", "Health check failed");
  return res.json();
}
