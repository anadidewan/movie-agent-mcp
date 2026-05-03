/**
 * Security property tests for API key leakage and request logging.
 *
 * Property 8: The TMDB API key never appears in any HTTP response body
 * Validates: Requirements 11.2, 11.3, 10.9
 *
 * Property 9: Request logs always contain method, path, and status
 * Validates: Requirements 12.1
 */

import * as fc from 'fast-check';
import { test } from '@fast-check/jest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { tmdbClient } from '../../src/lib/tmdbClient';
import { AppError, ErrorCode } from '../../src/types/errors';

jest.mock('../../src/lib/tmdbClient');

// ── Capture pino-http log output by mocking the logger module ─────────────────
// pino writes directly to the file descriptor, bypassing process.stdout.write,
// so we inject a PassThrough stream as the pino destination via jest.mock.
// This keeps createApp() free of test-only parameters.

let capturedLogLines: Record<string, unknown>[] = [];

jest.mock('../../src/lib/logger', () => {
  const { PassThrough } = require('stream') as typeof import('stream');
  const pino = require('pino').default as typeof import('pino').default;
  const pinoHttp = require('pino-http').default as typeof import('pino-http').default;

  const dest = new PassThrough();

  const testLogger = pino(
    {
      level: 'info',
      redact: { paths: ['req.headers.authorization'], censor: '[REDACTED]' },
    },
    dest,
  );

  let buffer = '';
  dest.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{')) {
        try {
          capturedLogLines.push(JSON.parse(trimmed) as Record<string, unknown>);
        } catch {
          // skip non-JSON lines
        }
      }
    }
  });

  const httpLogger = pinoHttp({
    logger: testLogger,
    redact: { paths: ['req.headers.authorization'], censor: '[REDACTED]' },
    serializers: {
      req(req: { method: string; url: string }) {
        return { method: req.method, url: req.url };
      },
    },
  });

  return { logger: testLogger, httpLogger };
});

const mockedGet = tmdbClient.get as jest.MockedFunction<typeof tmdbClient.get>;

// ── Sentinel API key used throughout these tests ──────────────────────────────
const TEST_API_KEY = 'TEST_SECRET_KEY_12345';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const successPagedResponse = {
  results: [
    {
      id: 550,
      title: 'Fight Club',
      release_date: '1999-10-15',
      overview: 'An insomniac office worker.',
      poster_path: '/abc.jpg',
      vote_average: 8.4,
      genre_ids: [18],
    },
  ],
  total_results: 1,
  total_pages: 1,
  page: 1,
};

// ── Scenario arbitraries for Property 8 ──────────────────────────────────────

/**
 * Each scenario describes a mock setup + a supertest request to make.
 * We use fc.oneof to cover success, 404, 429, 500, validation error, and
 * method/content-type guard paths.
 */
type Scenario =
  | { kind: 'success' }
  | { kind: 'not_found' }
  | { kind: 'rate_limited'; retryAfter: string | undefined }
  | { kind: 'internal_error' }
  | { kind: 'validation_error' }
  | { kind: 'method_not_allowed' }
  | { kind: 'unsupported_media_type' };

const scenarioArb: fc.Arbitrary<Scenario> = fc.oneof(
  fc.constant<Scenario>({ kind: 'success' }),
  fc.constant<Scenario>({ kind: 'not_found' }),
  fc.record<Scenario & { kind: 'rate_limited' }>({
    kind: fc.constant('rate_limited'),
    retryAfter: fc.oneof(
      fc.constant(undefined),
      fc.integer({ min: 1, max: 120 }).map(String),
    ),
  }),
  fc.constant<Scenario>({ kind: 'internal_error' }),
  fc.constant<Scenario>({ kind: 'validation_error' }),
  fc.constant<Scenario>({ kind: 'method_not_allowed' }),
  fc.constant<Scenario>({ kind: 'unsupported_media_type' }),
);

// ─── Property 8: API key never appears in any HTTP response body ──────────────
// Feature: tmdb-mcp-server
// Property 8: The TMDB API key never appears in any HTTP response body
// Validates: Requirements 11.2, 11.3, 10.9

