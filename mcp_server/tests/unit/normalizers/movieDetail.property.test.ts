import * as fc from 'fast-check';
import { test } from '@fast-check/jest';
import {
  extractGenreNames,
  extractCast,
  extractDirector,
  normalizeMovieDetail,
} from '../../../src/normalizers/movieDetail';
import {
  TmdbGenre,
  TmdbCastMember,
  TmdbCrewMember,
  TmdbMovieDetailWithAppended,
} from '../../../src/types/tmdb';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const validReleaseDateArb = fc
  .tuple(
    fc.integer({ min: 1900, max: 2100 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const tmdbGenreArb: fc.Arbitrary<TmdbGenre> = fc.record({
  id: fc.integer({ min: 1 }),
  name: fc.string({ minLength: 1 }),
});

const tmdbCastMemberArb: fc.Arbitrary<TmdbCastMember> = fc.record({
  name: fc.string({ minLength: 1 }),
  character: fc.string(),
  order: fc.integer({ min: 0 }),
});

const tmdbCrewMemberArb: fc.Arbitrary<TmdbCrewMember> = fc.record({
  name: fc.string({ minLength: 1 }),
  job: fc.string({ minLength: 1 }),
  department: fc.string({ minLength: 1 }),
});

// Crew member with job === "Director"
const directorCrewMemberArb: fc.Arbitrary<TmdbCrewMember> = fc.record({
  name: fc.string({ minLength: 1 }),
  job: fc.constant('Director'),
  department: fc.constant('Directing'),
});

const tmdbKeywordArb = fc.record({
  id: fc.integer({ min: 1 }),
  name: fc.string({ minLength: 1 }),
});

const tmdbMovieDetailWithAppendedArb: fc.Arbitrary<TmdbMovieDetailWithAppended> = fc.record({
  id: fc.integer({ min: 1 }),
  title: fc.string({ minLength: 1 }),
  release_date: fc.oneof(fc.constant(null), validReleaseDateArb),
  overview: fc.string(),
  poster_path: fc.oneof(
    fc.constant(null),
    fc.string({ minLength: 1 }).map((s) => `/${s}`),
  ),
  vote_average: fc.float({ min: 0, max: 10, noNaN: true }),
  runtime: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 300 })),
  genres: fc.array(tmdbGenreArb),
  credits: fc.record({
    cast: fc.array(tmdbCastMemberArb),
    crew: fc.array(tmdbCrewMemberArb),
  }),
  keywords: fc.record({
    keywords: fc.array(tmdbKeywordArb),
  }),
});

// ─── Property 2: normalizeMovieDetail output shape ───────────────────────────
// Feature: tmdb-mcp-server
// Property 2: Movie detail normalization preserves all required fields with correct types
// Validates: Requirements 2.2, 9.3
describe('normalizeMovieDetail', () => {
  test.prop([tmdbMovieDetailWithAppendedArb])(
    'Property 2: output always contains all required fields with correct types',
    (raw) => {
      const result = normalizeMovieDetail(raw);

      // Base MovieListItem fields
      expect(typeof result.id).toBe('number');
      expect(typeof result.title).toBe('string');
      expect(result.year === null || typeof result.year === 'number').toBe(true);
      expect(typeof result.overview).toBe('string');
      expect(result.poster_url === null || typeof result.poster_url === 'string').toBe(true);
      expect(typeof result.rating).toBe('number');

      // MovieDetail-specific fields
      expect(result.runtime === null || typeof result.runtime === 'number').toBe(true);
      expect(Array.isArray(result.genres)).toBe(true);
      expect(result.genres.every((g) => typeof g === 'string')).toBe(true);
      expect(Array.isArray(result.cast)).toBe(true);
      expect(result.cast.every((c) => typeof c.name === 'string' && typeof c.character === 'string')).toBe(true);
      expect(result.director === null || typeof result.director === 'string').toBe(true);
      expect(Array.isArray(result.keywords)).toBe(true);
      expect(result.keywords.every((k) => typeof k === 'string')).toBe(true);
    },
  );

  test.prop([tmdbMovieDetailWithAppendedArb])(
    'Property 2: scalar fields are preserved exactly from raw input',
    (raw) => {
      const result = normalizeMovieDetail(raw);
      expect(result.id).toBe(raw.id);
      expect(result.title).toBe(raw.title);
      expect(result.overview).toBe(raw.overview);
      expect(result.rating).toBe(raw.vote_average);
    },
  );

  test.prop([tmdbMovieDetailWithAppendedArb])(
    'Property 2: genres array length matches raw genres array length',
    (raw) => {
      const result = normalizeMovieDetail(raw);
      expect(result.genres.length).toBe(raw.genres.length);
    },
  );

  test.prop([tmdbMovieDetailWithAppendedArb])(
    'Property 2: keywords array length matches raw keywords array length',
    (raw) => {
      const result = normalizeMovieDetail(raw);
      expect(result.keywords.length).toBe(raw.keywords.keywords.length);
    },
  );
});

