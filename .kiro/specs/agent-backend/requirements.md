# Requirements Document

## Introduction

The Agent Backend is a Python-based FastAPI service that sits between a frontend client and the existing MCP wrapper microservice. It discovers available movie tools from the MCP wrapper at startup, registers them dynamically as LangChain tools bound to a Gemini language model, and exposes a stateless chat API that the frontend uses to send conversation history and receive assistant responses with a trace of tool calls made during the run.

The service holds the Gemini API key but does not hold the TMDB API key — that boundary remains inside the MCP wrapper. All movie data is fetched exclusively through the MCP wrapper's HTTP API.

## Glossary

- **Agent_Backend**: The FastAPI service described in this document.
- **MCP_Wrapper**: The existing microservice reachable at `MCP_BASE_URL` that exposes movie tools via HTTP.
- **LangChain_Tool**: A callable registered with the LangChain agent executor, backed by a POST call to the MCP wrapper.
- **Agent_Executor**: The LangChain component that orchestrates the Gemini model and LangChain tools to fulfil a user request.
- **Tool_Registry**: The in-memory collection of LangChain tools discovered from the MCP wrapper at startup.
- **MCP_Client**: The internal HTTP client (httpx-based) responsible for all communication with the MCP wrapper.
- **Chat_Request**: A JSON payload sent by the frontend containing the full conversation history.
- **Chat_Response**: A JSON payload returned by the Agent_Backend containing the assistant message and a tool call trace.
- **Tool_Call_Trace**: An ordered list of tool invocations (name, input, output_summary) captured during a single agent run.
- **output_summary**: A 1–2 sentence human-readable summary of a single tool call's result.
- **System_Prompt**: The instruction text that defines the agent's persona, tool-use policy, and response style.
- **Structured_Log**: A JSON log record emitted by structlog containing fields such as `request_id`, `endpoint`, `latency`, `tool_calls_made`, and `status`.
- **pydantic-settings**: The library used to load and validate environment variables at startup.

---

## Requirements

### Requirement 1: Service Startup and Tool Discovery

**User Story:** As a platform operator, I want the Agent Backend to discover available tools from the MCP wrapper at startup, so that the agent always reflects the current tool set without manual configuration.

#### Acceptance Criteria

1. WHEN the Agent_Backend starts, THE Agent_Backend SHALL call `GET MCP_BASE_URL/tools` to retrieve the list of available tools.
2. WHEN the MCP wrapper returns a valid tools list, THE Agent_Backend SHALL construct one LangChain_Tool per entry using the tool's `name`, `description`, and `input_schema` fields.
3. WHEN the MCP wrapper returns a valid tools list, THE Agent_Backend SHALL register all constructed LangChain_Tools with the Agent_Executor before accepting any requests.
4. IF the MCP wrapper is unreachable at startup, THEN THE Agent_Backend SHALL terminate with a non-zero exit code and emit a human-readable error message identifying the unreachable dependency.
5. IF the MCP wrapper returns an error response at startup, THEN THE Agent_Backend SHALL terminate with a non-zero exit code and include the error code and message in the startup failure output.
6. THE Agent_Backend SHALL derive each LangChain_Tool's argument schema from the `input_schema` JSON Schema field returned by the MCP wrapper.

---

### Requirement 2: Configuration and Secrets Management

**User Story:** As a platform operator, I want all required configuration to be validated at startup, so that the service fails fast with a clear message rather than crashing at runtime due to missing environment variables.

#### Acceptance Criteria

1. THE Agent_Backend SHALL load `GEMINI_API_KEY` and `MCP_BASE_URL` from environment variables using pydantic-settings.
2. IF `GEMINI_API_KEY` is absent or empty at startup, THEN THE Agent_Backend SHALL terminate with a non-zero exit code and emit a message identifying the missing variable.
3. IF `MCP_BASE_URL` is absent or empty at startup, THEN THE Agent_Backend SHALL terminate with a non-zero exit code and emit a message identifying the missing variable.
4. THE Agent_Backend SHALL load a `.env` file in development environments via python-dotenv.
5. THE Agent_Backend SHALL never include `GEMINI_API_KEY` or `MCP_BASE_URL` credentials in log output, error responses, or any API response body.

---

### Requirement 3: POST /chat Endpoint

**User Story:** As a frontend developer, I want a stateless chat endpoint that accepts the full conversation history and returns the assistant's reply with a tool call trace, so that the frontend can display both the answer and the reasoning steps.

