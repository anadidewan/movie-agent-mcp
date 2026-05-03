# Requirements Document

## Introduction

This document defines the requirements for a Node.js/TypeScript microservice that wraps the TMDB (The Movie Database) public REST API. The service exposes TMDB functionality as discrete, tool-callable HTTP endpoints designed to be consumed by a LangChain agent backend (Python). Each endpoint represents a meaningful, agent-invocable tool — this is not a generic API proxy. The service normalizes TMDB's inconsistent response shapes into predictable, well-typed output structures.

## Glossary

- **TMDB**: The Movie Database — a public REST API providing movie metadata, search, discovery, and recommendation data.
- **Tool**: A discrete, named capability exposed as a POST endpoint at `/tools/{tool_name}`, callable by an agent.
- **Server**: The Node.js/TypeScript Express microservice defined in this document.
- **TMDB_Client**: The single shared Axios-based HTTP client instance used to communicate with the TMDB API.
- **Validator**: The Zod-based request/response validation layer.
- **Normalizer**: The response transformation layer that converts raw TMDB API responses into consistent output shapes.
- **Logger**: The pino-based structured logging instance.
- **Agent**: The external LangChain Python backend that consumes the Server's tool endpoints.
- **poster_url**: A fully-qualified image URL constructed by prepending the TMDB image base URL to a raw `poster_path` value.
- **Tool_Registry**: The in-memory list of available tools and their metadata, used by the tools discovery endpoint.

---

## Requirements

### Requirement 1: Tool — Search Movies

**User Story:** As an Agent, I want to search for movies by title and optional release year, so that I can find relevant movies to present to a user or use in further queries.

#### Acceptance Criteria

1. WHEN a POST request is made to `/tools/search_movies` with a JSON body containing a `query` string, THE Server SHALL query the TMDB search API and return a normalized list of matching movies.
2. WHEN the optional `year` field is provided in the request body, THE Server SHALL filter TMDB search results to the specified release year.
3. THE Normalizer SHALL transform each TMDB search result into an object containing `id` (number), `title` (string), `year` (number), `overview` (string), `poster_url` (fully-qualified string URL or null), and `rating` (number).
4. WHEN the `query` field is missing or empty in the request body, THE Validator SHALL return a 400 response with a structured error.
5. WHEN TMDB returns zero results, THE Server SHALL return a 200 response with an empty `results` array.

---

### Requirement 2: Tool — Get Movie Details

**User Story:** As an Agent, I want to retrieve full details for a specific movie by its TMDB ID, so that I can provide rich, structured information about a movie to a user.

#### Acceptance Criteria

1. WHEN a POST request is made to `/tools/get_movie_details` with a JSON body containing a `movie_id` number, THE Server SHALL fetch the movie's detail, credits, and keywords from the TMDB API and return a normalized response.
2. THE Normalizer SHALL include in the response: `id`, `title`, `year`, `overview`, `poster_url`, `runtime` (minutes as number), `rating`, `genres` (array of genre name strings), `cast` (top 5 cast members as `[{ name, character }]`), `director` (string or null), and `keywords` (array of keyword name strings).
3. WHEN the `movie_id` field is missing or not a number in the request body, THE Validator SHALL return a 400 response with a structured error.
4. WHEN TMDB returns a 404 for the given `movie_id`, THE Server SHALL return a 404 response with a structured error indicating the movie was not found.

---

### Requirement 3: Tool — Discover Movies

**User Story:** As an Agent, I want to browse movies using category filters, so that I can surface relevant movies based on genre, rating, release period, or keywords.

#### Acceptance Criteria

1. WHEN a POST request is made to `/tools/discover_movies` with a JSON body containing any combination of `genre` (string), `min_rating` (number), `year_from` (number), `year_to` (number), or `keywords` (string), THE Server SHALL query the TMDB discover API with the applicable filters and return a normalized list of movies.
2. WHEN no filter fields are provided in the request body, THE Server SHALL execute the TMDB discover query with no filters and return results.
3. THE Normalizer SHALL transform each discovery result into the same shape as the `search_movies` result: `id`, `title`, `year`, `overview`, `poster_url`, and `rating`.
4. WHEN an invalid type is provided for any filter field (e.g., a string for `min_rating`), THE Validator SHALL return a 400 response with a structured error.
5. WHEN the `genre` field is a non-numeric string (e.g. `"Action"`), THE Server SHALL resolve it to a TMDB numeric genre ID by calling the TMDB genre list endpoint before executing the discover query. Resolution SHALL be case-insensitive.
6. WHEN the `genre` field is a numeric string (e.g. `"28"`), THE Server SHALL use it directly as a TMDB genre ID without making an additional genre list request.
7. WHEN the `genre` field is a non-numeric string that does not match any TMDB genre name, THE Server SHALL return a 404 response with `code` set to `"NO_RESULTS"` and a message listing the available genre names.

---

### Requirement 4: Tool — Get Recommendations

**User Story:** As an Agent, I want to retrieve TMDB's movie recommendations for a given movie, so that I can suggest related movies to a user.

