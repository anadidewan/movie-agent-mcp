import { TmdbMovieResult } from '../types/tmdb';
import { MovieListItem } from '../types/normalized';

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

/**
 * Constructs a fully-qualified poster URL from a raw TMDB poster_path.
 * Returns null if the path is null, undefined, or empty.
 */
export function buildPosterUrl(posterPath: string | null | undefined): string | null {
  if (!posterPath) {
    return null;
  }
  return `${TMDB_IMAGE_BASE_URL}${posterPath}`;
}

/**
 * Extracts the four-digit year integer from a TMDB release_date string (YYYY-MM-DD).
 * Returns null for null, undefined, or malformed input.
 */
export function extractYear(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) {
    return null;
  }
  const yearStr = releaseDate.slice(0, 4);
  const year = parseInt(yearStr, 10);
  if (isNaN(year) || yearStr.length < 4) {
    return null;
  }
  return year;
}

/**
 * Normalizes a raw TMDB movie result into a consistent MovieListItem shape.
 */
export function normalizeMovieListItem(raw: TmdbMovieResult): MovieListItem {
  return {
    id: raw.id,
    title: raw.title,
    year: extractYear(raw.release_date),
    overview: raw.overview,
    poster_url: buildPosterUrl(raw.poster_path),
    rating: raw.vote_average,
  };
}
