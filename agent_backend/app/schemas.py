"""
app/schemas.py — All Pydantic v2 request/response models.

These models define the public API contract between the frontend and the
Agent Backend, as well as internal data shapes used across modules.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class Message(BaseModel):
    """A single turn in the conversation history."""

    role: MessageRole
    content: str


class ChatRequest(BaseModel):
    """
    POST /chat request body.

    The frontend sends the full conversation history on every request
    (stateless design — no server-side session storage).
    extra="forbid" rejects unknown fields with a 422 rather than silently
    dropping them.
    """

    messages: list[Message]

    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class ToolCall(BaseModel):
    """A single tool invocation captured during an agent run."""

    tool: str
    input: dict[str, Any]
    output_summary: str  # 1-2 human-readable sentences, never raw tool output


class AssistantMessage(BaseModel):
    """The assistant's reply message."""

    role: Literal["assistant"] = "assistant"
    content: str


class ChatResponse(BaseModel):
    """
    POST /chat response body.

    Contains the assistant's reply and an ordered trace of every tool call
    made during the agent run.
    """

    message: AssistantMessage
    tool_calls: list[ToolCall]


# ---------------------------------------------------------------------------
# Error models
# ---------------------------------------------------------------------------


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    """
    Unified error envelope returned for all 4xx/5xx responses.

    Shape: { "error": { "code": "...", "message": "..." } }
    """

    error: ErrorDetail


# ---------------------------------------------------------------------------
# Health / Tools endpoint models
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    """GET /health response body."""

    status: Literal["ok"] = "ok"
    version: str
    mcp_status: Literal["ok", "unreachable"]


class ToolInfo(BaseModel):
    """A single registered tool as exposed by GET /tools."""

    name: str
    description: str


class ToolsResponse(BaseModel):
    """GET /tools response body."""

    tools: list[ToolInfo]


# ---------------------------------------------------------------------------
# Internal models (not part of the public API)
# ---------------------------------------------------------------------------


class ToolDescriptor(BaseModel):
    """
    Parsed from the MCP wrapper's GET /tools response.

    input_schema is the raw JSON Schema object used to dynamically construct
    the LangChain StructuredTool's args_schema at startup.
    """

    name: str
    description: str
    input_schema: dict[str, Any]
