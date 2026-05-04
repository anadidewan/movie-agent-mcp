import { useState } from "react";
import type { ToolCall } from "../lib/types";

export interface ToolCallPillProps {
  toolCall: ToolCall;
  description?: string;
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]*[.!?]/);
  return match ? match[0] : text;
}

export function ToolCallPill({ toolCall, description }: ToolCallPillProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        🔧 {toolCall.tool} — {firstSentence(toolCall.output_summary)}
      </button>

      {expanded && (
        <div className="mt-1 rounded-lg bg-gray-900 p-3 text-sm">
          <p className="font-mono text-gray-200">{toolCall.tool}</p>
          {description && (
            <p className="mt-1 text-gray-400">{description}</p>
          )}
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-gray-950 p-2 font-mono text-xs text-gray-300">
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
          <p className="mt-2 text-gray-300">{toolCall.output_summary}</p>
        </div>
      )}
    </div>
  );
}
