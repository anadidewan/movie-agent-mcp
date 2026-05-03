"""
app/agent_runner.py — LangChain agent construction and execution.

Responsibilities:
- build_args_schema(): dynamically construct a Pydantic model from a JSON Schema dict
- build_tool(): wrap an MCP tool as a LangChain StructuredTool
- build_agent_with_client(): assemble the full AgentExecutor bound to Gemini
- run(): invoke the agent and return a ChatResponse
- astream_run(): stream the agent response as SSE events
- summarise_output(): convert raw tool output into a 1-2 sentence human summary
"""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Optional, get_args, get_origin

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain.tools import StructuredTool
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field, create_model
from pydantic.fields import FieldInfo

from app.agent.prompt import build_system_prompt
from app.mcp_client import MCPClient
from app.schemas import AssistantMessage, ChatResponse, ToolCall, ToolDescriptor

import structlog

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# JSON Schema → Python type mapping
# ---------------------------------------------------------------------------

_JSON_SCHEMA_TYPE_MAP: dict[str, type] = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
    "array": list,
    "object": dict,
}


def json_schema_type_to_python(field_schema: dict[str, Any]) -> type:
    """Map a JSON Schema field definition to a Python type. Defaults to str."""
    return _JSON_SCHEMA_TYPE_MAP.get(field_schema.get("type", "string"), str)


# ---------------------------------------------------------------------------
# Dynamic Pydantic model construction
# ---------------------------------------------------------------------------


def build_args_schema(tool_name: str, input_schema: dict[str, Any]) -> type[BaseModel]:
    """
    Construct a Pydantic v2 model class from a JSON Schema object.

    Required fields become (type, FieldInfo).
    Optional fields become (Optional[type], FieldInfo(default=None)).
    """
    fields: dict[str, Any] = {}
    required_fields: set[str] = set(input_schema.get("required", []))
    properties: dict[str, Any] = input_schema.get("properties", {})

    for field_name, field_schema in properties.items():
        # Pydantic rejects field names starting with underscores — skip them
        if not field_name or field_name.startswith("_"):
            continue
        python_type = json_schema_type_to_python(field_schema)
        description = field_schema.get("description", "")

        if field_name in required_fields:
            fields[field_name] = (python_type, FieldInfo(description=description))
        else:
            fields[field_name] = (
                Optional[python_type],
                FieldInfo(default=None, description=description),
            )

    # create_model requires at least one field; if the schema has none,
    # produce an empty model (tools with no args, e.g. get_trending with
    # a required "window" field will always have at least one field).
    return create_model(f"{tool_name}_args", **fields)


# ---------------------------------------------------------------------------
# StructuredTool construction
# ---------------------------------------------------------------------------


def build_tool(descriptor: ToolDescriptor, mcp_client: MCPClient) -> StructuredTool:
    """
    Wrap an MCP tool descriptor as a LangChain StructuredTool.

    The tool's coroutine POSTs to MCP_BASE_URL/tools/{name} with the
    validated kwargs. The args_schema is derived from the descriptor's
    input_schema JSON Schema.
    """
    args_schema = build_args_schema(descriptor.name, descriptor.input_schema)
    tool_name = descriptor.name  # capture for closure

    async def tool_func(**kwargs: Any) -> str:
        return await mcp_client.call_tool(tool_name, kwargs)

    return StructuredTool(
        name=descriptor.name,
        description=descriptor.description,
        args_schema=args_schema,
        coroutine=tool_func,
    )


# ---------------------------------------------------------------------------
# Agent construction
# ---------------------------------------------------------------------------


def build_agent(
    tool_descriptors: list[ToolDescriptor],
    gemini_api_key: str,
) -> AgentExecutor:
    """
    Construct the LangChain AgentExecutor bound to Gemini.

    This is called once at startup after tool discovery. The returned
    executor is stored on app.state and reused for every request.
    """
    # We need the MCPClient reference to be passed in at call time via
    # build_tool, so build_agent accepts pre-built tools instead.
    # See: build_agent_with_client() below for the full startup path.
    raise NotImplementedError(
        "Use build_agent_with_client() to construct the agent executor."
    )