#### Acceptance Criteria

1. WHEN a POST request is made to `/tools/get_recommendations` with a JSON body containing a `movie_id` number, THE Server SHALL query the TMDB recommendations endpoint for that movie and return a normalized list of recommended movies.
2. THE Normalizer SHALL transform each recommendation result into the same shape as the `search_movies` result: `id`, `title`, `year`, `overview`, `poster_url`, and `rating`.
3. WHEN the `movie_id` field is missing or not a number in the request body, THE Validator SHALL return a 400 response with a structured error.
4. WHEN TMDB returns a 404 for the given `movie_id`, THE Server SHALL return a 404 response with a structured error.
5. WHEN TMDB returns zero recommendations, THE Server SHALL return a 200 response with an empty `results` array.

---

### Requirement 5: Tool — Get Trending Movies

**User Story:** As an Agent, I want to retrieve currently trending movies for a given time window, so that I can surface timely, popular content to a user.

#### Acceptance Criteria

1. WHEN a POST request is made to `/tools/get_trending` with a JSON body containing a `window` value of `"day"` or `"week"`, THE Server SHALL query the TMDB trending endpoint for the specified time window and return a normalized list of movies.
2. THE Normalizer SHALL transform each trending result into the same shape as the `search_movies` result: `id`, `title`, `year`, `overview`, `poster_url`, and `rating`.
3. WHEN the `window` field is missing or contains a value other than `"day"` or `"week"`, THE Validator SHALL return a 400 response with a structured error.

---

### Requirement 6: Tool — Get Movie ID

**User Story:** As an Agent, I want to resolve a movie title (and optional year) to a TMDB movie ID, so that I can obtain an ID to pass to other tools without requiring the user to know it.

#### Acceptance Criteria

1. WHEN a POST request is made to `/tools/get_movie_id` with a JSON body containing a `query` string, THE Server SHALL search TMDB and return the `movie_id` of the top-ranked result.
2. WHEN the optional `year` field is provided, THE Server SHALL use it to narrow the search before selecting the top result.
3. WHEN TMDB returns no results for the given query, THE Server SHALL return a 404 response with `code` set to `"NO_RESULTS"` and a structured error indicating no match was found.
4. WHEN the `query` field is missing or empty in the request body, THE Validator SHALL return a 400 response with a structured error.

---

### Requirement 7: Health Check Endpoint

**User Story:** As an operator, I want a health check endpoint, so that I can verify the service is running and ready to accept requests.

#### Acceptance Criteria

1. WHEN a GET request is made to `/health`, THE Server SHALL return a 200 response with a JSON body containing `{ "status": "ok" }`.
2. THE Server SHALL respond to `/health` without making any outbound calls to the TMDB API.

---

### Requirement 8: Tools Discovery Endpoint

**User Story:** As an Agent, I want to query a discovery endpoint that lists all available tools, so that I can dynamically understand what capabilities the service exposes.

#### Acceptance Criteria

1. WHEN a GET request is made to `/tools`, THE Server SHALL return a 200 response containing the Tool_Registry: a list of all available tools with their `name`, `description`, and `input_schema`.
2. THE Tool_Registry SHALL include all seven tools: `search_movies`, `get_movie_details`, `discover_movies`, `get_recommendations`, `get_trending`, `get_movie_id`, and `get_genre_id`.
3. THE Server SHALL return the tools list without making any outbound calls to the TMDB API.

---

### Requirement 16: Tool — Get Genre ID

**User Story:** As an Agent, I want to resolve a genre name to its TMDB numeric genre ID, so that I can obtain a precise ID to use with other tools or verify that a genre name is recognised by TMDB.

#### Acceptance Criteria

1. WHEN a POST request is made to `/tools/get_genre_id` with a JSON body containing a `name` string, THE Server SHALL fetch the TMDB genre list and return the matching genre's numeric ID and canonical name.
2. THE Server SHALL perform genre name matching case-insensitively and trim leading/trailing whitespace from the input before matching.
3. WHEN no TMDB genre matches the given name, THE Server SHALL return a 404 response with `code` set to `"NO_RESULTS"` and a message that includes the full list of available genre names.
4. WHEN the `name` field is missing or empty in the request body, THE Validator SHALL return a 400 response with a structured error.

---

### Requirement 9: Response Normalization

**User Story:** As an Agent, I want all tool responses to have consistent, predictable shapes, so that I can process them without conditional logic for TMDB's inconsistent raw formats.

#### Acceptance Criteria

1. THE Normalizer SHALL construct `poster_url` by prepending `https://image.tmdb.org/t/p/w500` to the raw `poster_path` value returned by TMDB.
2. WHEN TMDB returns a null or missing `poster_path`, THE Normalizer SHALL set `poster_url` to `null`.
3. THE Normalizer SHALL always return `genres` as an array of name strings, regardless of whether TMDB returns genre objects or genre IDs.
4. THE Normalizer SHALL always return `year` as a four-digit integer extracted from TMDB's `release_date` string.
5. WHEN TMDB returns a null or missing `release_date`, THE Normalizer SHALL set `year` to `null`.

