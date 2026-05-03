"""
Unit tests for extract_movies() in app/agent/movie_extractor.py.

Validates: Requirements 10.1
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.agent.movie_extractor import extract_movies
from app.schemas import Movie


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _action(tool: str) -> SimpleNamespace:
    """Create a fake action object with a .tool attribute."""
    return SimpleNamespace(tool=tool)


def _movie_output(*movies: dict) -> str:
    """Build a JSON tool output string with a results array."""
    return json.dumps({"results": list(movies)})


# Reusable movie dicts
FIGHT_CLUB = {"id": 550, "title": "Fight Club", "year": 1999, "poster_url": "https://img/fc.jpg", "rating": 8.4}
SE7EN = {"id": 807, "title": "Se7en", "year": 1995, "poster_url": "https://img/se7en.jpg", "rating": 8.3}
GODFATHER = {"id": 238, "title": "The Godfather", "year": 1972, "poster_url": "https://img/gf.jpg", "rating": 9.2}
INCEPTION = {"id": 27205, "title": "Inception", "year": 2010, "poster_url": "https://img/inc.jpg", "rating": 8.4}
INTERSTELLAR = {"id": 157336, "title": "Interstellar", "year": 2014, "poster_url": "https://img/is.jpg", "rating": 8.6}
MATRIX = {"id": 603, "title": "The Matrix", "year": 1999, "poster_url": "https://img/mx.jpg", "rating": 8.7}


# ---------------------------------------------------------------------------
# Mixed tool calls: only movie-returning tools contribute candidates
# ---------------------------------------------------------------------------


class TestMixedToolCalls:
    def test_only_movie_tools_contribute_candidates(self):
        """Non-movie tools like get_movie_details are ignored."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB)),
            (_action("get_movie_details"), json.dumps({"id": 550, "title": "Fight Club", "year": 1999})),
            (_action("get_movie_id"), json.dumps({"movie_id": 550})),
        ]
        llm_content = "You should watch Fight Club."
        result = extract_movies(steps, llm_content)
        assert len(result) == 1
        assert result[0].id == 550

    def test_all_four_movie_tools_contribute(self):
        """search_movies, discover_movies, get_recommendations, get_trending all work."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB)),
            (_action("discover_movies"), _movie_output(SE7EN)),
            (_action("get_recommendations"), _movie_output(GODFATHER)),
            (_action("get_trending"), _movie_output(INCEPTION)),
        ]
        llm_content = "Check out Fight Club, Se7en, The Godfather, and Inception."
        result = extract_movies(steps, llm_content)
        assert {m.id for m in result} == {550, 807, 238, 27205}


# ---------------------------------------------------------------------------
# Deduplication by id
# ---------------------------------------------------------------------------


class TestDeduplication:
    def test_same_movie_from_two_tools_appears_once(self):
        """Same movie id from search_movies and get_recommendations → one Movie."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB)),
            (_action("get_recommendations"), _movie_output(FIGHT_CLUB)),
        ]
        llm_content = "Fight Club is a classic."
        result = extract_movies(steps, llm_content)
        assert len(result) == 1
        assert result[0].id == 550

    def test_different_movies_not_deduplicated(self):
        """Movies with different ids are all kept."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB, SE7EN)),
        ]
        llm_content = "Fight Club and Se7en are both great."
        result = extract_movies(steps, llm_content)
        assert len(result) == 2


# ---------------------------------------------------------------------------
# Title filtering: only movies mentioned in llm_content are included
# ---------------------------------------------------------------------------


class TestTitleFiltering:
    def test_unmentioned_movies_excluded(self):
        """Movies whose titles don't appear in llm_content are filtered out."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB, SE7EN, GODFATHER)),
        ]
        llm_content = "I recommend Fight Club for a thrilling experience."
        result = extract_movies(steps, llm_content)
        assert len(result) == 1
        assert result[0].id == 550

    def test_no_movies_mentioned_returns_empty(self):
        """If llm_content mentions none of the candidate titles, return []."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB, SE7EN)),
        ]
        llm_content = "Here are some action movies for you."
        result = extract_movies(steps, llm_content)
        assert result == []


# ---------------------------------------------------------------------------
# Ordering by first mention position in llm_content
# ---------------------------------------------------------------------------


class TestOrdering:
    def test_movies_ordered_by_first_mention(self):
        """Movies appear in the order their titles first occur in llm_content."""
        steps = [
            # Tool returns them in alphabetical-ish order
            (_action("search_movies"), _movie_output(FIGHT_CLUB, INCEPTION, SE7EN)),
        ]
        # LLM mentions Se7en first, then Inception, then Fight Club
        llm_content = "Se7en is a masterpiece. Inception is mind-bending. Fight Club is iconic."
        result = extract_movies(steps, llm_content)
        assert [m.id for m in result] == [807, 27205, 550]

    def test_ordering_across_multiple_tool_calls(self):
        """Ordering works across movies from different tool calls."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB)),
            (_action("get_trending"), _movie_output(SE7EN)),
        ]
        llm_content = "Se7en came out before Fight Club."
        result = extract_movies(steps, llm_content)
        assert [m.id for m in result] == [807, 550]


