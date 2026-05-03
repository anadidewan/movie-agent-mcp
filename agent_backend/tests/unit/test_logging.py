"""
Property test for structured log record shape.

Property 7: Structured log record shape.

For any handled HTTP request, the structlog output SHALL contain exactly
one JSON record with the fields: request_id, endpoint, method, status,
latency_ms, tool_calls_made.

The request_id SHALL be a non-empty string unique across requests.
"""

from __future__ import annotations

import io
import json
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest
import structlog
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import given, settings as h_settings
from hypothesis import strategies as st

from app.api import router
from app.logging import configure_logging
from app.middleware import RequestLoggingMiddleware


# ---------------------------------------------------------------------------
# Test app factory with log capture
# ---------------------------------------------------------------------------


def make_logged_app() -> tuple[FastAPI, list[dict]]:
    """
    Create a minimal app with RequestLoggingMiddleware.
    Returns (app, captured_records) where captured_records is populated
    after each request.
    """
    captured: list[dict] = []

    # Redirect structlog output to a list
    class CapturingProcessor:
        def __call__(self, logger, method, event_dict):
            captured.append(dict(event_dict))
            raise structlog.DropEvent()  # prevent actual output

    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            CapturingProcessor(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=False,
    )

    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)
    app.include_router(router)

    mock_executor = MagicMock()
    mock_executor.tools = []
    mock_settings = MagicMock()
    mock_settings.version = "0.1.0"
    mock_mcp = MagicMock()
    mock_mcp.ping = AsyncMock(return_value=True)

    app.state.executor = mock_executor
    app.state.settings = mock_settings
    app.state.mcp_client = mock_mcp

    return app, captured


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def test_request_log_contains_required_fields():
    app, captured = make_logged_app()
    client = TestClient(app)

    from app.api import _health_cache
    _health_cache.invalidate()

    client.get("/health")

    # Find the "request" log record
    request_records = [r for r in captured if r.get("event") == "request"]
    assert len(request_records) >= 1

    record = request_records[0]
    assert "request_id" in record
    assert "endpoint" in record
    assert "status" in record
    assert "latency_ms" in record
    assert "tool_calls_made" in record


def test_request_id_is_non_empty_string():
    app, captured = make_logged_app()
    client = TestClient(app)

    from app.api import _health_cache
    _health_cache.invalidate()

    client.get("/health")

    request_records = [r for r in captured if r.get("event") == "request"]
    assert len(request_records) >= 1
    request_id = request_records[0]["request_id"]
    assert isinstance(request_id, str)
    assert len(request_id) > 0


def test_request_id_in_response_header():
    """Request-ID should be propagated in the X-Request-ID response header."""
    app, _ = make_logged_app()
    client = TestClient(app)

    from app.api import _health_cache
    _health_cache.invalidate()

    response = client.get("/health")
    assert "x-request-id" in response.headers
    assert len(response.headers["x-request-id"]) > 0


def test_endpoint_field_matches_path():
    app, captured = make_logged_app()
    client = TestClient(app)

    client.get("/tools")

    request_records = [r for r in captured if r.get("event") == "request"]
    assert any(r["endpoint"] == "/tools" for r in request_records)


# ---------------------------------------------------------------------------
# Property test (Hypothesis) — Property 7
# ---------------------------------------------------------------------------


@given(n_requests=st.integers(min_value=1, max_value=10))
@h_settings(max_examples=30)
def test_property7_each_request_produces_one_log_record_with_unique_request_id(
    n_requests: int,
):
    """
    Property 7: Structured log record shape.

    For any N handled HTTP requests, each SHALL produce exactly one
    'request' log record with all required fields, and all request_ids
    SHALL be unique.
    """
    app, captured = make_logged_app()
    client = TestClient(app)

    from app.api import _health_cache
    _health_cache.invalidate()

    captured.clear()

    for _ in range(n_requests):
        client.get("/tools")

    request_records = [r for r in captured if r.get("event") == "request"]

    # One record per request
    assert len(request_records) == n_requests

    # All required fields present in every record
    required_fields = {"request_id", "endpoint", "status", "latency_ms", "tool_calls_made"}
    for record in request_records:
        for field in required_fields:
            assert field in record, f"Missing field '{field}' in record: {record}"

    # All request_ids are unique
    request_ids = [r["request_id"] for r in request_records]
    assert len(set(request_ids)) == len(request_ids), "Duplicate request_ids found"
