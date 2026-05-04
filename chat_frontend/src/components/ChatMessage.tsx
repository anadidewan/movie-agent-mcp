import React from "react";
import type { ReactNode } from "react";
import type { Message } from "../lib/types";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { ToolCallPill } from "./ToolCallPill";
import { MovieStrip } from "./MovieStrip";
import { ErrorBanner } from "./ErrorBanner";

export interface ChatMessageProps {
  message: Message;
  toolRegistry: Map<string, string>;
}

function ChatMessageInner({ message, toolRegistry }: ChatMessageProps): ReactNode {
  const isUser = message.role === "user";

  return (
    <article
      className={`rounded-lg px-4 py-3 ${
        isUser
          ? "ml-auto max-w-[80%] bg-accent text-gray-100"
          : "mr-auto max-w-[80%] bg-gray-800 text-gray-100"
      }`}
    >
      {/* 1. Tool call pills */}
      {message.tool_calls.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {message.tool_calls.map((tc, i) => (
            <ToolCallPill
              key={`${tc.tool}-${i}`}
              toolCall={tc}
              description={toolRegistry.get(tc.tool)}
            />
          ))}
        </div>
      )}

      {/* 2. Message text or thinking indicator */}
      {message.status === "pending" && <ThinkingIndicator />}
      {(message.status === "streaming" ||
        message.status === "complete" ||
        message.status === "sent") &&
        message.content && (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
      {/* Show a subtle note when message completed with no text content */}
      {message.status === "complete" &&
        !message.content &&
        message.tool_calls.length > 0 && (
          <p className="text-sm italic text-gray-400">
            The agent used tools but produced no text response.
          </p>
        )}

      {/* 3. Movie strip */}
      <MovieStrip movies={message.movies} />

      {/* 4. Error banner */}
      {message.status === "error" && (
        <>
          {message.content && (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
          {message.error && <ErrorBanner error={message.error} />}
        </>
      )}
    </article>
  );
}

export const ChatMessage = React.memo(
  ChatMessageInner,
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.content.length === next.message.content.length &&
    prev.message.status === next.message.status &&
    prev.message.tool_calls.length === next.message.tool_calls.length &&
    prev.message.movies.length === next.message.movies.length &&
    prev.message.error?.code === next.message.error?.code
);
