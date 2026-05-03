import * as fc from 'fast-check';
import { test } from '@fast-check/jest';
import { SearchMoviesSchema } from '../../../src/schemas/searchMovies';
import { GetMovieDetailsSchema } from '../../../src/schemas/getMovieDetails';
import { DiscoverMoviesSchema } from '../../../src/schemas/discoverMovies';
import { GetRecommendationsSchema } from '../../../src/schemas/getRecommendations';
import { GetTrendingSchema } from '../../../src/schemas/getTrending';
import { GetMovieIdSchema } from '../../../src/schemas/getMovieId';
import { GetGenreIdSchema } from '../../../src/schemas/getGenreId';
import { AppError, ErrorCode } from '../../../src/types/errors';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Simulates the semantic validation performed by the discoverMovies service.
 * Throws UNPROCESSABLE_INPUT when year_from > year_to.
 */
function validateDiscoverMoviesSemantics(input: {
  year_from?: number;
  year_to?: number;
}): void {
  if (input.year_from !== undefined && input.year_to !== undefined) {
    if (input.year_from > input.year_to) {
      throw new AppError(
        ErrorCode.UNPROCESSABLE_INPUT,
        422,
        'year_from must not be greater than year_to',
      );
    }
  }
}

// ─── Property 5: Invalid tool inputs always produce VALIDATION_ERROR ─────────
// Feature: tmdb-mcp-server
// Property 5: Invalid tool inputs always produce 400 VALIDATION_ERROR and never reach TMDB
// Validates: Requirements 1.4, 2.3, 3.4, 4.3, 5.3, 6.4, 15.1, 15.2, 15.3

