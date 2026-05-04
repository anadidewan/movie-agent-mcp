# Movie Agent MCP

A full-stack agentic application for movie discovery. A React chat frontend talks to a LangChain agent (Gemini) that discovers its tools dynamically from an MCP-style microservice wrapping the TMDB API. The agent streams responses via Server-Sent Events. Tool invocations are rendered as expandable pills in the UI; movies the agent mentions in its prose are extracted deterministically and rendered as poster cards beneath the response.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full Mermaid diagram.

The system is three services with strict trust boundaries:

| Service | Port | Secret | Role |
|---|---|---|---|
| **mcp-server** | 3000 | `TMDB_API_KEY` | MCP-style tool server wrapping the TMDB REST API. Exposes tool discovery (`GET /tools`) and tool execution (`POST /tools/{name}`). Normalizes all TMDB responses into a stable contract. |
| **agent-backend** | 8000 | `GEMINI_API_KEY` | Stateless FastAPI service. Discovers tools from the MCP server at startup, registers them as LangChain StructuredTools, and runs a Gemini-powered agent. Streams responses via SSE. Extracts mentioned movies from prose for card rendering. |
| **chat-frontend** | 5173 | *(none)* | React 18 + TypeScript SPA. Consumes the agent backend's `/chat` SSE stream. Renders tool call pills, streaming text, and movie cards. Dark theme only. |

### Why This Shape

- **Swappable data layer.** The MCP server is the only service that knows about TMDB. Replace it with a different movie API (or a different domain entirely) and the agent adapts automatically via tool discovery.
- **Swappable LLM.** The agent backend is the only service that knows about Gemini. Swap to Claude, GPT-4, or a local model by changing one constructor.
- **Single-secret-per-service trust boundary.** The MCP server holds the TMDB key. The agent backend holds the Gemini key. The frontend holds nothing. No secret crosses a service boundary.
- **Dynamic tool discovery.** The agent backend calls `GET /tools` at startup and builds its LangChain tools from the response. Add a tool to the MCP server and the agent picks it up on next restart — no agent code changes.

## Quick Start

```bash
cp .env.example .env
# Fill in TMDB_API_KEY and GEMINI_API_KEY

docker compose up --build
```

- Frontend: http://localhost:5173
- Agent Backend: http://localhost:8000/health
- MCP Server: http://localhost:3000/health

## Manual Setup

### MCP Server (Node.js / TypeScript)

```bash
cd mcp_server
cp .env.example .env   # add TMDB_API_KEY
npm install
npm run dev            # http://localhost:3000
```

### Agent Backend (Python / FastAPI)

```bash
cd agent_backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add GEMINI_API_KEY, set MCP_BASE_URL=http://localhost:3000
uvicorn app.main:app --reload --port 8000
```

### Chat Frontend (React / Vite)

```bash
cd chat_frontend
pnpm install
pnpm run dev           # http://localhost:5173
```

## Project Structure

```
movie-agent-mcp/
├── mcp_server/          # MCP tool server (Node/TS, port 3000)
│   ├── src/
│   ├── tests/
│   ├── docs/contracts.md
│   ├── Dockerfile
│   └── README.md
├── agent_backend/       # Agent backend (Python/FastAPI, port 8000)
│   ├── app/
│   ├── tests/
│   ├── docs/contracts.md
│   ├── Dockerfile
│   └── README.md
├── chat_frontend/       # Chat frontend (React/TS/Vite, port 5173)
│   ├── src/
│   ├── Dockerfile
│   └── README.md
├── docs/
│   └── architecture.md
├── docker-compose.yml
├── DECISIONS.md
├── .env.example
├── .gitignore
└── README.md
```

## How a Request Flows

1. User types a message in the chat frontend and presses Cmd+Enter.
2. Frontend sends `POST /chat` to the agent backend with the full conversation history and `Accept: text/event-stream`.
3. Agent backend passes the message to the LangChain AgentExecutor bound to Gemini.
4. Gemini decides which tools to call. For each tool call, the agent backend POSTs to `mcp-server/tools/{name}`.
5. MCP server calls the TMDB API, normalizes the response, and returns it.
6. The agent backend feeds tool results back to Gemini, which generates the final prose response.
7. The agent backend streams the response as SSE events in this order:
   - `token` (many) — incremental LLM output chunks
   - `movies` (0 or 1) — structured movie data extracted from tool results, filtered to titles mentioned in the prose
   - `tool_calls` (1) — ordered trace of all tool invocations
   - `done` (1) — stream complete
8. Frontend renders tokens progressively, then movie cards and tool pills when their events arrive.

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| LLM | Google Gemini 2.5 Flash | Fast, tool-calling capable, generous free tier |
| Agent framework | LangChain | Project brief requirement; simple agent loop doesn't need LangGraph |
| Agent backend | FastAPI + uvicorn | Async-native, Pydantic v2 for typed contracts, SSE via StreamingResponse |
| MCP server | Express + TypeScript | Lightweight HTTP server, Zod for input validation |
| Frontend | React 18 + Vite + Tailwind CSS | Fast dev loop, strict TypeScript, utility-first styling |
| State management | useReducer | Single conversation, no global state library needed |
| SSE transport | Native fetch + ReadableStream | EventSource doesn't support POST; no third-party library needed |
| Testing | Vitest (frontend), Pytest + Hypothesis (backend), Jest (MCP) | Each matches its ecosystem |

## Deployment

This project is not hosted live. It runs locally via `docker compose`.

Recommended production shape:
- **MCP server** and **agent backend**: containers on a managed runtime (Cloud Run, Fargate, ECS). The MCP server should be on a private network, not exposed publicly — only the agent backend calls it.
- **Frontend**: static files on a CDN (CloudFront, Vercel, Netlify). `VITE_AGENT_BASE_URL` is baked at build time.
- **Secrets**: from a secrets manager (AWS Secrets Manager, GCP Secret Manager), injected as environment variables at runtime. Never baked into images.

## Documentation Philosophy

This documentation is written for two readers:

1. **A new developer joining the project** who needs to understand the architecture, run the services, and start contributing.
2. **A reviewer evaluating the architecture** who wants to understand the design decisions, trust boundaries, and trade-offs without reading every source file.

Each service has its own README, CONTRACTS.md, and test suite. The root README provides the cross-cutting view.

## Testing

| Service | What's tested | What's not tested |
|---|---|---|
| **mcp-server** | Normalizer property tests (output shape invariants), tool integration tests against mocked TMDB, API key leakage property test | TMDB API availability |
| **agent-backend** | Tool loader property tests (schema fidelity), movie extractor property tests (filtering, ordering, dedup), MCP error translation, `/chat` integration with mocked LLM | LLM output quality — the model's recommendations are not evaluated by tests |
| **chat-frontend** | SSE parser unit tests (chunking, buffering, malformed JSON), reducer unit tests, component tests | Visual regression, Tailwind class correctness |

LLM output quality is explicitly out of scope for automated testing. The prompt is documented in `agent_backend/docs/PROMPTS.md` with rationale and example scenarios.

## License

MIT
