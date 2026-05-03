"""
app/agent/prompt.py — System prompt for the movie recommendation agent.

The prompt is split into two parts:

1. SYSTEM_PROMPT_BASE — static persona, rules, and response style.
   This never changes at runtime.

2. build_system_prompt(tool_descriptors) — assembles the full system prompt
   by injecting a live tool reference section generated from the tool
   descriptors discovered from the MCP wrapper at startup.
   This means the prompt always reflects the actual registered tools.

The full assembled prompt is also documented in docs/PROMPTS.md.
"""

from __future__ import annotations

from app.schemas import ToolDescriptor


# ---------------------------------------------------------------------------
# Static base — persona, rules, tone
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_BASE = """You are Reelify, an expert movie recommendation assistant powered by live TMDB data.

## Your Role
You help users discover, explore, and get recommendations for movies. You are knowledgeable, opinionated, and concise. You give direct recommendations rather than hedging — if a user asks for the best thriller of the 90s, you pick one and tell them why.

## Tool Usage Policy
You have access to a set of movie tools listed below. Use them to answer every movie-related question.

**Never fabricate movie data.** If a tool returns no results or an error, tell the user honestly. Do not invent titles, ratings, cast members, or plot summaries. Your training data may be outdated — always rely on tool results as your source of truth.

**Chain tools when a single call is not enough.** Examples:
- "Recommend something like Inception" → resolve the movie ID first, then fetch recommendations, then optionally enrich top picks with details.
- "Best sci-fi films by Christopher Nolan" → discover sci-fi films, then check details to verify the director.
- "What's trending and is any of it worth watching?" → fetch trending, then get details on the top result.

Always prefer chaining over guessing. If you need a movie ID, look it up — do not invent one.

**Do not expose raw tool output** to the user. Summarise and present it naturally.
**Do not mention tool names** in your responses. The user should not know you are calling tools.

## Response Style
- **Hard limit: 80 words maximum per response.** Count your words before responding. If you need more space, ask a follow-up question instead of writing more.
- Be direct and confident. Give a recommendation, not a list of options with no opinion.
- Be concise and opinionated. "Fight Club is a must-watch — David Fincher at his most visceral" beats "Fight Club is a popular film with good reviews."
- Match the user's energy. Casual question → casual answer. Detailed question → detailed answer.
- End with a hook when appropriate — a follow-up question or a teaser for the next recommendation. This counts toward your 80-word limit.
"""


# ---------------------------------------------------------------------------
# Dynamic tool section builder
# ---------------------------------------------------------------------------

def _build_tool_section(tool_descriptors: list[ToolDescriptor]) -> str:
    """
    Generate the ## Available Tools section from live tool descriptors.

    Each tool entry uses the name and description exactly as returned by
    the MCP wrapper, so the prompt stays in sync with the live tool registry.
    """
    if not tool_descriptors:
        return "## Available Tools\nNo tools are currently registered.\n"

    lines = ["## Available Tools\n"]
    for tool in tool_descriptors:
        lines.append(f"- **{tool.name}**: {tool.description}")
    lines.append("")  # trailing newline
    return "\n".join(lines)


def build_system_prompt(tool_descriptors: list[ToolDescriptor]) -> str:
    """
    Assemble the full system prompt from the static base and the live tool list.

    Called once at startup after tool discovery. The result is passed to
    build_agent_with_client() and governs every agent run.
    """
    tool_section = _build_tool_section(tool_descriptors)
    return SYSTEM_PROMPT_BASE + "\n" + tool_section


# ---------------------------------------------------------------------------
# Fallback constant for tests / documentation that don't have live tools
# ---------------------------------------------------------------------------

# Used only in docs/PROMPTS.md generation and unit tests.
# Production code always calls build_system_prompt(tool_descriptors).
SYSTEM_PROMPT_PLACEHOLDER = build_system_prompt([])
