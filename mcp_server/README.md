# tmdb-mcp-server

A Node.js/TypeScript Express microservice that wraps the [TMDB (The Movie Database) REST API v3](https://developer.themoviedb.org/docs) and exposes seven discrete tool endpoints designed to be consumed by a LangChain agent backend. Each endpoint represents a named, agent-invocable capability — this is not a generic API proxy. All TMDB responses are normalized into consistent, well-typed shapes.

---

## Prerequisites

- **Node.js 20+** and **pnpm** (or Docker)
- **TMDB API key** — obtain one for free at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TMDB_API_KEY` | **Yes** | — | Your TMDB v3 API key (Bearer token) |
| `PORT` | No | `3000` | Port the server listens on |
| `NODE_ENV` | No | — | Set to `development` for pretty-printed logs |

---

## Local Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set TMDB_API_KEY=your_key_here

# 3. Start in development mode (hot reload)
pnpm run dev

# 4. Or build and run the compiled output
pnpm run build
pnpm start
```

The server will be available at `http://localhost:3000`.

---

## Running with Docker

```bash
# Build the image
docker build -t tmdb-mcp-server .

# Run the container — pass your API key at runtime
docker run -p 3000:3000 -e TMDB_API_KEY=your_key_here tmdb-mcp-server

# Optional: override the port
docker run -p 8080:8080 -e TMDB_API_KEY=your_key_here -e PORT=8080 tmdb-mcp-server
```

---

## Running Tests

```bash
pnpm test
```

This runs the full suite: unit tests, property-based tests (fast-check), and integration tests (supertest with mocked Axios).

---

## curl Examples

### Health check

```bash
curl http://localhost:3000/health
```

### List available tools

```bash
curl http://localhost:3000/tools
```

### Search movies

```bash
curl -X POST http://localhost:3000/tools/search_movies \
  -H "Content-Type: application/json" \
  -d '{"query": "Inception", "year": 2010}'
```

### Get movie details

```bash
curl -X POST http://localhost:3000/tools/get_movie_details \
  -H "Content-Type: application/json" \
  -d '{"movie_id": 27205}'
```

### Discover movies

```bash
curl -X POST http://localhost:3000/tools/discover_movies \
  -H "Content-Type: application/json" \
  -d '{"genre": "Action", "min_rating": 7.5, "year_from": 2010, "year_to": 2020}'
```

> `genre` accepts a name (`"Action"`) or a numeric ID string (`"28"`). Names are resolved automatically.

### Resolve a genre name to its TMDB ID

```bash
curl -X POST http://localhost:3000/tools/get_genre_id \
  -H "Content-Type: application/json" \
  -d '{"name": "Science Fiction"}'
```

### Get recommendations

```bash
curl -X POST http://localhost:3000/tools/get_recommendations \
  -H "Content-Type: application/json" \
  -d '{"movie_id": 27205}'
```

### Get trending movies

```bash
curl -X POST http://localhost:3000/tools/get_trending \
  -H "Content-Type: application/json" \
  -d '{"window": "week"}'
```

### Resolve a movie title to its TMDB ID

```bash
curl -X POST http://localhost:3000/tools/get_movie_id \
  -H "Content-Type: application/json" \
  -d '{"query": "The Dark Knight", "year": 2008}'
```

---

## Tool Reference

| Tool | Endpoint | Description |
|---|---|---|
| `search_movies` | `POST /tools/search_movies` | Search for movies by title and optional year |
| `get_movie_details` | `POST /tools/get_movie_details` | Get full details (runtime, genres, cast, director, keywords) for a movie by TMDB ID |
| `discover_movies` | `POST /tools/discover_movies` | Browse movies with optional filters: genre name or ID, min rating, year range, keywords |
| `get_recommendations` | `POST /tools/get_recommendations` | Get TMDB recommendations for a given movie ID |
| `get_trending` | `POST /tools/get_trending` | Get trending movies for a time window (`"day"` or `"week"`) |
| `get_movie_id` | `POST /tools/get_movie_id` | Resolve a movie title (+ optional year) to its TMDB numeric ID |
| `get_genre_id` | `POST /tools/get_genre_id` | Resolve a genre name (e.g. `"Action"`) to its TMDB numeric genre ID |

All tool endpoints return normalized responses with consistent field shapes. See [contracts.md](./docs/contracts.md) for full request/response schemas and error codes.

---

## Architecture Notes

The service follows a strict layered pipeline for every tool request:

```
validate (Zod) → semantic check → call TMDB (Axios) → normalize → respond
```

- All normalization is pure and side-effect-free, enabling property-based testing
- A single Axios instance handles all outbound TMDB calls with centralized error interception
- Structured JSON logging via [pino](https://getpino.io/) — the API key is never logged or exposed in responses
- The `createApp()` factory pattern keeps the Express app decoupled from `listen()`, making integration tests fast and reliable

For a detailed breakdown of the architecture, data models, correctness properties, and testing strategy, see [design.md](.kiro/specs/tmdb-mcp-server/design.md).
