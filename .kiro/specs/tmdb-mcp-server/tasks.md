# Implementation Plan: tmdb-mcp-server

## Overview

Implement a Node.js/TypeScript Express microservice that wraps the TMDB REST API v3 and exposes seven discrete tool endpoints callable by a LangChain agent backend. The implementation follows a layered architecture: validate → call TMDB → normalize → respond. All normalization is pure and side-effect-free. A single Axios instance handles all outbound calls with centralized error interception.

## Tasks

- [x] 1. Project scaffolding and configuration
  - Initialize `package.json` with `name`, `version`, `main`, `scripts` (`build`, `dev`, `start`, `test`, `lint`)
  - Install runtime dependencies: `express`, `axios`, `zod`, `pino`, `pino-http`, `pino-pretty`, `dotenv`
  - Install dev dependencies: `typescript`, `@types/express`, `@types/node`, `ts-node`, `nodemon`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`, `fast-check`, `@fast-check/jest`, `zod-fast-check`
  - Create `tsconfig.json` with `strict: true`, `target: ES2022`, `module: CommonJS`, `outDir: dist`, `rootDir: src`, `esModuleInterop: true`, `resolveJsonModule: true`
  - Create `.eslintrc.json` with TypeScript rules and `no-explicit-any` warning
  - Create `jest.config.ts` with `ts-jest` preset, `testEnvironment: node`, separate projects for unit and integration tests
  - Create `.env.example` with `TMDB_API_KEY=`, `PORT=3000`, `NODE_ENV=development`
  - Create all source directories: `src/lib`, `src/schemas`, `src/types`, `src/services`, `src/normalizers`, `src/routes`, `src/middleware`, `src/registry`, `tests/unit/normalizers`, `tests/unit/schemas`, `tests/unit/middleware`, `tests/integration/tools`, `tests/security`
  - _Requirements: 11.1, 14.1_

- [x] 2. Core types and error definitions
  - [x] 2.1 Create `src/types/errors.ts` — `ErrorCode` enum and `AppError` class
    - Define `ErrorCode` enum with all eight values: `VALIDATION_ERROR`, `NOT_FOUND`, `NO_RESULTS`, `UNPROCESSABLE_INPUT`, `RATE_LIMITED`, `METHOD_NOT_ALLOWED`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR`
    - Implement `AppError extends Error` with `code: ErrorCode`, `statusCode: number`, `message: string`, and optional `retryAfter?: string`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [x] 2.2 Create `src/types/tmdb.ts` — raw TMDB API response types
    - Define `TmdbMovieResult`, `TmdbGenre`, `TmdbCastMember`, `TmdbCrewMember`, `TmdbKeyword`, `TmdbMovieDetail`, `TmdbMovieDetailWithAppended`, `TmdbPagedResponse<T>`
    - _Requirements: 1.3, 2.2, 9.3_

  - [x] 2.3 Create `src/types/normalized.ts` — normalized output types
    - Define `MovieListItem` with `id`, `title`, `year`, `overview`, `poster_url`, `rating`
    - Define `CastMember` with `name`, `character`
    - Define `MovieDetail extends MovieListItem` with `runtime`, `genres`, `cast`, `director`, `keywords`
    - _Requirements: 1.3, 2.2, 3.3, 4.2, 5.2, 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 3. Logger and TMDB client infrastructure
  - [x] 3.1 Create `src/lib/logger.ts` — pino logger factory
    - Export `logger: pino.Logger` instance
    - Use `pino-pretty` transport when `NODE_ENV === 'development'`
    - Export `httpLogger` middleware (pino-http instance) for Express use
    - Redact `req.headers.authorization` to prevent API key leakage in logs
    - _Requirements: 11.2, 12.1, 12.2, 12.3, 12.4_

  - [x] 3.2 Create `src/lib/tmdbClient.ts` — singleton Axios instance
    - Create Axios instance with `baseURL: https://api.themoviedb.org/3`
    - Set default headers: `Authorization: Bearer ${TMDB_API_KEY}`, `Accept: application/json`
    - Add response interceptor mapping TMDB errors: 404 → `AppError(NOT_FOUND, 404)`, 429 → `AppError(RATE_LIMITED, 429, ..., retryAfter)`, 401 → `AppError(INTERNAL_ERROR, 500, "TMDB authentication failed")`, other 4xx/5xx → `AppError(INTERNAL_ERROR, 500, "Upstream error")`
    - Propagate `Retry-After` header value from TMDB 429 responses into the `AppError`
    - Export as `tmdbClient: AxiosInstance`
    - _Requirements: 11.2, 11.3, 13.1, 13.2_

