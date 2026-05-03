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
