# Agent Backend

A stateless FastAPI service that bridges a frontend chat UI and the [MCP wrapper](../mcp_server/README.md) microservice. It discovers available movie tools from the MCP wrapper at startup, registers them dynamically as LangChain tools bound to Google Gemini, and exposes a chat API with optional SSE streaming.

---

## Architecture

```
Frontend → Agent Backend → MCP Wrapper → TMDB
                        ↘ Google Gemini API
```

The Agent Backend holds the **Gemini API key** but never the TMDB API key — that boundary stays inside the MCP wrapper.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat` | Stateless chat. Send full conversation history, receive assistant reply + tool call trace. Supports SSE streaming via `Accept: text/event-stream`. |
| `GET` | `/health` | Service liveness. Returns `status`, `version`, `mcp_status` (cached 60s). |
| `GET` | `/tools` | Lists currently registered LangChain tools (mirrors MCP discovery). |

### POST /chat — Request
```json
{
  "messages": [
    { "role": "user", "content": "Recommend a dark thriller from the 90s" }
  ]
}
```

### POST /chat — Response
```json
{
  "message": { "role": "assistant", "content": "Se7en is the one..." },
  "tool_calls": [
    {
      "tool": "discover_movies",
      "input": { "genre": "Thriller", "year_from": 1990, "year_to": 1999 },
      "output_summary": "Found 20 thriller results. Top titles: Se7en, The Silence of the Lambs, Heat."
    }
  ]
}
```

### SSE Streaming
Add `Accept: text/event-stream` to stream the response token-by-token:
```
data: {"type":"token","content":"Se7en"}
data: {"type":"token","content":" is the one..."}
data: {"type":"tool_calls","tool_calls":[...]}
data: {"type":"done"}
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | ✅ | — | Google Gemini API key |
| `MCP_BASE_URL` | ✅ | — | Base URL of the MCP wrapper (e.g. `http://localhost:3000`) |
| `FRONTEND_ORIGIN` | ❌ | `http://localhost:5173` | Allowed CORS origin for the frontend |
| `VERSION` | ❌ | `0.1.0` | Service version string |
| `LOG_LEVEL` | ❌ | `INFO` | Log level: `DEBUG`, `INFO`, `WARNING`, `ERROR` |

The service **refuses to start** if `GEMINI_API_KEY` or `MCP_BASE_URL` are missing.

---

## Local Development

### Prerequisites
- Python 3.11
- The MCP wrapper running at `MCP_BASE_URL` (see `../mcp_server/README.md`)

### Setup

```bash
cd agent_backend

# Create and activate virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and set GEMINI_API_KEY and MCP_BASE_URL
```

### Run

```bash
# From agent_backend/
uvicorn app.main:app --reload --port 8000
```

The service will be available at `http://localhost:8000`.

---

## Running Tests

```bash
cd agent_backend
source .venv/bin/activate

# Run all tests
pytest tests/ -v

# Run only unit tests
pytest tests/unit/ -v

# Run only integration tests
pytest tests/integration/ -v

# Run a specific test file
pytest tests/unit/test_tool_loading.py -v
```

No live Gemini API key or TMDB connection is required — all external dependencies are mocked.

---

## Testing /chat with curl

### Non-streaming (JSON response)
```bash
curl -s -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What are the best sci-fi films from the 2000s?"}
    ]
  }' | jq .
```

### SSE Streaming
```bash
curl -s -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "messages": [
      {"role": "user", "content": "Recommend something like Inception"}
    ]
  }'
```

### Multi-turn conversation
```bash
curl -s -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is Fight Club about?"},
      {"role": "assistant", "content": "Fight Club is a 1999 film by David Fincher..."},
      {"role": "user", "content": "What should I watch next if I liked it?"}
    ]
  }' | jq .
```

---

## Docker

### Build
```bash
cd agent_backend
docker build -t agent-backend .
```

### Run
```bash
docker run -p 8000:8000 \
  -e GEMINI_API_KEY=your_key_here \
  -e MCP_BASE_URL=http://host.docker.internal:3000 \
  agent-backend
```

> **Note:** Use `host.docker.internal` to reach the MCP wrapper running on your host machine from inside Docker. On Linux, use `--network host` instead.

---

## Project Structure

```
agent_backend/
├── app/
│   ├── main.py          # FastAPI app factory, lifespan, CORS, middleware
│   ├── api.py           # Route handlers: /chat, /health, /tools
│   ├── agent_runner.py  # AgentExecutor construction, run(), astream_run()
│   ├── mcp_client.py    # httpx MCP client, error translation
│   ├── schemas.py       # Pydantic v2 request/response models
│   ├── config.py        # pydantic-settings Settings class
│   ├── logging.py       # structlog configuration
│   ├── middleware.py     # Request-ID injection, structured logging middleware
│   └── agent/
│       └── prompt.py    # SYSTEM_PROMPT + build_system_prompt()
├── tests/
│   ├── unit/            # Unit + property tests (no live dependencies)
│   └── integration/     # Integration tests (mocked LLM + MCP)
├── Dockerfile           # Multi-stage, python:3.11-slim
├── requirements.txt     # Pinned dependencies
├── .env.example         # Environment variable template
└── pytest.ini           # pytest + asyncio configuration
```
