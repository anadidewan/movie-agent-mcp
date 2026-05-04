# Specs

This project was built using spec-driven development. Each component was specified as a structured document set — requirements, design, and implementation tasks — before any code was written. The specs were reviewed and edited iteratively, then used to guide implementation. Some details evolved during the build (features removed, matching logic tightened, components simplified), so the specs reflect design intent rather than a perfect mirror of the final code. Deviations are marked inline with `[Removed during implementation]` where applicable.

## Artifacts

Each spec directory contains three files:

- **requirements.md** — User stories and acceptance criteria written in EARS format (Event-driven, Ubiquitous, State-driven, Unwanted-event). Each criterion is traceable and testable.
- **design.md** — Architecture diagrams (Mermaid), component interfaces, data models, algorithms, correctness properties, and a design decisions table with rationale.
- **tasks.md** — Ordered implementation breakdown. Each task references specific requirements for traceability. Tasks are marked complete, and optional tasks are flagged with `*`.

## Components

| Spec | Description |
|---|---|
| `tmdb-mcp-server/` | MCP-style tool server wrapping the TMDB API. Zod-validated endpoints, response normalizers, error translation. |
| `agent-backend/` | Stateless FastAPI service. Dynamic tool loading from MCP, LangChain agent with Gemini, SSE streaming, tool call tracing. |
| `movie-cards/` | Sub-spec for the agent backend's movie extractor module. Deterministic post-processor that derives movie cards from tool outputs and LLM prose. |
| `chat-frontend/` | React 18 + TypeScript SPA. SSE stream parsing, useReducer state management, tool call pills, movie card strips, error handling. |
