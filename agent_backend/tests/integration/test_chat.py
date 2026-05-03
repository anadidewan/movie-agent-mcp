"""
Integration + property tests for POST /chat.

The integration test mocks:
- MCPClient.get_tools() → two fixed ToolDescriptors
- MCPClient.call_tool() → predetermined JSON string
- ChatGoogleGenerativeAI → returns a predetermined AIMessage with one tool
  call followed by a final text response

Property tests (Hypothesis):
- Property 2: Tool call trace completeness
- Property 9: Invalid request bodies produce 422
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import given, settings as h_settings
from hypothesis import strategies as st
from langchain_core.messages import AIMessage

from app.api import router
from app.schemas import ToolDescriptor


# ---------------------------------------------------------------------------
# Shared fixtures and helpers
# ---------------------------------------------------------------------------

SEARCH_MOVIES_DESCRIPTOR = ToolDescriptor(
    name="search_movies",
    description="Search for movies by title and optional release year.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "year": {"type": "integer"},
        },
        "required": ["query"],
    },
)

GET_TRENDING_DESCRIPTOR = ToolDescriptor(
    name="get_trending",
    description="Get currently trending movies.",
    input_schema={
        "type": "object",
        "properties": {
            "window": {"type": "string"},
        },
        "required": ["window"],
    },
)

MOCK_TOOL_OUTPUT = json.dumps({
    "results": [
        {"id": 550, "title": "Fight Club", "year": 1999, "rating": 8.4},
        {"id": 807, "title": "Se7en", "year": 1995, "rating": 8.3},
    ]
})

FINAL_RESPONSE_TEXT = "Fight Club is a must-watch — David Fincher at his most visceral."


def make_fake_action(tool_name: str, tool_input: dict) -> MagicMock:
    action = MagicMock()
    action.tool = tool_name
    action.tool_input = tool_input
    return action


def make_mock_executor(
    steps: list[tuple[str, dict, str]],
    final_output: str = FINAL_RESPONSE_TEXT,
) -> MagicMock:
    """Build a mock AgentExecutor with predetermined intermediate_steps."""
    intermediate_steps = [
        (make_fake_action(name, inp), raw_out)
        for name, inp, raw_out in steps
    ]
    mock_executor = MagicMock()
    mock_executor.ainvoke = AsyncMock(return_value={
        "output": final_output,
        "intermediate_steps": intermediate_steps,
    })
    mock_executor.tools = []
    return mock_executor


def make_app_with_executor(executor) -> FastAPI:
    """Create a minimal FastAPI app with a pre-built executor on state."""
    app = FastAPI()
    app.include_router(router)

    mock_settings = MagicMock()
    mock_settings.version = "0.1.0"
    mock_mcp = MagicMock()
    mock_mcp.ping = AsyncMock(return_value=True)

    app.state.executor = executor
    app.state.settings = mock_settings
    app.state.mcp_client = mock_mcp

    return app


# ---------------------------------------------------------------------------
# Integration test — Task 12.1
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_chat_returns_200_with_correct_shape():
    """
    Integration test: POST /chat with mocked LLM and MCP wrapper.

    Asserts:
    - HTTP 200
    - message.role == "assistant"
    - message.content matches the mocked final text
    - tool_calls has exactly one entry
    - tool_calls[0].output_summary is non-empty
    """
    steps = [("search_movies", {"query": "fight club"}, MOCK_TOOL_OUTPUT)]
    executor = make_mock_executor(steps, final_output=FINAL_RESPONSE_TEXT)
    app = make_app_with_executor(executor)

    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "Recommend a dark thriller"}]},
    )

    assert response.status_code == 200
    data = response.json()

    # Response shape
    assert "message" in data
    assert "tool_calls" in data

    # Message
    assert data["message"]["role"] == "assistant"
    assert data["message"]["content"] == FINAL_RESPONSE_TEXT

    # Tool calls
    assert len(data["tool_calls"]) == 1
    tc = data["tool_calls"][0]
    assert tc["tool"] == "search_movies"
    assert tc["input"] == {"query": "fight club"}
    assert isinstance(tc["output_summary"], str)
    assert len(tc["output_summary"]) > 0


@pytest.mark.asyncio
async def test_chat_tool_calls_captured_in_order():
    """Multiple tool calls are captured in invocation order."""
    steps = [
        ("get_trending", {"window": "week"}, json.dumps({"results": [{"title": "Dune"}]})),
        ("search_movies", {"query": "dune"}, MOCK_TOOL_OUTPUT),
    ]
    executor = make_mock_executor(steps)
    app = make_app_with_executor(executor)

    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "What's trending?"}]},
    )

    assert response.status_code == 200
    tool_calls = response.json()["tool_calls"]
    assert len(tool_calls) == 2
    assert tool_calls[0]["tool"] == "get_trending"
    assert tool_calls[1]["tool"] == "search_movies"


@pytest.mark.asyncio
async def test_chat_no_tool_calls_returns_empty_list():
    """When no tools are invoked, tool_calls is an empty list."""
    executor = make_mock_executor(steps=[], final_output="No tools needed.")
    app = make_app_with_executor(executor)

    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )

    assert response.status_code == 200
    assert response.json()["tool_calls"] == []


@pytest.mark.asyncio
async def test_chat_output_summary_is_human_readable():
    """output_summary should be a short human-readable string, not raw JSON."""
    steps = [("search_movies", {"query": "inception"}, MOCK_TOOL_OUTPUT)]
    executor = make_mock_executor(steps)
    app = make_app_with_executor(executor)

    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "Tell me about Inception"}]},
    )

    tc = response.json()["tool_calls"][0]
    summary = tc["output_summary"]

    # Should not be raw JSON
    assert not summary.startswith("{")
    assert not summary.startswith("[")
    # Should mention count or title
    assert "Fight Club" in summary or "2" in summary or "result" in summary.lower()


@pytest.mark.asyncio
async def test_chat_mcp_unavailable_returns_503():
    """MCPUnavailableError during run → HTTP 503."""
    from app.mcp_client import MCPUnavailableError

    mock_executor = MagicMock()
    mock_executor.ainvoke = AsyncMock(
        side_effect=MCPUnavailableError("http://mcp", Exception("refused"))
    )
    mock_executor.tools = []

    app = make_app_with_executor(mock_executor)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "What's trending?"}]},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "MCP_UNAVAILABLE"


@pytest.mark.asyncio
async def test_chat_llm_error_returns_502():
    """Unexpected LLM exception during run → HTTP 502."""
    mock_executor = MagicMock()
    mock_executor.ainvoke = AsyncMock(side_effect=RuntimeError("Gemini quota exceeded"))
    mock_executor.tools = []

    app = make_app_with_executor(mock_executor)
    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "Recommend something"}]},
    )

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "LLM_ERROR"


# ---------------------------------------------------------------------------
# Property test — Property 2: Tool call trace completeness (Task 12.2)
# ---------------------------------------------------------------------------

_tool_names = st.sampled_from([
    "search_movies", "get_movie_details", "get_trending",
    "discover_movies", "get_recommendations",
])
_tool_inputs = st.fixed_dictionaries({"query": st.text(min_size=1, max_size=20)})
_raw_outputs = st.just(MOCK_TOOL_OUTPUT)


@pytest.mark.asyncio
@given(
    steps=st.lists(
        st.tuples(_tool_names, _tool_inputs, _raw_outputs),
        min_size=0,
        max_size=5,
    )
)
@h_settings(max_examples=50)
async def test_property2_tool_call_trace_completeness(
    steps: list[tuple[str, dict, str]]
):
    """
    Property 2: Tool call trace completeness.

    For any sequence of tool invocations, the tool_calls array in the
    ChatResponse SHALL contain exactly one entry per invocation, in order,
    with the correct tool name and input values.
    """
    executor = make_mock_executor(steps)
    app = make_app_with_executor(executor)

    client = TestClient(app)
    response = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "Recommend a movie"}]},
    )

    assert response.status_code == 200
    tool_calls = response.json()["tool_calls"]

    assert len(tool_calls) == len(steps), (
        f"Expected {len(steps)} tool calls, got {len(tool_calls)}"
    )

    for i, ((expected_tool, expected_input, _), actual_tc) in enumerate(zip(steps, tool_calls)):
        assert actual_tc["tool"] == expected_tool, (
            f"Step {i}: expected tool {expected_tool!r}, got {actual_tc['tool']!r}"
        )
        assert actual_tc["input"] == expected_input, (
            f"Step {i}: expected input {expected_input!r}, got {actual_tc['input']!r}"
        )


# ---------------------------------------------------------------------------
# Property test — Property 9: Invalid request bodies produce 422 (Task 12.3)
# ---------------------------------------------------------------------------

_invalid_bodies = st.one_of(
    # Wrong role value
    st.just({"messages": [{"role": "system", "content": "hello"}]}),
    # Missing content
    st.just({"messages": [{"role": "user"}]}),
    # Non-array messages
    st.just({"messages": "not a list"}),
    # Extra forbidden field
    st.just({"messages": [{"role": "user", "content": "hi"}], "extra_field": "bad"}),
    # Empty object
    st.just({}),
    # messages is null
    st.just({"messages": None}),
)


@pytest.mark.asyncio
@given(body=_invalid_bodies)
@h_settings(max_examples=50)
async def test_property9_invalid_request_bodies_produce_422(body: dict):
    """
    Property 9: Invalid request bodies produce 422.

    For any request body that violates the ChatRequest schema,
    POST /chat SHALL return HTTP 422 with error.code == "VALIDATION_ERROR".
    """
    executor = make_mock_executor([])
    app = make_app_with_executor(executor)

    # Register the validation error handler (same as main.py)
    from fastapi import Request
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse
    from app.schemas import ErrorDetail, ErrorResponse

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                error=ErrorDetail(code="VALIDATION_ERROR", message=str(exc.errors()))
            ).model_dump(),
        )

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/chat", json=body)

    assert response.status_code == 422
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "VALIDATION_ERROR"
