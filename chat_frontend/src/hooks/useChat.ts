import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApiError, postChatStream } from "../lib/api";
import { parseSSEStream } from "../lib/sse";
import type { ErrorDetail, Message, Movie, ToolCall } from "../lib/types";

// --- State ---

export interface ChatState {
  messages: Message[];
  isStreaming: boolean;
}

// --- Actions ---

export type ChatAction =
  | { type: "ADD_USER_MESSAGE"; id: string; content: string }
  | { type: "START_ASSISTANT_MESSAGE"; id: string }
  | { type: "APPEND_TOKEN"; content: string }
  | { type: "SET_MOVIES"; movies: Movie[] }
  | { type: "SET_TOOL_CALLS"; tool_calls: ToolCall[] }
  | { type: "COMPLETE_MESSAGE" }
  | { type: "SET_ERROR"; error: ErrorDetail };

// --- Helpers ---

/**
 * Return a new messages array with the last message replaced by `updated`.
 * Returns the original array unchanged if it's empty.
 */
function updateLastMessage(
  messages: readonly Message[],
  updater: (msg: Message) => Message,
): Message[] {
  if (messages.length === 0) return messages as Message[];
  const last = messages[messages.length - 1];
  const updated = updater(last);
  // If the updater returned the same reference, skip the copy
  if (updated === last) return messages as Message[];
  return [...messages.slice(0, -1), updated];
}

// --- Reducer ---

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_USER_MESSAGE": {
      const userMessage: Message = {
        id: action.id,
        role: "user",
        content: action.content,
        status: "sent",
        tool_calls: [],
        movies: [],
      };
      return {
        ...state,
        messages: [...state.messages, userMessage],
      };
    }

    case "START_ASSISTANT_MESSAGE": {
      const assistantMessage: Message = {
        id: action.id,
        role: "assistant",
        content: "",
        status: "pending",
        tool_calls: [],
        movies: [],
      };
      return {
        ...state,
        messages: [...state.messages, assistantMessage],
        isStreaming: true,
      };
    }

    case "APPEND_TOKEN": {
      return {
        ...state,
        messages: updateLastMessage(state.messages, (msg) => ({
          ...msg,
          content: msg.content + action.content,
          status: msg.status === "pending" ? "streaming" : msg.status,
        })),
      };
    }

    case "SET_MOVIES": {
      return {
        ...state,
        messages: updateLastMessage(state.messages, (msg) => ({
          ...msg,
          movies: action.movies,
        })),
      };
    }

    case "SET_TOOL_CALLS": {
      return {
        ...state,
        messages: updateLastMessage(state.messages, (msg) => ({
          ...msg,
          tool_calls: action.tool_calls,
        })),
      };
    }

    case "COMPLETE_MESSAGE": {
      return {
        ...state,
        messages: updateLastMessage(state.messages, (msg) => ({
          ...msg,
          // Don't overwrite error status — if the message already errored,
          // the subsequent "done" event should not clear the error.
          status: msg.status === "error" ? "error" : "complete",
        })),
        isStreaming: false,
      };
    }

    case "SET_ERROR": {
      return {
        ...state,
        messages: updateLastMessage(state.messages, (msg) => ({
          ...msg,
          status: "error",
          error: action.error,
        })),
        isStreaming: false,
      };
    }

    default:
      return state;
  }
}

// --- Initial state ---

const initialState: ChatState = {
  messages: [],
  isStreaming: false,
};

// --- Hook ---

export interface UseChatReturn {
  messages: Message[];
  isStreaming: boolean;
  sendMessage: (content: string) => void;
}

export function useChat(): UseChatReturn {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>(state.messages);

  // Keep messagesRef in sync with the latest messages
  messagesRef.current = state.messages;

  // Abort in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    // Abort any in-flight stream before starting a new one
    abortControllerRef.current?.abort();

    const userMessageId = crypto.randomUUID();
    dispatch({ type: "ADD_USER_MESSAGE", id: userMessageId, content });

    const assistantMessageId = crypto.randomUUID();
    dispatch({ type: "START_ASSISTANT_MESSAGE", id: assistantMessageId });

    // Build the messages array for the API call using the ref for latest messages
    // plus the new user message we just dispatched
    const apiMessages = [
      ...messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content },
    ];

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    (async () => {
      try {
        console.log("[useChat] POST /chat starting", { messageCount: apiMessages.length });
        const stream = await postChatStream(apiMessages, abortController.signal);
        console.log("[useChat] Stream opened, reading events…");

        let tokenCount = 0;
        for await (const event of parseSSEStream(stream)) {
          switch (event.type) {
            case "token":
              tokenCount++;
              if (tokenCount <= 3 || tokenCount % 10 === 0) {
                console.log(`[useChat] token #${tokenCount}:`, JSON.stringify(event.content).slice(0, 80));
              }
              dispatch({ type: "APPEND_TOKEN", content: event.content });
              break;
            case "movies":
              console.log("[useChat] movies event:", event.movies.length, "movies");
              dispatch({ type: "SET_MOVIES", movies: event.movies });
              break;
            case "tool_calls":
              console.log("[useChat] tool_calls event:", event.tool_calls.length, "calls", event.tool_calls.map(tc => tc.tool));
              dispatch({ type: "SET_TOOL_CALLS", tool_calls: event.tool_calls });
              break;
            case "done":
              console.log(`[useChat] done event (received ${tokenCount} tokens total)`);
              dispatch({ type: "COMPLETE_MESSAGE" });
              break;
            case "error":
              console.error("[useChat] error event:", event.code, event.message);
              dispatch({
                type: "SET_ERROR",
                error: { code: event.code, message: event.message },
              });
              break;
          }
        }
        console.log(`[useChat] Stream finished. Total tokens: ${tokenCount}`);
      } catch (err) {
        if (err instanceof ApiError) {
          console.error("[useChat] ApiError:", err.code, err.detail);
          dispatch({
            type: "SET_ERROR",
            error: { code: err.code, message: err.detail },
          });
        } else if (err instanceof DOMException && err.name === "AbortError") {
          console.log("[useChat] Stream aborted (intentional)");
          // Ignore abort errors — the stream was intentionally cancelled
        } else if (err instanceof Error && err.name === "AbortError") {
          console.log("[useChat] Stream aborted (other source)");
          // Ignore abort errors from other sources
        } else {
          console.error("[useChat] Unexpected error:", err);
          dispatch({
            type: "SET_ERROR",
            error: { code: "UNKNOWN", message: "An unexpected error occurred." },
          });
        }
      }
    })();
  }, []);

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    sendMessage,
  };
}