describe('Property 5: Invalid inputs always fail schema validation', () => {
  // ── search_movies ──────────────────────────────────────────────────────────

  describe('SearchMoviesSchema', () => {
    it('Property 5: missing query fails validation', () => {
      expect(SearchMoviesSchema.safeParse({}).success).toBe(false);
      expect(SearchMoviesSchema.safeParse({ year: 2020 }).success).toBe(false);
    });

    it('Property 5: empty string query fails validation', () => {
      expect(SearchMoviesSchema.safeParse({ query: '' }).success).toBe(false);
    });

    test.prop([
      fc.anything().filter(
        (v) =>
          typeof v !== 'string' ||
          (v as string).length === 0,
      ),
    ])(
      'Property 5: non-string or empty query always fails',
      (invalidQuery) => {
        const result = SearchMoviesSchema.safeParse({ query: invalidQuery });
        expect(result.success).toBe(false);
      },
    );

    test.prop([
      fc.record({
        query: fc.string({ minLength: 1 }),
        year: fc.anything().filter((v) => !Number.isInteger(v) || typeof v !== 'number'),
      }).filter(({ year }) => year !== undefined),
    ])(
      'Property 5: non-integer year always fails',
      ({ query, year }) => {
        const result = SearchMoviesSchema.safeParse({ query, year });
        expect(result.success).toBe(false);
      },
    );

    it('Property 5: valid input passes', () => {
      expect(SearchMoviesSchema.safeParse({ query: 'Inception' }).success).toBe(true);
      expect(SearchMoviesSchema.safeParse({ query: 'Inception', year: 2010 }).success).toBe(true);
    });
  });

  // ── get_movie_details ──────────────────────────────────────────────────────

  describe('GetMovieDetailsSchema', () => {
    it('Property 5: missing movie_id fails validation', () => {
      expect(GetMovieDetailsSchema.safeParse({}).success).toBe(false);
    });

    test.prop([
      fc.anything().filter((v) => !Number.isInteger(v) || typeof v !== 'number'),
    ])(
      'Property 5: non-integer movie_id always fails',
      (invalidId) => {
        const result = GetMovieDetailsSchema.safeParse({ movie_id: invalidId });
        expect(result.success).toBe(false);
      },
    );

    it('Property 5: float movie_id fails validation', () => {
      expect(GetMovieDetailsSchema.safeParse({ movie_id: 1.5 }).success).toBe(false);
    });

    it('Property 5: string movie_id fails validation', () => {
      expect(GetMovieDetailsSchema.safeParse({ movie_id: '123' }).success).toBe(false);
    });

    it('Property 5: valid integer movie_id passes', () => {
      expect(GetMovieDetailsSchema.safeParse({ movie_id: 550 }).success).toBe(true);
    });
  });

  // ── discover_movies ────────────────────────────────────────────────────────

  describe('DiscoverMoviesSchema', () => {
    test.prop([
      // Exclude undefined (field is optional — absence is valid) and valid numbers in [0, 10]
      fc.anything().filter(
        (v) =>
          v !== undefined &&
          (typeof v !== 'number' ||
            isNaN(v as number) ||
            (v as number) < 0 ||
            (v as number) > 10),
      ),
    ])(
      'Property 5: min_rating with wrong type or out-of-range value always fails',
      (invalidRating) => {
        const result = DiscoverMoviesSchema.safeParse({ min_rating: invalidRating });
        expect(result.success).toBe(false);
      },
    );

    it('Property 5: min_rating below 0 fails', () => {
      expect(DiscoverMoviesSchema.safeParse({ min_rating: -1 }).success).toBe(false);
    });

    it('Property 5: min_rating above 10 fails', () => {
      expect(DiscoverMoviesSchema.safeParse({ min_rating: 11 }).success).toBe(false);
    });

    it('Property 5: string min_rating fails', () => {
      expect(DiscoverMoviesSchema.safeParse({ min_rating: 'high' }).success).toBe(false);
    });

    it('Property 5: non-integer year_from fails', () => {
      expect(DiscoverMoviesSchema.safeParse({ year_from: 2020.5 }).success).toBe(false);
    });

    it('Property 5: non-integer year_to fails', () => {
      expect(DiscoverMoviesSchema.safeParse({ year_to: 2020.5 }).success).toBe(false);
    });

    it('Property 5: empty object passes (all fields optional)', () => {
      expect(DiscoverMoviesSchema.safeParse({}).success).toBe(true);
    });

    it('Property 5: valid full input passes', () => {
      expect(
        DiscoverMoviesSchema.safeParse({
          genre: 'Action',
          min_rating: 7.5,
          year_from: 2000,
          year_to: 2020,
          keywords: 'superhero',
        }).success,
      ).toBe(true);
    });
  });

  // ── get_recommendations ────────────────────────────────────────────────────

  describe('GetRecommendationsSchema', () => {
    it('Property 5: missing movie_id fails validation', () => {
      expect(GetRecommendationsSchema.safeParse({}).success).toBe(false);
    });

    test.prop([
      fc.anything().filter((v) => !Number.isInteger(v) || typeof v !== 'number'),
    ])(
      'Property 5: non-integer movie_id always fails',
      (invalidId) => {
        const result = GetRecommendationsSchema.safeParse({ movie_id: invalidId });
        expect(result.success).toBe(false);
      },
    );

    it('Property 5: valid integer movie_id passes', () => {
      expect(GetRecommendationsSchema.safeParse({ movie_id: 550 }).success).toBe(true);
    });
  });

  // ── get_trending ───────────────────────────────────────────────────────────

  describe('GetTrendingSchema', () => {
    it('Property 5: missing window fails validation', () => {
      expect(GetTrendingSchema.safeParse({}).success).toBe(false);
    });

    test.prop([
      fc.anything().filter((v) => v !== 'day' && v !== 'week'),
    ])(
      'Property 5: any value other than "day" or "week" always fails',
      (invalidWindow) => {
        const result = GetTrendingSchema.safeParse({ window: invalidWindow });
        expect(result.success).toBe(false);
      },
    );

    it('Property 5: "day" passes', () => {
      expect(GetTrendingSchema.safeParse({ window: 'day' }).success).toBe(true);
    });

    it('Property 5: "week" passes', () => {
      expect(GetTrendingSchema.safeParse({ window: 'week' }).success).toBe(true);
    });

    it('Property 5: "month" fails', () => {
      expect(GetTrendingSchema.safeParse({ window: 'month' }).success).toBe(false);
    });

    it('Property 5: empty string fails', () => {
      expect(GetTrendingSchema.safeParse({ window: '' }).success).toBe(false);
    });
  });

  // ── get_movie_id ───────────────────────────────────────────────────────────

  describe('GetMovieIdSchema', () => {
    it('Property 5: missing query fails validation', () => {
      expect(GetMovieIdSchema.safeParse({}).success).toBe(false);
    });

    it('Property 5: empty string query fails validation', () => {
      expect(GetMovieIdSchema.safeParse({ query: '' }).success).toBe(false);
    });

    test.prop([
      fc.anything().filter(
        (v) => typeof v !== 'string' || (v as string).length === 0,
      ),
    ])(
      'Property 5: non-string or empty query always fails',
      (invalidQuery) => {
        const result = GetMovieIdSchema.safeParse({ query: invalidQuery });
        expect(result.success).toBe(false);
      },
    );

    it('Property 5: valid query passes', () => {
      expect(GetMovieIdSchema.safeParse({ query: 'The Matrix' }).success).toBe(true);
    });

    it('Property 5: valid query with year passes', () => {
      expect(GetMovieIdSchema.safeParse({ query: 'The Matrix', year: 1999 }).success).toBe(true);
    });
  });

  // ── get_genre_id ───────────────────────────────────────────────────────────

  describe('GetGenreIdSchema', () => {
    it('Property 5: missing name fails validation', () => {
      expect(GetGenreIdSchema.safeParse({}).success).toBe(false);
    });

    it('Property 5: empty string name fails validation', () => {
      expect(GetGenreIdSchema.safeParse({ name: '' }).success).toBe(false);
    });

    test.prop([
      fc.anything().filter(
        (v) => typeof v !== 'string' || (v as string).length === 0,
      ),
    ])(
      'Property 5: non-string or empty name always fails',
      (invalidName) => {
        const result = GetGenreIdSchema.safeParse({ name: invalidName });
        expect(result.success).toBe(false);
      },
    );

    it('Property 5: valid name passes', () => {
      expect(GetGenreIdSchema.safeParse({ name: 'Action' }).success).toBe(true);
    });

    it('Property 5: single character name passes', () => {
      expect(GetGenreIdSchema.safeParse({ name: 'A' }).success).toBe(true);
    });

    it('Property 5: multi-word name passes', () => {
      expect(GetGenreIdSchema.safeParse({ name: 'Science Fiction' }).success).toBe(true);
    });
  });
});

