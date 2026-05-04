# Prompts Used During Development

This document captures the prompts used throughout the development of `movie-agent-mcp`. The prompts are organized in three parts: (0) early idea exploration, where strategic decisions about tooling and feature scope were made before any code was written; (1) initial component specs in Kiro, where requirements, design, and tasks were generated before implementation; and (2) refinement and debugging prompts used during integration and testing.

The intent is to show how the project was actually built — not just the polished output, but the iterative loop of explore → spec → review → generate → test → debug → fix.

---

## Part 0: Idea Exploration

Before any spec was written, two strategic questions needed answers: which agentic IDE to build in, and which public API to wrap. Both decisions were made deliberately, with the project rubric explicitly in mind.

### Tech Stack Decisions

The project required three distinct services, and the initial instinct was to go all-Node: one runtime across the MCP wrapper and the agent backend, one package manager, one test framework, one Dockerfile pattern. Consistency has real value — fewer moving parts, less context-switching, simpler local dev. But before committing, I wanted a sanity check.

> I m thinking of using Node for both the MCP server and agent backend. Does that actually make sense, or should i keep the agent side in Python??

The pushback was clear: the agent backend isn't just another HTTP service. It's a LangChain host with a Gemini integration, structured output validation, and property-based testing on the response contract. All of that tooling lives in Python first and gets ported to Node second — and the ported versions consistently lag the originals. Forcing the agent layer into Node would mean accepting a worse fit on the part of the stack that matters most.

So the stack split:

**Node.js + TypeScript for the MCP Server.** The MCP wrapper is almost pure I/O — receive a request, call TMDB, normalize the response, return it. Node's event-loop model handles concurrent outbound HTTP without thread overhead, and TypeScript with Zod gives strong typing on both the inbound contract and the inconsistent shapes coming back from TMDB. Express keeps the surface area small. This was the part where Node actually was the right call.

**Python + FastAPI for the Agent Backend.** The Python ecosystem owns the agentic-AI tooling. LangChain, the Google Gemini SDK, Pydantic v2, structlog, and Hypothesis for property-based testing are all first-class in Python and second-class everywhere else. FastAPI's async-native design plus its native SSE support via `StreamingResponse` made the streaming chat endpoint straightforward. Pydantic v2 with `extra="forbid"` enforces the request contract at the boundary, so invalid inputs fail at parsing rather than deep in the agent loop.

**React + TypeScript + Vite for the Frontend.** React is the obvious default for chat UIs — component model, controlled inputs, `useReducer` for the streaming state machine. Vite's dev loop is fast enough that iteration on the SSE rendering felt cheap. TypeScript on this side closes the loop: the same contract the Pydantic models enforce on the agent backend is mirrored as a discriminated union for SSE events on the frontend, so any drift between agent and UI is caught at compile time.

The polyglot architecture turned out to reinforce the trust boundary story — three services, three runtimes, each holding only the secrets and dependencies it needs. What started as "which language?" ended up as "each language where it earns its place."

### Public API Selection: Open-Meteo vs TMDB

The brief requires a public API with free access keys. Several options met the bar (Open-Meteo for weather, TMDB for movies, NewsAPI, PokéAPI), but they aren't equivalent under the rubric.

> Why would weather be a better pick than movies/TV for this? or is TMDB actually stronge for demo?

The honest comparison: Open-Meteo has lower setup cost (no key required) and universal relatability for reviewers, but a thinner tool surface — mostly parallel queries (current vs forecast vs air quality), not chained reasoning. TMDB has a richer multi-step tool surface (`search → details → recommendations → discover`) that exercises LangChain's tool-calling model more honestly, plus visually richer responses (posters, ratings) that make for a stronger demo video.

Picked TMDB. The chained tool calls are a stronger demonstration of agent reasoning than weather queries, and the cards-on-screen UX gives the video a clear visual moment when recommendations come back. The cost (one extra API key to manage) was small relative to the demo gain.

---

## Part 1: Component Specs

