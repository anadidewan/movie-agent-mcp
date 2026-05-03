import { tmdbClient } from '../lib/tmdbClient';
import { GetMovieIdInput } from '../schemas/getMovieId';
import { TmdbMovieResult, TmdbPagedResponse } from '../types/tmdb';
import { AppError, ErrorCode } from '../types/errors';

export interface GetMovieIdResult {
  movie_id: number;
}

/**
 * Resolves a movie title (and optional year) to a TMDB movie ID by searching
 * TMDB and returning the top-ranked result's ID.
 * Throws NO_RESULTS if the search returns no matches.
 */
export async function getMovieId(input: GetMovieIdInput): Promise<GetMovieIdResult> {
  const params: Record<string, unknown> = { query: input.query };
  if (input.year !== undefined) {
    params.year = input.year;
  }

  const response = await tmdbClient.get<TmdbPagedResponse<TmdbMovieResult>>('/search/movie', {
    params,
  });

  const results = response.data.results;
  if (results.length === 0) {
    throw new AppError(
      ErrorCode.NO_RESULTS,
      404,
      'No movie found matching the given query',
    );
  }

  return { movie_id: results[0].id };
}
