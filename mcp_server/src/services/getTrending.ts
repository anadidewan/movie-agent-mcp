import { tmdbClient } from '../lib/tmdbClient';
import { normalizeMovieListItem } from '../normalizers/movieListItem';
import { GetTrendingInput } from '../schemas/getTrending';
import { TmdbMovieResult, TmdbPagedResponse } from '../types/tmdb';
import { MovieListItem } from '../types/normalized';

export interface GetTrendingResult {
  results: MovieListItem[];
}

/**
 * Fetches currently trending movies from TMDB for the given time window
 * ('day' or 'week'). Returns a normalized list of trending movies.
 */
export async function getTrending(input: GetTrendingInput): Promise<GetTrendingResult> {
  const response = await tmdbClient.get<TmdbPagedResponse<TmdbMovieResult>>(
    `/trending/movie/${input.window}`,
  );

  const results = response.data.results.map(normalizeMovieListItem);
  return { results };
}