These are the five prompts that drove the initial spec generation in Kiro for each component. Each produced a `requirements.md`, `design.md`, and `tasks.md` triple under `.kiro/specs/`. The specs were reviewed and edited before code generation in every case.

### Spec 1 — MCP Server

The architectural centerpiece. This spec was deliberately verbose because the MCP wrapper's contract becomes the input artifact for every downstream component.


> Create a spec for a MCP-style server that wraps the TMDB public REST API.
>
> I want this to be a small microservice where TMDB features are exposed as proper tool-callable endpoints. This will be used by a seperate LangChain agent backend in Python, so dont make it like a generic API proxy. Each endpoint should feel like one clear tool that the agent can call.
>
> Tech
>
> Node.js with TypeScript (strict mode)
> Express for HTTP
> Axios for request/response
> dotenv
> pino for logging
> Package for request/response validation
>
> Required tools
>
> The server should expose each tool as a POST endpoint under /tools/{tool_name}, accept JSON input, and return normalised JSON:
> 
> search_movies — search by title and keywords
> Input: {query: string, year?: number}
> Output: {results: array{id, title, year, overview, poster_url, rating}}
> get_movie_details — fetch full details for a TMDB movie ID
> Input: {movie_id: number}
> Output: full movie object including genres, runtime, cast (top 5), director, keywords
> discover_movies — filtered category
> Input: any combination of {genre?, min_rating?, year_from?, year_to?, keywords?}
> Output: {results: [...]}
> get_recommendations — get TMDB's recommendations for a given movie
> Input: {movie_id: number}
> Output: {results: [...]}
> get_trending — get trending movies for a time window
> Input: {window: "day" | "week"}
> Output: {results: [...]}
> get_movie_id — get TMDB movie id based on name or other filters
> Input: {query: string, year?: number}
>
> Architecture requirements
>
> Express/Node folder structure: src/routes, src/services, src/schemas, src/types, src/lib/. Dont put business logic in routes.
> Use one TMDB client instance with the API key coming from env. Make sure the API key never shows up in logs, errors, responses, or payloads.
> Consistent error envelope: {error: {code, message}}
> Normalize responses because TMDB gives inconsistent shapes sometimes, like poster_path being partial, genres coming as IDs in some places and full objects in others, etc.
> Add health check and tools discovery.
>
> Non-functional
>
> Dockerfile
> Structured logging using pino
> Handle TMDB rate limits properly, dont just crash
> Proper error codes with defined info
> Generate a contracts.md for API request/response
> README with setup, required env vars, local run steps, and curl commands
> No auth, no persistence, no caching
>
> Deliverables: requirements.md, design.md, tasks.md, contracts.md.

### Spec 2 — Agent Backend

After reviewing the MCP wrapper's `contracts.md`, this spec consumed it directly. Trust boundaries were called out explicitly so the agent backend would never hold the TMDB key.

