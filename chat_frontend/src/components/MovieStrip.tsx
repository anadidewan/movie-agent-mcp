import type { Movie } from "../lib/types";
import { MovieCard } from "./MovieCard";

export interface MovieStripProps {
  movies: Movie[];
}

/**
 * Horizontal scrollable container for MovieCard children.
 * - Smooth scrolling on touch and trackpad (scroll-smooth, overflow-x-auto)
 * - Right-edge gradient fade when content overflows
 * - Renders nothing when movies array is empty
 */
export function MovieStrip({ movies }: MovieStripProps): React.ReactNode {
  if (movies.length === 0) return null;

  return (
    <div className="relative mt-2">
      <div className="flex gap-3 overflow-x-auto scroll-smooth pb-2">
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>
      {/* Right-edge gradient fade to indicate scrollability */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-gray-800 to-transparent" />
    </div>
  );
}
