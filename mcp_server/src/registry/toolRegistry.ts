/**
 * Tool Registry — static list of all available tools exposed by this service.
 * Each entry includes a human-readable description and a JSON Schema input_schema
 * that describes the tool's accepted request body.
 *
 * Requirements: 8.1, 8.2, 8.3
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const toolRegistry: ToolDefinition[] = [
  {
    name: 'search_movies',
    description:
      'Search for movies by title and optional release year. Returns a normalized list of matching movies with id, title, year, overview, poster_url, and rating.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          description: 'The movie title or search query (required, non-empty).',
        },
        year: {
          type: 'integer',
          description: 'Optional release year to filter results.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_movie_details',
    description:
      'Retrieve full details for a specific movie by its TMDB ID, including runtime, genres, top cast members, director, and keywords.',
    input_schema: {
      type: 'object',
      properties: {
        movie_id: {
          type: 'integer',
          description: 'The TMDB numeric movie ID.',
        },
      },
      required: ['movie_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'discover_movies',
    description:
      'Browse movies using optional category filters: genre, minimum rating, release year range, and keywords. All filters are optional; omitting all returns unfiltered results.',
    input_schema: {
      type: 'object',
      properties: {
        genre: {
          type: 'string',
          description: 'Genre name or TMDB genre ID to filter by.',
        },
        min_rating: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description: 'Minimum TMDB vote average (0–10).',
        },
        year_from: {
          type: 'integer',
          description: 'Earliest release year (inclusive). Must not exceed year_to when both are provided.',
        },
        year_to: {
          type: 'integer',
          description: 'Latest release year (inclusive). Must not be less than year_from when both are provided.',
        },
        keywords: {
          type: 'string',
          description: 'Keyword string to filter results by.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_recommendations',
    description:
      "Retrieve TMDB's movie recommendations for a given movie ID. Returns a normalized list of recommended movies.",
    input_schema: {
      type: 'object',
      properties: {
        movie_id: {
          type: 'integer',
          description: 'The TMDB numeric movie ID to get recommendations for.',
        },
      },
      required: ['movie_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_trending',
    description:
      'Retrieve currently trending movies for a given time window ("day" or "week"). Returns a normalized list of trending movies.',
    input_schema: {
      type: 'object',
      properties: {
        window: {
          type: 'string',
          enum: ['day', 'week'],
          description: 'Time window for trending results: "day" or "week".',
        },
      },
      required: ['window'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_movie_id',
    description:
      'Resolve a movie title (and optional year) to a TMDB movie ID. Returns the movie_id of the top-ranked search result.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          description: 'The movie title or search query (required, non-empty).',
        },
        year: {
          type: 'integer',
          description: 'Optional release year to narrow the search.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_genre_id',
    description:
      'Resolve a genre name (e.g. "Action", "Comedy") to its TMDB numeric genre ID. Useful before calling discover_movies when you have a genre name rather than an ID.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: 'The genre name to resolve (case-insensitive).',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
];