> Create a spec for the agent backend service that consumes the MCP wrapper tools and exposes a chat API for the frontend.
>
> Context:
>
> The MCP wrapper is a seperate microservice running at MCP_BASE_URL. Its contract is in docs/contracts.md:
> GET /tools returns avilable tools with input schemas
> POST /tools/{toolname} invokes a tool and returns normalised JSON
> Error envelope: {error: {code, message}}
> Keep the trust boundary cleer here. The agent backend owns the Gemini API key, but it should not have the TMDB API key at all.)
>
> Purpose
>
> Build a FastAPI service that:
>
> Discovers tools from the MCP wrapper when the app starts
> Registers them dynmically as LangChain tools connected to Gemini
> Exposes one stateless POST /chat endpoint that runs the agent and returns the answr, plus a trace of what tool calls happend
> 
> Stack: Python 3.11, FastAPI + uvicorn, LangChain, langchain-google-genai, httpx, pydantic v2, python-dotenv, structlog.
> 
> Endpoints:
> 
> POST /chat — stateless. Frontend will send the full convesation history. Response should be: {message: {role, content}, tool_calls: [{tool, input, output_summary}]}. Keep output_summary short and human-frndly, not some huge raw json.
> GET /health — returns status, version, mcp_status (cached / refeshed every minute))
> GET /tools — returns the currently registred LangChain tools, basically mirroed from MCP
> 
> Folder structure: app/main.py, app/api.py, app/agent.py, app/mcp.py, app/schemas.py, app/config.py, app/logging.py, tests/
> 
> Dynamic tool loading at startup:
> 
> Call /tools to discover avilable tools
> For each tool, create a LangChain StructuredTool whose function POSTs to MCP_BASE_URL/tools/{name} with the input
> Register those tools with the agent executor
> If the MCP wrapper is unreachble at startup, fail loudly with a clear messege, dont silently continoue and break later)
>
> The LangChain tool descrption should come from the MCP tool schema. The args schema should be derieved from the JSON schema returned by MCP, so we dont hardcode tool inputs twicce.
>
> System prompt:
> Externalise it to app/agent/prompt.py and export it to docs/PROMPTS.md. Define the agent as a movie recomendation assistant. Tell it when to use each tool, encourge tool chaining, dont let it make up movie data, and keep the tone helpfull, concise, and a little opinionated.)
>
> Tool call tracing:
> The agent executor should capture each tool invokation during the run: name, input, and output. After the run, summarize each tool call into a short human readable string, max 1–2 sentnces. Dont dump the whole tool respnse in the trace.
>
> Error handling:
>
> MCP wrapper returns errors → transalte it to a tool error the agent can reason about, dont crash the full agent
> MCP wrapper unreachable mid-reqeust → return 503 with a clear msg
> Gemini errors → return 502 with a clear msg
> Validation errors → 422
> All errors should return strutured envelope: {error: {code, message}}
>
> Secrets:
>
> GEMINI_API_KEY, MCP_BASE_URL via env (.env loaded in dev))
> API keys should never appear in logs, errors, resposnes, or the /tools endpoint
> Validate config at startup using pydantic-settings, dont let bad config fail in randm places later))
>
> Non-functional:
>
> CORS configured for frontend orgin
> Structured JSON logs with reqeust id, endpoint, latncy, tool calls made, and status
> Dockerfile using multi-stage python slim base
> Generate PROMPTS.md at repo root with the full system prompt, raitonale for each instruction, and example tool-chaining senarios
> README in package
> Add SSE for word-by-word ouput from the server
>
> Tests:
>
> Unit test for tools loaded using mock MCP response, and /tools response with correct shape
> Unit test for MCP client error transaltion
> One integration test for /chat where LLM is mocked with a fixed tool-call seqence, and MCP wrapper is mocked too))
> Dont test LLM output quality, dont test middlware, and dont chase covrage numbers for no reason
>
> Out of scope: No convesation history, no auth, no rate limiting.
>
> Deliverables: requirements.md, design.md, tasks.md, prompts.md.

### Spec 3 — Movie Cards (mid-build refinement)

Added after the agent backend was working but before the frontend was started. The decision was to enrich the agent's response with structured movie data so the frontend could render cards without parsing prose.

