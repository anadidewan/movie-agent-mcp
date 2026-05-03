/**
 * Integration tests for GET /tools (discovery endpoint), method guard, and content-type guard
 *
 * Requirements: 7.1, 7.2, 8.1, 8.2, 8.3, 10.7, 10.8
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { tmdbClient } from '../../src/lib/tmdbClient';
import { ErrorCode } from '../../src/types/errors';
import { toolRegistry } from '../../src/registry/toolRegistry';

jest.mock('../../src/lib/tmdbClient');

const mockedGet = tmdbClient.get as jest.MockedFunction<typeof tmdbClient.get>;

const app = createApp();

const EXPECTED_TOOL_NAMES = [
  'search_movies',
  'get_movie_details',
  'discover_movies',
  'get_recommendations',
  'get_trending',
  'get_movie_id',
  'get_genre_id',
];

describe('GET /tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Requirement 8.1: returns 200 with tools array
  it('returns 200 with a tools array', async () => {
    const res = await request(app).get('/tools');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tools');
    expect(Array.isArray(res.body.tools)).toBe(true);
  });

  // Requirement 8.2: all six tools are present
  it('returns all six tools in the registry', async () => {
    const res = await request(app).get('/tools');

    expect(res.status).toBe(200);
    const names = res.body.tools.map((t: { name: string }) => t.name);
    for (const expectedName of EXPECTED_TOOL_NAMES) {
      expect(names).toContain(expectedName);
    }
    expect(res.body.tools).toHaveLength(7);
  });

  // Requirement 8.1: each tool has name, description, input_schema
  it('each tool entry has name, description, and input_schema fields', async () => {
    const res = await request(app).get('/tools');

    expect(res.status).toBe(200);
    for (const tool of res.body.tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.input_schema).toBe('object');
      expect(tool.input_schema).not.toBeNull();
    }
  });

  // Requirement 8.3: no TMDB calls are made
  it('makes no outbound calls to TMDB', async () => {
    await request(app).get('/tools');

    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Response matches the static toolRegistry exactly
  it('response tools array matches the static toolRegistry', async () => {
    const res = await request(app).get('/tools');

    expect(res.status).toBe(200);
    expect(res.body.tools).toEqual(toolRegistry);
  });

  // Response is JSON
  it('responds with Content-Type application/json', async () => {
    const res = await request(app).get('/tools');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

// ── Method Guard: GET on a tool endpoint → 405 METHOD_NOT_ALLOWED ─────────────
// Requirement 10.7

describe('Method guard — GET /tools/search_movies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 405 METHOD_NOT_ALLOWED for GET request to a tool endpoint', async () => {
    const res = await request(app).get('/tools/search_movies');

    expect(res.status).toBe(405);
    expect(res.body.error.code).toBe(ErrorCode.METHOD_NOT_ALLOWED);
  });

  it('error response has { error: { code, message } } shape', async () => {
    const res = await request(app).get('/tools/search_movies');

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });

  it('does not call TMDB for a wrong-method request', async () => {
    await request(app).get('/tools/search_movies');

    expect(mockedGet).not.toHaveBeenCalled();
  });
});

// ── Content-Type Guard: POST with wrong Content-Type → 415 ───────────────────
// Requirement 10.8

describe('Content-Type guard — POST /tools/search_movies with text/plain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 415 UNSUPPORTED_MEDIA_TYPE for POST with Content-Type: text/plain', async () => {
    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'text/plain')
      .send('query=Fight Club');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
  });

  it('returns 415 UNSUPPORTED_MEDIA_TYPE for POST with no Content-Type header', async () => {
    const res = await request(app)
      .post('/tools/search_movies')
      .send('query=Fight Club');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
  });

  it('error response has { error: { code, message } } shape', async () => {
    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'text/plain')
      .send('query=Fight Club');

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
  });

  it('does not call TMDB for a wrong content-type request', async () => {
    await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'text/plain')
      .send('query=Fight Club');

    expect(mockedGet).not.toHaveBeenCalled();
  });
});
