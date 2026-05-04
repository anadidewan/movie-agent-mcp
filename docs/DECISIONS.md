# Architectural Decisions

## Dynamic tool registration over hardcoded tools

The agent backend discovers tools from the MCP server at startup via `GET /tools` and constructs LangChain `StructuredTool` instances dynamically from the JSON Schema in each tool descriptor. The alternative was hardcoding tool definitions in the agent backend. Dynamic registration means adding a tool to the MCP server requires zero changes in the agent backend — the tool loader builds the Pydantic args schema, the system prompt, and the LangChain binding automatically.

## Stateless agent backend (frontend owns history)

The agent backend stores no conversation state. The frontend sends the full message history on every `/chat` request. The alternative was server-side session storage (Redis, database). Stateless design eliminates session management complexity, makes the backend horizontally scalable with no shared state, and keeps the architecture simple for a demo application. The trade-off is larger request payloads on long conversations, which is acceptable at this scale.

## Prose-driven movie card extraction

Movie cards are derived by a deterministic post-processor that inspects tool call results and filters to movies whose titles appear in the LLM's prose response. The alternative was having the LLM output structured JSON for cards. The post-processor approach is more reliable — the LLM controls the prose, and the extractor derives cards from tool data. This avoids prompt-engineering fragility and ensures card data always comes from TMDB, never from the LLM's training data.

## SSE over WebSocket for streaming

The agent backend streams responses via Server-Sent Events (SSE) over HTTP, not WebSocket. The alternative was a WebSocket connection for bidirectional streaming. SSE is simpler: it works over standard HTTP, requires no connection upgrade, is natively supported by `fetch` + `ReadableStream`, and matches the unidirectional nature of the data flow (server → client tokens). The frontend uses `POST` with `Accept: text/event-stream` since `EventSource` only supports `GET`.

## Per-service trust boundaries (one secret per service)

Each service holds exactly one secret: the MCP server holds `TMDB_API_KEY`, the agent backend holds `GEMINI_API_KEY`, and the frontend holds nothing. The alternative was a single backend holding both keys. The split means compromising one service doesn't expose the other's secret, and each service can be deployed with minimal IAM permissions. It also makes the data layer swappable — replace the MCP server with a different API and the agent backend doesn't need to change its secret configuration.

## LangChain over LangGraph

The project uses LangChain's `AgentExecutor` with `create_tool_calling_agent`, not LangGraph. The project brief specified LangChain, and the agent's control flow is a simple tool-calling loop — there are no conditional branches, parallel tool execution, or human-in-the-loop steps that would benefit from LangGraph's explicit state machine. `AgentExecutor` with `astream_events` provides the streaming and intermediate step capture needed for SSE and tool call tracing.

## TypeScript strict mode + Pydantic v2: enforced typing across HTTP boundaries

Both sides of every HTTP boundary are typed: Zod schemas in the MCP server, Pydantic v2 models in the agent backend, and TypeScript interfaces in the frontend. The alternative was loose typing with runtime checks. Strict typing catches contract mismatches at compile time (TypeScript) or request time (Pydantic `extra="forbid"`), and the discriminated union for SSE events ensures exhaustive handling in the frontend's event dispatch loop.

## Whole-word matching for movie title extraction

The movie extractor matches candidate titles in the agent's prose using whole-word regex (case-insensitive), not substring search. The alternative was case-insensitive substring matching, which was the original implementation. Substring matching produced false positives — e.g., a TMDB film titled "Mummy" would match in a prose mention of "The Mummy". Whole-word matching aligns the extractor with the agent's actual recommendations and avoids surfacing unrelated films.
