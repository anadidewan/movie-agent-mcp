import {
  TmdbGenre,
  TmdbCastMember,
  TmdbCrewMember,
  TmdbMovieDetailWithAppended,
} from '../types/tmdb';
import { CastMember, MovieDetail } from '../types/normalized';
import { buildPosterUrl, extractYear } from './movieListItem';

const MAX_CAST_MEMBERS = 5;

/**
 * Maps an array of TMDB genre objects to an array of genre name strings.
 * Returns an empty array if genres is undefined.
 */
export function extractGenreNames(genres: TmdbGenre[] | undefined): string[] {
  if (!genres) {
    return [];
  }
  return genres.map((g) => g.name);
}

/**
 * Takes the top 5 cast members (in TMDB billing order) and maps them to
 * { name, character } objects. Returns an empty array if cast is undefined.
 */
export function extractCast(cast: TmdbCastMember[] | undefined): CastMember[] {
  if (!cast) {
    return [];
  }
  return cast.slice(0, MAX_CAST_MEMBERS).map(({ name, character }) => ({ name, character }));
}

/**
 * Finds the first crew member with job === "Director" and returns their name.
 * Returns null if no director is found or crew is undefined.
 */
export function extractDirector(crew: TmdbCrewMember[] | undefined): string | null {
  if (!crew) {
    return null;
  }
  const director = crew.find((member) => member.job === 'Director');
  return director ? director.name : null;
}

/**
 * Normalizes a raw TMDB movie detail response (with appended credits and keywords)
 * into a consistent MovieDetail shape.
 */
export function normalizeMovieDetail(raw: TmdbMovieDetailWithAppended): MovieDetail {
  return {
    id: raw.id,
    title: raw.title,
    year: extractYear(raw.release_date),
    overview: raw.overview,
    poster_url: buildPosterUrl(raw.poster_path),
    rating: raw.vote_average,
    runtime: raw.runtime ?? null,
    genres: extractGenreNames(raw.genres),
    cast: extractCast(raw.credits?.cast),
    director: extractDirector(raw.credits?.crew),
    keywords: raw.keywords?.keywords?.map((k) => k.name) ?? [],
  };
}
