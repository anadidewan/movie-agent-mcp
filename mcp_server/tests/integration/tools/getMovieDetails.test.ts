/**
 * Integration tests for POST /tools/get_movie_details
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import request from 'supertest';
import { createApp } from '../../../src/app';
import { tmdbClient } from '../../../src/lib/tmdbClient';
import { AppError, ErrorCode } from '../../../src/types/errors';

jest.mock('../../../src/lib/tmdbClient');

const mockedGet = tmdbClient.get as jest.MockedFunction<typeof tmdbClient.get>;

const app = createApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const tmdbDetailResponse = {
  id: 550,
  title: 'Fight Club',
  release_date: '1999-10-15',
  overview: 'An insomniac office worker forms an underground fight club.',
  poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
  vote_average: 8.4,
  runtime: 139,
  genres: [
    { id: 18, name: 'Drama' },
    { id: 53, name: 'Thriller' },
  ],
  credits: {
    cast: [
      { name: 'Brad Pitt', character: 'Tyler Durden', order: 0 },
      { name: 'Edward Norton', character: 'The Narrator', order: 1 },
      { name: 'Helena Bonham Carter', character: 'Marla Singer', order: 2 },
      { name: 'Meat Loaf', character: 'Robert Paulson', order: 3 },
      { name: 'Jared Leto', character: 'Angel Face', order: 4 },
      { name: 'Extra Actor', character: 'Extra Role', order: 5 }, // should be excluded (top 5 only)
    ],
    crew: [
      { name: 'David Fincher', job: 'Director', department: 'Directing' },
      { name: 'Jim Uhls', job: 'Screenplay', department: 'Writing' },
    ],
  },
  keywords: {
    keywords: [
      { id: 1, name: 'based on novel' },
      { id: 2, name: 'underground' },
    ],
  },
};

const expectedMovieDetail = {
  id: 550,
  title: 'Fight Club',
  year: 1999,
  overview: 'An insomniac office worker forms an underground fight club.',
  poster_url: 'https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
  rating: 8.4,
  runtime: 139,
  genres: ['Drama', 'Thriller'],
  cast: [
    { name: 'Brad Pitt', character: 'Tyler Durden' },
    { name: 'Edward Norton', character: 'The Narrator' },
    { name: 'Helena Bonham Carter', character: 'Marla Singer' },
    { name: 'Meat Loaf', character: 'Robert Paulson' },
    { name: 'Jared Leto', character: 'Angel Face' },
  ],
  director: 'David Fincher',
  keywords: ['based on novel', 'underground'],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /tools/get_movie_details', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Requirement 2.1: valid movie_id returns full MovieDetail shape
  it('returns 200 with full MovieDetail shape for a valid movie_id', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbDetailResponse } as never);

    const res = await request(app)
      .post('/tools/get_movie_details')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 550 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expectedMovieDetail);
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith('/movie/550', {
      params: { append_to_response: 'credits,keywords' },
    });
  });

  // Requirement 2.2: cast is limited to top 5 members
  it('limits cast to top 5 members', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbDetailResponse } as never);

    const res = await request(app)
      .post('/tools/get_movie_details')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 550 });

    expect(res.status).toBe(200);
    expect(res.body.cast).toHaveLength(5);
  });

  // Requirement 2.2: response includes all required fields
  it('response includes all required MovieDetail fields', async () => {
    mockedGet.mockResolvedValueOnce({ data: tmdbDetailResponse } as never);

    const res = await request(app)
      .post('/tools/get_movie_details')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 550 });

    expect(res.status).toBe(200);
    const body = res.body;
    expect(typeof body.id).toBe('number');
    expect(typeof body.title).toBe('string');
    expect(typeof body.overview).toBe('string');
    expect(typeof body.rating).toBe('number');
    expect(Array.isArray(body.genres)).toBe(true);
    expect(Array.isArray(body.cast)).toBe(true);
    expect(Array.isArray(body.keywords)).toBe(true);
    // year can be number or null
    expect(body.year === null || typeof body.year === 'number').toBe(true);
    // poster_url can be string or null
    expect(body.poster_url === null || typeof body.poster_url === 'string').toBe(true);
    // runtime can be number or null
    expect(body.runtime === null || typeof body.runtime === 'number').toBe(true);
    // director can be string or null
    expect(body.director === null || typeof body.director === 'string').toBe(true);
  });

  // Requirement 2.3: missing movie_id → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when movie_id is missing', async () => {
    const res = await request(app)
      .post('/tools/get_movie_details')
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Requirement 2.3: non-number movie_id → 400 VALIDATION_ERROR
  it('returns 400 VALIDATION_ERROR when movie_id is not a number', async () => {
    const res = await request(app)
      .post('/tools/get_movie_details')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 'not-a-number' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Requirement 2.4: TMDB 404 → 404 NOT_FOUND
  it('returns 404 NOT_FOUND when TMDB returns 404 for the movie_id', async () => {
    mockedGet.mockRejectedValueOnce(
      new AppError(ErrorCode.NOT_FOUND, 404, 'Resource not found on TMDB'),
    );

    const res = await request(app)
      .post('/tools/get_movie_details')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 99999999 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  // Handles null poster_path and null release_date gracefully
  it('handles null poster_path and null release_date', async () => {
    const detailWithNulls = {
      ...tmdbDetailResponse,
      poster_path: null,
      release_date: null,
    };
    mockedGet.mockResolvedValueOnce({ data: detailWithNulls } as never);

    const res = await request(app)
      .post('/tools/get_movie_details')
      .set('Content-Type', 'application/json')
      .send({ movie_id: 550 });

    expect(res.status).toBe(200);
    expect(res.body.poster_url).toBeNull();
    expect(res.body.year).toBeNull();
  });
});
