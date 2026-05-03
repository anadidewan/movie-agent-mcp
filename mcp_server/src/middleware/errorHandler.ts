import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from '../types/errors';
import { logger } from '../lib/logger';

/**
 * Global Express error handler — the single point of error serialization.
 *
 * Handles three categories:
 *   - AppError  → structured response using error.statusCode / error.code
 *   - ZodError  → 400 VALIDATION_ERROR with field-level detail
 *   - Unknown   → 500 INTERNAL_ERROR, never exposing internals
 *
 * Requirements: 10.1–10.9, 11.3, 12.2, 13.1, 13.2
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    // Log with code and sanitized message; include stack only in development
    const logPayload: Record<string, unknown> = {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
    };
    if (process.env.NODE_ENV === 'development') {
      logPayload.stack = err.stack;
    }
    logger.error(logPayload, 'AppError');

    // Propagate Retry-After for rate-limited responses (Requirement 13.2)
    if (err.code === ErrorCode.RATE_LIMITED && err.retryAfter !== undefined) {
      res.setHeader('Retry-After', err.retryAfter);
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    // Build a human-readable field-level message from Zod issues
    const message = err.errors
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    logger.error({ code: ErrorCode.VALIDATION_ERROR, message }, 'ZodError');

    res.status(400).json({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message,
      },
    });
    return;
  }

  // Unknown / unexpected error — never expose internals (Requirement 10.9, 11.3)
  const logPayload: Record<string, unknown> = {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
  };
  if (process.env.NODE_ENV === 'development' && err instanceof Error) {
    logPayload.stack = err.stack;
    logPayload.originalMessage = err.message;
  }
  logger.error(logPayload, 'UnknownError');

  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
  });
}