describe('Property 8: TMDB API key never appears in HTTP response body', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    // Set the sentinel key before creating the app so tmdbClient picks it up
    process.env.TMDB_API_KEY = TEST_API_KEY;
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    delete process.env.TMDB_API_KEY;
  });

  test.prop([scenarioArb])(
    'Property 8: response body never contains the API key value for any scenario',
    async (scenario) => {
      // Set up the mock based on the scenario
      switch (scenario.kind) {
        case 'success':
          mockedGet.mockResolvedValueOnce({ data: successPagedResponse } as never);
          break;
        case 'not_found':
          mockedGet.mockRejectedValueOnce(
            new AppError(ErrorCode.NOT_FOUND, 404, 'Resource not found on TMDB'),
          );
          break;
        case 'rate_limited':
          mockedGet.mockRejectedValueOnce(
            new AppError(
              ErrorCode.RATE_LIMITED,
              429,
              'TMDB rate limit reached',
              scenario.retryAfter,
            ),
          );
          break;
        case 'internal_error':
          mockedGet.mockRejectedValueOnce(
            new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Upstream error'),
          );
          break;
        case 'validation_error':
          // No mock needed — validation fails before TMDB is called
          break;
        case 'method_not_allowed':
          // No mock needed — method guard fires before TMDB is called
          break;
        case 'unsupported_media_type':
          // No mock needed — content-type guard fires before TMDB is called
          break;
      }

      let res: request.Response;

      switch (scenario.kind) {
        case 'success':
        case 'not_found':
        case 'rate_limited':
        case 'internal_error':
          res = await request(app)
            .post('/tools/search_movies')
            .set('Content-Type', 'application/json')
            .send({ query: 'Fight Club' });
          break;

        case 'validation_error':
          // Missing required field — triggers 400 VALIDATION_ERROR
          res = await request(app)
            .post('/tools/search_movies')
            .set('Content-Type', 'application/json')
            .send({});
          break;

        case 'method_not_allowed':
          // GET on a tool endpoint — triggers 405 METHOD_NOT_ALLOWED
          res = await request(app)
            .get('/tools/search_movies')
            .set('Content-Type', 'application/json');
          break;

        case 'unsupported_media_type':
          // Wrong Content-Type — triggers 415 UNSUPPORTED_MEDIA_TYPE
          res = await request(app)
            .post('/tools/search_movies')
            .set('Content-Type', 'text/plain')
            .send('query=Fight Club');
          break;
      }

      // The response body string must never contain the sentinel API key
      const bodyStr = JSON.stringify(res!.body);
      expect(bodyStr).not.toContain(TEST_API_KEY);

      // Also check the raw text representation
      const rawText = res!.text ?? '';
      expect(rawText).not.toContain(TEST_API_KEY);
    },
  );

  // Explicit example: 500 INTERNAL_ERROR from an unexpected thrown error
  it('Property 8: unexpected thrown error produces generic 500 without API key', async () => {
    mockedGet.mockRejectedValueOnce(new Error(`Auth failed with key ${TEST_API_KEY}`));

    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({ query: 'Fight Club' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(JSON.stringify(res.body)).not.toContain(TEST_API_KEY);
    expect(res.text).not.toContain(TEST_API_KEY);
  });

  // Explicit example: 401 from TMDB (auth failure) — must not expose key
  it('Property 8: TMDB auth failure produces 500 INTERNAL_ERROR without API key', async () => {
    mockedGet.mockRejectedValueOnce(
      new AppError(ErrorCode.INTERNAL_ERROR, 500, 'TMDB authentication failed'),
    );

    const res = await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({ query: 'Fight Club' });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(TEST_API_KEY);
    expect(res.text).not.toContain(TEST_API_KEY);
  });
});

// ─── Property 9: Request logs always contain method, path, and status ─────────
// Feature: tmdb-mcp-server
// Property 9: Request logs always contain method, path, and status
// Validates: Requirements 12.1

