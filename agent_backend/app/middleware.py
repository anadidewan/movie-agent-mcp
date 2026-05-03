"""
app/middleware.py — Request-ID injection and structured request logging.

RequestLoggingMiddleware:
- Assigns a unique UUID request_id to every incoming request
- Stores it on request.state.request_id for use in route handlers
- Emits one structured JSON log record per request with:
    request_id, endpoint, method, status, latency_ms
- Never logs GEMINI_API_KEY or any secret value
"""

from __future__ import annotations

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that:
    1. Generates a unique request_id per request
    2. Stores it on request.state for downstream handlers
    3. Emits a single structured log record after the response is sent
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.monotonic()
        response = await call_next(request)
        latency_ms = round((time.monotonic() - start) * 1000, 2)

        # Count tool calls if the route handler stored them on state
        tool_calls_made = getattr(request.state, "tool_calls_made", 0)

        logger.info(
            "request",
            request_id=request_id,
            endpoint=request.url.path,
            method=request.method,
            status=response.status_code,
            latency_ms=latency_ms,
            tool_calls_made=tool_calls_made,
        )

        # Propagate request_id in response header for client-side correlation
        response.headers["X-Request-ID"] = request_id
        return response
