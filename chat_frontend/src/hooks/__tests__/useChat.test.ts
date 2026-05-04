import { describe, it, expect } from "vitest";
import { chatReducer } from "../useChat";
import type { ChatState, ChatAction } from "../useChat";
import type { Message } from "../../lib/types";

function emptyState(): ChatState {
  return { messages: [], isStreaming: false };
}

function stateWithPendingAssistant(): ChatState {
  return {
    messages: [
      {
        id: "u1",
        role: "user",
        content: "hello",
        status: "sent",
        tool_calls: [],
        movies: [],
      },
      {
        id: "a1",
        role: "assistant",
        content: "",
        status: "pending",
        tool_calls: [],
        movies: [],
      },
    ],
    isStreaming: true,
  };
}

function stateWithStreamingAssistant(): ChatState {
  return {
    messages: [
      {
        id: "u1",
        role: "user",
        content: "hello",
        status: "sent",
        tool_calls: [],
        movies: [],
      },
      {
        id: "a1",
        role: "assistant",
        content: "Hi ",
        status: "streaming",
        tool_calls: [],
        movies: [],
      },
    ],
    isStreaming: true,
  };
}

describe("chatReducer", () => {
  describe("ADD_USER_MESSAGE", () => {
    it("appends a user message with status sent", () => {
      const state = emptyState();
      const action: ChatAction = {
        type: "ADD_USER_MESSAGE",
        id: "u1",
        content: "hello",
      };
      const next = chatReducer(state, action);

      expect(next.messages).toHaveLength(1);
      expect(next.messages[0]).toEqual<Message>({
        id: "u1",
        role: "user",
        content: "hello",
        status: "sent",
        tool_calls: [],
        movies: [],
      });
      expect(next.isStreaming).toBe(false);
    });

    it("does not mutate the original state", () => {
      const state = emptyState();
      const action: ChatAction = {
        type: "ADD_USER_MESSAGE",
        id: "u1",
        content: "hello",
      };
      const next = chatReducer(state, action);

      expect(state.messages).toHaveLength(0);
      expect(next.messages).not.toBe(state.messages);
    });
  });

  describe("START_ASSISTANT_MESSAGE", () => {
    it("appends a pending assistant message and sets isStreaming true", () => {
      const state: ChatState = {
        messages: [
          {
            id: "u1",
            role: "user",
            content: "hello",
            status: "sent",
            tool_calls: [],
            movies: [],
          },
        ],
        isStreaming: false,
      };
      const action: ChatAction = {
        type: "START_ASSISTANT_MESSAGE",
        id: "a1",
      };
      const next = chatReducer(state, action);

      expect(next.messages).toHaveLength(2);
      expect(next.messages[1]).toEqual<Message>({
        id: "a1",
        role: "assistant",
        content: "",
        status: "pending",
        tool_calls: [],
        movies: [],
      });
      expect(next.isStreaming).toBe(true);
    });
  });

  describe("APPEND_TOKEN", () => {
    it("transitions pending to streaming on first token", () => {
      const state = stateWithPendingAssistant();
      const action: ChatAction = {
        type: "APPEND_TOKEN",
        content: "Hi",
      };
      const next = chatReducer(state, action);
      const last = next.messages[next.messages.length - 1];

      expect(last.status).toBe("streaming");
      expect(last.content).toBe("Hi");
    });

    it("appends content to an already streaming message", () => {
      const state = stateWithStreamingAssistant();
      const action: ChatAction = {
        type: "APPEND_TOKEN",
        content: "there",
      };
      const next = chatReducer(state, action);
      const last = next.messages[next.messages.length - 1];

      expect(last.status).toBe("streaming");
      expect(last.content).toBe("Hi there");
    });

    it("produces a new messages array reference", () => {
      const state = stateWithPendingAssistant();
      const next = chatReducer(state, { type: "APPEND_TOKEN", content: "x" });

      expect(next.messages).not.toBe(state.messages);
    });
  });

  describe("SET_MOVIES", () => {
    it("sets movies on the last assistant message", () => {
      const state = stateWithStreamingAssistant();
      const movies = [
        { id: 1, title: "Inception", year: 2010, poster_url: null, rating: 8.8 },
        { id: 2, title: "Interstellar", year: 2014, poster_url: null, rating: 8.6 },
      ];
      const next = chatReducer(state, { type: "SET_MOVIES", movies });
      const last = next.messages[next.messages.length - 1];

      expect(last.movies).toEqual(movies);
      expect(last.movies).toBe(movies); // same reference — no unnecessary copy
    });
  });

  describe("SET_TOOL_CALLS", () => {
    it("sets tool_calls on the last assistant message", () => {
      const state = stateWithStreamingAssistant();
      const toolCalls = [
        { tool: "search_movies", input: { query: "sci-fi" }, output_summary: "Found 5 movies." },
      ];
      const next = chatReducer(state, {
        type: "SET_TOOL_CALLS",
        tool_calls: toolCalls,
      });
      const last = next.messages[next.messages.length - 1];

      expect(last.tool_calls).toEqual(toolCalls);
    });
  });

  describe("COMPLETE_MESSAGE", () => {
    it("sets status to complete and isStreaming to false", () => {
      const state = stateWithStreamingAssistant();
      const next = chatReducer(state, { type: "COMPLETE_MESSAGE" });
      const last = next.messages[next.messages.length - 1];

      expect(last.status).toBe("complete");
      expect(next.isStreaming).toBe(false);
    });

    it("works on a pending message that received no tokens", () => {
      const state = stateWithPendingAssistant();
      const next = chatReducer(state, { type: "COMPLETE_MESSAGE" });
      const last = next.messages[next.messages.length - 1];

      expect(last.status).toBe("complete");
      expect(last.content).toBe("");
      expect(next.isStreaming).toBe(false);
    });
  });

  describe("SET_ERROR", () => {
    it("sets error, status to error, and isStreaming to false", () => {
      const state = stateWithStreamingAssistant();
      const error = { code: "LLM_ERROR", message: "Something went wrong" };
      const next = chatReducer(state, { type: "SET_ERROR", error });
      const last = next.messages[next.messages.length - 1];

      expect(last.status).toBe("error");
      expect(last.error).toEqual(error);
      expect(next.isStreaming).toBe(false);
    });

    it("preserves partial content when setting error", () => {
      const state = stateWithStreamingAssistant();
      const error = { code: "LLM_ERROR", message: "Oops" };
      const next = chatReducer(state, { type: "SET_ERROR", error });
      const last = next.messages[next.messages.length - 1];

      expect(last.content).toBe("Hi "); // preserved from streaming state
      expect(last.status).toBe("error");
    });

    it("works on a pending message with no content", () => {
      const state = stateWithPendingAssistant();
      const error = { code: "MCP_UNAVAILABLE", message: "Service down" };
      const next = chatReducer(state, { type: "SET_ERROR", error });
      const last = next.messages[next.messages.length - 1];

      expect(last.status).toBe("error");
      expect(last.error).toEqual(error);
      expect(last.content).toBe("");
      expect(next.isStreaming).toBe(false);
    });
  });

  describe("immutability", () => {
    it("never mutates the original state across a sequence of actions", () => {
      const s0 = emptyState();
      const s1 = chatReducer(s0, { type: "ADD_USER_MESSAGE", id: "u1", content: "hi" });
      const s2 = chatReducer(s1, { type: "START_ASSISTANT_MESSAGE", id: "a1" });
      const s3 = chatReducer(s2, { type: "APPEND_TOKEN", content: "Hello" });
      const s4 = chatReducer(s3, { type: "APPEND_TOKEN", content: " world" });
      const s5 = chatReducer(s4, {
        type: "SET_TOOL_CALLS",
        tool_calls: [{ tool: "search", input: {}, output_summary: "done" }],
      });
      const s6 = chatReducer(s5, {
        type: "SET_MOVIES",
        movies: [{ id: 1, title: "Test", year: 2024, poster_url: null, rating: 7.0 }],
      });
      const s7 = chatReducer(s6, { type: "COMPLETE_MESSAGE" });

      // Original states are untouched
      expect(s0.messages).toHaveLength(0);
      expect(s1.messages).toHaveLength(1);
      expect(s2.messages).toHaveLength(2);
      expect(s2.messages[1].status).toBe("pending");
      expect(s3.messages[1].content).toBe("Hello");
      expect(s4.messages[1].content).toBe("Hello world");

      // Final state is correct
      expect(s7.messages).toHaveLength(2);
      expect(s7.messages[1].status).toBe("complete");
      expect(s7.messages[1].content).toBe("Hello world");
      expect(s7.messages[1].tool_calls).toHaveLength(1);
      expect(s7.messages[1].movies).toHaveLength(1);
      expect(s7.isStreaming).toBe(false);
    });
  });

  describe("unknown action", () => {
    it("returns the same state for an unknown action type", () => {
      const state = emptyState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = chatReducer(state, { type: "UNKNOWN" } as any);
      expect(next).toBe(state);
    });
  });
});
