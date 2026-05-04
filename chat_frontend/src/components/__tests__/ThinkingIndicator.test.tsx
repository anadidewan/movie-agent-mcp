import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ThinkingIndicator } from "../ThinkingIndicator";

describe("ThinkingIndicator", () => {
  it("renders 'Thinking…' text", () => {
    render(<ThinkingIndicator />);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("applies animate-pulse class for the pulsing effect", () => {
    render(<ThinkingIndicator />);
    const el = screen.getByText("Thinking…");
    expect(el.classList.contains("animate-pulse")).toBe(true);
  });

  it("applies text-gray-400 for muted text color", () => {
    render(<ThinkingIndicator />);
    const el = screen.getByText("Thinking…");
    expect(el.classList.contains("text-gray-400")).toBe(true);
  });

  it("has an accessible label for screen readers", () => {
    render(<ThinkingIndicator />);
    expect(screen.getByLabelText("Agent is thinking")).toBeInTheDocument();
  });

  it("renders as a span element", () => {
    render(<ThinkingIndicator />);
    const el = screen.getByText("Thinking…");
    expect(el.tagName).toBe("SPAN");
  });
});