def build_agent_with_client(
    tool_descriptors: list[ToolDescriptor],
    mcp_client: MCPClient,
    gemini_api_key: str,
    model_name: str = "gemini-2.5-flash-lite",
) -> AgentExecutor:
    """
    Full startup path: build tools, LLM, prompt, and AgentExecutor.

    Parameters
    ----------
    tool_descriptors : list[ToolDescriptor]
        Tools discovered from the MCP wrapper at startup.
    mcp_client : MCPClient
        Shared HTTP client; each tool's coroutine closes over this.
    gemini_api_key : str
        Raw Gemini API key (call SecretStr.get_secret_value() before passing).
    model_name : str
        Gemini model identifier. Defaults to gemini-1.5-flash.
    """
    tools = [build_tool(d, mcp_client) for d in tool_descriptors]

    # logger.debug("build_agent", tool_count=len(tools), model=model_name, tool_names=[t.name for t in tools])
    logger.info("config", key=gemini_api_key) 

    llm = ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=gemini_api_key,
        temperature=0.2,
    )

    # Build the system prompt dynamically from the live tool descriptors
    # so it always reflects the actual registered tool set.
    system_prompt = build_system_prompt(tool_descriptors)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ]
    )

    agent = create_tool_calling_agent(llm, tools, prompt)

    return AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=False,
        return_intermediate_steps=True,
        handle_parsing_errors=True,
    )


# ---------------------------------------------------------------------------
# Output summarisation
# ---------------------------------------------------------------------------

# Hard limit on the number of sentences in the assistant's response.
# The prompt instructs the model to stay within this limit, but we also
# enforce it in post-processing as a safety net.
MAX_RESPONSE_SENTENCES = 5


def enforce_sentence_limit(text: str, max_sentences: int = MAX_RESPONSE_SENTENCES) -> str:
    """
    Truncate text to at most `max_sentences` sentences.

    Splits on sentence-ending punctuation (. ! ?) followed by whitespace
    or end-of-string. Preserves the original text if it is already within
    the limit. Appends an ellipsis if truncation occurs.
    """
    import re

    if not text or not text.strip():
        return text

    # Split into sentences — keep the delimiter attached to each sentence
    # Pattern: split AFTER . ! ? that are followed by whitespace or end-of-string
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    if len(sentences) <= max_sentences:
        return text

    truncated = " ".join(sentences[:max_sentences])
    # Ensure it ends with punctuation
    if truncated and truncated[-1] not in ".!?":
        truncated += "."
    return truncated


def _summarise_object(data: dict[str, Any]) -> str:
    """Summarise a single-object tool response (e.g. get_movie_details)."""
    title = data.get("title", "")
    year = data.get("year", "")
    rating = data.get("rating", "")
    director = data.get("director", "")
    movie_id = data.get("movie_id", "")
    genre_name = data.get("genre_name", "")
    genre_id = data.get("genre_id", "")

    if title:
        parts = [f"Retrieved details for {title}"]
        if year:
            parts[0] += f" ({year})"
        if director:
            parts.append(f"directed by {director}")
        if rating:
            parts.append(f"rated {rating}/10")
        return ". ".join(parts) + "."
    if movie_id:
        return f"Resolved movie ID: {movie_id}."
    if genre_name:
        return f"Resolved genre '{genre_name}' to ID {genre_id}."
    # Generic fallback for unknown single-object shapes
    keys = list(data.keys())[:3]
    return f"Tool returned object with fields: {', '.join(keys)}."


def summarise_output(raw_output: str) -> str:
    """
    Convert raw tool output into a 1-2 sentence human-readable summary.

    Never includes raw JSON in the summary. Falls back to a truncated
    version of the raw string if parsing fails.
    """
    try:
        data = json.loads(raw_output)

        # List results (search_movies, discover_movies, get_recommendations, get_trending)
        if "results" in data:
            results = data["results"]
            count = len(results)
            if count == 0:
                return "The tool returned no results."
            titles = [r.get("title", "") for r in results[:3] if r.get("title")]
            title_str = ", ".join(titles) if titles else "unknown titles"
            return f"Found {count} result(s). Top titles: {title_str}."

        # Error envelope
        if "error" in data:
            error = data["error"]
            code = error.get("code", "UNKNOWN")
            message = error.get("message", "No message")
            return f"Tool returned error {code}: {message}."

        # Single-object responses (must be a dict)
        if isinstance(data, dict):
            return _summarise_object(data)
        # Unexpected JSON shape (array, null, scalar)
        return "Tool returned an unexpected response shape."

    except (json.JSONDecodeError, KeyError, TypeError):
        # Fallback: truncate raw string to 200 chars
        return raw_output[:200] if raw_output else "Tool returned an empty response."


# ---------------------------------------------------------------------------
# Agent execution
# ---------------------------------------------------------------------------