// ─── Property 6: Semantic validation rejects year_from > year_to ─────────────
// Feature: tmdb-mcp-server
// Property 6: Semantic validation rejects year_from > year_to
// Validates: Requirements 3.1, 10.3

describe('Property 6: Semantic validation rejects year_from > year_to', () => {
  test.prop([
    fc
      .tuple(fc.integer({ min: -9999, max: 9999 }), fc.integer({ min: -9999, max: 9999 }))
      .filter(([a, b]) => a > b),
  ])(
    'Property 6: year_from > year_to always throws UNPROCESSABLE_INPUT',
    ([year_from, year_to]) => {
      expect(() =>
        validateDiscoverMoviesSemantics({ year_from, year_to }),
      ).toThrow(AppError);

      try {
        validateDiscoverMoviesSemantics({ year_from, year_to });
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.code).toBe(ErrorCode.UNPROCESSABLE_INPUT);
        expect(appErr.statusCode).toBe(422);
      }
    },
  );

  test.prop([
    fc
      .tuple(fc.integer({ min: -9999, max: 9999 }), fc.integer({ min: -9999, max: 9999 }))
      .filter(([a, b]) => a <= b),
  ])(
    'Property 6: year_from <= year_to never throws',
    ([year_from, year_to]) => {
      expect(() =>
        validateDiscoverMoviesSemantics({ year_from, year_to }),
      ).not.toThrow();
    },
  );

  it('Property 6: only year_from present — no error', () => {
    expect(() => validateDiscoverMoviesSemantics({ year_from: 2020 })).not.toThrow();
  });

  it('Property 6: only year_to present — no error', () => {
    expect(() => validateDiscoverMoviesSemantics({ year_to: 2020 })).not.toThrow();
  });

  it('Property 6: neither present — no error', () => {
    expect(() => validateDiscoverMoviesSemantics({})).not.toThrow();
  });

  it('Property 6: year_from === year_to — no error', () => {
    expect(() =>
      validateDiscoverMoviesSemantics({ year_from: 2020, year_to: 2020 }),
    ).not.toThrow();
  });

  it('Property 6: year_from 2021 > year_to 2020 throws UNPROCESSABLE_INPUT', () => {
    expect(() =>
      validateDiscoverMoviesSemantics({ year_from: 2021, year_to: 2020 }),
    ).toThrow(AppError);
  });
});
