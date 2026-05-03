/**
 * Integration tests for POST /tools/discover_movies
 *
 * Requirements: 3.1, 3.2, 3.4, 10.3
 */

import request from 'supertest';
import { createApp } from '../../../src/app';
import { tmdbClient } from '../../../src/lib/tmdbClient';
import { ErrorCode } from '../../../src/types/errors';

jest.mock('../../../src/lib/tmdbClient');

const mockedGet = tmdbClient.get as jest.MockedFunction<typeof tmdbClient.get>;

const app = createApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const tmdbMovieResult = {
  id: 278,
  title: 'The Shawshank Redemption',
  release_date: '1994-09-23',
  overview: 'Two imprisoned men bond over a number of years.',
  poster_path: '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
  vote_average: 8.7,
  genre_ids: [18, 80],
};

const tmdbPagedResponse = {
  results: [tmdbMovieResult],
  total_results: 1,
  total_pages: 1,
  page: 1,
};

const expectedNormalized = {
  id: 278,
  title: 'The Shawshank Redemption',
  year: 1994,
  overview: 'Two imprisoned men bond over a number of years.',
  poster_url: 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
  rating: 8.7,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /tools/discover_movies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Requirement 3.1: valid filter combination returns normalized results
  it('returns 200 with normalized results for a valid filter combination', async () => {
    // genre: 'Drama' triggers genre lookup (first call), then discover (second call)
    mockedGet
      .mockResolvedValueOnce({ data: { genres: [{ id: 18, name: 'Drama' }] } } as never)
      .mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ genre: 'Drama', min_rating: 8.0, year_from: 1990, year_to: 2000 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [expectedNormalized] });
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  // Requirement 3.2: no filters → still calls TMDB and returns results
  it('returns 200 with results when no filters are provided', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [expectedNormalized] });
    expect(mockedGet).toHaveBeenCalledWith('/discover/movie', { params: {} });
  });

  // Requirement 3.1: single filter (genre name) — resolves name to ID first
  it('resolves genre name to ID and passes numeric ID to TMDB', async () => {
    // First call: genre list lookup; second call: discover
    mockedGet
      .mockResolvedValueOnce({ data: { genres: [{ id: 28, name: 'Action' }] } } as never)
      .mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ genre: 'Action' });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(mockedGet).toHaveBeenNthCalledWith(1, '/genre/movie/list');
    expect(mockedGet).toHaveBeenNthCalledWith(2, '/discover/movie', {
      params: { with_genres: 28 },
    });
  });

  // Numeric genre ID string bypasses genre lookup
  it('uses numeric genre ID directly without calling genre list endpoint', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ genre: '28' });

    expect(res.status).toBe(200);
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith('/discover/movie', {
      params: { with_genres: 28 },
    });
  });

  // Unknown genre name → 404 NO_RESULTS
  it('returns 404 NO_RESULTS when genre name does not match any TMDB genre', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { genres: [{ id: 28, name: 'Action' }] },
    } as never);

    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ genre: 'Underwater Basket Weaving' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NO_RESULTS);
  });

  // Requirement 3.1: min_rating filter is forwarded correctly
  it('forwards min_rating as vote_average.gte param to TMDB', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ min_rating: 7.5 });

    expect(res.status).toBe(200);
    expect(mockedGet).toHaveBeenCalledWith('/discover/movie', {
      params: { 'vote_average.gte': 7.5 },
    });
  });

  // Requirement 10.3: year_from > year_to → 422 UNPROCESSABLE_INPUT
  it('returns 422 UNPROCESSABLE_INPUT when year_from > year_to', async () => {
    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ year_from: 2020, year_to: 2010 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ErrorCode.UNPROCESSABLE_INPUT);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Requirement 10.3: year_from === year_to is valid (boundary)
  it('returns 200 when year_from equals year_to', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ year_from: 2000, year_to: 2000 });

    expect(res.status).toBe(200);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  // Requirement 3.4: invalid type for min_rating → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when min_rating is a string', async () => {
    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ min_rating: 'high' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Requirement 3.4: min_rating out of range → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when min_rating exceeds 10', async () => {
    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ min_rating: 11 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Requirement 3.4: invalid type for year_from → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when year_from is a string', async () => {
    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ year_from: 'nineteen-ninety' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Error response shape
  it('error response always has { error: { code, message } } shape', async () => {
    const res = await request(app)
      .post('/tools/discover_movies')
      .set('Content-Type', 'application/json')
      .send({ year_from: 2020, year_to: 2010 });

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});
