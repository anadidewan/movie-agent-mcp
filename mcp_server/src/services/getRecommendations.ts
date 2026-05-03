import { tmdbClient } from '../lib/tmdbClient';
import { normalizeMovieListItem } from '../normalizers/movieListItem';
import { GetRecommendationsInput } from '../schemas/getRecommendations';
import { TmdbMovieResult, TmdbPagedResponse } from '../types/tmdb';
import { MovieListItem } from '../types/normalized';

export interface GetRecommendationsResult {
  results: MovieListItem[];
}

/**
 * Fetches TMDB movie recommendations for the given movie ID.
 * Returns a normalized list of recommended movies (empty array if none found).
 */
export async function getRecommendations(
  input: GetRecommendationsInput,
): Promise<GetRecommendationsResult> {
  const response = await tmdbClient.get<TmdbPagedResponse<TmdbMovieResult>>(
    `/movie/${input.movie_id}/recommendations`,
  );

  const results = response.data.results.map(normalizeMovieListItem);
  return { results };
}
