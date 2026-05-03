export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  NO_RESULTS = 'NO_RESULTS',
  UNPROCESSABLE_INPUT = 'UNPROCESSABLE_INPUT',
  RATE_LIMITED = 'RATE_LIMITED',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  UNSUPPORTED_MEDIA_TYPE = 'UNSUPPORTED_MEDIA_TYPE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message: string,
    public readonly retryAfter?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