> I want to extnd the /chat response so the agent can return structurd movie data along with its normal prose respons. The frontend will use that datta to render movie cards. The agent should not decide which cards to show, keep that determinstic in a post-processer based on the tools the agent actully used.)
>
> Updated Response Contract should include array movies with all the required fields in {}
>
> Rules:
>
> movies is optinal. Omit it, or use an empty arrray, when the agent did not invok a movie-returning tool.
> Deduplicte movies by id.
> Max 5 movies per respons.
> Presrve the order movies appeared in the source tool ouput.
> If TMDB does not give a feild, keep it null. Never make it up]
>
> Updated Response Contract, SSE Mode
>
> Add a new event type. Emit it ONCE between the final token event and the tool_calls event:
>
> Event	Payload	When emitted
> token	(unchanged)
> movies	{type: "movies", movies: Array<Movie>}	Once after tokens, before tool_calls. Ommited if no movies.
> tool_calls	(unchanged)	
> error	(unchanged)	
> done	(unchanged)	
>
> Post-processor implementation:
>
> Add a new moduel: app/agent/movie_extractor.py. Function signiture:
>
> def extract_movies(intermediate_steps: list, max_count: int = 5) -> list[Movie]
>
> Behavior:
>
> Iterrate intermediate_steps in order from the LangChain agent run.
> For each step where the tool name is in {search_movies, get_recommendations, discover_movies, get_trending}, parse the tool ouput, which is the MCP wrapper's normalized respons.
> Extrct movies from the output's results arrray.
> Deduplicte by id, preserving first seen order.
> Return upto max_count movies.
> If a tool call erorred, skip it silently dont raise.]
>
> Wiring:
> 
> In JSON mode handler: after the agent run, call extract_movies(result["intermediate_steps"]) and attch it to message.movies.
> In SSE handler: after the final token is emited but before the tool_calls event, call extract_movies and emit the movies event only if non-empty]
>
> Updated Pydantic models:
> add movies as mentioned in mcp_wrapper
>
> Tests (addition only):
>
> Unit test for extract_movies: use fixture intermediate_steps with mixd tool calls, movie-returning, non-movie-returning, duplictes, and erorred ones, then assert extracton, dedup, and max_count.
> Update existing /chat integration test: assert respons includes movies field with correct shape.
> Update SSE test: assert movies event is emited in the right positon in the stream.
>
> CONTRACTS.md updates: add new movies feild in JSON example, new SSE movies event, and extracton policy note.
>
> Before coding this, first design the workflow. Tell me how this change afects the current working project, what might brek, and exactly which files / areas we need to touch. Then we can decide]

### Spec 4 — Frontend

Consumed the agent backend's `CONTRACTS.md` directly. The SSE event order (token → movies → tool_calls → done) was specified explicitly so the frontend's reducer state machine could be designed against the exact wire protocol.

> Create a spec for a React + TypeScript frontend chat app that consumes the agent backend's /chat API and shows the agent's reasonng using inline tool pills and prose-driven movie cards.
> 
> Context:
> 
> Agent backend is a seperate service (Python/FastAPI) at AGENT_BASE_URL. Contract is in ../agent-backend/CONTRACTS.md:
> POST /chat: accepts {messages: [{role, content}]}. Returns JSON by defualt, or SSE when Accept: text/event-stream is set.
> GET /tools: returns {tools: [{name, description}]}
> GET /health: returns {status, version, mcp_status}
> Error envelope: {error: {code, message}}
> Keep this as a simple UI for the project breif. Dont add extra featuers unless they directly suport the demo.)
> 
> Tech stack: Vite + React 18 + TypeScript (strict), Tailwind CSS (dark theme), useReducer for state, native fetch + ReadableStream for SSE (no third-party libary), no router.
> 
> Layout: single-page chat. Top bar with app title and health indicater. Main column around max-width ~720px with message list and input box. Right side pannel on desktop (collapsible), hidden on mobile, showing avilable tools))
> 
> Core features:
> 
> Chat message list — user/assistant messages, tool pills above message text after tool_calls event, streamed assistant text, and movie strip beneath the messsage after movies event.
> Tool call pills — clickable and expandable, showing tool name, descrption, input JSON, and output summary. Allow multiple expanded at once.
> Movie cards — render directly from agent's movies array. No parsing text and no heuristics. Horizantal scrollable strip of MovieCard components under the message.
> Available tools panel — populated from GET /tools, refeshes when /health recovers.
> Input box — multiline textarea, Enter to send, disbaled while streaming.
> Conversation state — useReducer at top level. No persistance.
> 
> SSE event flow (match the agent contract exactly):
> 
> token (many) → movies (0 or 1) → tool_calls (1) → done (1)
> 
> Start with a "Thinking…" state, append tokens in real time, then render movies, then render tool pills.
> 
> Architecture:
> 
> src/components/: ChatMessage, ToolCallPill, ToolPanel, Input, HealthIndicator, MovieCard, MovieStrip, ThinkingIndicator, ErrorBanner
> src/hooks/: useChat, useTools, useHealth
> src/lib/: api.ts, sse.ts (pure parser), types.ts, reducer.ts
> 
> Type safety: Use a discriminated union for ChatStreamEvent so event handling stays exhausitve and doesnt miss any case.
> 
> State management: Use useReducer and not useState, because token events fire alot and useState can get messy fast. Wrap ChatMessage in React.memo with a custom comparater. Reducer actions: ADD_USER_MESSAGE, START_ASSISTANT_MESSAGE, APPEND_TOKEN, SET_MOVIES, SET_TOOL_CALLS, COMPLETE_MESSAGE, SET_ERROR.
> 
> Error handling: Map error codes to user-facing messeges. Pre-stream errors should be handled by reading the JSON envelope. Keep errors non-blocking, dont crash the whole chat UI for one failed reqeust}
> 
> Tests: One smoke test for full chat flow with mocked SSE, and one SSE parser unit test for chunking, buffering, and malformed JSON. Dont test individual componets, Tailwind classes, or covrage targets.
> 
> Out of scope: No persistance, no progressive tool events, no reconnecton, no auth, no light mode toggle.
> 
> Deliverables: requirements.md, design.md (component tree, data flow, reducer state machine, SSE parser flow), tasks.md ordered for incremental delivery.


