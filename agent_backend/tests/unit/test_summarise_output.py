"""
Unit tests for summarise_output() and tool call tracing in agent_runner.py.

Validates all response shapes returned by the MCP wrapper tools:
- List results (search_movies, discover_movies, get_recommendations, get_trending)
- Single-object responses (get_movie_details, get_movie_id, get_genre_id)
- Error envelopes
- Empty results
- Non-JSON / malformed output (fallback)
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.agent_runner import summarise_output


# ---------------------------------------------------------------------------
# List result responses
# ---------------------------------------------------------------------------


def test_results_with_titles_returns_count_and_top_titles():
    payload = json.dumps({
        "results": [
            {"id": 550, "title": "Fight Club", "year": 1999},
            {"id": 807, "title": "Se7en", "year": 1995},
            {"id": 238, "title": "The Godfather", "year": 1972},
            {"id": 278, "title": "The Shawshank Redemption", "year": 1994},
        ]
    })
    result = summarise_output(payload)
    assert "4" in result
    assert "Fight Club" in result
    assert "Se7en" in result
    assert "The Godfather" in result
    # 4th title should NOT appear (only top 3)
    assert "Shawshank" not in result


def test_empty_results_returns_no_results_message():
    payload = json.dumps({"results": []})
    result = summarise_output(payload)
    assert "no results" in result.lower()


def test_results_without_titles_still_returns_count():
    payload = json.dumps({
        "results": [{"id": 1}, {"id": 2}]
    })
    result = summarise_output(payload)
    assert "2" in result


# ---------------------------------------------------------------------------
# Single-object responses
# ---------------------------------------------------------------------------


def test_movie_details_with_title_director_rating():
    payload = json.dumps({
        "id": 550,
        "title": "Fight Club",
        "year": 1999,
        "director": "David Fincher",
        "rating": 8.4,
    })
    result = summarise_output(payload)
    assert "Fight Club" in result
    assert "1999" in result
    assert "David Fincher" in result
    assert "8.4" in result


def test_movie_details_without_director():
    payload = json.dumps({
        "id": 550,
        "title": "Fight Club",
        "year": 1999,
        "rating": 8.4,
    })
    result = summarise_output(payload)
    assert "Fight Club" in result
    assert isinstance(result, str)
    assert len(result) > 0


def test_get_movie_id_response():
    payload = json.dumps({"movie_id": 27205})
    result = summarise_output(payload)
    assert "27205" in result


def test_get_genre_id_response():
    payload = json.dumps({"genre_id": 28, "genre_name": "Action"})
    result = summarise_output(payload)
    assert "Action" in result
    assert "28" in result


# ---------------------------------------------------------------------------
# Error envelope
# ---------------------------------------------------------------------------


def test_error_envelope_returns_code_and_message():
    payload = json.dumps({
        "error": {"code": "NOT_FOUND", "message": "Movie does not exist on TMDB"}
    })
    result = summarise_output(payload)
    assert "NOT_FOUND" in result
    assert "Movie does not exist on TMDB" in result


# ---------------------------------------------------------------------------
# Fallback / edge cases
# ---------------------------------------------------------------------------


def test_non_json_input_returns_truncated_string():
    raw = "This is not JSON at all"
    result = summarise_output(raw)
    assert result == raw  # short enough, returned as-is (truncated at 200)


def test_non_json_long_input_is_truncated():
    raw = "x" * 300
    result = summarise_output(raw)
    assert len(result) <= 200


def test_empty_string_returns_fallback():
    result = summarise_output("")
    assert "empty" in result.lower() or len(result) > 0


def test_output_is_always_a_string():
    """summarise_output must always return a str, never raise."""
    cases = [
        '{"results": []}',
        '{"error": {"code": "X", "message": "Y"}}',
        '{"movie_id": 1}',
        "not json",
        "",
        "null",
        "[]",
    ]
    for case in cases:
        result = summarise_output(case)
        assert isinstance(result, str), f"Expected str for input {case!r}, got {type(result)}"
