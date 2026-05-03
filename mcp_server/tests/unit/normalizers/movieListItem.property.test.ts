import * as fc from 'fast-check';
import { test } from '@fast-check/jest';
import {
  buildPosterUrl,
  extractYear,
  normalizeMovieListItem,
} from '../../../src/normalizers/movieListItem';
import { TmdbMovieResult } from '../../../src/types/tmdb';

// Arbitrary for a valid TMDB release_date string (YYYY-MM-DD)
const validReleaseDateArb = fc
  .tuple(
    fc.integer({ min: 1900, max: 2100 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

// Arbitrary for a non-empty poster_path (TMDB paths start with '/')
const posterPathArb = fc
  .string({ minLength: 1 })
  .map((s) => `/${s}`);

// Arbitrary for a full TmdbMovieResult with all combinations of nullable fields
const tmdbMovieResultArb: fc.Arbitrary<TmdbMovieResult> = fc.record({
  id: fc.integer({ min: 1 }),
  title: fc.string({ minLength: 1 }),
  release_date: fc.oneof(
    fc.constant(null),
    validReleaseDateArb,
  ),
  overview: fc.string(),
  poster_path: fc.oneof(
    fc.constant(null),
    posterPathArb,
  ),
  vote_average: fc.float({ min: 0, max: 10, noNaN: true }),
  genre_ids: fc.array(fc.integer({ min: 1 })),
});

// ─── Property 1: normalizeMovieListItem output shape ────────────────────────
// Feature: tmdb-mcp-server
// Property 1: Movie list item normalization preserves required fields with correct types
// Validates: Requirements 1.3, 3.3, 4.2, 5.2, 9.1, 9.2, 9.4, 9.5
describe('normalizeMovieListItem', () => {
  test.prop([tmdbMovieResultArb])(
    'Property 1: output always contains all required fields with correct types',
    (raw) => {
      const result = normalizeMovieListItem(raw);

      expect(typeof result.id).toBe('number');
      expect(typeof result.title).toBe('string');
      expect(result.year === null || typeof result.year === 'number').toBe(true);
      expect(typeof result.overview).toBe('string');
      expect(result.poster_url === null || typeof result.poster_url === 'string').toBe(true);
      expect(typeof result.rating).toBe('number');
    },
  );

  test.prop([tmdbMovieResultArb])(
    'Property 1: id and title are preserved exactly from raw input',
    (raw) => {
      const result = normalizeMovieListItem(raw);
      expect(result.id).toBe(raw.id);
      expect(result.title).toBe(raw.title);
      expect(result.overview).toBe(raw.overview);
      expect(result.rating).toBe(raw.vote_average);
    },
  );
});

// ─── Property 3: poster_url is a deterministic function of poster_path ───────
// Feature: tmdb-mcp-server
// Property 3: poster_url construction is a deterministic function of poster_path
// Validates: Requirements 9.1, 9.2
describe('buildPosterUrl', () => {
  test.prop([posterPathArb])(
    'Property 3: non-null poster_path produces URL with correct prefix',
    (posterPath) => {
      const url = buildPosterUrl(posterPath);
      expect(url).toBe(`https://image.tmdb.org/t/p/w500${posterPath}`);
    },
  );

  it('Property 3: null poster_path returns null', () => {
    expect(buildPosterUrl(null)).toBeNull();
  });

  it('Property 3: undefined poster_path returns null', () => {
    expect(buildPosterUrl(undefined)).toBeNull();
  });

  it('Property 3: empty string poster_path returns null', () => {
    expect(buildPosterUrl('')).toBeNull();
  });

  test.prop([posterPathArb])(
    'Property 3: buildPosterUrl is deterministic — same input always yields same output',
    (posterPath) => {
      expect(buildPosterUrl(posterPath)).toBe(buildPosterUrl(posterPath));
    },
  );

  test.prop([fc.oneof(fc.constant(null), fc.constant(undefined))])(
    'Property 3: null or undefined always returns null',
    (nullish) => {
      expect(buildPosterUrl(nullish)).toBeNull();
    },
  );
});

// ─── Property 4: Year extraction is a deterministic function of release_date ─
// Feature: tmdb-mcp-server
// Property 4: Year extraction is a deterministic function of release_date
// Validates: Requirements 9.4, 9.5
describe('extractYear', () => {
  test.prop([validReleaseDateArb])(
    'Property 4: valid YYYY-MM-DD date returns the correct four-digit year',
    (releaseDate) => {
      const expectedYear = parseInt(releaseDate.slice(0, 4), 10);
      expect(extractYear(releaseDate)).toBe(expectedYear);
    },
  );

  it('Property 4: null release_date returns null', () => {
    expect(extractYear(null)).toBeNull();
  });

  it('Property 4: undefined release_date returns null', () => {
    expect(extractYear(undefined)).toBeNull();
  });

  it('Property 4: empty string returns null', () => {
    expect(extractYear('')).toBeNull();
  });

  test.prop([
    fc.string({ maxLength: 3 }).filter((s) => s.length > 0),
  ])(
    'Property 4: strings shorter than 4 chars return null',
    (shortStr) => {
      expect(extractYear(shortStr)).toBeNull();
    },
  );

  test.prop([validReleaseDateArb])(
    'Property 4: extractYear is deterministic — same input always yields same output',
    (releaseDate) => {
      expect(extractYear(releaseDate)).toBe(extractYear(releaseDate));
    },
  );

  it('Property 4: malformed date with non-numeric year returns null', () => {
    expect(extractYear('abcd-01-01')).toBeNull();
  });

  // Specific examples for clarity
  it('extracts year 1994 from "1994-09-23"', () => {
    expect(extractYear('1994-09-23')).toBe(1994);
  });

  it('extracts year 2023 from "2023-01-01"', () => {
    expect(extractYear('2023-01-01')).toBe(2023);
  });
});

// ─── Property 10: Cast limit (covered here for buildPosterUrl/extractYear context)
// Note: The cast-limit property (Property 10) is primarily tested in movieDetail.property.test.ts
// but the extractCast function is also exercised via normalizeMovieDetail.
// This file validates the list-item normalizer only.