Note: the `ToolPanel` component, `useHealth` hook, and `HealthIndicator` were spec'd here but removed during implementation as redundant with the inline tool pills. The `useTools` hook was retained but simplified to populate tool descriptions for the expanded pill view. The relevant spec sections are marked `[Removed during implementation]` in `.kiro/specs/chat-frontend/`.

### Spec 5 — Top-Level Repo Artifacts

> After the three components were built, this prompt generated the root README, docker-compose, architecture diagram, and DECISIONS.md.
> 
> Generate the top-level repo artifacts for movie-agent-mcp, a monorepo with three services: mcp-server (Node/TS, port 3000), agent-backend (Python/FastAPI, port 8000), and frontend (React/TS/Vite, port 5173). Each service already has its own README, Dockerfile, .env.example, and CONTRACTS.md, so dont regenrate those again.
> 
> Project summary: A full-stack agentic app for movie discovery. The frontend chats with a Gemini/LangChain agent that discovers tools dynmically from an MCP-style microservice wrapping the TMDB API. The agent streams respons using SSE. Tool calls show as expandable pills, and movies mentiond by the agent in prose show as cards below the responce.)
> 
> Generate at the repo root:
> 
> README.md with sections: project descrption, architecture (with reference to docs/architecture.png and trust boundries breakdown), "Why This Shape", Quick Start (docker compose), Manual Setup (per-service), project structure tree, "How a Request Flows" (with SSE event seqence), Tech Stack table, deploymnt shape (not hosted live), documentation philosphy, testing summary, MIT license.
> docker-compose.yml with three services, healthchecks chaining dependncy order, no volumes, service names as hostnames.
> .env.example with TMDB_API_KEY and GEMINI_API_KEY, plus comments for where to get each one))
> .gitignore covering env files, node_modules, Python bytecode/venvs, build outputs, IDE folders, OS files, and logs.
> docs/architecture.md — Mermaid graph TB diagram with User, Frontend subgraph, Agent Backend subgraph (labeled with secret), MCP Server subgraph (labeled with secret), external TMDB and Gemini APIs, dotted arrows for LLM calls and discovery, dark-theme color classes.
> DECISIONS.md — architectural decision log. Keep it short: one paragraph per decision (decision → alternative → rationale): dynmic tool registration, stateless agent backend, prose-driven movie extracton, SSE over WebSocket, per-service trust boundries, LangChain over LangGraph, TypeScript strict + Pydantic v2.
> 
> Constraints: Do NOT regenrate per-service files. Do NOT include live deploymnt URLs. Do NOT add CI/CD. Keep the root README under ~250 lines and easy to skim in 2 mins. Make sure evrything matches the existing CONTRACTS.md files and PROMPTS.md.)
---

