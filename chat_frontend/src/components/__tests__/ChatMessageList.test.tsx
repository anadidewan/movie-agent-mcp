import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChatMessageList } from "../ChatMessageList";
import type { Message } from "../../lib/types";

function makeMessage(overrides: Partial<Message> & { id: string; role: Message["role"] }): Message {
  return {
    content: "",
    status: "complete",
    tool_calls: [],
    movies: [],
    ...overrides,
  };
}

const emptyRegistry = new Map<string, string>();

describe("ChatMessageList", () => {
  it("shows empty state when messages array is empty", () => {
    render(<ChatMessageList messages={[]} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Send a message to start chatting…")).toBeInTheDocument();
  });

  it("has aria-live='polite' on the container", () => {
    render(<ChatMessageList messages={[]} toolRegistry={emptyRegistry} />);
    const container = screen.getByRole("log");
    expect(container).toHaveAttribute("aria-live", "polite");
  });

  it("renders user messages with accent background (right-aligned)", () => {
    const messages: Message[] = [
      makeMessage({ id: "u1", role: "user", content: "Hello", status: "sent" }),
    ];
    render(<ChatMessageList messages={messages} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    const bubble = screen.getByText("Hello").closest("article");
    expect(bubble?.classList.contains("bg-accent")).toBe(true);
    expect(bubble?.classList.contains("ml-auto")).toBe(true);
  });

  it("renders assistant messages with neutral background (left-aligned)", () => {
    const messages: Message[] = [
      makeMessage({ id: "a1", role: "assistant", content: "Hi there", status: "complete" }),
    ];
    render(<ChatMessageList messages={messages} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Hi there")).toBeInTheDocument();
    const bubble = screen.getByText("Hi there").closest("article");
    expect(bubble?.classList.contains("bg-gray-800")).toBe(true);
    expect(bubble?.classList.contains("mr-auto")).toBe(true);
  });

  it("shows 'Thinking…' for pending status", () => {
    const messages: Message[] = [
      makeMessage({ id: "a1", role: "assistant", status: "pending" }),
    ];
    render(<ChatMessageList messages={messages} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("shows content for streaming status", () => {
    const messages: Message[] = [
      makeMessage({ id: "a1", role: "assistant", content: "Streaming text", status: "streaming" }),
    ];
    render(<ChatMessageList messages={messages} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Streaming text")).toBeInTheDocument();
  });

  it("shows error message for error status", () => {
    const messages: Message[] = [
      makeMessage({
        id: "a1",
        role: "assistant",
        content: "Partial content",
        status: "error",
        error: { code: "LLM_ERROR", message: "Something went wrong" },
      }),
    ];
    render(<ChatMessageList messages={messages} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Partial content")).toBeInTheDocument();
    expect(screen.getByText("The AI service had an issue — try again.")).toBeInTheDocument();
  });

  it("renders multiple messages in order", () => {
    const messages: Message[] = [
      makeMessage({ id: "u1", role: "user", content: "First", status: "sent" }),
      makeMessage({ id: "a1", role: "assistant", content: "Second", status: "complete" }),
      makeMessage({ id: "u2", role: "user", content: "Third", status: "sent" }),
    ];
    render(<ChatMessageList messages={messages} toolRegistry={emptyRegistry} />);
    const items = screen.getAllByText(/First|Second|Third/);
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("First");
    expect(items[1]).toHaveTextContent("Second");
    expect(items[2]).toHaveTextContent("Third");
  });
});
