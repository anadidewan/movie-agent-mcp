# Implementation Plan: Agent Backend

## Overview

Build a stateless FastAPI service (`agent_backend/`) that bridges the frontend and the existing MCP wrapper. The service discovers tools from the MCP wrapper at startup, registers them as LangChain `StructuredTool` instances bound to a Gemini model, and exposes `/chat`, `/health`, and `/tools` endpoints. Implementation proceeds layer by layer: project scaffold → config/schemas → MCP client → agent core → API routes → streaming → logging/CORS → tests → Dockerfile + docs.

## Tasks

- [x] 1. Scaffold project structure and install dependencies
  - Create the full directory tree under `agent_backend/` as specified (app/, app/agent/, tests/unit/, tests/integration/)
  - Create all `__init__.py` files
  - Create `agent_backend/requirements.txt` with pinned versions: `fastapi`, `uvicorn[standard]`, `httpx`, `langchain`, `langchain-google-genai`, `pydantic`, `pydantic-settings`, `structlog`, `python-dotenv`, `pytest`, `pytest-asyncio`, `hypothesis`, `respx`
  - Create `agent_backend/.env.example` with placeholder values for `GEMINI_API_KEY`, `MCP_BASE_URL`, `FRONTEND_ORIGIN`, `VERSION`, `LOG_LEVEL`
  - _Requirements: 2.1, 11.1_