# ---------------------------------------------------------------------------
# max_count enforcement
# ---------------------------------------------------------------------------


class TestMaxCount:
    def test_max_count_caps_results(self):
        """More candidates than max_count → result length == max_count."""
        all_movies = [FIGHT_CLUB, SE7EN, GODFATHER, INCEPTION, INTERSTELLAR, MATRIX]
        steps = [
            (_action("search_movies"), _movie_output(*all_movies)),
        ]
        llm_content = (
            "Fight Club, Se7en, The Godfather, Inception, Interstellar, and The Matrix "
            "are all worth watching."
        )
        result = extract_movies(steps, llm_content, max_count=3)
        assert len(result) == 3

    def test_fewer_than_max_count_returns_all(self):
        """When fewer movies than max_count, all are returned."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB, SE7EN)),
        ]
        llm_content = "Fight Club and Se7en are great."
        result = extract_movies(steps, llm_content, max_count=5)
        assert len(result) == 2

    def test_default_max_count_is_five(self):
        """Default max_count is 5."""
        all_movies = [FIGHT_CLUB, SE7EN, GODFATHER, INCEPTION, INTERSTELLAR, MATRIX]
        steps = [
            (_action("search_movies"), _movie_output(*all_movies)),
        ]
        llm_content = (
            "Fight Club, Se7en, The Godfather, Inception, Interstellar, and The Matrix."
        )
        result = extract_movies(steps, llm_content)
        assert len(result) == 5


# ---------------------------------------------------------------------------
# Error resilience
# ---------------------------------------------------------------------------


class TestErrorResilience:
    def test_malformed_json_output_skipped(self):
        """Non-JSON tool output is silently skipped."""
        steps = [
            (_action("search_movies"), "this is not json"),
            (_action("discover_movies"), _movie_output(FIGHT_CLUB)),
        ]
        llm_content = "Fight Club is great."
        result = extract_movies(steps, llm_content)
        assert len(result) == 1
        assert result[0].id == 550

    def test_missing_results_key_skipped(self):
        """JSON without a 'results' key is skipped."""
        steps = [
            (_action("search_movies"), json.dumps({"data": [FIGHT_CLUB]})),
            (_action("discover_movies"), _movie_output(SE7EN)),
        ]
        llm_content = "Se7en is a thriller."
        result = extract_movies(steps, llm_content)
        assert len(result) == 1
        assert result[0].id == 807

    def test_error_envelope_skipped(self):
        """Tool output with an 'error' key is skipped."""
        steps = [
            (_action("search_movies"), json.dumps({"error": {"code": "NOT_FOUND", "message": "No results"}})),
            (_action("discover_movies"), _movie_output(FIGHT_CLUB)),
        ]
        llm_content = "Fight Club is a must-see."
        result = extract_movies(steps, llm_content)
        assert len(result) == 1
        assert result[0].id == 550

    def test_all_errored_outputs_returns_empty(self):
        """When every tool output is errored or malformed, return []."""
        steps = [
            (_action("search_movies"), "not json"),
            (_action("discover_movies"), json.dumps({"error": {"code": "ERR", "message": "fail"}})),
            (_action("get_trending"), json.dumps({"no_results_key": True})),
        ]
        llm_content = "Here are some movies for you."
        result = extract_movies(steps, llm_content)
        assert result == []


# ---------------------------------------------------------------------------
# Empty llm_content → returns []
# ---------------------------------------------------------------------------


class TestEmptyLlmContent:
    def test_empty_string_returns_empty(self):
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB)),
        ]
        result = extract_movies(steps, "")
        assert result == []

    def test_none_like_empty_returns_empty(self):
        """Falsy llm_content returns []."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB)),
        ]
        # Empty string is the canonical "empty" case
        result = extract_movies(steps, "")
        assert result == []


# ---------------------------------------------------------------------------
# Case-insensitive title matching
# ---------------------------------------------------------------------------


class TestCaseInsensitiveMatching:
    def test_lowercase_mention_matches_titlecase_movie(self):
        """LLM writes 'fight club' but tool returns 'Fight Club'."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB)),
        ]
        llm_content = "You should definitely watch fight club."
        result = extract_movies(steps, llm_content)
        assert len(result) == 1
        assert result[0].id == 550

    def test_uppercase_mention_matches(self):
        """LLM writes 'FIGHT CLUB' but tool returns 'Fight Club'."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB)),
        ]
        llm_content = "FIGHT CLUB is an amazing film."
        result = extract_movies(steps, llm_content)
        assert len(result) == 1
        assert result[0].id == 550

    def test_mixed_case_mention_matches(self):
        """LLM writes 'fIgHt ClUb' still matches."""
        steps = [
            (_action("search_movies"), _movie_output(FIGHT_CLUB)),
        ]
        llm_content = "fIgHt ClUb is a cult classic."
        result = extract_movies(steps, llm_content)
        assert len(result) == 1
        assert result[0].id == 550
