"""
app/mcp_client.py — HTTP client for the MCP wrapper microservice.

Responsibilities:
- Discover available tools at startup (GET /tools)
- Invoke individual tools during agent runs (POST /tools/{name})
- Probe MCP reachability for the health endpoint (GET /health)
- Translate all MCP error conditions into safe, agent-readable strings
  so the LangChain AgentExecutor can reason about failures rather than crash.

Error contract:
- Connection failures / timeouts  → raise MCPUnavailableError
- HTTP 4xx / 5xx responses        → return "Error [CODE]: message" string
- Non-JSON / malformed bodies     → return "Error [PARSE_ERROR]: ..." string
- Successful responses            → return JSON body as a formatted string
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.schemas import ToolDescriptor

import structlog

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class MCPUnavailableError(Exception):
    """
    Raised when the MCP wrapper cannot be reached at all
    (connection refused, DNS failure, timeout).

    This is distinct from an MCP error response (4xx/5xx), which is
    translated into a tool error string instead.
    """

    def __init__(self, url: str, cause: Exception) -> None:
        super().__init__(f"MCP wrapper unreachable at {url}: {cause}")
        self.url = url
        self.cause = cause


# ---------------------------------------------------------------------------
# MCP Client
# ---------------------------------------------------------------------------


class MCPClient:
    """
    Async HTTP client wrapping all communication with the MCP wrapper.

    Uses a single shared httpx.AsyncClient for connection pooling.
    Call close() on shutdown to release resources.
    """

    def __init__(self, base_url: str, timeout: float = 10.0) -> None:
        # Normalise: strip trailing slash so URL joins are predictable
        self._base_url = str(base_url).rstrip("/")
        self._client = httpx.AsyncClient(timeout=timeout)
        logger.debug("mcp_client_init", base_url=self._base_url, timeout=timeout)

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def get_tools(self) -> list[ToolDescriptor]:
        """
        Fetch the tool registry from the MCP wrapper.

        Called once at startup. Raises MCPUnavailableError if the wrapper
        cannot be reached, or MCPStartupError if the response is invalid.
        """
        url = f"{self._base_url}/tools"
        logger.debug("get_tools_request", url=url)
        try:
            response = await self._client.get(url)
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            logger.error("get_tools_connection_failed", url=url, error=str(exc))
            raise MCPUnavailableError(url, exc) from exc

        if response.status_code != 200:
            error_msg = self._extract_error_message(response)
            logger.error("get_tools_error_response", url=url, status=response.status_code, error=error_msg)
            raise MCPStartupError(
                f"MCP wrapper returned {response.status_code} on GET /tools: {error_msg}"
            )

        try:
            data = response.json()
            tools_raw = data.get("tools", [])
            tools = [ToolDescriptor(**t) for t in tools_raw]
            logger.debug("get_tools_success", tool_count=len(tools), names=[t.name for t in tools])
            return tools
        except Exception as exc:
            raise MCPStartupError(
                f"MCP wrapper returned unparseable tool list: {exc}"
            ) from exc

    async def call_tool(self, name: str, args: dict[str, Any]) -> str:
        """
        Invoke a tool on the MCP wrapper.

        Returns a string in all non-connection-error cases so the
        LangChain AgentExecutor always receives a result it can reason about:

        - Success (200)         → JSON body serialised as a string
        - 4xx / 5xx             → "Error [CODE]: message"
        - Non-JSON body         → "Error [PARSE_ERROR]: Unexpected response from tool server"
        - Connection failure    → raises MCPUnavailableError
        """
        url = f"{self._base_url}/tools/{name}"
        logger.debug("call_tool_request", tool=name, url=url, args=args)
        try:
            response = await self._client.post(url, json=args)
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            logger.error("call_tool_connection_failed", tool=name, url=url, error=str(exc))
            raise MCPUnavailableError(url, exc) from exc

        if response.status_code == 200:
            logger.debug("call_tool_success", tool=name, status=200)
            try:
                return json.dumps(response.json())
            except Exception:
                return response.text

        # 4xx / 5xx — translate to a tool error string (never raise)
        error_str = self._extract_error_message(response)
        logger.debug("call_tool_error_response", tool=name, status=response.status_code, error=error_str)
        return error_str

    async def ping(self) -> bool:
        """
        Probe MCP wrapper reachability for the /health endpoint.

        Returns True if the wrapper responds with any HTTP status.
        Returns False if it responds with a non-200 status.
        Raises MCPUnavailableError on connection failure.
        """
        url = f"{self._base_url}/health"
        logger.debug("ping_request", url=url)
        try:
            response = await self._client.get(url)
            reachable = response.status_code == 200
            logger.debug("ping_result", reachable=reachable, status=response.status_code)
            return reachable
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            logger.debug("ping_failed", url=url, error=str(exc))
            raise MCPUnavailableError(url, exc) from exc

    async def close(self) -> None:
        """Release the underlying httpx connection pool."""
        await self._client.aclose()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _extract_error_message(self, response: httpx.Response) -> str:
        """
        Parse an MCP error response into a safe, agent-readable string.

        Tries to extract { "error": { "code": ..., "message": ... } }.
        Falls back to a PARSE_ERROR string if the body is not valid JSON
        or does not match the expected envelope shape.
        """
        try:
            body = response.json()
            error = body.get("error", {})
            code = error.get("code", "UNKNOWN_ERROR")
            message = error.get("message", "No message provided")
            return f"Error [{code}]: {message}"
        except Exception:
            return "Error [PARSE_ERROR]: Unexpected response from tool server"


# ---------------------------------------------------------------------------
# Startup-specific exception (not a runtime tool error)
# ---------------------------------------------------------------------------


class MCPStartupError(Exception):
    """
    Raised during startup when the MCP wrapper returns an unexpected
    response to GET /tools (e.g. non-200 status or malformed body).

    Distinct from MCPUnavailableError (connection failure) and from
    tool error strings (runtime 4xx/5xx during agent runs).
    """
