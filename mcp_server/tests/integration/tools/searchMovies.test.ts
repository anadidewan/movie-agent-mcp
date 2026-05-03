/**
 * Integration tests for POST /tools/search_movies
 *
 * Requirements: 1.1, 1.2, 1.4, 1.5, 13.1, 13.2
 */

import request from 'supertest';
import { createApp } from '../../../src/app';
import { tmdbClient } from '../../../src/lib/tmdbClient';
import { AppError, ErrorCode } from '../../../src/types/errors';

jest.mock('../../../src/lib/tmdbClient');

const mockedGet = tmdbClient.get as jest.MockedFunction<typeof tmdbClient.get>;

const app = createApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const tmdbMovieResult = {
  id: 550,
  title: 'Fight Club',
  release_date: '1999-10-15',
  overview: 'An insomniac office worker forms an underground fight club.',
  poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
  vote_average: 8.4,
  genre_ids: [18, 53],
};

const tmdbPagedResponse = {
  results: [tmdbMovieResult],
  total_results: 1,
  total_pages: 1,
  page: 1,
};

const expectedNormalized = {
  id: 550,
  title: 'Fight Club',
  year: 1999,
  overview: 'An insomniac office worker forms an underground fight club.',
  poster_url: 'https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
  rating: 8.4,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /tools/search_movies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Requirement 1.1: valid query returns normalized results
  it('returns 200 with normalized results array for a valid query', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({ query: 'Fight Club' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [expectedNormalized] });
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith('/search/movie', {
      params: { query: 'Fight Club' },
    });
  });

  // Requirement 1.2: optional year filter is forwarded to TMDB
  it('passes year param to TMDB when year is provided', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({ query: 'Fight Club', year: 1999 });

    expect(res.status).toBe(200);
    expect(mockedGet).toHaveBeenCalledWith('/search/movie', {
      params: { query: 'Fight Club', year: 1999 },
    });
  });

  // Requirement 1.4: missing query → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when query is missing', async () => {
    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Requirement 1.4: empty query → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when query is an empty string', async () => {
    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({ query: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Requirement 1.5: zero results → 200 with empty array
  it('returns 200 with empty results array when TMDB returns zero results', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { results: [], total_results: 0, total_pages: 0, page: 1 },
    } as never);

    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({ query: 'xyzzy_no_results_expected' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [] });
  });

  // Requirements 13.1, 13.2: TMDB 429 → 429 RATE_LIMITED with Retry-After header
  it('returns 429 RATE_LIMITED and propagates Retry-After header when TMDB rate-limits', async () => {
    mockedGet.mockRejectedValueOnce(
      new AppError(ErrorCode.RATE_LIMITED, 429, 'TMDB rate limit reached', '30'),
    );

    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({ query: 'Fight Club' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(res.headers['retry-after']).toBe('30');
  });

  // Requirement 13.1: TMDB 429 without Retry-After header
  it('returns 429 RATE_LIMITED without Retry-After header when not provided by TMDB', async () => {
    mockedGet.mockRejectedValueOnce(
      new AppError(ErrorCode.RATE_LIMITED, 429, 'TMDB rate limit reached'),
    );

    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({ query: 'Fight Club' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(res.headers['retry-after']).toBeUndefined();
  });

  // Error response shape
  it('error response always has { error: { code, message } } shape', async () => {
    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});
