# API Contracts — tmdb-mcp-server

All tool endpoints accept `POST` requests with `Content-Type: application/json`.  
All responses are JSON. All error responses follow the shape:

```json
{ "error": { "code": string, "message": string } }
```

---

## GET /health

Returns the service liveness status. No outbound TMDB calls are made.

**Response 200:**
```json
{ "status": "ok" }
```

---

## GET /tools

Returns the full Tool Registry: all available tools with their names, descriptions, and JSON Schema input definitions. No outbound TMDB calls are made.

**Response 200:**
```json
{
  "tools": [
    {
      "name": "string",
      "description": "string",
      "input_schema": {}
    }
  ]
}
```

---

## POST /tools/search_movies

Search for movies by title and optional release year.

**Request:**
```json
{
  "query": "string",   // required, non-empty
  "year": 2024         // optional, integer
}
```

**Response 200:**
```json
{
  "results": [
    {
      "id": 550,
      "title": "Fight Club",
      "year": 1999,
      "overview": "A ticking-time-bomb insomniac...",
      "poster_url": "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
      "rating": 8.4
    }
  ]
}
```

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `query` is missing or empty |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## POST /tools/get_movie_details

Retrieve full details for a specific movie by its TMDB ID, including credits and keywords.

**Request:**
```json
{
  "movie_id": 550   // required, integer
}
```

**Response 200:**
```json
{
  "id": 550,
  "title": "Fight Club",
  "year": 1999,
  "overview": "A ticking-time-bomb insomniac...",
  "poster_url": "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
  "rating": 8.4,
  "runtime": 139,
  "genres": ["Drama", "Thriller"],
  "cast": [
    { "name": "Brad Pitt", "character": "Tyler Durden" },
    { "name": "Edward Norton", "character": "The Narrator" }
  ],
  "director": "David Fincher",
  "keywords": ["based on novel or book", "support group", "dual identity"]
}
```

> `cast` contains at most 5 members in TMDB billing order.  
> `director` is `null` if no director is found in the crew.  
> `runtime` is `null` if TMDB does not provide it.

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `movie_id` is missing or not a number |
| `NOT_FOUND` | 404 | Movie does not exist on TMDB |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## POST /tools/discover_movies

Browse movies using optional category filters. All filter fields are optional; omitting all returns unfiltered results.

> `genre` accepts either a genre name (e.g. `"Action"`) or a numeric TMDB genre ID as a string (e.g. `"28"`). When a name is provided, the server resolves it to an ID automatically via the TMDB genre list. Resolution is case-insensitive. If the name does not match any known genre, a `NO_RESULTS` error is returned.

**Request:**
```json
{
  "genre": "Action",    // optional, genre name or numeric ID string
  "min_rating": 7.5,    // optional, number 0–10
  "year_from": 2000,    // optional, integer
  "year_to": 2020,      // optional, integer
  "keywords": "space"   // optional, string
}
```

**Response 200:**
```json
{
  "results": [
    {
      "id": 550,
      "title": "Fight Club",
      "year": 1999,
      "overview": "A ticking-time-bomb insomniac...",
      "poster_url": "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
      "rating": 8.4
    }
  ]
}
```

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid field type (e.g., string for `min_rating`) |
| `NO_RESULTS` | 404 | `genre` name does not match any TMDB genre |
| `UNPROCESSABLE_INPUT` | 422 | `year_from` is greater than `year_to` |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## POST /tools/get_recommendations

Retrieve TMDB's movie recommendations for a given movie.

**Request:**
```json
{
  "movie_id": 550   // required, integer
}
```

**Response 200:**
```json
{
  "results": [
    {
      "id": 807,
      "title": "Se7en",
      "year": 1995,
      "overview": "Two detectives...",
      "poster_url": "https://image.tmdb.org/t/p/w500/69Sns8WoET6CfaYlIkHbla4l7nC.jpg",
      "rating": 8.3
    }
  ]
}
```

> Returns an empty `results` array when TMDB has no recommendations for the given movie.

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `movie_id` is missing or not a number |
| `NOT_FOUND` | 404 | Movie does not exist on TMDB |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## POST /tools/get_trending

Retrieve currently trending movies for a given time window.

**Request:**
```json
{
  "window": "day"   // required, "day" or "week"
}
```

**Response 200:**
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

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `window` is missing or not `"day"` / `"week"` |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## POST /tools/get_movie_id

Resolve a movie title (and optional year) to a TMDB movie ID.

**Request:**
```json
{
  "query": "Inception",   // required, non-empty
  "year": 2010            // optional, integer
}
```

**Response 200:**
```json
{
  "movie_id": 27205
}
```

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `query` is missing or empty |
| `NO_RESULTS` | 404 | No matching movie found for the given query |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## POST /tools/get_genre_id

Resolve a genre name to its TMDB numeric genre ID. Useful when you want to pass a precise ID to `discover_movies`, or to validate that a genre name is recognised by TMDB.

> Matching is case-insensitive and trims leading/trailing whitespace. If no genre matches, the error message includes the full list of valid genre names.

**Request:**
```json
{
  "name": "Action"   // required, non-empty string
}
```

**Response 200:**
```json
{
  "genre_id": 28,
  "genre_name": "Action"
}
```

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `name` is missing or empty |
| `NO_RESULTS` | 404 | No TMDB genre matches the given name |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Common Error Codes

| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body failed schema validation |
| `NOT_FOUND` | 404 | Requested resource does not exist on TMDB |
| `NO_RESULTS` | 404 | Search/lookup returned zero results |
| `METHOD_NOT_ALLOWED` | 405 | HTTP method not supported for this endpoint |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | `Content-Type` is not `application/json` |
| `UNPROCESSABLE_INPUT` | 422 | Semantically invalid input (e.g., `year_from > year_to`) |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Notes

- The `Retry-After` response header is propagated on `429 RATE_LIMITED` responses when provided by TMDB.
- Tool endpoints (`POST /tools/*`) require `Content-Type: application/json`; omitting it returns `415 UNSUPPORTED_MEDIA_TYPE`.
- Sending a non-POST request to a tool endpoint returns `405 METHOD_NOT_ALLOWED`.
- `poster_url` is `null` when TMDB does not provide a poster image for the movie.
- `year` is `null` when TMDB does not provide a `release_date` for the movie.
