import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Message } from "../lib/types";
import { ChatMessage } from "./ChatMessage";

export interface ChatMessageListProps {
  messages: Message[];
  toolRegistry: Map<string, string>;
}

/**
 * Vertically scrolling container with aria-live="polite" for screen reader announcements.
 * Auto-scrolls to bottom as content changes (new messages, streaming tokens, movies, tool calls).
 * Renders ChatMessage for each message in the array.
 */
export function ChatMessageList({ messages, toolRegistry }: ChatMessageListProps): ReactNode {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute a scroll key that changes whenever we should auto-scroll:
  // new messages, content growth on the last message, movies/tool_calls arriving
  const lastMsg = messages[messages.length - 1];
  const scrollKey = lastMsg
    ? `${messages.length}-${lastMsg.content.length}-${lastMsg.status}-${lastMsg.movies.length}-${lastMsg.tool_calls.length}`
    : `${messages.length}`;

  useEffect(() => {
    if (!bottomRef.current || !containerRef.current) return;

    // Only auto-scroll if the user is already near the bottom (within 150px).
    // This prevents hijacking scroll when the user has scrolled up to read history.
    const container = containerRef.current;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    if (distanceFromBottom < 150) {
      bottomRef.current.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [scrollKey]);

  if (messages.length === 0) {
    return (
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
      >
        <p className="mt-12 text-center text-gray-500">
          Send a message to start chatting…
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
      role="log"
      aria-live="polite"
    >
      <div className="space-y-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} toolRegistry={toolRegistry} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
