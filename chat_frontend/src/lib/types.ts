// --- Backend contract types ---

export interface Movie {
  id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  rating: number | null;
}

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output_summary: string;
}

export interface ToolInfo {
  name: string;
  description: string;
}

export interface HealthStatus {
  status: "ok";
  version: string;
  mcp_status: "ok" | "unreachable";
}

export interface ErrorDetail {
  code: string;
  message: string;
}

export interface ErrorEnvelope {
  error: ErrorDetail;
}

// --- SSE event discriminated union ---

export type ChatStreamEvent =
  | { type: "token"; content: string }
  | { type: "movies"; movies: Movie[] }
  | { type: "tool_calls"; tool_calls: ToolCall[] }
  | { type: "error"; code: string; message: string }
  | { type: "done" };

// --- Frontend message model ---

export type MessageStatus = "sent" | "pending" | "streaming" | "complete" | "error";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  tool_calls: ToolCall[];
  movies: Movie[];
  error?: ErrorDetail;
}