- [x] 4. Normalizer functions
  - [x] 4.1 Create `src/normalizers/movieListItem.ts`
    - Implement `buildPosterUrl(posterPath: string | null | undefined): string | null` — prepend `https://image.tmdb.org/t/p/w500` to non-null path, return `null` otherwise
    - Implement `extractYear(releaseDate: string | null | undefined): number | null` — parse first 4 chars of `YYYY-MM-DD` string, return `null` for null/undefined/malformed input
    - Implement `normalizeMovieListItem(raw: TmdbMovieResult): MovieListItem` — map all fields using the above helpers
    - _Requirements: 1.3, 3.3, 4.2, 5.2, 9.1, 9.2, 9.4, 9.5_

  - [x] 4.2 Write property tests for `movieListItem` normalizer
    - **Property 1: Movie list item normalization preserves required fields with correct types**
    - **Validates: Requirements 1.3, 3.3, 4.2, 5.2, 9.1, 9.2, 9.4, 9.5**
    - File: `tests/unit/normalizers/movieListItem.property.test.ts`
    - Use `fc.record` to generate arbitrary `TmdbMovieResult` objects with all combinations of null/non-null `poster_path` and `release_date`
    - **Property 3: poster_url construction is a deterministic function of poster_path**
    - **Validates: Requirements 9.1, 9.2**
    - **Property 4: Year extraction is a deterministic function of release_date**
    - **Validates: Requirements 9.4, 9.5**
    - **Property 10: Cast is always limited to the top 5 members** (for `extractCast` — also covered in 4.4)
    - **Validates: Requirements 2.2**

  - [x] 4.3 Create `src/normalizers/movieDetail.ts`
    - Implement `extractGenreNames(genres: TmdbGenre[] | undefined): string[]` — map genre objects to name strings, return `[]` for undefined
    - Implement `extractCast(cast: TmdbCastMember[] | undefined): CastMember[]` — take first 5 entries (TMDB billing order), map to `{ name, character }`, return `[]` for undefined
    - Implement `extractDirector(crew: TmdbCrewMember[] | undefined): string | null` — find first crew member with `job === "Director"`, return name or `null`
    - Implement `normalizeMovieDetail(raw: TmdbMovieDetailWithAppended): MovieDetail` — compose all helpers
    - _Requirements: 2.2, 9.3_

  - [x] 4.4 Write property tests for `movieDetail` normalizer
    - **Property 2: Movie detail normalization preserves all required fields with correct types**
    - **Validates: Requirements 2.2, 9.3**
    - File: `tests/unit/normalizers/movieDetail.property.test.ts`
    - Use `fc.record` to generate arbitrary `TmdbMovieDetailWithAppended` objects with varying cast sizes (0 to N), crew compositions, genre arrays, and keyword arrays
    - **Property 10: Cast is always limited to the top 5 members**
    - **Validates: Requirements 2.2**
    - Assert `result.cast.length <= 5` for all generated inputs

