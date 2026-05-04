import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MovieStrip } from "../MovieStrip";
import type { Movie } from "../../lib/types";

const sampleMovies: Movie[] = [
  { id: 1, title: "Movie A", year: 2023, poster_url: null, rating: 8.0 },
  { id: 2, title: "Movie B", year: 2022, poster_url: "https://example.com/b.jpg", rating: 7.5 },
  { id: 3, title: "Movie C", year: null, poster_url: null, rating: null },
];

describe("MovieStrip", () => {
  it("renders nothing when movies array is empty", () => {
    const { container } = render(<MovieStrip movies={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a MovieCard for each movie", () => {
    render(<MovieStrip movies={sampleMovies} />);
    expect(screen.getByText("Movie A")).toBeInTheDocument();
    expect(screen.getByText("Movie B")).toBeInTheDocument();
    expect(screen.getByText("Movie C")).toBeInTheDocument();
  });

  it("applies horizontal scroll and smooth scrolling classes", () => {
    const { container } = render(<MovieStrip movies={sampleMovies} />);
    const scrollContainer = container.querySelector(".overflow-x-auto");
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer?.classList.contains("scroll-smooth")).toBe(true);
  });

  it("uses flex gap-3 for card layout", () => {
    const { container } = render(<MovieStrip movies={sampleMovies} />);
    const scrollContainer = container.querySelector(".flex");
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer?.classList.contains("gap-3")).toBe(true);
  });

  it("has a relative-positioned outer container for gradient overlay", () => {
    const { container } = render(<MovieStrip movies={sampleMovies} />);
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.classList.contains("relative")).toBe(true);
  });

  it("renders a right-edge gradient fade overlay", () => {
    const { container } = render(<MovieStrip movies={sampleMovies} />);
    const gradient = container.querySelector(".bg-gradient-to-l");
    expect(gradient).toBeInTheDocument();
    expect(gradient?.classList.contains("pointer-events-none")).toBe(true);
  });
});
