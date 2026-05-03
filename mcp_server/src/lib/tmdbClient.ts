import axios, { AxiosInstance, AxiosError } from 'axios';
import { AppError, ErrorCode } from '../types/errors';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

function createTmdbClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: TMDB_BASE_URL,
    headers: {
      Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
      Accept: 'application/json',
    },
  });

  // Response interceptor — map TMDB error statuses to typed AppErrors
  instance.interceptors.response.use(
    // Pass through successful responses unchanged
    (response) => response,
    (error: AxiosError) => {
      const status = error.response?.status;

      if (status === 404) {
        return Promise.reject(
          new AppError(ErrorCode.NOT_FOUND, 404, 'Resource not found on TMDB'),
        );
      }

      if (status === 429) {
        const retryAfter = error.response?.headers?.['retry-after'] as string | undefined;
        return Promise.reject(
          new AppError(
            ErrorCode.RATE_LIMITED,
            429,
            'TMDB rate limit reached',
            retryAfter,
          ),
        );
      }

      if (status === 401) {
        // Never expose the API key or auth details in the error message
        return Promise.reject(
          new AppError(ErrorCode.INTERNAL_ERROR, 500, 'TMDB authentication failed'),
        );
      }

      // All other 4xx / 5xx responses
      if (status !== undefined && (status >= 400)) {
        return Promise.reject(
          new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Upstream error'),
        );
      }

      // Network errors, timeouts, etc. — no status code available
      return Promise.reject(
        new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Upstream error'),
      );
    },
  );

  return instance;
}

export const tmdbClient: AxiosInstance = createTmdbClient();