describe('Property 9: Request logs always contain method, url, and statusCode', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    process.env.TMDB_API_KEY = TEST_API_KEY;
    process.env.NODE_ENV = 'test';
    // The logger module is already mocked at the top of this file.
    // createApp() will pick up the mocked httpLogger automatically.
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset captured log lines before each iteration
    capturedLogLines = [];
  });

  afterAll(() => {
    delete process.env.TMDB_API_KEY;
  });

  /**
   * Arbitraries for different request types to cover a variety of paths.
   */
  type RequestSpec =
    | { kind: 'health' }
    | { kind: 'tools_discovery' }
    | { kind: 'search_movies_valid' }
    | { kind: 'search_movies_invalid' }
    | { kind: 'method_not_allowed' };

  const requestSpecArb: fc.Arbitrary<RequestSpec> = fc.oneof(
    fc.constant<RequestSpec>({ kind: 'health' }),
    fc.constant<RequestSpec>({ kind: 'tools_discovery' }),
    fc.constant<RequestSpec>({ kind: 'search_movies_valid' }),
    fc.constant<RequestSpec>({ kind: 'search_movies_invalid' }),
    fc.constant<RequestSpec>({ kind: 'method_not_allowed' }),
  );

  test.prop([requestSpecArb])(
    'Property 9: every request produces a log entry with method, url, and statusCode',
    async (spec) => {
      if (spec.kind === 'search_movies_valid') {
        mockedGet.mockResolvedValueOnce({ data: successPagedResponse } as never);
      }

      // Reset log lines before this iteration
      capturedLogLines.length = 0;

      switch (spec.kind) {
        case 'health':
          await request(app).get('/health');
          break;
        case 'tools_discovery':
          await request(app).get('/tools');
          break;
        case 'search_movies_valid':
          await request(app)
            .post('/tools/search_movies')
            .set('Content-Type', 'application/json')
            .send({ query: 'Inception' });
          break;
        case 'search_movies_invalid':
          await request(app)
            .post('/tools/search_movies')
            .set('Content-Type', 'application/json')
            .send({});
          break;
        case 'method_not_allowed':
          await request(app)
            .get('/tools/search_movies')
            .set('Content-Type', 'application/json');
          break;
      }

      // pino-http emits a log entry on response finish that includes req and res info.
      // Find the HTTP request log entry — it will have req.method and res.statusCode.
      const httpLogEntry = capturedLogLines.find(
        (entry) =>
          (entry['req'] !== undefined && entry['res'] !== undefined) ||
          (entry['method'] !== undefined && entry['url'] !== undefined && entry['statusCode'] !== undefined),
      );

      // There must be at least one HTTP log entry per request
      expect(httpLogEntry).toBeDefined();

      if (httpLogEntry) {
        if (httpLogEntry['req'] !== undefined) {
          // Standard pino-http shape
          const req = httpLogEntry['req'] as Record<string, unknown>;
          const res = httpLogEntry['res'] as Record<string, unknown>;
          expect(typeof req['method']).toBe('string');
          expect(typeof req['url']).toBe('string');
          expect(typeof res['statusCode']).toBe('number');
        } else {
          // Flat shape (custom serializer)
          expect(typeof httpLogEntry['method']).toBe('string');
          expect(typeof httpLogEntry['url']).toBe('string');
          expect(typeof httpLogEntry['statusCode']).toBe('number');
        }
      }
    },
  );

  // Explicit example: health check log entry
  it('Property 9: GET /health log entry contains method GET, url /health, and statusCode 200', async () => {
    capturedLogLines.length = 0;
    await request(app).get('/health');

    const httpEntry = capturedLogLines.find(
      (entry) =>
        (entry['req'] !== undefined && entry['res'] !== undefined) ||
        (entry['method'] !== undefined && entry['url'] !== undefined),
    );

    expect(httpEntry).toBeDefined();

    if (httpEntry) {
      if (httpEntry['req'] !== undefined) {
        const req = httpEntry['req'] as Record<string, unknown>;
        const res = httpEntry['res'] as Record<string, unknown>;
        expect(req['method']).toBe('GET');
        expect(req['url']).toBe('/health');
        expect(res['statusCode']).toBe(200);
      } else {
        expect(httpEntry['method']).toBe('GET');
        expect(httpEntry['url']).toBe('/health');
        expect(httpEntry['statusCode']).toBe(200);
      }
    }
  });

  // Explicit example: error path log entry
  it('Property 9: POST /tools/search_movies with missing query produces log entry with statusCode 400', async () => {
    capturedLogLines.length = 0;
    await request(app)
      .post('/tools/search_movies')
      .set('Content-Type', 'application/json')
      .send({});

    const httpEntry = capturedLogLines.find(
      (entry) =>
        (entry['req'] !== undefined && entry['res'] !== undefined) ||
        (entry['method'] !== undefined && entry['url'] !== undefined),
    );

    expect(httpEntry).toBeDefined();

    if (httpEntry) {
      if (httpEntry['req'] !== undefined) {
        const res = httpEntry['res'] as Record<string, unknown>;
        expect(res['statusCode']).toBe(400);
      } else {
        expect(httpEntry['statusCode']).toBe(400);
      }
    }
  });
});
