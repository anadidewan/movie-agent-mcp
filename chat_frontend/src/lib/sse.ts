import type { ChatStreamEvent } from "./types";

/**
 * Parse a single SSE segment (text between \n\n boundaries) into a ChatStreamEvent.
 * Returns null for malformed or non-data segments.
 */
export function parseSegment(segment: string): ChatStreamEvent | null {
  const trimmed = segment.trim();
  if (!trimmed.startsWith("data:")) return null;

  const jsonStr = trimmed.slice("data:".length).trim();
  try {
    return JSON.parse(jsonStr) as ChatStreamEvent;
  } catch {
    return null; // Skip malformed JSON
  }
}

/**
 * Parse an SSE ReadableStream into a sequence of ChatStreamEvent objects.
 *
 * - Buffers partial chunks until a complete event (terminated by \n\n) is found.
 * - Handles multi-event chunks by splitting and yielding each separately.
 * - Skips malformed JSON without throwing.
 * - Signals implicit termination when the stream closes without a done event.
 *
 * @param stream - The raw byte stream from fetch response.body
 * @yields ChatStreamEvent objects in order
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatStreamEvent, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const segments = buffer.split("\n\n");
      // Last segment is either empty (if buffer ended with \n\n) or incomplete
      buffer = segments.pop() ?? "";

      for (const segment of segments) {
        const event = parseSegment(segment);
        if (event) {
          if (event.type === "done") receivedDone = true;
          yield event;
        }
      }
    }

    // Process any remaining buffer content
    if (buffer.trim()) {
      const event = parseSegment(buffer);
      if (event) {
        if (event.type === "done") receivedDone = true;
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Signal implicit termination if stream closed without done event
  if (!receivedDone) {
    yield { type: "done" } as ChatStreamEvent;
  }
}
