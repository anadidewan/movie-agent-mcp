"""
Property test for SSE/non-SSE tool call trace equivalence.

Property 10: SSE streaming tool call trace completeness.

For any sequence of tool invocations during a streaming agent run,
the final tool_calls SSE event SHALL contain exactly the same tool call
entries (name, input) as would appear in the non-streaming ChatResponse
for the same run.

We test this by mocking the AgentExecutor to return a predetermined
sequence of intermediate_steps, then comparing the tool_calls produced
by run() vs those emitted in the SSE stream by astream_run().
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from hypothesis import given, settings as h_settings
from hypothesis import strategies as st

from app.agent_runner import astream_run, run
from app.schemas import Message, MessageRole


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_messages() -> list[Message]:
    return [Message(role=MessageRole.user, content="Recommend a movie")]


def make_fake_action(tool_name: str, tool_input: dict) -> MagicMock:
    action = MagicMock()
    action.tool = tool_name
    action.tool_input = tool_input
    return action


def make_mock_executor(steps: list[tuple[str, dict, str]], final_output: str = "Here is my recommendation.") -> MagicMock:
    """
    Build a mock AgentExecutor that returns predetermined intermediate_steps.

    steps: list of (tool_name, tool_input_dict, raw_output_str)
    """
    intermediate_steps = [
        (make_fake_action(name, inp), raw_out)
        for name, inp, raw_out in steps
    ]

    # Mock ainvoke for non-streaming run()
    mock_executor = MagicMock()
    mock_executor.ainvoke = AsyncMock(return_value={
        "output": final_output,
        "intermediate_steps": intermediate_steps,
    })

    # Mock astream_events for streaming astream_run()
    async def fake_astream_events(inputs, version="v1"):
        # Emit tool_end events for each step
        for name, inp, raw_out in steps:
            yield {
                "event": "on_tool_end",
                "name": name,
                "data": {"input": inp, "output": raw_out},
            }
        # Emit a final token event with the output
        yield {
            "event": "on_chat_model_stream",
            "data": {"chunk": MagicMock(content=final_output)},
        }

    mock_executor.astream_events = fake_astream_events
    mock_executor.tools = []
    return mock_executor


async def collect_sse_tool_calls(executor, messages) -> list[dict]:
    """Collect the tool_calls from the SSE stream."""
    tool_calls = []
    async for chunk in astream_run(executor, messages):
        if chunk.startswith("data: "):
            payload = json.loads(chunk[6:].strip())
            if payload.get("type") == "tool_calls":
                tool_calls = payload["tool_calls"]
    return tool_calls


# ---------------------------------------------------------------------------
# Unit test — basic SSE stream structure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sse_stream_emits_token_events():
    steps = [("search_movies", {"query": "inception"}, '{"results": [{"title": "Inception"}]}')]
    executor = make_mock_executor(steps, final_output="Inception is great!")
    messages = make_messages()

    events = []
    async for chunk in astream_run(executor, messages):
        if chunk.startswith("data: "):
            events.append(json.loads(chunk[6:].strip()))

    types = [e["type"] for e in events]
    assert "token" in types
    assert "tool_calls" in types
    assert "done" in types


@pytest.mark.asyncio
async def test_sse_stream_done_is_last_event():
    executor = make_mock_executor([], final_output="No tools needed.")
    messages = make_messages()

    events = []
    async for chunk in astream_run(executor, messages):
        if chunk.startswith("data: "):
            events.append(json.loads(chunk[6:].strip()))

    assert events[-1]["type"] == "done"


@pytest.mark.asyncio
async def test_sse_stream_tool_calls_contains_correct_tool_name():
    steps = [("get_trending", {"window": "week"}, '{"results": [{"title": "Dune"}]}')]
    executor = make_mock_executor(steps)
    messages = make_messages()

    tool_calls = await collect_sse_tool_calls(executor, messages)
    assert len(tool_calls) == 1
    assert tool_calls[0]["tool"] == "get_trending"


# ---------------------------------------------------------------------------
# Property test (Hypothesis) — Property 10
# ---------------------------------------------------------------------------

_tool_name_strategy = st.sampled_from([
    "search_movies", "get_movie_details", "get_trending",
    "discover_movies", "get_recommendations", "get_movie_id", "get_genre_id",
])

_tool_input_strategy = st.fixed_dictionaries({
    "query": st.text(min_size=1, max_size=20),
})

_raw_output_strategy = st.one_of(
    st.just('{"results": [{"title": "Fight Club"}, {"title": "Se7en"}]}'),
    st.just('{"movie_id": 550}'),
    st.just('{"error": {"code": "NOT_FOUND", "message": "Not found"}}'),
)


@pytest.mark.asyncio
@given(
    steps=st.lists(
        st.tuples(_tool_name_strategy, _tool_input_strategy, _raw_output_strategy),
        min_size=0,
        max_size=5,
    )
)
@h_settings(max_examples=50)
async def test_property10_sse_and_non_sse_tool_calls_are_equivalent(
    steps: list[tuple[str, dict, str]]
):
    """
    Property 10: SSE streaming tool call trace completeness.

    For any sequence of tool invocations, the tool_calls in the SSE stream
    SHALL contain exactly the same tool names and inputs as the tool_calls
    in the non-streaming ChatResponse.
    """
    messages = make_messages()
    executor = make_mock_executor(steps)

    # Non-streaming path
    non_streaming_response = await run(executor, messages)
    non_streaming_calls = [
        (tc.tool, tc.input) for tc in non_streaming_response.tool_calls
    ]

    # Streaming path — reset mock
    executor2 = make_mock_executor(steps)
    streaming_calls_raw = await collect_sse_tool_calls(executor2, messages)
    streaming_calls = [
        (tc["tool"], tc["input"]) for tc in streaming_calls_raw
    ]

    # Both paths must produce the same tool names and inputs
    assert len(non_streaming_calls) == len(streaming_calls), (
        f"Non-streaming had {len(non_streaming_calls)} calls, "
        f"streaming had {len(streaming_calls)} calls"
    )

    for (ns_tool, ns_input), (s_tool, s_input) in zip(non_streaming_calls, streaming_calls):
        assert ns_tool == s_tool, f"Tool name mismatch: {ns_tool!r} vs {s_tool!r}"
        assert ns_input == s_input, f"Tool input mismatch: {ns_input!r} vs {s_input!r}"


# ---------------------------------------------------------------------------
# Helpers for SSE event collection
# ---------------------------------------------------------------------------


async def collect_all_sse_events(executor, messages) -> list[dict]:
    """Collect all parsed SSE events from the stream."""
    events = []
    async for chunk in astream_run(executor, messages):
        if chunk.startswith("data: "):
            events.append(json.loads(chunk[6:].strip()))
    return events


# ---------------------------------------------------------------------------
# Integration tests — Task 6.2: SSE movies event
# ---------------------------------------------------------------------------

MULTI_MOVIE_OUTPUT = json.dumps({
    "results": [
        {"id": 550, "title": "Fight Club", "year": 1999, "poster_url": "https://image.tmdb.org/t/p/w500/fc.jpg", "rating": 8.4},
        {"id": 807, "title": "Se7en", "year": 1995, "poster_url": "https://image.tmdb.org/t/p/w500/s7.jpg", "rating": 8.3},
        {"id": 13, "title": "Forrest Gump", "year": 1994, "rating": 8.8},
    ]
})

SSE_FINAL_OUTPUT_WITH_MOVIES = (
    "I'd recommend Fight Club and Se7en — both are dark, gripping thrillers."
)


@pytest.mark.asyncio
async def test_sse_movies_event_emitted_with_correct_order():
    """
    SSE movies event is emitted after the last token event and before
    the tool_calls event when movies are present.

    Validates: Requirements 10.4
    """
    steps = [
        ("search_movies", {"query": "dark thrillers"}, MULTI_MOVIE_OUTPUT),
    ]
    executor = make_mock_executor(steps, final_output=SSE_FINAL_OUTPUT_WITH_MOVIES)
    messages = make_messages()

    events = await collect_all_sse_events(executor, messages)
    event_types = [e["type"] for e in events]

    # movies event must be present
    assert "movies" in event_types, (
        f"Expected 'movies' event in stream, got types: {event_types}"
    )

    # Verify ordering: token(s) → movies → tool_calls → done
    last_token_idx = max(i for i, t in enumerate(event_types) if t == "token")
    movies_idx = event_types.index("movies")
    tool_calls_idx = event_types.index("tool_calls")
    done_idx = event_types.index("done")

    assert last_token_idx < movies_idx, (
        f"movies event (idx={movies_idx}) should come after last token (idx={last_token_idx})"
    )
    assert movies_idx < tool_calls_idx, (
        f"movies event (idx={movies_idx}) should come before tool_calls (idx={tool_calls_idx})"
    )
    assert tool_calls_idx < done_idx, (
        f"tool_calls (idx={tool_calls_idx}) should come before done (idx={done_idx})"
    )


@pytest.mark.asyncio
async def test_sse_movies_event_payload_contains_correct_data():
    """
    The movies SSE event payload contains correct movie data matching
    only movies mentioned in the LLM output.

    Validates: Requirements 10.4
    """
    steps = [
        ("search_movies", {"query": "dark thrillers"}, MULTI_MOVIE_OUTPUT),
    ]
    executor = make_mock_executor(steps, final_output=SSE_FINAL_OUTPUT_WITH_MOVIES)
    messages = make_messages()

    events = await collect_all_sse_events(executor, messages)
    movies_events = [e for e in events if e["type"] == "movies"]

    # Exactly one movies event
    assert len(movies_events) == 1
    movies_payload = movies_events[0]

    assert "movies" in movies_payload
    movies = movies_payload["movies"]
    assert isinstance(movies, list)
    assert len(movies) > 0

    # Each movie has required fields
    for movie in movies:
        assert "id" in movie
        assert "title" in movie
        assert isinstance(movie["id"], int)
        assert isinstance(movie["title"], str)

    # Only movies mentioned in the output are included
    movie_titles = {m["title"] for m in movies}
    assert "Fight Club" in movie_titles
    assert "Se7en" in movie_titles
    # Forrest Gump is NOT mentioned in SSE_FINAL_OUTPUT_WITH_MOVIES
    assert "Forrest Gump" not in movie_titles

    # Verify specific movie data
    fight_club = next(m for m in movies if m["title"] == "Fight Club")
    assert fight_club["id"] == 550
    assert fight_club["year"] == 1999
    assert fight_club["rating"] == 8.4
    assert fight_club["poster_url"] == "https://image.tmdb.org/t/p/w500/fc.jpg"


@pytest.mark.asyncio
async def test_sse_no_movies_event_when_no_movies_present():
    """
    When no movies are extracted (none mentioned in LLM output),
    no movies SSE event is emitted.

    Validates: Requirements 10.4
    """
    steps = [
        ("search_movies", {"query": "comedies"}, MULTI_MOVIE_OUTPUT),
    ]
    # LLM output does not mention any movie titles from the tool results
    executor = make_mock_executor(
        steps,
        final_output="I couldn't find anything matching your request. Try a different query.",
    )
    messages = make_messages()

    events = await collect_all_sse_events(executor, messages)
    event_types = [e["type"] for e in events]

    assert "movies" not in event_types, (
        f"Expected no 'movies' event when no movies are mentioned, got types: {event_types}"
    )
    # Other events should still be present
    assert "token" in event_types
    assert "tool_calls" in event_types
    assert "done" in event_types


@pytest.mark.asyncio
async def test_sse_no_movies_event_when_no_movie_tools_invoked():
    """
    When no movie-returning tools are invoked, no movies event is emitted.

    Validates: Requirements 10.4
    """
    steps = [
        ("get_movie_details", {"movie_id": 550}, '{"title": "Fight Club", "year": 1999}'),
    ]
    executor = make_mock_executor(
        steps,
        final_output="Fight Club (1999) is a great movie directed by David Fincher.",
    )
    messages = make_messages()

    events = await collect_all_sse_events(executor, messages)
    event_types = [e["type"] for e in events]

    assert "movies" not in event_types, (
        f"Expected no 'movies' event when no movie-returning tools invoked, got types: {event_types}"
    )


@pytest.mark.asyncio
async def test_sse_movies_event_with_multiple_tool_calls():
    """
    Movies from multiple movie-returning tool calls are combined,
    deduplicated, and emitted in a single movies event.

    Validates: Requirements 10.4
    """
    search_output = json.dumps({
        "results": [
            {"id": 550, "title": "Fight Club", "year": 1999, "rating": 8.4},
        ]
    })
    trending_output = json.dumps({
        "results": [
            {"id": 550, "title": "Fight Club", "year": 1999, "rating": 8.4},
            {"id": 438631, "title": "Dune", "year": 2021, "rating": 7.9},
        ]
    })
    steps = [
        ("search_movies", {"query": "fight club"}, search_output),
        ("get_trending", {"window": "week"}, trending_output),
    ]
    executor = make_mock_executor(
        steps,
        final_output="Fight Club and Dune are both excellent films worth watching.",
    )
    messages = make_messages()

    events = await collect_all_sse_events(executor, messages)
    movies_events = [e for e in events if e["type"] == "movies"]

    assert len(movies_events) == 1
    movies = movies_events[0]["movies"]

    # Both movies mentioned, deduplicated by id
    movie_ids = [m["id"] for m in movies]
    assert 550 in movie_ids
    assert 438631 in movie_ids
    # No duplicate ids
    assert len(movie_ids) == len(set(movie_ids))
