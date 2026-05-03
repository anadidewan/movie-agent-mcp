"""
Unit + property tests for GET /health endpoint and HealthCache.

Covers:
- Returns HTTP 200 with status/version/mcp_status fields
- mcp_status is "ok" when MCP is reachable
- mcp_status is "unreachable" when MCP is not reachable
- Still returns HTTP 200 when MCP is unreachable

Property tests (Hypothesis):
- Property 8: Health cache — at most one MCP call per TTL window
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import given, settings as h_settings
from hypothesis import strategies as st

from app.api import HealthCache, router
from app.mcp_client import MCPUnavailableError


# ---------------------------------------------------------------------------
# Test app factory (reused from test_tools_endpoint pattern)
# ---------------------------------------------------------------------------


def make_app(ping_result=True, ping_raises=False) -> tuple[FastAPI, MagicMock]:
    """Create a minimal FastAPI app with mocked MCP client."""
    app = FastAPI()
    app.include_router(router)

    mock_executor = MagicMock()
    mock_executor.tools = []

    mock_settings = MagicMock()
    mock_settings.version = "1.2.3"

    mock_mcp = MagicMock()
    if ping_raises:
        mock_mcp.ping = AsyncMock(side_effect=MCPUnavailableError("http://mcp", Exception("refused")))
    else:
        mock_mcp.ping = AsyncMock(return_value=ping_result)

    app.state.executor = mock_executor
    app.state.settings = mock_settings
    app.state.mcp_client = mock_mcp

    return app, mock_mcp


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def test_health_returns_200():
    app, _ = make_app()
    # Reset cache between tests
    from app.api import _health_cache
    _health_cache.invalidate()

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200


def test_health_response_has_required_fields():
    app, _ = make_app()
    from app.api import _health_cache
    _health_cache.invalidate()

    client = TestClient(app)
    data = client.get("/health").json()

    assert "status" in data
    assert "version" in data
    assert "mcp_status" in data


def test_health_status_is_ok():
    app, _ = make_app()
    from app.api import _health_cache
    _health_cache.invalidate()

    client = TestClient(app)
    data = client.get("/health").json()
    assert data["status"] == "ok"


def test_health_version_matches_settings():
    app, _ = make_app()
    from app.api import _health_cache
    _health_cache.invalidate()

    client = TestClient(app)
    data = client.get("/health").json()
    assert data["version"] == "1.2.3"


def test_health_mcp_status_ok_when_reachable():
    app, _ = make_app(ping_result=True)
    from app.api import _health_cache
    _health_cache.invalidate()

    client = TestClient(app)
    data = client.get("/health").json()
    assert data["mcp_status"] == "ok"


def test_health_mcp_status_unreachable_when_ping_fails():
    app, _ = make_app(ping_result=False)
    from app.api import _health_cache
    _health_cache.invalidate()

    client = TestClient(app)
    data = client.get("/health").json()
    assert data["mcp_status"] == "unreachable"


def test_health_mcp_status_unreachable_when_connection_error():
    app, _ = make_app(ping_raises=True)
    from app.api import _health_cache
    _health_cache.invalidate()

    client = TestClient(app)
    response = client.get("/health")
    # Must still return 200 even when MCP is unreachable
    assert response.status_code == 200
    assert response.json()["mcp_status"] == "unreachable"


# ---------------------------------------------------------------------------
# HealthCache unit tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_cache_calls_ping_on_first_request():
    mock_mcp = MagicMock()
    mock_mcp.ping = AsyncMock(return_value=True)

    cache = HealthCache(ttl_seconds=60)
    status = await cache.get_mcp_status(mock_mcp)

    assert status == "ok"
    mock_mcp.ping.assert_called_once()


@pytest.mark.asyncio
async def test_health_cache_does_not_call_ping_within_ttl():
    mock_mcp = MagicMock()
    mock_mcp.ping = AsyncMock(return_value=True)

    cache = HealthCache(ttl_seconds=60)
    await cache.get_mcp_status(mock_mcp)
    await cache.get_mcp_status(mock_mcp)
    await cache.get_mcp_status(mock_mcp)

    # ping should only be called once despite 3 requests
    mock_mcp.ping.assert_called_once()


@pytest.mark.asyncio
async def test_health_cache_refreshes_after_ttl():
    mock_mcp = MagicMock()
    mock_mcp.ping = AsyncMock(return_value=True)

    cache = HealthCache(ttl_seconds=0)  # TTL=0 means always expired
    await cache.get_mcp_status(mock_mcp)
    await cache.get_mcp_status(mock_mcp)

    # With TTL=0, each call should refresh
    assert mock_mcp.ping.call_count == 2


@pytest.mark.asyncio
async def test_health_cache_invalidate_forces_refresh():
    mock_mcp = MagicMock()
    mock_mcp.ping = AsyncMock(return_value=True)

    cache = HealthCache(ttl_seconds=60)
    await cache.get_mcp_status(mock_mcp)
    cache.invalidate()
    await cache.get_mcp_status(mock_mcp)

    assert mock_mcp.ping.call_count == 2


# ---------------------------------------------------------------------------
# Property test (Hypothesis)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@given(n_calls=st.integers(min_value=2, max_value=20))
@h_settings(max_examples=50)
async def test_property8_health_cache_at_most_one_ping_per_ttl(n_calls: int):
    """
    Property 8: Health cache — at most one MCP call per TTL window.

    For any N sequential calls to get_mcp_status within a single TTL window,
    MCPClient.ping() SHALL be called at most once.
    """
    mock_mcp = MagicMock()
    mock_mcp.ping = AsyncMock(return_value=True)

    cache = HealthCache(ttl_seconds=3600)  # Very long TTL — all calls hit cache

    for _ in range(n_calls):
        await cache.get_mcp_status(mock_mcp)

    # Regardless of N, ping should only be called once
    assert mock_mcp.ping.call_count == 1
