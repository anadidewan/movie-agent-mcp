import { tmdbClient } from '../lib/tmdbClient';
import { AppError, ErrorCode } from '../types/errors';
import { TmdbGenre } from '../types/tmdb';

interface TmdbGenreListResponse {
  genres: TmdbGenre[];
}

export interface GetGenreIdResult {
  genre_id: number;
  genre_name: string;
}

/**
 * Fetches the TMDB genre list and resolves a genre name (case-insensitive) to its numeric ID.
 * Throws NO_RESULTS if no genre matches the given name.
 */
export async function getGenreId(name: string): Promise<GetGenreIdResult> {
  const response = await tmdbClient.get<TmdbGenreListResponse>('/genre/movie/list');
  const genres = response.data.genres;

  const normalizedInput = name.trim().toLowerCase();
  const match = genres.find((g) => g.name.toLowerCase() === normalizedInput);

  if (!match) {
    const available = genres.map((g) => g.name).join(', ');
    throw new AppError(
      ErrorCode.NO_RESULTS,
      404,
      `No genre found matching "${name}". Available genres: ${available}`,
    );
  }

  return { genre_id: match.id, genre_name: match.name };
}