- [x] 5. Zod input schemas
  - [x] 5.1 Create all six Zod schemas in `src/schemas/`
    - `searchMovies.ts`: `SearchMoviesSchema` — `query: z.string().min(1)`, `year: z.number().int().optional()`; export inferred `SearchMoviesInput` type
    - `getMovieDetails.ts`: `GetMovieDetailsSchema` — `movie_id: z.number().int()`; export inferred type
    - `discoverMovies.ts`: `DiscoverMoviesSchema` — `genre`, `min_rating` (0–10), `year_from`, `year_to` all optional; export inferred type
    - `getRecommendations.ts`: `GetRecommendationsSchema` — `movie_id: z.number().int()`; export inferred type
    - `getTrending.ts`: `GetTrendingSchema` — `window: z.enum(['day', 'week'])`; export inferred type
    - `getMovieId.ts`: `GetMovieIdSchema` — `query: z.string().min(1)`, `year: z.number().int().optional()`; export inferred type
    - `getGenreId.ts`: `GetGenreIdSchema` — `name: z.string().min(1)`; export inferred type
    - _Requirements: 1.4, 2.3, 3.4, 4.3, 5.3, 6.4, 15.1, 15.2, 15.3, 16.4_

  - [x] 5.2 Write property tests for schema validation
    - **Property 5: Invalid tool inputs always produce 400 VALIDATION_ERROR and never reach TMDB**
    - **Validates: Requirements 1.4, 2.3, 3.4, 4.3, 5.3, 6.4, 15.1, 15.2, 15.3**
    - File: `tests/unit/schemas/validation.property.test.ts`
    - Use `fc.anything()` filtered to exclude valid inputs; assert each schema `.safeParse()` returns `success: false` for invalid inputs
    - **Property 6: Semantic validation rejects year_from > year_to**
    - **Validates: Requirements 3.1, 10.3**
    - Use `fc.tuple(fc.integer(), fc.integer()).filter(([a, b]) => a > b)` to generate `year_from > year_to` pairs; assert the service throws `UNPROCESSABLE_INPUT`

