# Prompts — tmdb-mcp-server

This document contains example prompts for interacting with this server as an LLM agent tool provider, along with the expected response shape for each. These are intended as a reference for agent system prompt authors, integration developers, and anyone testing the server manually.

---

## System Prompt (Agent Configuration)

Use this as the system prompt when configuring an LLM agent to use this server as its tool backend:

```
You are a movie assistant. You have access to the following tools that query The Movie Database (TMDB):

- search_movies: Search for movies by title and optional year.
- get_movie_details: Get full details for a movie using its TMDB ID (runtime, genres, cast, director, keywords).
- discover_movies: Browse movies using optional filters — genre name or ID, minimum rating, release year range, and keywords.
- get_recommendations: Get TMDB recommendations for a movie using its TMDB ID.
- get_trending: Get currently trending movies for "day" or "week".
- get_movie_id: Resolve a movie title (and optional year) to its TMDB numeric ID.
- get_genre_id: Resolve a genre name (e.g. "Action") to its TMDB numeric genre ID.

When a user asks about movies, use the appropriate tool. Chain tools when needed — for example, use get_movie_id first to resolve a title to an ID, then use get_movie_details or get_recommendations with that ID.

Always present results in a clear, readable format. If a tool returns an empty results array, tell the user no results were found.
```

---

## Tool Prompts and Expected Responses

### 1. search_movies

**Prompt:**
> "Find movies about space exploration"

**Tool call:**
```json
{
  "tool": "search_movies",
  "input": { "query": "space exploration" }
}
```

**Expected response shape:**
```json
{
  "results": [
    {
      "id": 12345,
      "title": "Interstellar",
      "year": 2014,
      "overview": "A team of explorers travel through a wormhole in space...",
      "poster_url": "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
      "rating": 8.4
    }
  ]
}
```

**Empty result case:**
```json
{ "results": [] }
```

---

### 2. search_movies (with year)

**Prompt:**
> "Find the movie Inception from 2010"

**Tool call:**
```json
{
  "tool": "search_movies",
  "input": { "query": "Inception", "year": 2010 }
}
```

**Expected response shape:** same as above, filtered to 2010 releases.

---

### 3. get_movie_id

**Prompt:**
> "What is the TMDB ID for The Dark Knight?"

**Tool call:**
```json
{
  "tool": "get_movie_id",
  "input": { "query": "The Dark Knight", "year": 2008 }
}
```

**Expected response shape:**
```json
{ "movie_id": 155 }
```

**Error — no match found:**
```json
{
  "error": {
    "code": "NO_RESULTS",
    "message": "No movie found matching the given query"
  }
}
```

---

### 4. get_movie_details

**Prompt:**
> "Tell me about the movie with TMDB ID 155"

**Tool call:**
```json
{
  "tool": "get_movie_details",
  "input": { "movie_id": 155 }
}
```

**Expected response shape:**
```json
{
  "id": 155,
  "title": "The Dark Knight",
  "year": 2008,
  "overview": "Batman raises the stakes in his war on crime...",
  "poster_url": "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
  "rating": 9.0,
  "runtime": 152,
  "genres": ["Action", "Crime", "Drama", "Thriller"],
  "cast": [
    { "name": "Christian Bale", "character": "Bruce Wayne / Batman" },
    { "name": "Heath Ledger", "character": "Joker" },
    { "name": "Aaron Eckhart", "character": "Harvey Dent" },
    { "name": "Michael Caine", "character": "Alfred Pennyworth" },
    { "name": "Maggie Gyllenhaal", "character": "Rachel Dawes" }
  ],
  "director": "Christopher Nolan",
  "keywords": ["dc comics", "crime fighter", "secret identity", "gotham city"]
}
```

> `cast` contains at most 5 members. `director` and `runtime` may be `null`.

