import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../types/errors';

/**
 * Middleware that rejects POST requests whose Content-Type is not application/json.
 * Requirement 10.8
 */
export function contentTypeGuard(req: Request, _res: Response, next: NextFunction): void {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    return next(
      new AppError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 415, 'Content-Type must be application/json'),
    );
  }
  next();
}