#### Acceptance Criteria

1. WHEN a `POST /chat` request is received with a valid body, THE Agent_Backend SHALL pass the full message history to the Agent_Executor and return an HTTP 200 response.
2. THE Agent_Backend SHALL accept a request body matching the schema `{ "messages": [{ "role": "user|assistant", "content": "string" }] }`.
3. THE Agent_Backend SHALL return a response body matching the schema `{ "message": { "role": "assistant", "content": "string" }, "tool_calls": [{ "tool": "string", "input": {}, "output_summary": "string" }] }`.
4. THE Agent_Backend SHALL populate `tool_calls` with one entry per LangChain_Tool invocation made during the agent run, in invocation order.
5. THE Agent_Backend SHALL set each `output_summary` to a human-readable string of no more than two sentences summarising the tool call result.
6. WHEN no tools are invoked during an agent run, THE Agent_Backend SHALL return an empty `tool_calls` array.
7. IF the request body fails schema validation, THEN THE Agent_Backend SHALL return HTTP 422 with the error envelope `{ "error": { "code": "VALIDATION_ERROR", "message": "string" } }`.
8. IF the Gemini API returns an error during a run, THEN THE Agent_Backend SHALL return HTTP 502 with the error envelope `{ "error": { "code": "LLM_ERROR", "message": "string" } }`.
9. IF the MCP wrapper is unreachable during a run, THEN THE Agent_Backend SHALL return HTTP 503 with the error envelope `{ "error": { "code": "MCP_UNAVAILABLE", "message": "string" } }`.

---

### Requirement 4: MCP Client and Tool Error Translation

**User Story:** As a platform operator, I want MCP wrapper errors to be translated into agent-readable tool errors rather than crashing the agent, so that the agent can reason about failures and respond gracefully to the user.

#### Acceptance Criteria

1. WHEN the MCP wrapper returns an error envelope `{ "error": { "code": string, "message": string } }` for a tool call, THE MCP_Client SHALL return the error information as a structured tool error that the Agent_Executor can process.
2. WHEN the MCP wrapper returns an HTTP 4xx response for a tool call, THE MCP_Client SHALL translate the response into a tool error without raising an unhandled exception.
3. WHEN the MCP wrapper returns an HTTP 5xx response for a tool call, THE MCP_Client SHALL translate the response into a tool error without raising an unhandled exception.
4. IF the MCP wrapper is unreachable during a tool call (connection refused, timeout), THEN THE MCP_Client SHALL raise a typed exception that the Agent_Backend maps to HTTP 503.
5. THE MCP_Client SHALL never propagate raw HTTP response bodies containing potential secrets or internal stack traces to the frontend.

---

### Requirement 5: GET /health Endpoint

**User Story:** As a platform operator, I want a health endpoint that reports the service status and MCP wrapper reachability, so that monitoring systems can detect degraded states without invoking the agent.

#### Acceptance Criteria

1. WHEN `GET /health` is called, THE Agent_Backend SHALL return HTTP 200 with a body containing `status`, `version`, and `mcp_status` fields.
2. THE Agent_Backend SHALL cache the `mcp_status` value and refresh it at most once per 60 seconds.
3. WHEN the MCP wrapper is reachable, THE Agent_Backend SHALL set `mcp_status` to `"ok"`.
4. WHEN the MCP wrapper is unreachable, THE Agent_Backend SHALL set `mcp_status` to `"unreachable"` and still return HTTP 200.
5. THE Agent_Backend SHALL set `version` to the service version string defined in the application configuration.

---

### Requirement 6: GET /tools Endpoint

**User Story:** As a frontend developer, I want to query which tools are currently registered, so that I can display or debug the agent's capabilities without inspecting server logs.

#### Acceptance Criteria

1. WHEN `GET /tools` is called, THE Agent_Backend SHALL return HTTP 200 with the list of currently registered LangChain_Tools.
2. THE Agent_Backend SHALL include each tool's `name` and `description` in the response.
3. THE Agent_Backend SHALL never include `GEMINI_API_KEY`, `MCP_BASE_URL`, or any other secret in the `/tools` response.

---

### Requirement 7: System Prompt

**User Story:** As a product owner, I want the agent's persona, tool-use policy, and response style to be defined in an externalised, version-controlled prompt, so that the agent's behaviour can be reviewed and updated without code changes.

