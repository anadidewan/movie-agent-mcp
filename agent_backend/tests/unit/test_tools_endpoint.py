"""
Unit + property tests for GET /tools endpoint.

Covers:
- Returns HTTP 200
- Response shape matches ToolsResponse
- Each entry has non-empty name and description
- No secret values appear in the response

Property tests (Hypothesis):
- Property 6: GET /tools response completeness
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import given, settings as h_settings
from hypothesis import strategies as st
from langchain.tools import StructuredTool
from pydantic import BaseModel

from app.api import router
from app.schemas import ToolDescriptor


# ---------------------------------------------------------------------------
# Test app factory
# ---------------------------------------------------------------------------


def make_app(tools: list) -> FastAPI:
    """Create a minimal FastAPI app with the router and mocked state."""
    app = FastAPI()
    app.include_router(router)

    # Mock executor with a .tools list
    mock_executor = MagicMock()
    mock_executor.tools = tools

    # Mock settings
    mock_settings = MagicMock()
    mock_settings.version = "0.1.0"
    mock_settings.gemini_api_key = MagicMock()
    mock_settings.gemini_api_key.get_secret_value.return_value = "sk-test-key-should-not-appear"

    # Mock MCP client
    mock_mcp = MagicMock()
    mock_mcp.ping = AsyncMock(return_value=True)

    app.state.executor = mock_executor
    app.state.settings = mock_settings
    app.state.mcp_client = mock_mcp

    return app


def make_mock_tool(name: str, description: str) -> MagicMock:
    """Create a mock LangChain tool with name and description."""
    tool = MagicMock()
    tool.name = name
    tool.description = description
    return tool


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def test_get_tools_returns_200():
    tools = [make_mock_tool("search_movies", "Search for movies")]
    client = TestClient(make_app(tools))
    response = client.get("/tools")
    assert response.status_code == 200


def test_get_tools_response_shape():
    tools = [
        make_mock_tool("search_movies", "Search for movies by title"),
        make_mock_tool("get_trending", "Get trending movies"),
    ]
    client = TestClient(make_app(tools))
    response = client.get("/tools")
    data = response.json()

    assert "tools" in data
    assert isinstance(data["tools"], list)
    assert len(data["tools"]) == 2


def test_get_tools_each_entry_has_name_and_description():
    tools = [
        make_mock_tool("search_movies", "Search for movies by title"),
        make_mock_tool("get_trending", "Get trending movies"),
    ]
    client = TestClient(make_app(tools))
    response = client.get("/tools")
    data = response.json()

    for entry in data["tools"]:
        assert "name" in entry
        assert "description" in entry
        assert len(entry["name"]) > 0
        assert len(entry["description"]) > 0


def test_get_tools_names_match_registered_tools():
    tools = [
        make_mock_tool("search_movies", "Search for movies"),
        make_mock_tool("get_movie_details", "Get movie details"),
    ]
    client = TestClient(make_app(tools))
    response = client.get("/tools")
    data = response.json()

    names = [t["name"] for t in data["tools"]]
    assert "search_movies" in names
    assert "get_movie_details" in names


def test_get_tools_no_secret_in_response():
    """API key must never appear in the /tools response."""
    secret_key = "sk-test-key-should-not-appear"
    tools = [make_mock_tool("search_movies", "Search for movies")]
    client = TestClient(make_app(tools))
    response = client.get("/tools")

    response_text = response.text
    assert secret_key not in response_text


def test_get_tools_empty_list():
    client = TestClient(make_app([]))
    response = client.get("/tools")
    assert response.status_code == 200
    assert response.json() == {"tools": []}


# ---------------------------------------------------------------------------
# Property tests (Hypothesis)
# ---------------------------------------------------------------------------

_tool_name_strategy = st.text(
    min_size=1, max_size=30,
    alphabet=st.characters(whitelist_categories=("Ll",), whitelist_characters="_")
).filter(lambda s: s.isidentifier())

_tool_desc_strategy = st.text(min_size=1, max_size=100)


@given(
    tool_specs=st.lists(
        st.tuples(_tool_name_strategy, _tool_desc_strategy),
        min_size=1,
        max_size=20,
        unique_by=lambda x: x[0],  # unique names
    )
)
@h_settings(max_examples=100)
def test_property6_tools_response_completeness(tool_specs: list[tuple[str, str]]):
    """
    Property 6: GET /tools response completeness.

    For any set of N tools registered at startup, GET /tools SHALL return
    exactly N entries with matching names and descriptions.
    No secret values SHALL appear in the response.
    """
    secret = "super-secret-gemini-key-xyz"
    tools = [make_mock_tool(name, desc) for name, desc in tool_specs]

    app = make_app(tools)
    # Override the secret in settings
    app.state.settings.gemini_api_key.get_secret_value.return_value = secret

    client = TestClient(app)
    response = client.get("/tools")

    assert response.status_code == 200
    data = response.json()

    # Exactly N entries
    assert len(data["tools"]) == len(tool_specs)

    # Names and descriptions match
    returned = {t["name"]: t["description"] for t in data["tools"]}
    for name, desc in tool_specs:
        assert name in returned
        assert returned[name] == desc

    # No secret in response
    assert secret not in response.text
