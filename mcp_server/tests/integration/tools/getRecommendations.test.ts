/**
 * Integration tests for POST /tools/get_recommendations
 *
 * Requirements: 4.1, 4.4, 4.5
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
  id: 807,
  title: 'Se7en',
  release_date: '1995-09-22',
  overview: 'Two detectives hunt a serial killer who uses the seven deadly sins.',
  poster_path: '/69Sns8WoET6CfaYlIkHbla4l7nC.jpg',
  vote_average: 8.3,
  genre_ids: [80, 9648, 53],
};

const tmdbPagedResponse = {
  results: [tmdbMovieResult],
  total_results: 1,
  total_pages: 1,
  page: 1,
};

const expectedNormalized = {
  id: 807,
  title: 'Se7en',
  year: 1995,
  overview: 'Two detectives hunt a serial killer who uses the seven deadly sins.',
  poster_url: 'https://image.tmdb.org/t/p/w500/69Sns8WoET6CfaYlIkHbla4l7nC.jpg',
  rating: 8.3,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /tools/get_recommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Requirement 4.1: valid movie_id returns normalized recommendations
  it('returns 200 with normalized results for a valid movie_id', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/get_recommendations')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 550 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [expectedNormalized] });
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith('/movie/550/recommendations');
  });

  // Requirement 4.4: TMDB 404 → 404 NOT_FOUND
  it('returns 404 NOT_FOUND when TMDB returns 404 for the movie_id', async () => {
    mockedGet.mockRejectedValueOnce(
      new AppError(ErrorCode.NOT_FOUND, 404, 'Resource not found on TMDB'),
    );

    const res = await request(app)
      .post('/tools/get_recommendations')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 99999999 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  // Requirement 4.5: zero recommendations → 200 with empty array
  it('returns 200 with empty results array when TMDB returns zero recommendations', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { results: [], total_results: 0, total_pages: 0, page: 1 },
    } as never);

    const res = await request(app)
      .post('/tools/get_recommendations')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 550 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [] });
  });

  // Requirement 4.3 (from design): missing movie_id → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when movie_id is missing', async () => {
    const res = await request(app)
      .post('/tools/get_recommendations')
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // movie_id must be a number
  it('returns 400 VALIDATION_ERROR when movie_id is not a number', async () => {
    const res = await request(app)
      .post('/tools/get_recommendations')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Error response shape
  it('error response always has { error: { code, message } } shape', async () => {
    mockedGet.mockRejectedValueOnce(
      new AppError(ErrorCode.NOT_FOUND, 404, 'Resource not found on TMDB'),
    );

    const res = await request(app)
      .post('/tools/get_recommendations')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 1 });

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});
