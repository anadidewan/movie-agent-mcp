import { describe, it, expect } from "vitest";
import { parseSSEStream, parseSegment } from "../sse";
import type { ChatStreamEvent } from "../types";

/** Helper: create a ReadableStream from an array of string chunks. */
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Collect all events from the async generator into an array. */
async function collectEvents(
  stream: ReadableStream<Uint8Array>,
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of parseSSEStream(stream)) {
    events.push(event);
  }
  return events;
}

describe("parseSegment", () => {
  it("parses a valid data segment", () => {
    const result = parseSegment('data: {"type":"token","content":"hi"}');
    expect(result).toEqual({ type: "token", content: "hi" });
  });

  it("returns null for non-data segments", () => {
    expect(parseSegment("event: message")).toBeNull();
    expect(parseSegment("id: 123")).toBeNull();
    expect(parseSegment("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseSegment("data: {not json}")).toBeNull();
  });

  it("handles data: with no space after colon", () => {
    const result = parseSegment('data:{"type":"done"}');
    expect(result).toEqual({ type: "done" });
  });
});

describe("parseSSEStream", () => {
  it("yields events from a single chunk with multiple events", async () => {
    const chunk =
      'data: {"type":"token","content":"Hello"}\n\n' +
      'data: {"type":"token","content":" world"}\n\n' +
      'data: {"type":"done"}\n\n';

    const events = await collectEvents(makeStream([chunk]));

    expect(events).toEqual([
      { type: "token", content: "Hello" },
      { type: "token", content: " world" },
      { type: "done" },
    ]);
  });

  it("buffers split-event chunks correctly", async () => {
    // Split a single event across two chunks
    const chunk1 = 'data: {"type":"tok';
    const chunk2 = 'en","content":"hi"}\n\ndata: {"type":"done"}\n\n';

    const events = await collectEvents(makeStream([chunk1, chunk2]));

    expect(events).toEqual([
      { type: "token", content: "hi" },
      { type: "done" },
    ]);
  });

  it("skips malformed JSON and continues processing", async () => {
    const chunk =
      "data: {bad json}\n\n" +
      'data: {"type":"token","content":"ok"}\n\n' +
      'data: {"type":"done"}\n\n';

    const events = await collectEvents(makeStream([chunk]));

    expect(events).toEqual([
      { type: "token", content: "ok" },
      { type: "done" },
    ]);
  });

  it("yields synthetic done when stream closes without done event", async () => {
    const chunk = 'data: {"type":"token","content":"partial"}\n\n';

    const events = await collectEvents(makeStream([chunk]));

    expect(events).toEqual([
      { type: "token", content: "partial" },
      { type: "done" },
    ]);
  });

  it("does not yield synthetic done when stream includes done event", async () => {
    const chunk =
      'data: {"type":"token","content":"hi"}\n\n' +
      'data: {"type":"done"}\n\n';

    const events = await collectEvents(makeStream([chunk]));

    const doneEvents = events.filter((e) => e.type === "done");
    expect(doneEvents).toHaveLength(1);
  });

  it("handles remaining buffer content after stream closes", async () => {
    // Last event without trailing \n\n
    const chunk = 'data: {"type":"token","content":"tail"}';

    const events = await collectEvents(makeStream([chunk]));

    expect(events).toEqual([
      { type: "token", content: "tail" },
      { type: "done" }, // synthetic done since no done event
    ]);
  });

  it("handles empty stream", async () => {
    const events = await collectEvents(makeStream([]));

    // Should yield synthetic done
    expect(events).toEqual([{ type: "done" }]);
  });

  it("handles movies and tool_calls event types", async () => {
    const chunk =
      'data: {"type":"tool_calls","tool_calls":[{"tool":"search","input":{},"output_summary":"found 3"}]}\n\n' +
      'data: {"type":"movies","movies":[{"id":1,"title":"Test","year":2024,"poster_url":null,"rating":8.5}]}\n\n' +
      'data: {"type":"done"}\n\n';

    const events = await collectEvents(makeStream([chunk]));

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      type: "tool_calls",
      tool_calls: [{ tool: "search", input: {}, output_summary: "found 3" }],
    });
    expect(events[1]).toEqual({
      type: "movies",
      movies: [
        { id: 1, title: "Test", year: 2024, poster_url: null, rating: 8.5 },
      ],
    });
    expect(events[2]).toEqual({ type: "done" });
  });
});
