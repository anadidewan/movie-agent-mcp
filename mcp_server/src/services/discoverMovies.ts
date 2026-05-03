import { tmdbClient } from '../lib/tmdbClient';
import { normalizeMovieListItem } from '../normalizers/movieListItem';
import { DiscoverMoviesInput } from '../schemas/discoverMovies';
import { TmdbMovieResult, TmdbPagedResponse } from '../types/tmdb';
import { MovieListItem } from '../types/normalized';
import { AppError, ErrorCode } from '../types/errors';
import { getGenreId } from './getGenreId';

export interface DiscoverMoviesResult {
  results: MovieListItem[];
}

/**
 * Discovers movies on TMDB using optional filters.
 * Performs semantic validation to ensure year_from <= year_to when both are provided.
 * Returns a normalized list of matching movies.
 */
export async function discoverMovies(input: DiscoverMoviesInput): Promise<DiscoverMoviesResult> {
  // Semantic validation: year_from must not exceed year_to
  if (input.year_from !== undefined && input.year_to !== undefined) {
    if (input.year_from > input.year_to) {
      throw new AppError(
        ErrorCode.UNPROCESSABLE_INPUT,
        422,
        'year_from must not be greater than year_to',
      );
    }
  }

  // Build TMDB discover query params from the validated input
  const params: Record<string, unknown> = {};

  if (input.genre !== undefined) {
    // If genre is a numeric string (e.g. "28"), use it directly as an ID.
    // Otherwise resolve the genre name to a TMDB genre ID first.
    const numericId = parseInt(input.genre, 10);
    if (!isNaN(numericId) && String(numericId) === input.genre.trim()) {
      params['with_genres'] = numericId;
    } else {
      const { genre_id } = await getGenreId(input.genre);
      params['with_genres'] = genre_id;
    }
  }
  if (input.min_rating !== undefined) {
    params['vote_average.gte'] = input.min_rating;
  }
  if (input.year_from !== undefined) {
    params['primary_release_date.gte'] = `${input.year_from}-01-01`;
  }
  if (input.year_to !== undefined) {
    params['primary_release_date.lte'] = `${input.year_to}-12-31`;
  }
  if (input.keywords !== undefined) {
    params['with_keywords'] = input.keywords;
  }

  const response = await tmdbClient.get<TmdbPagedResponse<TmdbMovieResult>>('/discover/movie', {
    params,
  });

  const results = response.data.results.map(normalizeMovieListItem);
  return { results };
}
