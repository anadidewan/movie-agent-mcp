import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ErrorBanner } from "../ErrorBanner";

describe("ErrorBanner", () => {
  it("maps LLM_ERROR to user-friendly message", () => {
    render(<ErrorBanner error={{ code: "LLM_ERROR", message: "internal" }} />);
    expect(
      screen.getByText("The AI service had an issue — try again.")
    ).toBeInTheDocument();
  });

  it("maps MCP_UNAVAILABLE to user-friendly message", () => {
    render(
      <ErrorBanner error={{ code: "MCP_UNAVAILABLE", message: "timeout" }} />
    );
    expect(
      screen.getByText(
        "The movie data service is unavailable — try again in a moment."
      )
    ).toBeInTheDocument();
  });

  it("maps VALIDATION_ERROR to user-friendly message", () => {
    render(
      <ErrorBanner error={{ code: "VALIDATION_ERROR", message: "bad input" }} />
    );
    expect(
      screen.getByText("Something went wrong with your request.")
    ).toBeInTheDocument();
  });

  it("maps unknown error codes to fallback message", () => {
    render(
      <ErrorBanner error={{ code: "SOME_UNKNOWN_CODE", message: "mystery" }} />
    );
    expect(
      screen.getByText("Unexpected error. Try again.")
    ).toBeInTheDocument();
  });

  it("applies the correct Tailwind styling classes", () => {
    const { container } = render(
      <ErrorBanner error={{ code: "LLM_ERROR", message: "err" }} />
    );
    const el = container.querySelector("p")!;
    expect(el.className).toContain("bg-red-900/30");
    expect(el.className).toContain("text-red-300");
    expect(el.className).toContain("rounded-md");
    expect(el.className).toContain("px-3");
    expect(el.className).toContain("py-2");
    expect(el.className).toContain("text-sm");
    expect(el.className).toContain("mt-2");
  });
});
