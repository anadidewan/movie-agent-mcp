"""
app/api.py — FastAPI route handlers.

Endpoints:
- POST /chat   — stateless agent chat (JSON or SSE streaming)
- GET  /health — service + MCP wrapper liveness
- GET  /tools  — registered LangChain tool list

Error mapping:
- RequestValidationError → 422 VALIDATION_ERROR
- MCPUnavailableError    → 503 MCP_UNAVAILABLE
- LLMError               → 502 LLM_ERROR
- Unhandled              → 500 INTERNAL_ERROR
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.mcp_client import MCPClient, MCPUnavailableError
from app.schemas import (
    AssistantMessage,
    ChatRequest,
    ChatResponse,
    ErrorDetail,
    ErrorResponse,
    HealthResponse,
    ToolCall,
    ToolInfo,
    ToolsResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Health cache — TTL-based with double-check locking
# ---------------------------------------------------------------------------


class HealthCache:
    """
    Caches the MCP wrapper reachability status for up to `ttl_seconds`.

    Uses asyncio.Lock with a double-check pattern to prevent multiple
    concurrent requests from all triggering a refresh simultaneously.
    """

    def __init__(self, ttl_seconds: int = 60) -> None:
        self._lock = asyncio.Lock()
        self._cached_status: str | None = None
        self._last_checked: float = 0.0
        self._ttl = ttl_seconds

    async def get_mcp_status(self, mcp_client: MCPClient) -> str:
        now = time.monotonic()
        # Fast path — no lock needed if cache is fresh
        if self._cached_status is not None and (now - self._last_checked) < self._ttl:
            return self._cached_status

        async with self._lock:
            # Double-check after acquiring lock
            now = time.monotonic()
            if self._cached_status is not None and (now - self._last_checked) < self._ttl:
                return self._cached_status

            try:
                reachable = await mcp_client.ping()
                self._cached_status = "ok" if reachable else "unreachable"
            except MCPUnavailableError:
                self._cached_status = "unreachable"

            self._last_checked = time.monotonic()
            return self._cached_status

    def invalidate(self) -> None:
        """Force the next call to refresh the cache."""
        self._last_checked = 0.0


# Module-level cache instance shared across requests
_health_cache = HealthCache(ttl_seconds=60)


# ---------------------------------------------------------------------------
# Error helpers
# ---------------------------------------------------------------------------


def _error_response(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(error=ErrorDetail(code=code, message=message)).model_dump(),
    )


# ---------------------------------------------------------------------------
# POST /chat
# ---------------------------------------------------------------------------


@router.post("/chat")
async def chat(request: Request, body: ChatRequest) -> Any:
    """
    Stateless chat endpoint.

    The frontend sends the full conversation history on every request.
    Detects SSE streaming via the Accept: text/event-stream header.

    Returns:
    - JSON ChatResponse (default)
    - StreamingResponse with SSE events (when Accept: text/event-stream)
    """
    executor = request.app.state.executor
    accept = request.headers.get("accept", "")
    log = logger.bind(endpoint="/chat", request_id=getattr(request.state, "request_id", "-"))

    if "text/event-stream" in accept:
        # SSE streaming mode
        log.debug("chat_sse_mode", message_count=len(body.messages))
        from app.agent_runner import astream_run

        async def event_generator():
            try:
                async for chunk in astream_run(executor, body.messages):
                    yield chunk
            except MCPUnavailableError as exc:
                import json
                yield f"data: {json.dumps({'type': 'error', 'code': 'MCP_UNAVAILABLE', 'message': 'MCP wrapper is unavailable'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception as exc:
                import json
                yield f"data: {json.dumps({'type': 'error', 'code': 'LLM_ERROR', 'message': 'Agent error occurred'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming JSON mode
    log.debug("chat_json_mode", message_count=len(body.messages))
    from app.agent_runner import run

    try:
        response = await run(executor, body.messages)
        log.info("chat_complete", tool_calls_made=len(response.tool_calls))
        return response
    except MCPUnavailableError:
        log.warning("mcp_unavailable_during_chat")
        return _error_response(
            "MCP_UNAVAILABLE",
            "The movie data service is temporarily unavailable. Please try again.",
            503,
        )
    except Exception as exc:
        log.error("llm_error", error=str(exc))
        return _error_response(
            "LLM_ERROR",
            "The AI service encountered an error. Please try again.",
            502,
        )


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    """
    Service liveness endpoint.

    Returns status, version, and MCP wrapper reachability.
    mcp_status is cached for 60 seconds to avoid hammering the MCP wrapper.
    Always returns HTTP 200 — even when MCP is unreachable.
    """
    mcp_client: MCPClient = request.app.state.mcp_client
    settings = request.app.state.settings

    mcp_status = await _health_cache.get_mcp_status(mcp_client)
    logger.debug("health_check", mcp_status=mcp_status, version=settings.version)

    return HealthResponse(
        status="ok",
        version=settings.version,
        mcp_status=mcp_status,  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# GET /tools
# ---------------------------------------------------------------------------


@router.get("/tools", response_model=ToolsResponse)
async def tools(request: Request) -> ToolsResponse:
    """
    Returns the list of currently registered LangChain tools.

    Mirrors what was discovered from the MCP wrapper at startup.
    Never includes secrets or internal configuration.
    """
    executor = request.app.state.executor
    tool_list = [
        ToolInfo(name=t.name, description=t.description)
        for t in executor.tools
    ]
    logger.debug("tools_list", tool_count=len(tool_list))
    return ToolsResponse(tools=tool_list)