---

### Requirement 10: Structured Error Responses

**User Story:** As an Agent, I want all error responses to follow a consistent format with distinct, machine-readable error codes, so that I can handle each failure scenario programmatically without relying solely on HTTP status codes.

#### Acceptance Criteria

1. THE Server SHALL return all error responses in the format `{ "error": { "code": string, "message": string } }`.
2. WHEN a request body fails schema validation (e.g., a required field is missing, a field has the wrong type, or an enum field contains a disallowed value), THE Server SHALL return a 400 status with `code` set to `"VALIDATION_ERROR"` and a `message` that identifies the specific field(s) that failed.
3. WHEN a request body is syntactically valid JSON but is semantically invalid in a way that cannot be expressed as a schema constraint (e.g., `year_from` is greater than `year_to`), THE Server SHALL return a 422 status with `code` set to `"UNPROCESSABLE_INPUT"` and a `message` describing the semantic conflict.
4. WHEN a requested resource is not found on TMDB (e.g., a `movie_id` that does not exist), THE Server SHALL return a 404 status with `code` set to `"NOT_FOUND"`.
5. WHEN a search or lookup query returns no matching results on TMDB, THE Server SHALL return a 404 status with `code` set to `"NO_RESULTS"` and a `message` indicating no match was found for the given query.
6. WHEN TMDB returns a 429 rate-limit response, THE Server SHALL return a 429 status with `code` set to `"RATE_LIMITED"` and a `message` indicating the upstream rate limit was reached.
7. WHEN a request is made using an HTTP method not supported by the target endpoint (e.g., GET to a tool endpoint that only accepts POST), THE Server SHALL return a 405 status with `code` set to `"METHOD_NOT_ALLOWED"`.
8. WHEN a POST request is made with a `Content-Type` header other than `application/json`, THE Server SHALL return a 415 status with `code` set to `"UNSUPPORTED_MEDIA_TYPE"`.
9. WHEN an unexpected error occurs, THE Server SHALL return a 500 status with `code` set to `"INTERNAL_ERROR"` and a generic message that does not expose internal details or the TMDB API key.

---

### Requirement 11: API Key Security

**User Story:** As an operator, I want the TMDB API key to be kept strictly internal, so that it is never exposed through logs, error messages, or HTTP responses.

#### Acceptance Criteria

1. THE Server SHALL read the TMDB API key exclusively from the `TMDB_API_KEY` environment variable at startup.
2. THE Logger SHALL never include the TMDB API key value in any log entry.
3. THE Server SHALL never include the TMDB API key value in any HTTP response body, header, or error message.
4. WHEN the `TMDB_API_KEY` environment variable is not set at startup, THE Server SHALL log a fatal error and exit with a non-zero status code.

---

### Requirement 12: Structured Logging

**User Story:** As an operator, I want structured JSON logs for all requests and errors, so that I can monitor and debug the service in production.

#### Acceptance Criteria

1. THE Logger SHALL emit a structured JSON log entry for every incoming HTTP request, including the HTTP method, path, and response status code.
2. THE Logger SHALL emit a structured JSON log entry for every error, including the error code and a sanitized message.
3. THE Logger SHALL never include request body contents that may contain sensitive data in log entries.
4. WHILE the `NODE_ENV` environment variable is set to `"development"`, THE Logger SHALL emit human-readable (pretty-printed) log output.

---

### Requirement 13: TMDB Rate Limit Handling

**User Story:** As an operator, I want the service to handle TMDB rate-limit responses gracefully, so that transient throttling does not cause unhandled errors.

#### Acceptance Criteria

1. WHEN the TMDB_Client receives a 429 response from TMDB, THE Server SHALL return a 429 response to the caller with the structured error format defined in Requirement 10.
2. THE Server SHALL propagate the `Retry-After` header from the TMDB 429 response to the caller's 429 response, if present.

---

### Requirement 14: Containerization

**User Story:** As an operator, I want the service packaged as a Docker container, so that I can deploy it consistently across environments.

#### Acceptance Criteria

1. THE Server SHALL include a `Dockerfile` that builds a production-ready container image using a Node.js base image.
2. THE Dockerfile SHALL accept the `TMDB_API_KEY` as a runtime environment variable and SHALL NOT bake it into the image at build time.
3. THE Dockerfile SHALL expose the port on which the Server listens.
4. WHEN the container starts, THE Server SHALL be ready to accept HTTP requests on the configured port.

---

### Requirement 15: Input Validation

**User Story:** As an Agent, I want the service to validate all tool inputs before processing, so that I receive clear, actionable errors for malformed requests rather than cryptic failures.

#### Acceptance Criteria

1. THE Validator SHALL validate all POST request bodies against their defined Zod schemas before any service logic is executed.
2. WHEN validation fails, THE Validator SHALL return a 400 response with `code` set to `"VALIDATION_ERROR"` and a `message` that identifies the specific field(s) that failed validation.
3. THE Server SHALL not forward any request to the TMDB_Client if the request body fails validation.
