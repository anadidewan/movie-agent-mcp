import type { Movie } from "../lib/types";

export interface MovieCardProps {
  movie: Movie;
}

/**
 * Fixed-width (~140px) card displaying a movie poster, title, year, and rating.
 * Shows a neutral placeholder when poster_url is null.
 * Subtle scale-up on hover.
 */
export function MovieCard({ movie }: MovieCardProps): React.ReactNode {
  return (
    <div className="w-[140px] min-w-[140px] h-[220px] overflow-hidden rounded-lg bg-gray-800 hover:scale-105 transition-transform">
      {/* Poster area */}
      {movie.poster_url ? (
        <img
          src={movie.poster_url}
          alt={`${movie.title} poster`}
          className="h-[160px] w-full object-cover"
        />
      ) : (
        <div className="flex h-[160px] w-full items-center justify-center bg-gray-700 text-3xl">
          🎬
        </div>
      )}

      {/* Info area */}
      <div className="px-2 py-1">
        <p className="line-clamp-2 text-xs font-medium leading-tight text-gray-100">
          {movie.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          {movie.year != null && (
            <span className="text-xs text-gray-400">{movie.year}</span>
          )}
          {movie.rating != null && (
            <span className="text-xs text-gray-400">⭐ {movie.rating}</span>
          )}
        </div>
      </div>
    </div>
  );
}
