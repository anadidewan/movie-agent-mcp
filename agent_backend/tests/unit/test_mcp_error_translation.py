"""
Unit + property tests for MCPClient error translation.

Covers:
- 400 / 404 / 500 responses with valid error envelopes → tool error string
- Connection errors → MCPUnavailableError
- Non-JSON response body → PARSE_ERROR string

Property tests (Hypothesis):
- Property 3: call_tool() never raises for any 4xx/5xx status code
- Property 4: error string always contains the code and message from the envelope
"""

from __future__ import annotations

import json
import pytest
import respx
import httpx
from hypothesis import given, settings as h_settings
from hypothesis import strategies as st

from app.mcp_client import MCPClient, MCPUnavailableError


BASE_URL = "http://mcp-test.local"


def make_error_body(code: str, message: str) -> bytes:
    return json.dumps({"error": {"code": code, "message": message}}).encode()


# ---------------------------------------------------------------------------
# Unit tests — specific examples
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@respx.mock
async def test_400_with_valid_envelope_returns_error_string():
    respx.post(f"{BASE_URL}/tools/search_movies").mock(
        return_value=httpx.Response(
            400, content=make_error_body("VALIDATION_ERROR", "query is missing or empty")
        )
    )
    client = MCPClient(BASE_URL)
    result = await client.call_tool("search_movies", {})
    await client.close()

    assert "VALIDATION_ERROR" in result
    assert "query is missing or empty" in result
    # Must be a string, not an exception
    assert isinstance(result, str)


@pytest.mark.asyncio
@respx.mock
async def test_404_returns_error_string():
    respx.post(f"{BASE_URL}/tools/get_movie_details").mock(
        return_value=httpx.Response(
            404, content=make_error_body("NOT_FOUND", "Movie does not exist on TMDB")
        )
    )
    client = MCPClient(BASE_URL)
    result = await client.call_tool("get_movie_details", {"movie_id": 999999})
    await client.close()

    assert "NOT_FOUND" in result
    assert isinstance(result, str)


@pytest.mark.asyncio
@respx.mock
async def test_500_returns_error_string():
    respx.post(f"{BASE_URL}/tools/get_trending").mock(
        return_value=httpx.Response(
            500, content=make_error_body("INTERNAL_ERROR", "Unexpected server error")
        )
    )
    client = MCPClient(BASE_URL)
    result = await client.call_tool("get_trending", {"window": "day"})
    await client.close()

    assert "INTERNAL_ERROR" in result
    assert isinstance(result, str)


@pytest.mark.asyncio
@respx.mock
async def test_non_json_body_returns_parse_error_string():
    respx.post(f"{BASE_URL}/tools/search_movies").mock(
        return_value=httpx.Response(502, content=b"<html>Bad Gateway</html>")
    )
    client = MCPClient(BASE_URL)
    result = await client.call_tool("search_movies", {"query": "inception"})
    await client.close()

    assert "PARSE_ERROR" in result
    assert isinstance(result, str)


@pytest.mark.asyncio
@respx.mock
async def test_connection_error_raises_mcp_unavailable():
    respx.post(f"{BASE_URL}/tools/search_movies").mock(
        side_effect=httpx.ConnectError("Connection refused")
    )
    client = MCPClient(BASE_URL)

    with pytest.raises(MCPUnavailableError) as exc_info:
        await client.call_tool("search_movies", {"query": "inception"})
    await client.close()

    assert BASE_URL in str(exc_info.value)


@pytest.mark.asyncio
@respx.mock
async def test_timeout_raises_mcp_unavailable():
    respx.post(f"{BASE_URL}/tools/search_movies").mock(
        side_effect=httpx.TimeoutException("Request timed out")
    )
    client = MCPClient(BASE_URL)

    with pytest.raises(MCPUnavailableError):
        await client.call_tool("search_movies", {"query": "inception"})
    await client.close()


@pytest.mark.asyncio
@respx.mock
async def test_200_returns_json_string():
    payload = {"results": [{"id": 550, "title": "Fight Club"}]}
    respx.post(f"{BASE_URL}/tools/search_movies").mock(
        return_value=httpx.Response(200, json=payload)
    )
    client = MCPClient(BASE_URL)
    result = await client.call_tool("search_movies", {"query": "fight club"})
    await client.close()

    parsed = json.loads(result)
    assert parsed["results"][0]["title"] == "Fight Club"


# ---------------------------------------------------------------------------
# Property tests (Hypothesis)
# ---------------------------------------------------------------------------

# Strategy: generate valid error envelopes with arbitrary code/message strings
error_envelope_strategy = st.fixed_dictionaries({
    "error": st.fixed_dictionaries({
        "code": st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd", "Pc"))),
        "message": st.text(min_size=1, max_size=200),
    })
})

# Strategy: generate HTTP error status codes (4xx and 5xx)
error_status_strategy = st.integers(min_value=400, max_value=599)


@pytest.mark.asyncio
@given(status_code=error_status_strategy, envelope=error_envelope_strategy)
@h_settings(max_examples=100)
async def test_property3_call_tool_never_raises_on_error_status(
    status_code: int, envelope: dict
):
    """
    Property 3: MCP error translation — no unhandled exceptions.

    For any HTTP status code in 4xx-5xx range with any error envelope,
    call_tool() SHALL return a non-empty string and SHALL NOT raise.
    """
    with respx.mock:
        respx.post(f"{BASE_URL}/tools/any_tool").mock(
            return_value=httpx.Response(
                status_code, content=json.dumps(envelope).encode()
            )
        )
        client = MCPClient(BASE_URL)
        # Must not raise
        result = await client.call_tool("any_tool", {})
        await client.close()

    assert isinstance(result, str)
    assert len(result) > 0


@pytest.mark.asyncio
@given(envelope=error_envelope_strategy)
@h_settings(max_examples=100)
async def test_property4_error_string_contains_code_and_message(envelope: dict):
    """
    Property 4: MCP error strings contain structured information.

    For any valid error envelope { "error": { "code": C, "message": M } },
    the returned string SHALL contain both C and M.
    """
    code = envelope["error"]["code"]
    message = envelope["error"]["message"]

    with respx.mock:
        respx.post(f"{BASE_URL}/tools/any_tool").mock(
            return_value=httpx.Response(
                400, content=json.dumps(envelope).encode()
            )
        )
        client = MCPClient(BASE_URL)
        result = await client.call_tool("any_tool", {})
        await client.close()

    assert code in result
    assert message in result