- [x] 6. Tool services
  - [x] 6.1 Create `src/services/searchMovies.ts`
    - Accept validated `SearchMoviesInput`; call `tmdbClient.get('/search/movie', { params: { query, year } })`
    - Map `TmdbPagedResponse<TmdbMovieResult>.results` through `normalizeMovieListItem`
    - Return `{ results: MovieListItem[] }`
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 6.2 Create `src/services/getMovieDetails.ts`
    - Accept validated `GetMovieDetailsInput`; call `tmdbClient.get('/movie/{movie_id}', { params: { append_to_response: 'credits,keywords' } })`
    - Map response through `normalizeMovieDetail`
    - Return `MovieDetail`
    - _Requirements: 2.1, 2.4_

  - [x] 6.3 Create `src/services/discoverMovies.ts`
    - Accept validated `DiscoverMoviesInput`
    - Perform semantic validation: if `year_from` and `year_to` are both present and `year_from > year_to`, throw `AppError(UNPROCESSABLE_INPUT, 422, 'year_from must not be greater than year_to')`
    - Build TMDB query params: if `genre` is a numeric string use it directly as `with_genres`; if it is a non-numeric string call `getGenreId()` to resolve it to an ID (throws `NO_RESULTS` if unrecognised); map `min_rating` to `vote_average.gte`, `year_from` to `primary_release_date.gte`, `year_to` to `primary_release_date.lte`, `keywords` to `with_keywords`
    - Call `tmdbClient.get('/discover/movie', { params })`; map results through `normalizeMovieListItem`
    - Return `{ results: MovieListItem[] }`
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 10.3_

  - [x] 6.7 Create `src/services/getGenreId.ts`
    - Accept a genre name string
    - Call `tmdbClient.get('/genre/movie/list')` to fetch the full TMDB genre list
    - Perform case-insensitive, trimmed match against genre names
    - If no match found, throw `AppError(NO_RESULTS, 404, 'No genre found matching "...". Available genres: ...')` with the full list of available names in the message
    - Return `{ genre_id: number, genre_name: string }`
    - This function is shared: used internally by `discoverMovies` and externally via the `get_genre_id` tool endpoint
    - _Requirements: 16.1, 16.2, 16.3_

  - [x] 6.4 Create `src/services/getRecommendations.ts`
    - Accept validated `GetRecommendationsInput`; call `tmdbClient.get('/movie/{movie_id}/recommendations')`
    - Map results through `normalizeMovieListItem`; return `{ results: MovieListItem[] }`
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 6.5 Create `src/services/getTrending.ts`
    - Accept validated `GetTrendingInput`; call `tmdbClient.get('/trending/movie/{window}')`
    - Map results through `normalizeMovieListItem`; return `{ results: MovieListItem[] }`
    - _Requirements: 5.1, 5.2_

  - [x] 6.6 Create `src/services/getMovieId.ts`
    - Accept validated `GetMovieIdInput`; call `tmdbClient.get('/search/movie', { params: { query, year } })`
    - If `results` array is empty, throw `AppError(NO_RESULTS, 404, 'No movie found matching the given query')`
    - Return `{ movie_id: results[0].id }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Checkpoint — core logic complete
  - Ensure all normalizer unit tests pass and all Zod schemas parse valid inputs correctly
  - Run `npx tsc --noEmit` to confirm no TypeScript errors across types, normalizers, schemas, and services
  - Ask the user if any questions arise before proceeding to middleware and routing.

- [x] 8. Middleware
  - [x] 8.1 Create `src/middleware/methodGuard.ts`
    - Export Express middleware that checks `req.method`; if not `POST`, throw `AppError(METHOD_NOT_ALLOWED, 405, 'Method not allowed')`
    - _Requirements: 10.7_

  - [x] 8.2 Create `src/middleware/contentTypeGuard.ts`
    - Export Express middleware that checks `req.headers['content-type']` includes `application/json`; if not, throw `AppError(UNSUPPORTED_MEDIA_TYPE, 415, 'Content-Type must be application/json')`
    - _Requirements: 10.8_

  - [x] 8.3 Create `src/middleware/errorHandler.ts` — global Express error handler
    - Handle `AppError` instances: respond with `error.statusCode` and `{ error: { code: error.code, message: error.message } }`
    - Handle `ZodError` instances: respond with 400 and `{ error: { code: "VALIDATION_ERROR", message: <field details> } }`
    - Handle unknown errors: respond with 500 and `{ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } }` — never expose stack or raw error
    - For `RATE_LIMITED` errors: propagate `Retry-After` header if present on the `AppError` instance
    - Log every error via `logger` with `code` and sanitized `message`; only log stack in `NODE_ENV === 'development'`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 11.3, 12.2, 13.1, 13.2_

  - [x] 8.4 Write example-based tests for error handler middleware
    - **Property 7: All error responses conform to the structured error shape**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9**
    - File: `tests/unit/middleware/errorHandler.test.ts`
    - Test each `ErrorCode` value produces the correct HTTP status and `{ error: { code, message } }` shape
    - Test that `RATE_LIMITED` errors propagate `Retry-After` header
    - Test that unknown errors produce 500 with `INTERNAL_ERROR` and do not expose stack traces

- [x] 9. Tool registry and routes
  - [x] 9.1 Create `src/registry/toolRegistry.ts`
    - Define `ToolDefinition` interface: `{ name: string; description: string; input_schema: Record<string, unknown> }`
    - Export `toolRegistry: ToolDefinition[]` with all seven tools: `search_movies`, `get_movie_details`, `discover_movies`, `get_recommendations`, `get_trending`, `get_movie_id`, `get_genre_id`
    - Each entry includes a human-readable `description` and a JSON Schema `input_schema` derived from the corresponding Zod schema
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 9.2 Create `src/routes/health.ts`
    - Export Express router with `GET /` handler returning `{ status: "ok" }` with status 200
    - No outbound TMDB calls
    - _Requirements: 7.1, 7.2_

  - [x] 9.3 Create `src/routes/tools.ts`
    - Export Express router with `GET /` handler returning `{ tools: toolRegistry }` with status 200
    - No outbound TMDB calls
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 9.4 Create `src/routes/toolHandlers.ts` — POST `/tools/:tool` dispatcher
    - Parse `:tool` param and dispatch to the correct service: `search_movies`, `get_movie_details`, `discover_movies`, `get_recommendations`, `get_trending`, `get_movie_id`, `get_genre_id`
    - Validate request body against the tool's Zod schema before calling the service; on failure pass `ZodError` to `next(err)`
    - For unknown tool names, call `next(new AppError(NOT_FOUND, 404, 'Unknown tool'))`
    - Wrap service calls in try/catch and forward errors to `next(err)`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 16.1, 15.1, 15.2, 15.3_

- [x] 10. Express app factory and entry point
  - [x] 10.1 Create `src/app.ts` — Express app factory
    - Export `createApp(): express.Application` function (no `listen` call — keeps app testable)
    - Register `express.json()` body parser
    - Register `httpLogger` (pino-http) middleware
    - Mount `methodGuard` and `contentTypeGuard` on `POST /tools/*`
    - Mount health router at `/health`
    - Mount tools discovery router at `/tools` (GET)
    - Mount tool handlers router at `/tools` (POST)
    - Register `errorHandler` as the final middleware
    - _Requirements: 7.1, 8.1, 10.7, 10.8, 12.1_

  - [x] 10.2 Create `index.ts` — entry point
    - Load `.env` via `dotenv/config`
    - Validate `TMDB_API_KEY` is set; if missing, log fatal error via `logger.fatal` and call `process.exit(1)`
    - Read `PORT` from env (default `3000`)
    - Call `createApp()` and start listening
    - Register `SIGTERM` and `SIGINT` handlers for graceful shutdown (close server, then exit)
    - _Requirements: 11.1, 11.4_

- [x] 11. Integration tests
  - [x] 11.1 Write integration tests for `search_movies` endpoint
    - File: `tests/integration/tools/searchMovies.test.ts`
    - Mock Axios with a valid TMDB paged response; assert 200 with normalized `results` array
    - Test missing `query` → 400 `VALIDATION_ERROR`
    - Test TMDB 429 response → 429 `RATE_LIMITED` with `Retry-After` header propagated
    - Test TMDB zero results → 200 with empty `results` array
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 13.1, 13.2_

  - [x] 11.2 Write integration tests for `get_movie_details` endpoint
    - File: `tests/integration/tools/getMovieDetails.test.ts`
    - Mock Axios with a valid TMDB detail+credits+keywords response; assert 200 with full `MovieDetail` shape
    - Test missing `movie_id` → 400 `VALIDATION_ERROR`
    - Test TMDB 404 → 404 `NOT_FOUND`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 11.3 Write integration tests for `discover_movies` endpoint
    - File: `tests/integration/tools/discoverMovies.test.ts`
    - Mock Axios; assert 200 with normalized results for valid filter combinations
    - Test genre name (e.g. `"Drama"`) triggers two mocked calls: genre list then discover; assert `with_genres` receives the resolved numeric ID
    - Test numeric genre ID string (e.g. `"28"`) triggers only one mocked call (no genre list lookup)
    - Test unknown genre name → 404 `NO_RESULTS`
    - Test `year_from > year_to` → 422 `UNPROCESSABLE_INPUT`
    - Test invalid field type (e.g., string for `min_rating`) → 400 `VALIDATION_ERROR`
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 10.3_

  - [x] 11.4 Write integration tests for `get_recommendations` endpoint
    - File: `tests/integration/tools/getRecommendations.test.ts`
    - Mock Axios; assert 200 with normalized results
    - Test TMDB 404 → 404 `NOT_FOUND`
    - Test TMDB zero results → 200 with empty `results` array
    - _Requirements: 4.1, 4.4, 4.5_

  - [x] 11.5 Write integration tests for `get_trending` endpoint
    - File: `tests/integration/tools/getTrending.test.ts`
    - Mock Axios; assert 200 with normalized results for `window: "day"` and `window: "week"`
    - Test invalid `window` value → 400 `VALIDATION_ERROR`
    - _Requirements: 5.1, 5.3_

  - [x] 11.6 Write integration tests for `get_movie_id` endpoint
    - File: `tests/integration/tools/getMovieId.test.ts`
    - Mock Axios; assert 200 with `{ movie_id: number }` for a valid query
    - Test TMDB zero results → 404 `NO_RESULTS`
    - Test missing `query` → 400 `VALIDATION_ERROR`
    - _Requirements: 6.1, 6.3, 6.4_

  - [x] 11.7 Write integration tests for health and discovery endpoints
    - File: `tests/integration/health.test.ts` — assert `GET /health` returns `{ status: "ok" }` with no TMDB calls
    - File: `tests/integration/tools-discovery.test.ts` — assert `GET /tools` returns all seven tools with `name`, `description`, `input_schema`; assert no TMDB calls
    - Test `GET /tools/search_movies` (wrong method) → 405 `METHOD_NOT_ALLOWED`
    - Test `POST /tools/search_movies` with `Content-Type: text/plain` → 415 `UNSUPPORTED_MEDIA_TYPE`
    - _Requirements: 7.1, 7.2, 8.1, 8.2, 8.3, 10.7, 10.8_

  - [x] 11.8 Write integration tests for `get_genre_id` endpoint
    - File: `tests/integration/tools/getGenreId.test.ts`
    - Mock Axios with a TMDB genre list response; assert 200 with `{ genre_id, genre_name }` for a known genre
    - Test case-insensitive matching (e.g. `"action"`, `"ACTION"` both resolve correctly)
    - Test multi-word genre name (e.g. `"Science Fiction"`)
    - Test unknown genre name → 404 `NO_RESULTS` with message containing the input name
    - Test missing `name` → 400 `VALIDATION_ERROR`
    - Test empty `name` → 400 `VALIDATION_ERROR`
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [x] 12. Security property tests
  - [ ]* 12.1 Write property tests for API key leakage
    - File: `tests/security/apiKeyLeakage.property.test.ts`
    - **Property 8: The TMDB API key never appears in any HTTP response body**
    - **Validates: Requirements 11.2, 11.3, 10.9**
    - Set `TMDB_API_KEY` to a known test value; use `fc.oneof(...)` to generate requests covering all error and success paths; assert response body string does not contain the key value
    - **Property 9: Request logs always contain method, path, and status**
    - **Validates: Requirements 12.1**
    - Capture pino log output; assert each log entry contains `method`, `url`, and `statusCode` fields

- [x] 13. Checkpoint — all tests passing
  - Run the full test suite (`pnpm test`) and ensure all unit, property, and integration tests pass
  - Run `npx tsc --noEmit` to confirm zero TypeScript errors
  - Ask the user if any questions arise before proceeding to documentation and containerization.

- [x] 14. Documentation and containerization
  - [x] 14.1 Create `contracts.md` at project root
    - Document all 9 endpoint contracts (GET /health, GET /tools, POST /tools/search_movies, POST /tools/get_movie_details, POST /tools/discover_movies, POST /tools/get_recommendations, POST /tools/get_trending, POST /tools/get_movie_id, POST /tools/get_genre_id)
    - Include request shape, response 200 shape, and all error codes per endpoint
    - Include the common error codes table
    - _Requirements: 8.1, 10.1_

  - [x] 14.2 Create `README.md` at project root
    - Cover: overview, prerequisites (Node.js 20+, pnpm, TMDB API key), environment variables (`TMDB_API_KEY`, `PORT`, `NODE_ENV`), local setup steps, Docker run instructions, `pnpm test` command, curl examples for all 8 endpoints, tool reference summary, link to design.md
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 14.3 Create `Dockerfile`
    - Use `node:20-alpine` as base image
    - Copy `package.json` and `pnpm-lock.yaml`, run `pnpm install --frozen-lockfile --prod`
    - Copy compiled output from `dist/`
    - Accept `TMDB_API_KEY` as a runtime `ENV` variable — do NOT bake it in at build time
    - `EXPOSE` the configured port (default 3000)
    - Set `CMD ["node", "dist/index.js"]`
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 15. Final checkpoint — build and smoke test
  - Run `pnpm run build` to compile TypeScript to `dist/`
  - Run the full test suite one final time to confirm everything passes
  - Verify the Dockerfile builds successfully with `docker build -t tmdb-mcp-server .`
  - Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 7, 13, 15) ensure incremental validation at natural boundaries
- Property tests validate universal correctness properties using fast-check; unit/integration tests validate specific examples and edge cases
- The design uses TypeScript throughout — all code examples and implementations should use TypeScript with strict mode enabled
- The `createApp()` factory pattern (task 10.1) is critical for testability — integration tests import the app without starting a real server
