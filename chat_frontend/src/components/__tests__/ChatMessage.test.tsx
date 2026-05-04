import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChatMessage } from "../ChatMessage";
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

describe("ChatMessage", () => {
  it("renders user messages right-aligned with accent background", () => {
    const msg = makeMessage({ id: "u1", role: "user", content: "Hello", status: "sent" });
    render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    const article = screen.getByRole("article");
    expect(article.classList.contains("bg-accent")).toBe(true);
    expect(article.classList.contains("ml-auto")).toBe(true);
  });

  it("renders assistant messages left-aligned with neutral background", () => {
    const msg = makeMessage({ id: "a1", role: "assistant", content: "Hi there", status: "complete" });
    render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    const article = screen.getByRole("article");
    expect(article.classList.contains("bg-gray-800")).toBe(true);
    expect(article.classList.contains("mr-auto")).toBe(true);
  });

  it("displays ThinkingIndicator when status is pending", () => {
    const msg = makeMessage({ id: "a1", role: "assistant", status: "pending" });
    render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("displays message text when status is streaming", () => {
    const msg = makeMessage({ id: "a1", role: "assistant", content: "Streaming text", status: "streaming" });
    render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Streaming text")).toBeInTheDocument();
  });

  it("displays message text when status is complete", () => {
    const msg = makeMessage({ id: "a1", role: "assistant", content: "Done text", status: "complete" });
    render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Done text")).toBeInTheDocument();
  });

  it("renders tool call pills with tool name and first sentence of output_summary", () => {
    const msg = makeMessage({
      id: "a1",
      role: "assistant",
      content: "Here are results",
      status: "complete",
      tool_calls: [
        { tool: "search_movies", input: { query: "action" }, output_summary: "Found 5 movies. More details available." },
      ],
    });
    render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    expect(screen.getByText(/🔧 search_movies — Found 5 movies\./)).toBeInTheDocument();
  });

  it("renders MovieStrip with MovieCards when movies are present", () => {
    const msg = makeMessage({
      id: "a1",
      role: "assistant",
      content: "Check these out",
      status: "complete",
      movies: [
        { id: 1, title: "Movie A", year: 2023, poster_url: null, rating: 8.0 },
        { id: 2, title: "Movie B", year: 2022, poster_url: null, rating: 7.5 },
      ],
    });
    render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Movie A")).toBeInTheDocument();
    expect(screen.getByText("Movie B")).toBeInTheDocument();
  });

  it("renders nothing for movies when movies array is empty", () => {
    const msg = makeMessage({
      id: "a1",
      role: "assistant",
      content: "No movies here",
      status: "complete",
      movies: [],
    });
    const { container } = render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    expect(container.querySelector(".overflow-x-auto")).not.toBeInTheDocument();
  });

  it("renders error banner when status is error", () => {
    const msg = makeMessage({
      id: "a1",
      role: "assistant",
      content: "Partial content",
      status: "error",
      error: { code: "LLM_ERROR", message: "Something went wrong" },
    });
    render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    expect(screen.getByText("Partial content")).toBeInTheDocument();
    expect(screen.getByText("The AI service had an issue — try again.")).toBeInTheDocument();
  });

  it("uses article element for semantic HTML", () => {
    const msg = makeMessage({ id: "u1", role: "user", content: "Test", status: "sent" });
    render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("renders content in correct vertical order: pills → text → movies → error", () => {
    const msg = makeMessage({
      id: "a1",
      role: "assistant",
      content: "Some text",
      status: "error",
      tool_calls: [
        { tool: "get_trending", input: {}, output_summary: "Trending movies fetched." },
      ],
      movies: [
        { id: 1, title: "Movie A", year: 2023, poster_url: null, rating: 8.0 },
      ],
      error: { code: "LLM_ERROR", message: "Oops" },
    });
    const { container } = render(<ChatMessage message={msg} toolRegistry={emptyRegistry} />);
    const article = container.querySelector("article")!;

    // First child: tool call pills container
    expect(article.textContent).toContain("get_trending");
    // Movie card title should be present (rendered via MovieStrip)
    expect(article.textContent).toContain("Movie A");
    // Error banner (LLM_ERROR maps to user-friendly message)
    expect(article.textContent).toContain("The AI service had an issue");
  });
});
