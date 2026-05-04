import type { ReactNode } from "react";

/**
 * Pulsing "Thinking…" text displayed when an assistant message status is "pending".
 * Replaced by message content when the first token event arrives.
 */
export function ThinkingIndicator(): ReactNode {
  return (
    <span className="animate-pulse text-gray-400" aria-label="Agent is thinking">
      Thinking…
    </span>
  );
}
