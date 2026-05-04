# Architecture — Movie Agent MCP

```mermaid
graph TB
    User([User])

    subgraph Frontend["Chat Frontend (port 5173)"]
        direction TB
        UI[React UI]
        Hook[useChat Hook]
        Reducer[Chat Reducer]
        UI --> Hook --> Reducer
    end

    subgraph Agent["Agent Backend (port 8000)<br/><i>secret: GEMINI_API_KEY</i>"]
        direction TB
        ChatEndpoint[POST /chat]
        ToolLoader[Tool Loader]
        Executor[LangChain AgentExecutor]
        MovieExtractor[Movie Extractor]
        ChatEndpoint --> Executor
        Executor --> MovieExtractor
    end

    subgraph MCP["MCP Server (port 3000)<br/><i>secret: TMDB_API_KEY</i>"]
        direction TB
        Discovery[GET /tools]
        ToolEndpoints[POST /tools/:name]
        Normalizer[Response Normalizer]
        TMDBClient[TMDB HTTP Client]
        ToolEndpoints --> Normalizer --> TMDBClient
    end

    TMDB[(TMDB API)]
    Gemini[(Gemini API)]

    User -->|chat| Frontend
    Frontend -->|"POST /chat (SSE)"| ChatEndpoint
    Executor -.->|LLM calls| Gemini
    Executor -->|"POST /tools/:name"| ToolEndpoints
    TMDBClient -->|REST| TMDB
    ToolLoader -.->|"GET /tools (at startup)"| Discovery

    classDef frontend fill:#1e1e2a,stroke:#6366f1,color:#ededf2
    classDef agent fill:#1e1e2a,stroke:#22c55e,color:#ededf2
    classDef mcp fill:#1e1e2a,stroke:#f59e0b,color:#ededf2
    classDef external fill:#0a0a0f,stroke:#6b6b80,color:#9494a8

    class Frontend frontend
    class Agent agent
    class MCP mcp
    class TMDB,Gemini external
```

## Trust Boundaries

Each service holds exactly one secret and never exposes it across service boundaries:

- The **MCP server** holds `TMDB_API_KEY`. It is the only service that communicates with the TMDB REST API. In a production deployment, it should sit on a private network — only the agent backend calls it.
- The **Agent backend** holds `GEMINI_API_KEY`. It is the only service that communicates with the Gemini API. It discovers tools from the MCP server at startup and proxies tool calls during agent runs, but never forwards its own secret.
- The **Chat frontend** holds no secrets. All authentication and API key management happens server-side. The frontend communicates only with the agent backend over HTTP.

No secret is ever included in HTTP response bodies, SSE events, or log output. The agent backend uses `pydantic.SecretStr` for the Gemini key; the MCP server validates the TMDB key is present at startup and never serializes it.