**Error — movie not found:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found on TMDB"
  }
}
```

---

### 5. discover_movies (genre name)

**Prompt:**
> "Show me highly rated Action movies from the 2010s"

**Tool call:**
```json
{
  "tool": "discover_movies",
  "input": {
    "genre": "Action",
    "min_rating": 7.5,
    "year_from": 2010,
    "year_to": 2019
  }
}
```

> The server resolves `"Action"` to its TMDB genre ID automatically. You can also pass a numeric ID string like `"28"` directly.

**Expected response shape:**
```json
{
  "results": [
    {
      "id": 24428,
      "title": "The Avengers",
      "year": 2012,
      "overview": "Earth's mightiest heroes must come together...",
      "poster_url": "https://image.tmdb.org/t/p/w500/RYMX2wcKCBAr24UyPD7KE3wYQly.jpg",
      "rating": 7.7
    }
  ]
}
```

**Error — unknown genre name:**
```json
{
  "error": {
    "code": "NO_RESULTS",
    "message": "No genre found matching \"Sci-Fi\". Available genres: Action, Adventure, Animation, ..."
  }
}
```

---

### 6. discover_movies (no filters)

**Prompt:**
> "Show me some movies"

**Tool call:**
```json
{
  "tool": "discover_movies",
  "input": {}
}
```

**Expected response shape:** same as above, unfiltered TMDB discover results.

---

### 7. get_genre_id

**Prompt:**
> "What is the TMDB genre ID for Science Fiction?"

**Tool call:**
```json
{
  "tool": "get_genre_id",
  "input": { "name": "Science Fiction" }
}
```

**Expected response shape:**
```json
{
  "genre_id": 878,
  "genre_name": "Science Fiction"
}
```

> Matching is case-insensitive — `"science fiction"`, `"SCIENCE FICTION"`, and `"Science Fiction"` all resolve to the same result.

**Error — unknown genre:**
```json
{
  "error": {
    "code": "NO_RESULTS",
    "message": "No genre found matching \"Sci-Fi\". Available genres: Action, Adventure, Animation, ..."
  }
}
```

---

### 8. get_recommendations

**Prompt:**
> "What movies are similar to Inception?"

**Agent chain:**
1. Call `get_movie_id` with `{ "query": "Inception", "year": 2010 }` → `{ "movie_id": 27205 }`
2. Call `get_recommendations` with `{ "movie_id": 27205 }`

**Tool call:**
```json
{
  "tool": "get_recommendations",
  "input": { "movie_id": 27205 }
}
```

**Expected response shape:**
```json
{
  "results": [
    {
      "id": 157336,
      "title": "Interstellar",
      "year": 2014,
      "overview": "A team of explorers travel through a wormhole...",
      "poster_url": "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
      "rating": 8.4
    }
  ]
}
```

**Error — movie ID does not exist:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found on TMDB"
  }
}
```

---

### 9. get_trending

**Prompt:**
> "What movies are trending this week?"

**Tool call:**
```json
{
  "tool": "get_trending",
  "input": { "window": "week" }
}
```

**Expected response shape:**
```json
{
  "results": [
    {
      "id": 1022789,
      "title": "Inside Out 2",
      "year": 2024,
      "overview": "Teenager Riley's mind headquarters...",
      "poster_url": "https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg",
      "rating": 7.6
    }
  ]
}
```

**Error — invalid window value:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "window: Invalid enum value. Expected 'day' | 'week', received 'month'"
  }
}
```

---

## Common Error Responses

These can be returned by any tool endpoint:

| Scenario | Code | HTTP Status |
|---|---|---|
| Missing or invalid request field | `VALIDATION_ERROR` | 400 |
| Movie or resource not found on TMDB | `NOT_FOUND` | 404 |
| Search or lookup returned zero results | `NO_RESULTS` | 404 |
| Wrong HTTP method (e.g. GET on a tool) | `METHOD_NOT_ALLOWED` | 405 |
| Missing or wrong `Content-Type` header | `UNSUPPORTED_MEDIA_TYPE` | 415 |
| Semantically invalid input (e.g. `year_from > year_to`) | `UNPROCESSABLE_INPUT` | 422 |
| TMDB rate limit hit | `RATE_LIMITED` | 429 |
| Unexpected server error | `INTERNAL_ERROR` | 500 |

All error responses follow this shape:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

On `RATE_LIMITED` responses, a `Retry-After` header is included when TMDB provides one.

---

## Chaining Example — Full Agent Flow

**User prompt:** "What movies would someone who loved Interstellar enjoy?"

**Agent steps:**

1. Resolve title to ID:
   ```json
   { "tool": "get_movie_id", "input": { "query": "Interstellar", "year": 2014 } }
   ```
   → `{ "movie_id": 157336 }`

2. Get recommendations:
   ```json
   { "tool": "get_recommendations", "input": { "movie_id": 157336 } }
   ```
   → list of recommended movies

3. Optionally enrich a result with full details:
   ```json
   { "tool": "get_movie_details", "input": { "movie_id": 27205 } }
   ```
   → full details including cast, director, keywords