- [x] 2. Implement configuration and Pydantic schemas
  - [x] 2.1 Implement `app/config.py` — `Settings` class
    - Define `Settings(BaseSettings)` with fields: `gemini_api_key: SecretStr`, `mcp_base_url: AnyHttpUrl`, `frontend_origin: str = "http://localhost:3000"`, `version: str = "0.1.0"`, `log_level: str = "INFO"`
    - Configure `SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Implement `app/schemas.py` — all Pydantic v2 models
    - Define `MessageRole` enum (`user`, `assistant`)
    - Define `Message`, `ChatRequest` (with `extra="forbid"`), `ToolCall`, `AssistantMessage`, `ChatResponse`, `ErrorDetail`, `ErrorResponse`
    - Define `HealthResponse`, `ToolInfo`, `ToolsResponse`
    - Define `ToolDescriptor` (internal model for MCP tool list)
    - _Requirements: 3.2, 3.3, 5.1, 6.1, 6.2_

- [x] 3. Implement MCP client
  - [x] 3.1 Implement `app/mcp_client.py` — `MCPUnavailableError` and `MCPClient`
    - Define `MCPUnavailableError(url, cause)` exception class
    - Implement `MCPClient.__init__(base_url)` — creates `httpx.AsyncClient`
    - Implement `get_tools() -> list[ToolDescriptor]` — GET `{base_url}/tools`, parse response into `ToolDescriptor` list
    - Implement `call_tool(name, args) -> str` — POST `{base_url}/tools/{name}`, return JSON string on 200; on 4xx/5xx parse error envelope and return `"Error [CODE]: message"` string; on non-JSON body return `"Error [PARSE_ERROR]: Unexpected response from tool server"`; on connection error/timeout raise `MCPUnavailableError`
    - Implement `ping() -> bool` — GET `{base_url}/health`, return True on 200, False on error, raise `MCPUnavailableError` on connection failure
    - Implement `close()` — close the `httpx.AsyncClient`
    - _Requirements: 1.1, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 3.2 Write unit tests for MCP error translation (`tests/unit/test_mcp_error_translation.py`)
    - Test 400 response with valid error envelope → returns tool error string, no exception
    - Test 404 response → returns tool error string
    - Test 500 response → returns tool error string
    - Test connection error → raises `MCPUnavailableError`
    - Test non-JSON response body → returns `"Error [PARSE_ERROR]: ..."` string
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 3.3 Write property tests for MCP error translation (`tests/unit/test_mcp_error_translation.py`)
    - **Property 3: MCP error translation — no unhandled exceptions**
    - Generate random 4xx/5xx status codes and random error envelopes; assert `call_tool()` never raises and always returns a non-empty string
    - **Property 4: MCP error strings contain structured information**
    - Generate random `{ "error": { "code": C, "message": M } }` envelopes; assert returned string contains both `C` and `M`
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 4. Checkpoint — MCP client tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement dynamic tool loading and agent construction
  - [x] 5.1 Implement `app/agent/prompt.py` — `SYSTEM_PROMPT` constant
    - Define the agent as a movie recommendation assistant
    - Include per-tool guidance for `search_movies`, `discover_movies`, `get_trending`, `get_movie_details`, `get_recommendations`, `get_movie_id`, `get_genre_id`
    - Instruct the agent to chain tools when a single call is insufficient
    - Forbid fabricating movie data; require exclusive reliance on tool results
    - Define a helpful, concise, opinionated recommendation tone
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 5.2 Implement `app/agent.py` — `build_args_schema`, `build_tool`, `build_agent`
    - Implement `json_schema_type_to_python(field_schema) -> type` with the full type mapping table (string→str, integer→int, number→float, boolean→bool, array→list, object→dict, unknown→str)
    - Implement `build_args_schema(tool_name, input_schema) -> type[BaseModel]` using `pydantic.create_model()`; wrap optional fields in `Optional[T]` with `default=None`
    - Implement `build_tool(descriptor, mcp_client) -> StructuredTool` — creates async `tool_func` closure, returns `StructuredTool(name, description, args_schema, coroutine=tool_func)`
    - Implement `build_agent(tool_descriptors, settings) -> AgentExecutor` — constructs `ChatGoogleGenerativeAI` using `settings.gemini_api_key.get_secret_value()`, assembles prompt from `SYSTEM_PROMPT`, returns configured `AgentExecutor`
    - _Requirements: 1.2, 1.3, 1.6, 7.1, 7.2_

  - [x] 5.3 Write unit tests for tool loading (`tests/unit/test_tool_loading.py`)
    - Test `build_args_schema()` maps each JSON Schema type to the correct Python type
    - Test optional fields (not in `required`) become `Optional[T]` with `default=None`
    - Test `build_tool()` produces a `StructuredTool` with correct `name`, `description`, `args_schema`
    - Test with the `search_movies` descriptor: assert `query: str` (required) and `year: Optional[int]`
    - _Requirements: 1.2, 1.6_

  - [x] 5.4 Write property test for tool construction completeness (`tests/unit/test_tool_loading.py`)
    - **Property 1: Tool construction completeness and fidelity**
    - Generate random `ToolDescriptor` lists (1–20 items) with varying names, descriptions, and JSON Schema shapes
    - Assert output tool count equals input descriptor count
    - Assert each tool's `name` and `description` match the corresponding descriptor
    - Assert each tool's `args_schema` field names match the descriptor's `properties` keys
    - **Validates: Requirements 1.2, 1.3, 1.6**

- [x] 6. Implement `summarise_output` and tool call tracing
  - [x] 6.1 Implement `summarise_output(raw_output: str) -> str` in `app/agent.py`
    - Parse raw output as JSON; if `results` key present: `"Found N result(s). Top titles: X, Y, Z."`
    - If `error` key present: `"Tool returned error CODE: message."`
    - Single-object responses: summarise key fields via `_summarise_object(data)`
    - Fallback: truncate to 200 chars
    - _Requirements: 3.5_

  - [x] 6.2 Implement `run(executor, messages) -> ChatResponse` in `app/agent.py`
    - Await `executor.ainvoke()` with formatted message history
    - Iterate `result["intermediate_steps"]` (list of `(AgentAction, raw_output)` tuples)
    - Build `ToolCall` list using `summarise_output()` for each step
    - Return `ChatResponse(message=AssistantMessage(content=...), tool_calls=[...])`
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6_

- [x] 7. Implement API routes
  - [x] 7.1 Implement `app/api.py` — `HealthCache` class and route handlers
    - Implement `HealthCache` with `asyncio.Lock`, TTL=60s, double-check locking pattern
    - Implement `GET /health` handler — uses `HealthCache.get_mcp_status()`, returns `HealthResponse`
    - Implement `GET /tools` handler — reads `app.state.executor.tools`, returns `ToolsResponse` with `name` and `description` only (no secrets)
    - Implement `POST /chat` handler — inspects `Accept` header; if `text/event-stream` returns `StreamingResponse` backed by `astream_run()`; otherwise awaits `run()` and returns `JSONResponse`
    - Map `MCPUnavailableError` → HTTP 503, `LLMError` → HTTP 502, `RequestValidationError` → HTTP 422 with `ErrorResponse` envelope
    - _Requirements: 3.1, 3.7, 3.8, 3.9, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3_

  - [x] 7.2 Write unit tests for GET /tools endpoint (`tests/unit/test_tools_endpoint.py`)
    - Test returns HTTP 200
    - Test response shape matches `ToolsResponse`
    - Test each entry contains non-empty `name` and `description`
    - Test no secret values appear in the response body
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 7.3 Write property test for GET /tools completeness (`tests/unit/test_tools_endpoint.py`)
    - **Property 6: GET /tools response completeness**
    - Generate random tool lists of size 1–20; register them at startup via mock
    - Assert response contains exactly N entries with matching names and descriptions
    - Assert no secret values appear in any response field
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 7.4 Write unit tests for GET /health endpoint (`tests/unit/test_health.py`)
    - Test returns HTTP 200 with `status`, `version`, `mcp_status` fields
    - Test `mcp_status` is `"ok"` when MCP is reachable
    - Test `mcp_status` is `"unreachable"` when MCP is not reachable, still returns HTTP 200
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 7.5 Write property test for health cache TTL (`tests/unit/test_health.py`)
    - **Property 8: Health cache — at most one MCP call per TTL window**
    - Simulate N concurrent/sequential calls to `GET /health` within a mocked 60-second window
    - Assert `MCPClient.ping()` is called at most once
    - **Validates: Requirements 5.2**

- [x] 8. Checkpoint — API route tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement SSE streaming
  - [x] 9.1 Implement `astream_run(executor, messages) -> AsyncGenerator[str, None]` in `app/agent.py`
    - Use `executor.astream_events()` to yield SSE-formatted strings
    - Emit `data: {"type":"token","content":"..."}\n\n` for each LLM output chunk
    - Emit `data: {"type":"tool_calls","tool_calls":[...]}\n\n` once after all tokens, using the same `intermediate_steps` tracing logic as `run()`
    - Emit `data: {"type":"error","code":"...","message":"..."}\n\n` on agent error
    - Emit `data: {"type":"done"}\n\n` as the final event
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 9.2 Write property test for SSE/non-SSE trace equivalence (`tests/integration/test_streaming.py`)
    - **Property 10: SSE streaming tool call trace completeness**
    - Generate random tool call sequences; run both streaming and non-streaming modes with the same mock executor
    - Assert the `tool_calls` content (name, input) is identical in both modes
    - **Validates: Requirements 10.2**

- [x] 10. Implement structured logging and CORS middleware
  - [x] 10.1 Implement `app/logging.py` — structlog configuration
    - Configure structlog with JSON renderer
    - Ensure `SecretStr` values are never serialised (use `__repr__` masking)
    - _Requirements: 8.1, 8.4_

  - [x] 10.2 Implement request-ID middleware and per-request log record in `app/main.py`
    - Inject a unique `request_id` UUID into each request's context
    - Emit one structlog record per handled request with fields: `request_id`, `endpoint`, `latency`, `tool_calls_made`, `status`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 10.3 Configure CORS middleware in `app/main.py`
    - Allow requests from `settings.frontend_origin`
    - Allow `POST` and `GET` methods
    - Allow `Content-Type` and `Authorization` headers
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 10.4 Write property test for structured log record shape (`tests/unit/test_logging.py`)
    - **Property 7: Structured log record shape**
    - Generate random request inputs; capture structlog output
    - Assert each request produces exactly one JSON record with all required fields (`request_id`, `endpoint`, `latency`, `tool_calls_made`, `status`)
    - Assert `request_id` is a non-empty string unique across concurrent requests
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 11. Implement `app/main.py` — app factory and lifespan
  - Implement `lifespan(app)` async context manager: instantiate `Settings`, create `MCPClient`, call `get_tools()` (raises `MCPUnavailableError` → log + `sys.exit(1)`), call `build_agent()`, store executor/client/settings on `app.state`, yield, then `await mcp_client.close()`
  - Construct `FastAPI` app with `lifespan=lifespan`
  - Register CORS middleware, request-ID middleware, and structlog middleware
  - Include the router from `api.py`
  - _Requirements: 1.4, 1.5, 2.2, 2.3_

- [x] 12. Write integration and property tests for POST /chat
  - [x] 12.1 Write integration test for POST /chat (`tests/integration/test_chat.py`)
    - Use `httpx.AsyncClient` with `ASGITransport`
    - Mock `MCPClient.get_tools()` → two fixed `ToolDescriptor` instances
    - Mock `MCPClient.call_tool()` → predetermined JSON string
    - Mock `ChatGoogleGenerativeAI` → returns `AIMessage` with one tool call then a final text response
    - Assert HTTP 200, `message.role == "assistant"`, `message.content` matches mock, `tool_calls` has exactly one entry, `tool_calls[0].output_summary` is non-empty and ≤ two sentences
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 12.4_

  - [x] 12.2 Write property test for tool call trace completeness (`tests/integration/test_chat.py`)
    - **Property 2: Tool call trace completeness**
    - Generate random sequences of tool call actions (1–10 steps); mock executor to return those steps as `intermediate_steps`
    - Assert `tool_calls` in the response contains exactly one entry per step, in order, with correct `tool` name and `input` values
    - **Validates: Requirements 3.4**

  - [x] 12.3 Write property test for invalid request bodies (`tests/integration/test_chat.py`)
    - **Property 9: Invalid request bodies produce 422**
    - Generate invalid `ChatRequest` bodies (wrong role value, missing `content`, non-array `messages`, extra forbidden fields)
    - Assert each returns HTTP 422 with `error.code == "VALIDATION_ERROR"`
    - **Validates: Requirements 3.7**

- [x] 13. Write secret safety property test
  - [x] 13.1 Write property test for secret leakage (`tests/unit/test_secret_safety.py`)
    - **Property 5: Secret values never appear in outputs**
    - Generate random API key strings; configure `Settings` with each key
    - Run a full request cycle (chat, health, tools endpoints)
    - Capture all log output and response bodies
    - Assert the raw key string never appears in any captured output
    - **Validates: Requirements 2.5, 6.3, 8.4**

- [x] 14. Checkpoint — full test suite passes
  - Run `pytest agent_backend/tests/ -v` and ensure all non-optional tests pass, ask the user if questions arise.

- [x] 15. Write Dockerfile and README
  - [x] 15.1 Write `agent_backend/Dockerfile`
    - Multi-stage build: `builder` stage installs dependencies from `requirements.txt` into a venv; `final` stage copies venv and app source from `python:3.11-slim`
    - Final stage sets `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`
    - No `GEMINI_API_KEY` or `MCP_BASE_URL` baked into the image
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 15.2 Write `agent_backend/README.md`
    - Document environment variables, local dev setup, how to run tests, and how to build/run the Docker image
    - _Requirements: 11.1_

- [x] 16. Export system prompt documentation
  - Create `docs/PROMPTS.md` containing:
    - Full `SYSTEM_PROMPT` text (copied from `app/agent/prompt.py`)
    - Rationale for each instruction section
    - Example tool chaining scenarios (at least three: genre + year filter, trending + details, search + recommendations)
  - _Requirements: 7.8_

- [x] 17. Final checkpoint — wire everything together
  - Verify `app/main.py` imports and wires all modules correctly (config, mcp_client, agent, api, logging)
  - Verify `app/api.py` router is included in the FastAPI app
  - Verify all `__init__.py` files export the public API of each module
  - Run `pytest agent_backend/tests/ -v` one final time; ensure all non-optional tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints at tasks 4, 8, 14, and 17 ensure incremental validation
- Property tests validate the 10 universal correctness properties defined in the design document
- Unit tests validate specific examples and error conditions
- No live Gemini API key or TMDB connection is required to run the test suite — all external dependencies are mocked