def _messages_to_langchain(
    messages: list[Any],
) -> tuple[list[Any], str]:
    """
    Split the conversation history into:
    - chat_history: all messages except the last user message
    - input: the content of the last user message

    Returns (chat_history, input_text).
    """
    from app.schemas import Message, MessageRole

    if not messages:
        return [], ""

    lc_messages = []
    for msg in messages[:-1]:
        if msg.role == MessageRole.user:
            lc_messages.append(HumanMessage(content=msg.content))
        else:
            lc_messages.append(AIMessage(content=msg.content))

    last = messages[-1]
    return lc_messages, last.content


async def run(executor: AgentExecutor, messages: list[Any]) -> ChatResponse:
    """
    Invoke the agent executor and return a structured ChatResponse.

    Collects intermediate_steps to build the tool_calls trace.
    """
    chat_history, user_input = _messages_to_langchain(messages)
    logger.debug("agent_run_start", user_input=user_input[:100], history_length=len(chat_history))

    result = await executor.ainvoke(
        {"input": user_input, "chat_history": chat_history}
    )

    # Build tool call trace from intermediate steps
    tool_calls: list[ToolCall] = []
    for action, raw_output in result.get("intermediate_steps", []):
        logger.debug("tool_invocation", tool=action.tool, input=action.tool_input)
        tool_calls.append(
            ToolCall(
                tool=action.tool,
                input=action.tool_input if isinstance(action.tool_input, dict) else {"input": action.tool_input},
                output_summary=summarise_output(str(raw_output)),
            )
        )

    logger.debug("agent_run_complete", tool_calls_count=len(tool_calls), output_length=len(result.get("output", "")))

    return ChatResponse(
        message=AssistantMessage(content=result.get("output", "")),
        tool_calls=tool_calls,
    )


async def astream_run(
    executor: AgentExecutor, messages: list[Any]
) -> AsyncGenerator[str, None]:
    """
    Stream the agent response as Server-Sent Events.

    Yields SSE-formatted strings:
    - data: {"type":"token","content":"..."}\n\n  — for each LLM output chunk
    - data: {"type":"tool_calls","tool_calls":[...]}\n\n  — once, after all tokens
    - data: {"type":"error","code":"...","message":"..."}\n\n  — on agent error
    - data: {"type":"done"}\n\n  — final event

    The frontend detects streaming by sending Accept: text/event-stream.
    """
    chat_history, user_input = _messages_to_langchain(messages)

    intermediate_steps: list[tuple[Any, str]] = []
    full_output = ""

    try:
        async for event in executor.astream_events(
            {"input": user_input, "chat_history": chat_history},
            version="v1",
        ):
            kind = event.get("event", "")

            # Stream LLM output tokens
            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    full_output += chunk.content
                    payload = json.dumps({"type": "token", "content": chunk.content})
                    yield f"data: {payload}\n\n"

            # Capture tool invocations
            elif kind == "on_tool_end":
                tool_name = event.get("name", "unknown_tool")
                tool_input = event.get("data", {}).get("input", {})
                tool_output = event.get("data", {}).get("output", "")
                intermediate_steps.append(
                    (
                        _FakeAction(tool=tool_name, tool_input=tool_input),
                        str(tool_output),
                    )
                )

    except Exception as exc:
        from app.mcp_client import MCPUnavailableError

        if isinstance(exc, MCPUnavailableError):
            payload = json.dumps(
                {"type": "error", "code": "MCP_UNAVAILABLE", "message": str(exc)}
            )
        else:
            payload = json.dumps(
                {"type": "error", "code": "LLM_ERROR", "message": str(exc)}
            )
        yield f"data: {payload}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return

    # Emit tool call trace
    tool_calls = [
        ToolCall(
            tool=action.tool,
            input=action.tool_input if isinstance(action.tool_input, dict) else {"input": action.tool_input},
            output_summary=summarise_output(raw_output),
        )
        for action, raw_output in intermediate_steps
    ]

    tc_payload = json.dumps(
        {
            "type": "tool_calls",
            "tool_calls": [tc.model_dump() for tc in tool_calls],
        }
    )
    yield f"data: {tc_payload}\n\n"
    yield f"data: {json.dumps({'type': 'done'})}\n\n"


class _FakeAction:
    """Minimal stand-in for AgentAction used when capturing SSE tool events."""

    def __init__(self, tool: str, tool_input: Any) -> None:
        self.tool = tool
        self.tool_input = tool_input
