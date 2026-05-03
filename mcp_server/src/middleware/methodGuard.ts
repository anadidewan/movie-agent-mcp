import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../types/errors';

/**
 * Middleware that rejects any request whose HTTP method is not POST.
 * Applies to tool endpoints only (mounted on POST /tools/*).
 * Requirement 10.7
 */
export function methodGuard(req: Request, _res: Response, next: NextFunction): void {
  if (req.method !== 'POST') {
    return next(new AppError(ErrorCode.METHOD_NOT_ALLOWED, 405, 'Method not allowed'));
  }
  next();
}
