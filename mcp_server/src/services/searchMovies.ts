import { tmdbClient } from '../lib/tmdbClient';
import { normalizeMovieListItem } from '../normalizers/movieListItem';
import { SearchMoviesInput } from '../schemas/searchMovies';
import { TmdbMovieResult, TmdbPagedResponse } from '../types/tmdb';
import { MovieListItem } from '../types/normalized';

export interface SearchMoviesResult {
  results: MovieListItem[];
}

/**
 * Searches TMDB for movies matching the given query and optional year.
 * Returns a normalized list of matching movies.
 */
export async function searchMovies(input: SearchMoviesInput): Promise<SearchMoviesResult> {
  const params: Record<string, unknown> = { query: input.query };
  if (input.year !== undefined) {
    params.year = input.year;
  }

  const response = await tmdbClient.get<TmdbPagedResponse<TmdbMovieResult>>('/search/movie', {
    params,
  });

  const results = response.data.results.map(normalizeMovieListItem);
  return { results };
}
