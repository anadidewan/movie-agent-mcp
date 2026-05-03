import { tmdbClient } from '../lib/tmdbClient';
import { normalizeMovieDetail } from '../normalizers/movieDetail';
import { GetMovieDetailsInput } from '../schemas/getMovieDetails';
import { TmdbMovieDetailWithAppended } from '../types/tmdb';
import { MovieDetail } from '../types/normalized';

/**
 * Fetches full movie details (including credits and keywords) from TMDB
 * for the given movie ID and returns a normalized MovieDetail object.
 */
export async function getMovieDetails(input: GetMovieDetailsInput): Promise<MovieDetail> {
  const response = await tmdbClient.get<TmdbMovieDetailWithAppended>(
    `/movie/${input.movie_id}`,
    {
      params: { append_to_response: 'credits,keywords' },
    },
  );

  return normalizeMovieDetail(response.data);
}
