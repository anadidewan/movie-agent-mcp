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

> `genre` accepts either a genre name (e.g. `"Action"`) or a numeric TMDB genre ID as a string (e.g. `"28"`).

**Request:**
```json
{
  "genre": "Action",
  "min_rating": 7.5,
  "year_from": 2000,
  "year_to": 2020,
  "keywords": "space"
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
| `VALIDATION_ERROR` | 400 | Invalid field type |
| `NO_RESULTS` | 404 | Genre name does not match any TMDB genre |
| `UNPROCESSABLE_INPUT` | 422 | `year_from` > `year_to` |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## POST /tools/get_recommendations

Retrieve TMDB recommendations for a given movie.

**Request:**
```json
{ "movie_id": 550 }
```

**Response 200:**
```json
{
  "results": [
    { "id": 807, "title": "Se7en", "year": 1995, "overview": "...", "poster_url": "...", "rating": 8.3 }
  ]
}
```

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `movie_id` missing or not a number |
| `NOT_FOUND` | 404 | Movie does not exist on TMDB |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## POST /tools/get_trending

Retrieve currently trending movies.

**Request:**
```json
{ "window": "day" }
```

**Response 200:**
```json
{
  "results": [
    { "id": 1022789, "title": "Inside Out 2", "year": 2024, "overview": "...", "poster_url": "...", "rating": 7.6 }
  ]
}
```

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `window` missing or not `"day"` / `"week"` |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## POST /tools/get_movie_id

Resolve a movie title to a TMDB movie ID.

**Request:**
```json
{ "query": "Inception", "year": 2010 }
```

**Response 200:**
```json
{ "movie_id": 27205 }
```

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `query` missing or empty |
| `NO_RESULTS` | 404 | No matching movie found |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## POST /tools/get_genre_id

Resolve a genre name to its TMDB numeric genre ID.

**Request:**
```json
{ "name": "Action" }
```

**Response 200:**
```json
{ "genre_id": 28, "genre_name": "Action" }
```

**Errors:**
| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `name` missing or empty |
| `NO_RESULTS` | 404 | No TMDB genre matches |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Common Error Codes

| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body failed schema validation |
| `NOT_FOUND` | 404 | Resource does not exist on TMDB |
| `NO_RESULTS` | 404 | Search/lookup returned zero results |
| `METHOD_NOT_ALLOWED` | 405 | HTTP method not supported |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | `Content-Type` is not `application/json` |
| `UNPROCESSABLE_INPUT` | 422 | Semantically invalid input |
| `RATE_LIMITED` | 429 | TMDB upstream rate limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
