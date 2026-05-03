/**
 * Integration tests for POST /tools/get_movie_id
 *
 * Requirements: 6.1, 6.3, 6.4
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /tools/get_movie_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Requirement 6.1: valid query returns { movie_id: number }
  it('returns 200 with { movie_id: number } for a valid query', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/get_movie_id')
      .set('Content-Type', 'application/json')
      .send({ query: 'Fight Club' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ movie_id: 550 });
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith('/search/movie', {
      params: { query: 'Fight Club' },
    });
  });

  // Requirement 6.2: optional year narrows the search
  it('passes year param to TMDB when year is provided', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbPagedResponse } as never);

    const res = await request(app)
      .post('/tools/get_movie_id')
      .set('Content-Type', 'application/json')
      .send({ query: 'Fight Club', year: 1999 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ movie_id: 550 });
    expect(mockedGet).toHaveBeenCalledWith('/search/movie', {
      params: { query: 'Fight Club', year: 1999 },
    });
  });

  // Requirement 6.3: zero results → 404 NO_RESULTS
  it('returns 404 NO_RESULTS when TMDB returns zero results', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { results: [], total_results: 0, total_pages: 0, page: 1 },
    } as never);

    const res = await request(app)
      .post('/tools/get_movie_id')
      .set('Content-Type', 'application/json')
      .send({ query: 'xyzzy_no_results_expected' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NO_RESULTS);
  });

  // Requirement 6.4: missing query → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when query is missing', async () => {
    const res = await request(app)
      .post('/tools/get_movie_id')
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Requirement 6.4: empty query → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when query is an empty string', async () => {
    const res = await request(app)
      .post('/tools/get_movie_id')
      .set('Content-Type', 'application/json')
      .send({ query: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Returns the top-ranked result's ID (first in array)
  it('returns the movie_id of the first result when multiple results exist', async () => {
    const multipleResults = {
      results: [
        { ...tmdbMovieResult, id: 550 },
        { ...tmdbMovieResult, id: 807, title: 'Se7en' },
      ],
      total_results: 2,
      total_pages: 1,
      page: 1,
    };
    mockedGet.mockResolvedValueOnce({ data: multipleResults } as never);

    const res = await request(app)
      .post('/tools/get_movie_id')
      .set('Content-Type', 'application/json')
      .send({ query: 'Fight Club' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ movie_id: 550 }); // first result
  });

  // Error response shape
  it('error response always has { error: { code, message } } shape', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { results: [], total_results: 0, total_pages: 0, page: 1 },
    } as never);

    const res = await request(app)
      .post('/tools/get_movie_id')
      .set('Content-Type', 'application/json')
      .send({ query: 'no results' });

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});
