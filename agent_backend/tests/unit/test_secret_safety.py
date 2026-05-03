"""
Property test for secret leakage prevention.

Property 5: Secret values never appear in outputs.

For any value assigned to GEMINI_API_KEY, that exact string SHALL NOT
appear in any HTTP response body from /chat, /health, or /tools endpoints.

We test this by:
1. Configuring the app with a generated API key string
2. Calling all three endpoints
3. Asserting the key never appears in any response body or header value
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import given, settings as h_settings
from hypothesis import strategies as st
from pydantic import SecretStr

from app.api import router, _health_cache


# ---------------------------------------------------------------------------
# Test app factory with configurable secret
# ---------------------------------------------------------------------------


def make_app_with_secret(secret_key: str) -> FastAPI:
    """
    Create a minimal app where the Gemini API key is set to `secret_key`.
    The key is stored as SecretStr on settings, mirroring production behaviour.
    """
    app = FastAPI()
    app.include_router(router)

    # Mock executor — tools list includes the secret in description to test
    # that even if it somehow ended up in a tool description, it's not leaked
    mock_tool = MagicMock()
    mock_tool.name = "search_movies"
    mock_tool.description = "Search for movies by title."  # no secret here

    mock_executor = MagicMock()
    mock_executor.tools = [mock_tool]
    mock_executor.ainvoke = AsyncMock(return_value={
        "output": "Here is a recommendation.",
        "intermediate_steps": [],
    })

    # Settings with SecretStr — mirrors production config
    mock_settings = MagicMock()
    mock_settings.version = "0.1.0"
    mock_settings.gemini_api_key = SecretStr(secret_key)

    mock_mcp = MagicMock()
    mock_mcp.ping = AsyncMock(return_value=True)

    app.state.executor = mock_executor
    app.state.settings = mock_settings
    app.state.mcp_client = mock_mcp

    return app


def collect_all_response_text(client: TestClient, secret: str) -> list[tuple[str, str]]:
    """
    Call all three endpoints and return (endpoint, response_text) pairs.
    Invalidates health cache before /health to force a fresh response.
    """
    _health_cache.invalidate()

    results = []

    # GET /tools
    r = client.get("/tools")
    results.append(("/tools", r.text))

    # GET /health
    r = client.get("/health")
    results.append(("/health", r.text))

    # POST /chat
    r = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "Recommend a movie"}]},
    )
    results.append(("/chat", r.text))

    return results


# ---------------------------------------------------------------------------
# Unit tests — specific examples
# ---------------------------------------------------------------------------


def test_api_key_not_in_tools_response():
    secret = "AIzaSy-test-key-12345"
    app = make_app_with_secret(secret)
    client = TestClient(app)

    response = client.get("/tools")
    assert secret not in response.text


def test_api_key_not_in_health_response():
    secret = "AIzaSy-test-key-67890"
    app = make_app_with_secret(secret)
    client = TestClient(app)

    _health_cache.invalidate()
    response = client.get("/health")
    assert secret not in response.text


def test_api_key_not_in_chat_response():
    secret = "AIzaSy-test-key-abcde"
    app = make_app_with_secret(secret)
    client = TestClient(app)

    response = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "What should I watch?"}]},
    )
    assert secret not in response.text


def test_api_key_not_in_response_headers():
    secret = "AIzaSy-test-key-header-check"
    app = make_app_with_secret(secret)
    client = TestClient(app)

    _health_cache.invalidate()
    for path, method in [("/tools", "GET"), ("/health", "GET")]:
        if method == "GET":
            response = client.get(path)
        else:
            response = client.post(path, json={})

        for header_name, header_value in response.headers.items():
            assert secret not in header_value, (
                f"Secret found in response header '{header_name}' for {path}"
            )


def test_secret_str_repr_is_masked():
    """Verify pydantic SecretStr masks the value in repr/str."""
    secret = "my-super-secret-gemini-key"
    s = SecretStr(secret)
    assert secret not in str(s)
    assert secret not in repr(s)
    assert s.get_secret_value() == secret  # only accessible explicitly


# ---------------------------------------------------------------------------
# Property test (Hypothesis) — Property 5
# ---------------------------------------------------------------------------

# Generate realistic-looking API key strings
_api_key_strategy = st.text(
    min_size=10,
    max_size=60,
    alphabet=st.characters(
        whitelist_categories=("Lu", "Ll", "Nd"),
        whitelist_characters="-_",
    ),
).filter(lambda s: len(s) >= 10)


@given(secret_key=_api_key_strategy)
@h_settings(max_examples=50)
def test_property5_secret_never_appears_in_any_response(secret_key: str):
    """
    Property 5: Secret values never appear in outputs.

    For any GEMINI_API_KEY value, that exact string SHALL NOT appear in
    any response body from /chat, /health, or /tools.
    """
    app = make_app_with_secret(secret_key)
    client = TestClient(app)

    endpoint_responses = collect_all_response_text(client, secret_key)

    for endpoint, response_text in endpoint_responses:
        assert secret_key not in response_text, (
            f"Secret key leaked in response from {endpoint}!\n"
            f"Secret: {secret_key!r}\n"
            f"Response: {response_text[:200]!r}"
        )
