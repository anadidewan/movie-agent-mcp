"""
app/main.py — FastAPI application factory and lifespan manager.

Startup sequence:
1. Validate config (pydantic-settings) — exit 1 if GEMINI_API_KEY or MCP_BASE_URL missing
2. Configure structlog
3. Create MCPClient and call GET /tools — exit 1 if MCP wrapper is unreachable
4. Build AgentExecutor with discovered tools
5. Store executor, mcp_client, settings on app.state
6. Begin serving requests

Shutdown:
- Close the httpx.AsyncClient inside MCPClient

Middleware (applied in order):
- CORSMiddleware  — allow frontend origin
- RequestLoggingMiddleware — inject request_id, emit structured log per request
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.api import router
from app.config import Settings
from app.logging import configure_logging
from app.mcp_client import MCPClient, MCPStartupError, MCPUnavailableError
from app.middleware import RequestLoggingMiddleware
from app.agent_runner import build_agent_with_client
from app.schemas import ErrorDetail, ErrorResponse

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — startup and shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Validate configuration
    try:
        settings = Settings()
    except ValidationError as exc:
        # Print a human-readable message before exiting
        print(
            f"[agent-backend] FATAL: Missing or invalid configuration.\n{exc}",
            file=sys.stderr,
        )
        sys.exit(1)

    # 2. Configure structured logging
    configure_logging(settings.log_level)
    log = structlog.get_logger("startup")

    log.info("starting", version=settings.version, mcp_base_url=str(settings.mcp_base_url))

    # 3. Discover tools from MCP wrapper
    mcp_client = MCPClient(str(settings.mcp_base_url))
    try:
        tool_descriptors = await mcp_client.get_tools()
    except MCPUnavailableError as exc:
        log.error("mcp_unreachable_at_startup", error=str(exc))
        print(
            f"[agent-backend] FATAL: MCP wrapper is unreachable at startup.\n{exc}",
            file=sys.stderr,
        )
        await mcp_client.close()
        sys.exit(1)
    except MCPStartupError as exc:
        log.error("mcp_startup_error", error=str(exc))
        print(
            f"[agent-backend] FATAL: MCP wrapper returned an error at startup.\n{exc}",
            file=sys.stderr,
        )
        await mcp_client.close()
        sys.exit(1)

    log.info("tools_discovered", count=len(tool_descriptors), names=[t.name for t in tool_descriptors])
    # 4. Build AgentExecutor
    executor = build_agent_with_client(
        tool_descriptors=tool_descriptors,
        mcp_client=mcp_client,
        gemini_api_key=settings.gemini_api_key.get_secret_value(),
    )

    # 5. Store on app.state
    app.state.executor = executor
    app.state.mcp_client = mcp_client
    app.state.settings = settings

    log.info("ready", tool_count=len(tool_descriptors))

    yield  # Application is running

    # Shutdown
    log.info("shutting_down")
    await mcp_client.close()


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    app = FastAPI(
        title="Agent Backend",
        description="Movie recommendation agent powered by Gemini and TMDB via MCP.",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS — must be added before other middleware
    # Settings not available yet at factory time; read from env directly
    # The actual origin is applied at request time via the middleware config.
    # We use a permissive default here; production should set FRONTEND_ORIGIN.
    import os
    frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[frontend_origin],
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization", "Accept"],
    )

    # Request logging — injects request_id, emits structured log per request
    app.add_middleware(RequestLoggingMiddleware)

    # Routes
    app.include_router(router)

    # Global validation error handler — return structured ErrorResponse
    from fastapi.exceptions import RequestValidationError

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                error=ErrorDetail(
                    code="VALIDATION_ERROR",
                    message=str(exc.errors()),
                )
            ).model_dump(),
        )

    return app


# ---------------------------------------------------------------------------
# ASGI app instance (used by uvicorn)
# ---------------------------------------------------------------------------

app = create_app()
