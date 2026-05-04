# API Contracts — Agent Backend

All responses are JSON unless SSE streaming is requested.
All error responses follow the shape:

```json
{ "error": { "code": string, "message": string } }
```

---

## POST /chat

Stateless chat endpoint. The frontend sends the full conversation history on every request. Returns the assistant's reply and an ordered trace of tool calls made during the agent run.

Supports two response modes:
- **JSON** (default): returns a single JSON response body
- **SSE streaming**: returns Server-Sent Events when `Accept: text/event-stream` is set

### JSON Mode

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Recommend a dark thriller" },
    { "role": "assistant", "content": "Se7en is a great pick..." },
    { "role": "user", "content": "What else?" }
  ]
}
```

> `role` must be `"user"` or `"assistant"`. Extra fields are rejected (HTTP 422).

**Response 200:**
```json
{
  "message": {
    "role": "assistant",
    "content": "If you liked Se7en, try Zodiac — another Fincher masterpiece.",
    "movies": [
      {
        "id": 539,
        "title": "Zodiac",
        "year": 2007,
        "poster_url": "https://image.tmdb.org/t/p/w500/...",
        "rating": 7.7
      }
    ]
  },
  "tool_calls": [
    {
      "tool": "get_recommendations",
      "input": { "movie_id": 807 },
      "output_summary": "Found 20 result(s). Top titles: Zodiac, The Silence of the Lambs, Prisoners."
    }
  ]
}
```

> `tool_calls` is an ordered list of every tool invocation during the run.
> `output_summary` is a 1-2 sentence human-readable summary — never raw JSON.
> When no tools are invoked, `tool_calls` is an empty array `[]`.
> `movies` is a `list[Movie]` of structured movie data extracted from tool results. Defaults to `[]` when no movies are present. Each `Movie` has fields: `id` (int), `title` (str), `year` (int | null), `poster_url` (str | null), `rating` (float | null).

### SSE Streaming Mode

Set `Accept: text/event-stream` to receive the response token-by-token.

**SSE Event Types:**

| Event type | Payload | When emitted |
|---|---|---|
| `token` | `{"type": "token", "content": "string"}` | Each LLM output chunk |
| `movies` | `{"type": "movies", "movies": [...]}` | After final token, before tool_calls |
| `tool_calls` | `{"type": "tool_calls", "tool_calls": [...]}` | Once, after all tokens |
| `error` | `{"type": "error", "code": "string", "message": "string"}` | On agent error |
| `done` | `{"type": "done"}` | Final event, signals stream end |

**Example stream:**
```
data: {"type":"token","content":"If you liked"}

data: {"type":"token","content":" Se7en, try Zodiac."}

data: {"type":"movies","movies":[{"id":539,"title":"Zodiac","year":2007,"poster_url":"https://image.tmdb.org/t/p/w500/...","rating":7.7}]}

data: {"type":"tool_calls","tool_calls":[{"tool":"get_recommendations","input":{"movie_id":807},"output_summary":"Found 20 results. Top: Zodiac, Prisoners."}]}

data: {"type":"done"}
```

### Errors

| Code | HTTP Status | Condition |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Request body fails schema validation (wrong role, missing content, extra fields) |
| `LLM_ERROR` | 502 | Gemini API returned an error during the agent run |
| `MCP_UNAVAILABLE` | 503 | MCP wrapper is unreachable during the agent run |

---

## GET /health

Returns service liveness status and MCP wrapper reachability. Always returns HTTP 200, even when the MCP wrapper is unreachable.

`mcp_status` is cached for 60 seconds to avoid hammering the MCP wrapper.

**Response 200:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "mcp_status": "ok"
}
```

> `mcp_status` is `"ok"` when the MCP wrapper is reachable, `"unreachable"` otherwise.

---

## GET /tools

Returns the list of currently registered LangChain tools. Mirrors what was discovered from the MCP wrapper at startup.

Never includes API keys, secrets, or internal configuration.

**Response 200:**
```json
{
  "tools": [
    {
      "name": "search_movies",
      "description": "Search for movies by title and optional release year."
    },
    {
      "name": "get_movie_details",
      "description": "Retrieve full details for a movie by TMDB ID."
    },
    {
      "name": "discover_movies",
      "description": "Browse movies by genre, rating, year range, and keywords."
    },
    {
      "name": "get_recommendations",
      "description": "Get TMDB recommendations for a given movie."
    },
    {
      "name": "get_trending",
      "description": "Retrieve currently trending movies."
    },
    {
      "name": "get_movie_id",
      "description": "Resolve a movie title to its TMDB ID."
    },
    {
      "name": "get_genre_id",
      "description": "Resolve a genre name to its TMDB genre ID."
    }
  ]
}
```

> The tool list is dynamic — it reflects whatever the MCP wrapper returns at startup. If the MCP wrapper adds or removes tools, this endpoint updates automatically on the next restart.

---

## Common Error Envelope

All error responses use this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "1 validation error for ChatRequest..."
  }
}
```

| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Request body failed Pydantic schema validation |
| `LLM_ERROR` | 502 | Gemini API error during agent execution |
| `MCP_UNAVAILABLE` | 503 | MCP wrapper unreachable (connection refused, timeout) |
| `INTERNAL_ERROR` | 500 | Unhandled server error |

---

## Response Headers

| Header | Value | Description |
|---|---|---|
| `X-Request-ID` | UUID string | Unique identifier for the request, useful for log correlation |
| `Content-Type` | `application/json` or `text/event-stream` | Depends on the response mode |

---

## Notes

- The service is **stateless** — no conversation history is stored server-side. The frontend must send the full message history on every `/chat` request.
- `GEMINI_API_KEY` and `MCP_BASE_URL` are never included in any response body, header, or log output.
- MCP wrapper tool errors (4xx/5xx from the wrapper) are **not** surfaced as HTTP errors to the frontend. They are translated into agent-readable strings so the LLM can reason about them and respond gracefully.
- The service refuses to start if `GEMINI_API_KEY` or `MCP_BASE_URL` are missing, or if the MCP wrapper is unreachable at startup.
- The `movies` field in `AssistantMessage` and the `movies` SSE event are populated by a deterministic post-processor that extracts structured movie data from tool call results. Only movies whose full titles appear as exact phrases (case-insensitive, word-boundary delimited) in the assistant's prose response are included. Movies are ordered by their first mention position in the prose, deduplicated by `id`, and capped at 5 per response. The LLM does not control which movies appear as cards — the post-processor derives them entirely from tool outputs and the prose content.