## Part 2: Refinement and Debugging

These are smaller, targeted prompts used during integration and testing. They show how Kiro was used as an iterative debugging partner, not just a one-shot code generator. Listed roughly chronologically.

### Process Check Before Implementation

Before implementing the movie-cards feature mid-build, asked Kiro to map the impact across existing code rather than starting straight in. The response identified which files would change and which would stay untouched, which let me commit to the change with full visibility into the blast radius.

> First map the workflow for this change. How will it affect the stuff that already works, what files do we need to touch, and what could break? Dont start coding yet.

### Architectural Pivot: Prose-Driven Movie Extraction

The initial movie-cards design surfaced all movies returned by tools. After thinking through the UX, switched to surfacing only films the agent actually mentioned by name in its prose response, ordered by mention position. This kept the visual output (cards) tightly aligned with the verbal output (text), so the user never sees a card the agent didn't recommend.

> What if we only include movie data for titles the LLM actually mentions in the response, and keep the cards in that same order?

### Dynamic System Prompt Construction

Caught a coupling problem: the system prompt was hardcoding the tool list, which would drift if the MCP server added or removed a tool. Refactored to inject the tool section dynamically at startup from the live discovery response, so the prompt and the tool registry can never drift apart.

> Since we fetch tools live, can you also build the prompt from the live tool list instead of hardcoding it? I dont want stale tool info in the prompt.

### Pushing Back on a Test-Concern Leak

When a sub-agent added a `CreateAppOptions` parameter to the production app factory purely to make logging injectable for a security test, pushed back — that's a test concern leaking into the public API surface. The cleaner pattern is to mock the logger module in the test using `jest.mock`, the same pattern already used for the TMDB client. Production code stayed unchanged.

> Why did you add `CreateAppOptions` in `app.ts`? Feels like test logic leaking into prod code.

### Test Discipline Question

Rather than assuming new tests were needed for the `get_genre_id` tool, asked whether the existing project pattern required them. The answer (yes — integration test, schema property test, discovery-count test update) ensured the new tool stayed consistent with the rest of the codebase.

> Do we need tests for this new tool if we follow the current project pattern?

### Bug Fix: Movie Card False Positive (the Mummy bug)

Real-world testing surfaced a false positive in the movie extractor. When the agent's prose mentioned "The Mummy" (1999, 2017, 1932), the extractor's substring match also caught a separate TMDB film titled just "Mummy" (rating 0) and rendered it as a card the agent never recommended.

Asked Kiro to enumerate fix options with their tradeoffs:

> What are the options to make the title matching stricter? List the tradeoffs too.

The response listed five approaches: word-boundary regex, exact title match, title+year disambiguation, length-based threshold, longest-match preference. Picked exact title matching (option 2) — the agent already produces precise titles per the system prompt, and this eliminates a class of false positives without requiring more sophisticated logic.

> Okay implement option 2.

The fix included a regression test that locks in the behavior: a candidate `Mummy` (2020) does not match prose that says "The Mummy from 1999," because exact-phrase matching with word boundaries on both sides correctly distinguishes the two titles.

---

## Notes on Prompt Style

- **Idea-exploration prompts are short and open-ended.** They surface tradeoffs before committing to a direction. The point isn't to get an answer; it's to make the implicit decision criteria explicit.
- **Spec prompts are deliberately verbose.** They include architectural constraints ("strict mode"), security requirements ("API key must never appear in logs"), and explicit out-of-scope sections. The verbosity front-loads decisions that would otherwise be made implicitly during code generation.
- **Refinement prompts are deliberately terse.** They state the symptom, the suspected cause, and the desired outcome — letting Kiro propose the implementation.
- **Every prompt was reviewed and the generated output was edited where needed.** The committed code is not raw Kiro output. Specs were reviewed before code generation in every case; design documents were edited to push back on choices that didn't match the project's needs (folder structure, error envelope shape, test scope).