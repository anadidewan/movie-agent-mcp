import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MovieCard } from "../MovieCard";
import type { Movie } from "../../lib/types";

const fullMovie: Movie = {
  id: 1,
  title: "The Shawshank Redemption",
  year: 1994,
  poster_url: "https://image.tmdb.org/t/p/w200/poster.jpg",
  rating: 9.3,
};

const nullPosterMovie: Movie = {
  id: 2,
  title: "Unknown Film",
  year: 2020,
  poster_url: null,
  rating: 7.5,
};

const minimalMovie: Movie = {
  id: 3,
  title: "Minimal",
  year: null,
  poster_url: null,
  rating: null,
};

describe("MovieCard", () => {
  it("renders poster image when poster_url is provided", () => {
    render(<MovieCard movie={fullMovie} />);
    const img = screen.getByRole("img", { name: /The Shawshank Redemption poster/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", fullMovie.poster_url);
  });

  it("renders placeholder emoji when poster_url is null", () => {
    render(<MovieCard movie={nullPosterMovie} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("🎬")).toBeInTheDocument();
  });

  it("renders movie title", () => {
    render(<MovieCard movie={fullMovie} />);
    expect(screen.getByText("The Shawshank Redemption")).toBeInTheDocument();
  });

  it("renders year when provided", () => {
    render(<MovieCard movie={fullMovie} />);
    expect(screen.getByText("1994")).toBeInTheDocument();
  });

  it("hides year when null", () => {
    render(<MovieCard movie={minimalMovie} />);
    expect(screen.queryByText(/\d{4}/)).not.toBeInTheDocument();
  });

  it("renders rating with star icon when provided", () => {
    render(<MovieCard movie={fullMovie} />);
    expect(screen.getByText(/⭐ 9.3/)).toBeInTheDocument();
  });

  it("hides rating when null", () => {
    render(<MovieCard movie={minimalMovie} />);
    expect(screen.queryByText(/⭐/)).not.toBeInTheDocument();
  });

  it("applies hover scale and transition classes", () => {
    const { container } = render(<MovieCard movie={fullMovie} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("hover:scale-105");
    expect(card.className).toContain("transition-transform");
  });

  it("applies overflow-hidden and rounded-lg to the card container", () => {
    const { container } = render(<MovieCard movie={fullMovie} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("overflow-hidden");
    expect(card.className).toContain("rounded-lg");
  });

  it("applies bg-gray-800 for dark theme styling", () => {
    const { container } = render(<MovieCard movie={fullMovie} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-gray-800");
  });

  it("title has line-clamp-2 for truncation", () => {
    render(<MovieCard movie={fullMovie} />);
    const title = screen.getByText("The Shawshank Redemption");
    expect(title.className).toContain("line-clamp-2");
  });
});
