/**
 * Integration tests for POST /tools/get_trending
 *
 * Requirements: 5.1, 5.3
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
  id: 1022789,
  title: 'Inside Out 2',
  release_date: '2024-06-11',
  overview: 'Teenager Riley undergoes a new wave of emotions.',
  poster_path: '/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg',
  vote_average: 7.6,
  genre_ids: [16, 10751, 12, 35],
};

const tmdbPagedResponse = {
  results: [tmdbMovieResult],
  total_results: 1,
  total_pages: 1,
  page: 1,
};

const expectedNormalized = {
  id: 1022789,
  title: 'Inside Out 2',
  year: 2024,
  overview: 'Teenager Riley undergoes a new wave of emotions.',
  poster_url: 'https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg',
  rating: 7.6,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /tools/get_trending', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Requirement 5.1: window "day" returns normalized results
  it('returns 200 with normalized results for window "day"', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/get_trending')
      .set('Content-Type', 'application/json')
      .send({ window: 'day' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [expectedNormalized] });
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith('/trending/movie/day');
  });

  // Requirement 5.1: window "week" returns normalized results
  it('returns 200 with normalized results for window "week"', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/get_trending')
      .set('Content-Type', 'application/json')
      .send({ window: 'week' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [expectedNormalized] });
    expect(mockedGet).toHaveBeenCalledWith('/trending/movie/week');
  });

  // Requirement 5.3: invalid window value → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when window is an invalid value', async () => {
    const res = await request(app)
      .post('/tools/get_trending')
      .set('Content-Type', 'application/json')
      .send({ window: 'month' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Requirement 5.3: missing window → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when window is missing', async () => {
    const res = await request(app)
      .post('/tools/get_trending')
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Requirement 5.3: window must be exactly "day" or "week" (case-sensitive)
  it('returns 400 VALIDATION_ERROR when window is "Day" (wrong case)', async () => {
    const res = await request(app)
      .post('/tools/get_trending')
      .set('Content-Type', 'application/json')
      .send({ window: 'Day' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Error response shape
  it('error response always has { error: { code, message } } shape', async () => {
    const res = await request(app)
      .post('/tools/get_trending')
      .set('Content-Type', 'application/json')
      .send({ window: 'invalid' });

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});