#### Acceptance Criteria

1. THE Agent_Backend SHALL load the System_Prompt from `app/agent/prompt.py` at startup.
2. THE Agent_Backend SHALL pass the System_Prompt to the Agent_Executor so that it governs every agent run.
3. THE System_Prompt SHALL define the agent as a movie recommendation assistant.
4. THE System_Prompt SHALL instruct the agent on when to use each available tool.
5. THE System_Prompt SHALL encourage the agent to chain multiple tools when a single tool call is insufficient to answer the user's request.
6. THE System_Prompt SHALL instruct the agent to never fabricate movie data and to rely exclusively on tool results.
7. THE System_Prompt SHALL define a helpful, concise, and opinionated recommendation tone.
8. THE Agent_Backend SHALL export the System_Prompt content to `docs/PROMPTS.md` for documentation purposes.

---

### Requirement 8: Structured Logging

**User Story:** As a platform operator, I want every request to produce a structured JSON log record, so that I can query logs by request ID, endpoint, latency, and tool usage without parsing free-form text.

#### Acceptance Criteria

1. THE Agent_Backend SHALL emit one Structured_Log record per handled request using structlog.
2. THE Structured_Log SHALL include `request_id`, `endpoint`, `latency`, `tool_calls_made`, and `status` fields.
3. THE Agent_Backend SHALL assign a unique `request_id` to each incoming request.
4. THE Agent_Backend SHALL never include `GEMINI_API_KEY` or any other secret value in any log record.

---

### Requirement 9: CORS Configuration

**User Story:** As a frontend developer, I want the Agent Backend to allow cross-origin requests from the frontend origin, so that browser-based clients can call the API without CORS errors.

#### Acceptance Criteria

1. THE Agent_Backend SHALL configure CORS middleware to allow requests from the configured frontend origin.
2. THE Agent_Backend SHALL allow `POST` and `GET` HTTP methods in CORS preflight responses.
3. THE Agent_Backend SHALL allow the `Content-Type` and `Authorization` headers in CORS preflight responses.

---

### Requirement 10: SSE Streaming for Chat Responses

**User Story:** As a frontend developer, I want the chat endpoint to support Server-Sent Events streaming, so that the assistant's response can be displayed word-by-word as it is generated rather than waiting for the full response.

#### Acceptance Criteria

1. WHERE the client requests SSE streaming, THE Agent_Backend SHALL stream the assistant's response tokens via Server-Sent Events on the `POST /chat` endpoint.
2. WHERE the client requests SSE streaming, THE Agent_Backend SHALL emit a final SSE event containing the complete Tool_Call_Trace after the response tokens are exhausted.
3. WHERE the client does not request SSE streaming, THE Agent_Backend SHALL return the full Chat_Response as a single JSON body.

---

### Requirement 11: Dockerfile and Containerisation

**User Story:** As a platform operator, I want a production-ready Dockerfile for the Agent Backend, so that the service can be built and deployed as a container without additional configuration.

#### Acceptance Criteria

1. THE Agent_Backend SHALL include a multi-stage Dockerfile using a Python slim base image.
2. THE Dockerfile SHALL produce an image that starts the Agent_Backend via uvicorn.
3. THE Dockerfile SHALL not embed `GEMINI_API_KEY` or `MCP_BASE_URL` in the image; those values SHALL be supplied at runtime via environment variables.

---

### Requirement 12: Test Coverage

**User Story:** As a developer, I want a targeted test suite that validates tool loading, error translation, and the end-to-end chat flow, so that regressions in critical paths are caught without requiring a live Gemini or TMDB connection.

#### Acceptance Criteria

1. THE test suite SHALL include a unit test that verifies LangChain_Tool construction given a mock MCP tools response, asserting that tool names, descriptions, and argument schemas are correctly mapped.
2. THE test suite SHALL include a unit test for the `GET /tools` endpoint asserting that the response shape matches the registered tool list.
3. THE test suite SHALL include a unit test for MCP_Client error translation, asserting that 4xx and 5xx MCP responses produce structured tool errors rather than unhandled exceptions.
4. THE test suite SHALL include one integration test for `POST /chat` that mocks the Gemini LLM to return a predetermined tool call sequence and mocks the MCP wrapper, asserting that the response shape is correct and that `tool_calls` captures all invocations.
5. THE test suite SHALL NOT test LLM output quality, middleware behaviour, or aim for line coverage targets.
