"""
app/agent/movie_extractor.py — Deterministic post-processor for movie extraction.

Inspects intermediate tool call results from the agent run, filters to movies
whose titles appear in the LLM's prose output, and returns them as structured
Movie objects ordered by first mention position.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import ValidationError

from app.schemas import Movie

logger = logging.getLogger(__name__)

# Tools whose output contains a `results` array of movie objects.
MOVIE_TOOLS: frozenset[str] = frozenset(
    {
        "search_movies",
        "discover_movies",
        "get_recommendations",
        "get_trending",
    }
)


def extract_movies(
    intermediate_steps: list[tuple[Any, str]],
    llm_content: str,
    max_count: int = 5,
) -> list[Movie]:
    """Extract structured movie data from agent intermediate steps.

    Filters to only movies whose titles appear in the LLM's prose,
    orders by first mention position, deduplicates by id, and caps
    at *max_count*.

    Parameters
    ----------
    intermediate_steps:
        Ordered ``(action, raw_output)`` pairs from the agent run.
        Each *action* must expose a ``.tool`` attribute (str).
    llm_content:
        The full text of the LLM's prose response.
    max_count:
        Maximum number of movies to return.  Default ``5``.

    Returns
    -------
    list[Movie]
        Movies ordered by first mention position in *llm_content*,
        deduplicated by id, capped at *max_count*.
        Never raises — returns ``[]`` on any error.
    """
    try:
        if not llm_content:
            return []

        llm_lower = llm_content.lower()

        # Phase 1: Collect all candidate movies from qualifying tool steps
        candidates: list[Movie] = []
        for action, raw_output in intermediate_steps:
            if getattr(action, "tool", None) not in MOVIE_TOOLS:
                continue
            candidates.extend(_parse_movies_from_output(raw_output))

        # Phase 2: Filter to movies mentioned in LLM content
        mentioned: list[tuple[int, Movie]] = []
        for movie in candidates:
            pos = _find_title_position(movie.title, llm_lower)
            if pos >= 0:
                mentioned.append((pos, movie))

        # Phase 3: Sort by first mention position
        mentioned.sort(key=lambda pair: pair[0])

        # Phase 4: Deduplicate by id (first-seen wins)
        seen_ids: set[int] = set()
        unique: list[Movie] = []
        for _pos, movie in mentioned:
            if movie.id not in seen_ids:
                seen_ids.add(movie.id)
                unique.append(movie)

        # Phase 5: Cap at max_count
        return unique[:max_count]

    except Exception:
        logger.debug("extract_movies failed; returning empty list", exc_info=True)
        return []


def _parse_movies_from_output(raw_output: str) -> list[Movie]:
    """Parse a single tool output string into a list of Movie objects.

    Returns ``[]`` if the output is malformed, missing ``results``,
    or contains an error envelope.
    """
    try:
        parsed = json.loads(raw_output)
    except (json.JSONDecodeError, TypeError):
        return []

    if not isinstance(parsed, dict):
        return []

    # Skip error envelopes
    if "error" in parsed:
        return []

    results = parsed.get("results")
    if not isinstance(results, list):
        return []

    movies: list[Movie] = []
    for entry in results:
        try:
            movie = Movie(
                id=entry["id"],
                title=entry["title"],
                year=entry.get("year"),
                poster_url=entry.get("poster_url"),
                rating=entry.get("rating"),
            )
            movies.append(movie)
        except (KeyError, TypeError, ValidationError):
            continue  # skip malformed entries

    return movies


def _find_title_position(title: str, llm_content_lower: str) -> int:
    """Return the index of the first case-insensitive occurrence of *title*.

    Returns ``-1`` if not found.
    """
    return llm_content_lower.find(title.lower())
