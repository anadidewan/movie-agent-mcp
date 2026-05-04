import type { ErrorDetail } from "../lib/types";

export interface ErrorBannerProps {
  error: ErrorDetail;
}

const ERROR_MESSAGES: Record<string, string> = {
  LLM_ERROR: "The AI service had an issue — try again.",
  MCP_UNAVAILABLE:
    "The movie data service is unavailable — try again in a moment.",
  VALIDATION_ERROR: "Something went wrong with your request.",
};

export function ErrorBanner({ error }: ErrorBannerProps) {
  const message =
    ERROR_MESSAGES[error.code] ?? "Unexpected error. Try again.";

  return (
    <p className="bg-red-900/30 text-red-300 rounded-md px-3 py-2 text-sm mt-2">
      {message}
    </p>
  );
}
