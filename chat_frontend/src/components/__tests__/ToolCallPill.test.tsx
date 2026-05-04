import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { ToolCallPill } from "../ToolCallPill";
import type { ToolCall } from "../../lib/types";

const sampleToolCall: ToolCall = {
  tool: "search_movies",
  input: { query: "action", year: 2023 },
  output_summary: "Found 5 movies. More details available upon request.",
};

describe("ToolCallPill", () => {
  it("renders collapsed state with tool name and first sentence", () => {
    render(<ToolCallPill toolCall={sampleToolCall} />);
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("🔧 search_movies — Found 5 movies.");
  });

  it("extracts first sentence ending with exclamation mark", () => {
    const tc: ToolCall = {
      tool: "get_trending",
      input: {},
      output_summary: "Trending movies fetched! Here are the results.",
    };
    render(<ToolCallPill toolCall={tc} />);
    expect(screen.getByRole("button").textContent).toContain("Trending movies fetched!");
  });

  it("extracts first sentence ending with question mark", () => {
    const tc: ToolCall = {
      tool: "get_details",
      input: {},
      output_summary: "Did you mean this movie? It has a high rating.",
    };
    render(<ToolCallPill toolCall={tc} />);
    expect(screen.getByRole("button").textContent).toContain("Did you mean this movie?");
  });

  it("uses full text when no sentence-ending punctuation is found", () => {
    const tc: ToolCall = {
      tool: "get_details",
      input: {},
      output_summary: "No punctuation here",
    };
    render(<ToolCallPill toolCall={tc} />);
    expect(screen.getByRole("button").textContent).toContain("No punctuation here");
  });

  it("starts collapsed (expanded panel not visible)", () => {
    render(<ToolCallPill toolCall={sampleToolCall} />);
    expect(screen.queryByText("Found 5 movies. More details available upon request.")).not.toBeInTheDocument();
  });

  it("expands on click showing tool details", async () => {
    const user = userEvent.setup();
    render(<ToolCallPill toolCall={sampleToolCall} description="Search for movies by query" />);

    await user.click(screen.getByRole("button"));

    // Tool name in expanded panel
    expect(screen.getByText("search_movies")).toBeInTheDocument();
    // Description
    expect(screen.getByText("Search for movies by query")).toBeInTheDocument();
    // Input JSON
    expect(screen.getByText(/\"query\": \"action\"/)).toBeInTheDocument();
    expect(screen.getByText(/\"year\": 2023/)).toBeInTheDocument();
    // Full output summary
    expect(screen.getByText("Found 5 movies. More details available upon request.")).toBeInTheDocument();
  });

  it("collapses on second click", async () => {
    const user = userEvent.setup();
    render(<ToolCallPill toolCall={sampleToolCall} />);

    const button = screen.getByRole("button");
    await user.click(button);
    expect(screen.getByText("Found 5 movies. More details available upon request.")).toBeInTheDocument();

    await user.click(button);
    expect(screen.queryByText("Found 5 movies. More details available upon request.")).not.toBeInTheDocument();
  });

  it("does not render description when not provided", async () => {
    const user = userEvent.setup();
    render(<ToolCallPill toolCall={sampleToolCall} />);

    await user.click(screen.getByRole("button"));

    // Tool name should be there, but no description paragraph
    expect(screen.getByText("search_movies")).toBeInTheDocument();
    // The expanded panel should not contain a description element
    const expandedPanel = screen.getByText("search_movies").closest("div");
    const paragraphs = expandedPanel?.querySelectorAll("p") ?? [];
    // Only tool name and output summary paragraphs, no description
    const texts = Array.from(paragraphs).map((p) => p.textContent);
    expect(texts).not.toContain("Search for movies by query");
  });

  it("sets aria-expanded attribute correctly", async () => {
    const user = userEvent.setup();
    render(<ToolCallPill toolCall={sampleToolCall} />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-expanded", "false");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("is keyboard accessible - toggles with Enter key", async () => {
    const user = userEvent.setup();
    render(<ToolCallPill toolCall={sampleToolCall} />);

    const button = screen.getByRole("button");
    button.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByText("Found 5 movies. More details available upon request.")).toBeInTheDocument();
  });

  it("is keyboard accessible - toggles with Space key", async () => {
    const user = userEvent.setup();
    render(<ToolCallPill toolCall={sampleToolCall} />);

    const button = screen.getByRole("button");
    button.focus();
    await user.keyboard(" ");

    expect(screen.getByText("Found 5 movies. More details available upon request.")).toBeInTheDocument();
  });

  it("has visible focus indicator class on the button", () => {
    render(<ToolCallPill toolCall={sampleToolCall} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("focus:ring-2");
    expect(button.className).toContain("focus:ring-accent");
  });

  it("uses bg-gray-700 for the pill button", () => {
    render(<ToolCallPill toolCall={sampleToolCall} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-gray-700");
  });

  it("uses bg-gray-900 for the expanded panel", async () => {
    const user = userEvent.setup();
    render(<ToolCallPill toolCall={sampleToolCall} />);

    await user.click(screen.getByRole("button"));

    const expandedPanel = screen.getByText("search_movies").closest("div");
    expect(expandedPanel?.className).toContain("bg-gray-900");
  });
});
