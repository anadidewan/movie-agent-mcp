import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssueCode } from 'zod';
import { AppError, ErrorCode } from '../../../src/types/errors';
import { errorHandler } from '../../../src/middleware/errorHandler';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a minimal mock Express Response that captures the status code,
 * JSON body, and any headers set during error handling.
 */
function makeMockRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    headers,
  };
  return res;
}

function makeMockReq(): Request {
  return {} as Request;
}

function makeMockNext(): NextFunction {
  return jest.fn() as unknown as NextFunction;
}

// ─── Property 7: All error responses conform to the structured error shape ───
// Feature: tmdb-mcp-server
// Property 7: All error responses conform to the structured error shape
// Validates: Requirements 10.1–10.9

describe('errorHandler — Property 7: structured error shape', () => {
  // Map of ErrorCode → expected HTTP status
  const errorCodeStatusMap: Array<[ErrorCode, number]> = [
    [ErrorCode.VALIDATION_ERROR, 400],
    [ErrorCode.NOT_FOUND, 404],
    [ErrorCode.NO_RESULTS, 404],
    [ErrorCode.UNPROCESSABLE_INPUT, 422],
    [ErrorCode.RATE_LIMITED, 429],
    [ErrorCode.METHOD_NOT_ALLOWED, 405],
    [ErrorCode.UNSUPPORTED_MEDIA_TYPE, 415],
    [ErrorCode.INTERNAL_ERROR, 500],
  ];

  test.each(errorCodeStatusMap)(
    'AppError with code %s produces HTTP %i and structured body',
    (code, expectedStatus) => {
      const err = new AppError(code, expectedStatus, `Test message for ${code}`);
      const res = makeMockRes();

      errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

      expect(res.statusCode).toBe(expectedStatus);
      expect(res.body).toEqual({
        error: {
          code,
          message: `Test message for ${code}`,
        },
      });
    },
  );

  it('response body always has exactly { error: { code, message } } shape for AppError', () => {
    const err = new AppError(ErrorCode.NOT_FOUND, 404, 'Not found');
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['error']);
    const errorObj = body.error as Record<string, unknown>;
    expect(Object.keys(errorObj).sort()).toEqual(['code', 'message'].sort());
  });
});

// ─── RATE_LIMITED: Retry-After header propagation ────────────────────────────
// Validates: Requirements 13.1, 13.2

describe('errorHandler — RATE_LIMITED Retry-After propagation', () => {
  it('propagates Retry-After header when retryAfter is set on AppError', () => {
    const err = new AppError(ErrorCode.RATE_LIMITED, 429, 'Rate limited', '30');
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.body).toEqual({
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: 'Rate limited',
      },
    });
  });

  it('does NOT set Retry-After header when retryAfter is absent', () => {
    const err = new AppError(ErrorCode.RATE_LIMITED, 429, 'Rate limited');
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeUndefined();
  });

  it('does NOT set Retry-After header for non-RATE_LIMITED errors even if retryAfter is set', () => {
    // AppError constructor accepts retryAfter for any code, but handler should only propagate for RATE_LIMITED
    const err = new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Error', '60');
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    expect(res.headers['retry-after']).toBeUndefined();
  });
});

// ─── ZodError handling ───────────────────────────────────────────────────────
// Validates: Requirements 10.2, 15.2

describe('errorHandler — ZodError produces 400 VALIDATION_ERROR', () => {
  function makeZodError(fields: Array<{ path: string[]; message: string }>): ZodError {
    return new ZodError(
      fields.map(({ path, message }) => ({
        code: ZodIssueCode.custom,
        path,
        message,
      })),
    );
  }

  it('returns 400 with VALIDATION_ERROR code for a ZodError', () => {
    const err = makeZodError([{ path: ['query'], message: 'Required' }]);
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    expect(res.statusCode).toBe(400);
    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('includes field path and message in the error message', () => {
    const err = makeZodError([{ path: ['query'], message: 'String must contain at least 1 character(s)' }]);
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.message).toContain('query');
    expect(body.error.message).toContain('String must contain at least 1 character(s)');
  });

  it('joins multiple field errors with semicolons', () => {
    const err = makeZodError([
      { path: ['query'], message: 'Required' },
      { path: ['year'], message: 'Expected integer' },
    ]);
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.message).toContain('query');
    expect(body.error.message).toContain('year');
    expect(body.error.message).toContain(';');
  });

  it('response body has exactly { error: { code, message } } shape', () => {
    const err = makeZodError([{ path: ['movie_id'], message: 'Required' }]);
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['error']);
    const errorObj = body.error as Record<string, unknown>;
    expect(Object.keys(errorObj).sort()).toEqual(['code', 'message'].sort());
  });
});

// ─── Unknown error handling ───────────────────────────────────────────────────
// Validates: Requirements 10.9, 11.3

describe('errorHandler — unknown errors produce 500 INTERNAL_ERROR', () => {
  it('returns 500 with INTERNAL_ERROR for a plain Error', () => {
    const err = new Error('Something went wrong internally');
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
      },
    });
  });

  it('does NOT expose the original error message in the response', () => {
    const err = new Error('Secret internal detail: DB connection string xyz');
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    const body = res.body as { error: { message: string } };
    expect(body.error.message).not.toContain('Secret internal detail');
    expect(body.error.message).not.toContain('DB connection string');
  });

  it('does NOT expose stack trace in the response body', () => {
    const err = new Error('crash');
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('at ');       // stack frame pattern
    expect(bodyStr).not.toContain('Error:');
  });

  it('returns 500 with INTERNAL_ERROR for a thrown string', () => {
    const err = 'some string error';
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    expect(res.statusCode).toBe(500);
    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(body.error.message).toBe('An unexpected error occurred');
  });

  it('returns 500 with INTERNAL_ERROR for a thrown null', () => {
    const res = makeMockRes();

    errorHandler(null, makeMockReq(), res as unknown as Response, makeMockNext());

    expect(res.statusCode).toBe(500);
    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('returns 500 with INTERNAL_ERROR for a thrown object', () => {
    const err = { weird: 'object', secret: 'data' };
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    expect(res.statusCode).toBe(500);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('weird');
    expect(bodyStr).not.toContain('secret');
  });

  it('response body has exactly { error: { code, message } } shape for unknown errors', () => {
    const err = new TypeError('type mismatch');
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['error']);
    const errorObj = body.error as Record<string, unknown>;
    expect(Object.keys(errorObj).sort()).toEqual(['code', 'message'].sort());
  });
});

// ─── Method guard and content-type guard integration ─────────────────────────
// Validates: Requirements 10.7, 10.8

describe('errorHandler — METHOD_NOT_ALLOWED and UNSUPPORTED_MEDIA_TYPE', () => {
  it('handles METHOD_NOT_ALLOWED AppError correctly', () => {
    const err = new AppError(ErrorCode.METHOD_NOT_ALLOWED, 405, 'Method not allowed');
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
    });
  });

  it('handles UNSUPPORTED_MEDIA_TYPE AppError correctly', () => {
    const err = new AppError(
      ErrorCode.UNSUPPORTED_MEDIA_TYPE,
      415,
      'Content-Type must be application/json',
    );
    const res = makeMockRes();

    errorHandler(err, makeMockReq(), res as unknown as Response, makeMockNext());

    expect(res.statusCode).toBe(415);
    expect(res.body).toEqual({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/json',
      },
    });
  });
});