// ─── Property 10: Cast is always limited to the top 5 members ────────────────
// Feature: tmdb-mcp-server
// Property 10: Cast is always limited to the top 5 members
// Validates: Requirements 2.2
describe('extractCast', () => {
  test.prop([fc.array(tmdbCastMemberArb)])(
    'Property 10: cast result length is always <= 5 regardless of input size',
    (cast) => {
      const result = extractCast(cast);
      expect(result.length).toBeLessThanOrEqual(5);
    },
  );

  test.prop([fc.array(tmdbCastMemberArb, { minLength: 5 })])(
    'Property 10: cast result is exactly 5 when input has 5 or more members',
    (cast) => {
      const result = extractCast(cast);
      expect(result.length).toBe(5);
    },
  );

  test.prop([fc.array(tmdbCastMemberArb, { maxLength: 4 })])(
    'Property 10: cast result length equals input length when input has fewer than 5 members',
    (cast) => {
      const result = extractCast(cast);
      expect(result.length).toBe(cast.length);
    },
  );

  it('Property 10: undefined cast returns empty array', () => {
    expect(extractCast(undefined)).toEqual([]);
  });

  test.prop([fc.array(tmdbCastMemberArb)])(
    'Property 10: cast preserves original billing order (first N members)',
    (cast) => {
      const result = extractCast(cast);
      const expected = cast.slice(0, 5);
      result.forEach((member, i) => {
        expect(member.name).toBe(expected[i].name);
        expect(member.character).toBe(expected[i].character);
      });
    },
  );

  // Also validate via normalizeMovieDetail
  test.prop([tmdbMovieDetailWithAppendedArb])(
    'Property 10: normalizeMovieDetail cast is always <= 5 members',
    (raw) => {
      const result = normalizeMovieDetail(raw);
      expect(result.cast.length).toBeLessThanOrEqual(5);
    },
  );
});

// ─── extractGenreNames ────────────────────────────────────────────────────────
describe('extractGenreNames', () => {
  test.prop([fc.array(tmdbGenreArb)])(
    'maps genre objects to name strings',
    (genres) => {
      const result = extractGenreNames(genres);
      expect(result).toEqual(genres.map((g) => g.name));
    },
  );

  it('returns empty array for undefined', () => {
    expect(extractGenreNames(undefined)).toEqual([]);
  });
});

// ─── extractDirector ─────────────────────────────────────────────────────────
describe('extractDirector', () => {
  test.prop([fc.array(tmdbCrewMemberArb).filter((crew) => !crew.some((m) => m.job === 'Director'))])(
    'returns null when no crew member has job === "Director"',
    (crew) => {
      expect(extractDirector(crew)).toBeNull();
    },
  );

  test.prop([
    fc.tuple(
      directorCrewMemberArb,
      fc.array(tmdbCrewMemberArb),
    ).map(([director, rest]) => [director, ...rest]),
  ])(
    'returns the name of the first Director in the crew array',
    (crew) => {
      const result = extractDirector(crew as TmdbCrewMember[]);
      const firstDirector = (crew as TmdbCrewMember[]).find((m) => m.job === 'Director');
      expect(result).toBe(firstDirector?.name ?? null);
    },
  );

  it('returns null for undefined crew', () => {
    expect(extractDirector(undefined)).toBeNull();
  });

  it('returns null for empty crew array', () => {
    expect(extractDirector([])).toBeNull();
  });
});
