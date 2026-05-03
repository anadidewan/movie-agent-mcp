/**
 * Integration tests for GET /health
 *
 * Requirements: 7.1, 7.2
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { tmdbClient } from '../../src/lib/tmdbClient';

jest.mock('../../src/lib/tmdbClient');

const mockedGet = tmdbClient.get as jest.MockedFunction<typeof tmdbClient.get>;

const app = createApp();

describe('GET /health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Requirement 7.1: returns 200 with { status: "ok" }
  it('returns 200 with { status: "ok" }', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  // Requirement 7.2: no TMDB calls are made
  it('makes no outbound calls to TMDB', async () => {
    await request(app).get('/health');

    expect(mockedGet).not.toHaveBeenCalled();
  });

  // Response is JSON
  it('responds with Content-Type application/json', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
