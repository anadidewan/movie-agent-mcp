/**
 * Integration tests for POST /tools/get_genre_id
 */

import request from 'supertest';
import { createApp } from '../../../src/app';
import { tmdbClient } from '../../../src/lib/tmdbClient';
import { ErrorCode } from '../../../src/types/errors';

jest.mock('../../../src/lib/tmdbClient');

const mockedGet = tmdbClient.get as jest.MockedFunction<typeof tmdbClient.get>;

const app = createApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const tmdbGenreListResponse = {
  genres: [
    { id: 28, name: 'Action' },
    { id: 35, name: 'Comedy' },
    { id: 18, name: 'Drama' },
    { id: 27, name: 'Horror' },
    { id: 878, name: 'Science Fiction' },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /tools/get_genre_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Happy path: known genre name returns correct ID
  it('returns 200 with genre_id and genre_name for a known genre', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbGenreListResponse } as never);

    const res = await request(app)
      .post('/tools/get_genre_id')
      .set('Content-Type', 'application/json')
      .send({ name: 'Action' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ genre_id: 28, genre_name: 'Action' });
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith('/genre/movie/list');
  });

  // Case-insensitive matching
  it('matches genre name case-insensitively', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbGenreListResponse } as never);

    const res = await request(app)
      .post('/tools/get_genre_id')
      .set('Content-Type', 'application/json')
      .send({ name: 'action' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ genre_id: 28, genre_name: 'Action' });
  });

  it('matches genre name with mixed case', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbGenreListResponse } as never);

    const res = await request(app)
      .post('/tools/get_genre_id')
      .set('Content-Type', 'application/json')
      .send({ name: 'COMEDY' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ genre_id: 35, genre_name: 'Comedy' });
  });

  // Multi-word genre name
  it('resolves multi-word genre names correctly', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbGenreListResponse } as never);

    const res = await request(app)
      .post('/tools/get_genre_id')
      .set('Content-Type', 'application/json')
      .send({ name: 'Science Fiction' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ genre_id: 878, genre_name: 'Science Fiction' });
  });

  // Unknown genre → 404 NO_RESULTS
  it('returns 404 NO_RESULTS for an unknown genre name', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbGenreListResponse } as never);

    const res = await request(app)
      .post('/tools/get_genre_id')
      .set('Content-Type', 'application/json')
      .send({ name: 'Underwater Basket Weaving' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NO_RESULTS);
    expect(res.body.error.message).toContain('Underwater Basket Weaving');
  });

  // Validation: missing name → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when name is missing', async () => {
    const res = await request(app)
      .post('/tools/get_genre_id')
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Validation: empty string → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when name is an empty string', async () => {
    const res = await request(app)
      .post('/tools/get_genre_id')
      .set('Content-Type', 'application/json')
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Error response shape
  it('error response always has { error: { code, message } } shape', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbGenreListResponse } as never);

    const res = await request(app)
      .post('/tools/get_genre_id')
      .set('Content-Type', 'application/json')
      .send({ name: 'Nonexistent' });

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });
});
