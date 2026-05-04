# Architecture — Movie Agent MCP

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'fontSize': '16px'}, 'flowchart': {'nodeSpacing': 30, 'rankSpacing': 50}}}%%
flowchart TD
    User([User]) -->|chat| Frontend

    subgraph Frontend["Chat Frontend · port 5173"]
        UI[React UI] --> Hook[useChat Hook] --> Reducer[Chat Reducer]
    end

    Frontend -->|"POST /chat (SSE)"| Agent

    subgraph Agent["Agent Backend · port 8000"]
        ChatEndpoint[POST /chat] --> Executor[LangChain AgentExecutor]
        Executor --> MovieExtractor[Movie Extractor]
        Executor --> ToolLoader[Tool Loader]
    end

    Agent -->|"POST /tools/:name  ·  GET /tools (startup)"| MCP

    subgraph MCP["MCP Server · port 3000"]
        Discovery[GET /tools]
        ToolEndpoints[POST /tools/:name] --> Normalizer[Response Normalizer] --> TMDBClient[TMDB HTTP Client]
    end

    Executor -.->|LLM calls| Gemini[(Gemini API)]
    TMDBClient -->|REST| TMDB[(TMDB API)]

    style Frontend fill:#1e1e2a,stroke:#6366f1,color:#ededf2
    style Agent fill:#1e1e2a,stroke:#22c55e,color:#ededf2
    style MCP fill:#1e1e2a,stroke:#f59e0b,color:#ededf2
    style Gemini fill:#0a0a0f,stroke:#6b6b80,color:#9494a8
    style TMDB fill:#0a0a0f,stroke:#6b6b80,color:#9494a8
```

## Trust Boundaries

Each service holds exactly one secret and never exposes it across service boundaries:

- The **MCP server** holds `TMDB_API_KEY`. It is the only service that communicates with the TMDB REST API. In a production deployment, it should sit on a private network — only the agent backend calls it.
- The **Agent backend** holds `GEMINI_API_KEY`. It is the only service that communicates with the Gemini API. It discovers tools from the MCP server at startup and proxies tool calls during agent runs, but never forwards its own secret.
- The **Chat frontend** holds no secrets. All authentication and API key management happens server-side. The frontend communicates only with the agent backend over HTTP.

No secret is ever included in HTTP response bodies, SSE events, or log output. The agent backend uses `pydantic.SecretStr` for the Gemini key; the MCP server validates the TMDB key is present at startup and never serializes it.
