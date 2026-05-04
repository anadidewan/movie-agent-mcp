# Requirements Document — Chat Frontend (Reelify)

## Introduction

Reelify is a single-page React + TypeScript chat application that consumes the Agent Backend's `/chat` API over Server-Sent Events. It visualizes the agent's reasoning through inline tool-call pills and renders prose-driven movie cards beneath assistant messages. The application is a demonstration UI for the end-to-end agent experience — not a production product. It uses Vite, Tailwind CSS (dark theme only), and native `fetch` + `ReadableStream` for SSE transport.

## Glossary

- **App**: The top-level React component that owns conversation state and renders the page layout.
- **Chat_Message_List**: The vertically scrolling container that displays all user and assistant messages in chronological order.
- **Chat_Message**: A single message bubble in the conversation, rendered differently for user and assistant roles.
- **Tool_Call_Pill**: A compact inline element displaying a tool invocation summary, expandable to show full details.
- **Movie_Card**: A fixed-size card component displaying a movie poster thumbnail, title, year, and rating.
- **Movie_Strip**: A horizontal scrollable container holding zero or more Movie_Card children beneath an assistant message.
- **Tool_Panel**: [Removed during implementation] ~~A collapsible right-side panel listing all tools the agent has registered, populated from `GET /tools`.~~
- **Health_Indicator**: [Removed during implementation] ~~A small colored dot in the top bar reflecting the reachability of the Agent Backend and its MCP connection.~~
- **Input_Box**: A multiline textarea with a send button at the bottom of the main column for composing messages.
- **Thinking_Indicator**: A pulsing "Thinking…" placeholder shown between request dispatch and the first SSE token event.
- **Typing_Indicator**: A visual cue shown while tokens are actively streaming into an assistant message.
- **Error_Banner**: An inline error message rendered within an assistant message bubble when an error event arrives.
- **SSE_Parser**: A pure-function utility that consumes a `ReadableStream<Uint8Array>`, buffers UTF-8 text chunks, splits on `\n\n` boundaries, and yields parsed `ChatStreamEvent` objects.
- **Chat_Reducer**: A `useReducer`-based state machine managing the messages array and message status transitions.
- **Agent_Backend**: The external FastAPI service at `VITE_AGENT_BASE_URL` that provides `/chat`, `/tools`, and `/health` endpoints.
- **VITE_AGENT_BASE_URL**: A Vite environment variable specifying the base URL of the Agent Backend (default `http://localhost:8000`).

## Requirements

### Requirement 1: Project Foundation and Type Safety

**User Story:** As a developer, I want a well-structured Vite + React + TypeScript project with strict type definitions matching the Agent Backend contract, so that I can build features on a reliable foundation.

#### Acceptance Criteria

1. THE App SHALL be scaffolded as a Vite project with React 18, TypeScript in strict mode, and Tailwind CSS configured with a dark theme as the only theme.
2. THE App SHALL define TypeScript types in `src/lib/types.ts` matching the Agent Backend contract: `Movie`, `ToolCall`, `ChatStreamEvent` (discriminated union), `Message`, `Tool`, and `HealthStatus`.
3. THE App SHALL use `VITE_AGENT_BASE_URL` from the environment for all API requests, defaulting to `http://localhost:8000` when the variable is not set.
4. THE App SHALL provide typed fetch wrappers in `src/lib/api.ts` for `POST /chat`, `GET /tools`, and `GET /health` that return typed responses.
5. THE App SHALL include a `.env.example` file at the package root containing `VITE_AGENT_BASE_URL=` with no value assigned.

### Requirement 2: SSE Stream Parsing

**User Story:** As a developer, I want a robust SSE parser that handles chunked streaming, buffering, and all event types, so that the chat hook can reliably process the Agent Backend's streaming responses.

#### Acceptance Criteria

1. THE SSE_Parser SHALL consume a `ReadableStream<Uint8Array>` and yield parsed `ChatStreamEvent` objects by buffering UTF-8 text chunks and splitting on `\n\n` boundaries.
2. WHEN a chunk arrives that contains an incomplete SSE event (no trailing `\n\n`), THE SSE_Parser SHALL buffer the partial data and combine it with subsequent chunks before parsing.
3. WHEN a chunk arrives that contains multiple complete SSE events, THE SSE_Parser SHALL yield each event separately in order.
4. WHEN a `data:` line contains invalid JSON, THE SSE_Parser SHALL skip that event and continue processing subsequent events without throwing.
5. WHEN the stream closes without a `done` event, THE SSE_Parser SHALL signal implicit termination to the consumer.
6. THE SSE_Parser SHALL be implemented as a pure function in `src/lib/sse.ts` with no dependencies on React or DOM APIs.

### Requirement 3: Conversation State Management

**User Story:** As a user, I want my conversation to flow naturally with the agent, with messages appearing progressively as the agent responds, so that I can follow the agent's reasoning in real time.

#### Acceptance Criteria

1. THE Chat_Reducer SHALL manage the messages array using `useReducer` with the following actions: `ADD_USER_MESSAGE`, `START_ASSISTANT_MESSAGE`, `APPEND_TOKEN`, `SET_MOVIES`, `SET_TOOL_CALLS`, `COMPLETE_MESSAGE`, and `SET_ERROR`.
2. WHEN the user sends a message, THE App SHALL append the user message to the messages array and immediately dispatch `START_ASSISTANT_MESSAGE` to create a pending assistant message.
3. WHEN the first `token` event arrives for a pending assistant message, THE Chat_Reducer SHALL transition the message status from `pending` to `streaming`.
4. WHEN subsequent `token` events arrive, THE Chat_Reducer SHALL append each token's content to the active streaming message.
5. WHEN a `movies` event arrives, THE Chat_Reducer SHALL set the `movies` array on the active assistant message.
6. WHEN a `tool_calls` event arrives, THE Chat_Reducer SHALL set the `tool_calls` array on the active assistant message.
7. WHEN a `done` event arrives, THE Chat_Reducer SHALL transition the active message status to `complete`.
8. WHEN an `error` event arrives, THE Chat_Reducer SHALL set the error envelope on the active message, transition its status to `error`, and preserve any partial content already received.
9. THE App SHALL send the full conversation history to `POST /chat` with the `Accept: text/event-stream` header on every user message.
10. THE App SHALL use `fetch()` with a `ReadableStream` reader for SSE transport and use `AbortController` to cancel in-flight streams when the component unmounts.
11. THE Chat_Message component SHALL be wrapped in `React.memo`, comparing by message `id`, content length, status, and lengths of `tool_calls` and `movies` arrays, so that only the actively streaming message re-renders on each token.

### Requirement 4: Page Layout

**User Story:** As a user, I want a clean single-page layout with a centered chat column and a top bar, so that I can focus on the conversation.

#### Acceptance Criteria

1. THE App SHALL render a top bar containing the application title "Reelify".
2. THE App SHALL render a centered main column with a maximum width of approximately 720 pixels containing the Chat_Message_List and the Input_Box at the bottom.
3. [Removed during implementation] ~~THE App SHALL render the Tool_Panel as a right-side panel that is visible on screens wider than 1024 pixels and collapsed by default on narrower screens.~~
4. THE App SHALL be usable on viewports as narrow as 360 pixels, with the chat column filling the available width.
5. THE App SHALL use a dark theme as the only visual theme, implemented via Tailwind CSS.

### Requirement 5: Chat Message Rendering

**User Story:** As a user, I want to see my messages and the agent's responses clearly distinguished, with tool calls and movie cards integrated into the agent's response, so that I can understand what the agent did and what it recommends.

#### Acceptance Criteria

1. THE Chat_Message SHALL render user messages right-aligned with an accent background color.
2. THE Chat_Message SHALL render assistant messages left-aligned with a neutral background color.
3. WHEN an assistant message has a `pending` status, THE Chat_Message SHALL display the Thinking_Indicator in place of message content.
4. WHEN an assistant message has a `streaming` status, THE Chat_Message SHALL display the message text as it accumulates from token events.
5. WHEN an assistant message has a non-empty `tool_calls` array, THE Chat_Message SHALL render Tool_Call_Pill components above the message text.
6. WHEN an assistant message has a non-empty `movies` array, THE Chat_Message SHALL render a Movie_Strip component beneath the message text.
7. THE Chat_Message SHALL render its content in the vertical order: tool call pills, message text, movie strip.

### Requirement 6: Thinking and Typing Indicators

**User Story:** As a user, I want visual feedback that the agent is working on my request, so that I know the application has not frozen.

#### Acceptance Criteria

1. WHEN a request has been sent but no token events have arrived, THE Thinking_Indicator SHALL display a pulsing "Thinking…" text.
2. WHEN the first token event arrives, THE App SHALL replace the Thinking_Indicator with the assistant message bubble containing the streamed text.

### Requirement 7: Tool Call Pills

**User Story:** As a user, I want to see which tools the agent used and what they returned, so that I can understand the agent's reasoning process.

#### Acceptance Criteria

1. THE Tool_Call_Pill SHALL display in the format "🔧 {tool_name} — {first sentence of output_summary}" in its collapsed state.
2. WHEN the user clicks a Tool_Call_Pill, THE Tool_Call_Pill SHALL toggle an expandable panel below it showing: tool name in monospace, tool description looked up from the tools registry, input as formatted JSON in monospace, and the output summary.
3. WHEN multiple Tool_Call_Pill components are present, THE Tool_Call_Pill components SHALL allow multiple pills to be expanded simultaneously.
4. THE Tool_Call_Pill components SHALL be keyboard-accessible, toggling expansion on Enter or Space key press.
5. THE Tool_Call_Pill components SHALL render only after the `tool_calls` SSE event arrives, appearing all at once rather than progressively during streaming.

### Requirement 8: Movie Card and Movie Strip

**User Story:** As a user, I want to see movie recommendations as visual cards with poster, title, year, and rating, so that I can quickly scan the agent's suggestions.

#### Acceptance Criteria

1. THE Movie_Card SHALL display a poster thumbnail from `poster_url`, the movie title (truncated with ellipsis at 1-2 lines), the year (small and muted, hidden when null), and the rating with a star icon (small, hidden when null).
2. WHEN `poster_url` is null, THE Movie_Card SHALL display a neutral placeholder image.
3. THE Movie_Card SHALL have a fixed width of approximately 140 pixels and a fixed height, with a subtle scale-up effect on hover.
4. THE Movie_Strip SHALL render a horizontal scrollable container holding Movie_Card children with smooth scrolling on touch and trackpad.
5. WHEN the Movie_Strip content overflows its container, THE Movie_Strip SHALL display a subtle gradient fade on the right edge to indicate scrollability.
6. WHEN the `movies` array is empty or absent, THE Movie_Strip SHALL render nothing.

### Requirement 9: Available Tools Panel [Removed during implementation]

~~**User Story:** As a user, I want to see what tools the agent has available, so that I understand the agent's capabilities.~~

~~#### Acceptance Criteria~~

~~1. WHEN the App loads, THE Tool_Panel SHALL fetch the tool list from `GET /tools` and display each tool as a card with the tool name in monospace and the description in 1-2 lines.~~
~~2. THE Tool_Panel SHALL display a header "Available Tools" with a tooltip explaining "These are the tools the agent can call to answer your questions."~~
~~3. WHEN the screen width is narrower than 1024 pixels, THE Tool_Panel SHALL be collapsed by default and expandable via a toggle control.~~
~~4. IF `GET /tools` fails, THEN THE Tool_Panel SHALL display "Could not load tools" with a retry button.~~
~~5. WHEN the Health_Indicator transitions from red or amber to green, THE Tool_Panel SHALL re-fetch the tool list from `GET /tools`.~~

### Requirement 10: Health Indicator [Removed during implementation]

~~**User Story:** As a user, I want to see at a glance whether the agent backend is reachable, so that I know if my messages will be processed.~~

~~#### Acceptance Criteria~~

~~1. THE Health_Indicator SHALL display a green dot when `GET /health` returns `status: "ok"` and `mcp_status: "ok"`.~~
~~2. THE Health_Indicator SHALL display an amber dot when `GET /health` returns `status: "ok"` and `mcp_status: "unreachable"`.~~
~~3. THE Health_Indicator SHALL display a red dot when `GET /health` is unreachable (network error or non-200 response).~~
~~4. THE Health_Indicator SHALL poll `GET /health` every 30 seconds.~~

### Requirement 11: Input Box

**User Story:** As a user, I want a comfortable text input that supports multiline messages and keyboard shortcuts, so that I can compose messages efficiently.

#### Acceptance Criteria

1. THE Input_Box SHALL render a multiline textarea that auto-grows up to a maximum of approximately 6 rows.
2. THE Input_Box SHALL render a send button that is disabled while a request or stream is in flight.
3. WHEN the user presses Cmd+Enter (macOS) or Ctrl+Enter (other platforms), THE Input_Box SHALL send the current message.
4. WHEN the user presses Enter without a modifier key, THE Input_Box SHALL insert a newline.
5. WHEN a message is sent, THE Input_Box SHALL clear its content and refocus the textarea.

### Requirement 12: Error Handling

**User Story:** As a user, I want clear error messages when something goes wrong, so that I know what happened and can try again.

#### Acceptance Criteria

1. WHEN an `error` SSE event arrives with code `LLM_ERROR`, THE Error_Banner SHALL display "The AI service had an issue — try again."
2. WHEN an `error` SSE event arrives with code `MCP_UNAVAILABLE`, THE Error_Banner SHALL display "The movie data service is unavailable — try again in a moment."
3. WHEN an `error` SSE event arrives with code `VALIDATION_ERROR`, THE Error_Banner SHALL display "Something went wrong with your request."
4. WHEN an `error` SSE event arrives with an unrecognized code, THE Error_Banner SHALL display "Unexpected error. Try again."
5. WHEN a pre-stream HTTP error (4xx/5xx) occurs before the SSE body starts, THE App SHALL read the JSON error envelope and display the mapped error message in the Error_Banner.
6. WHEN an error occurs, THE App SHALL preserve any partial assistant message content already received and re-enable the Input_Box.
7. WHEN the SSE stream closes unexpectedly without a `done` event, THE App SHALL preserve partial content, mark the message as complete, and display a soft warning.

### Requirement 13: Accessibility

**User Story:** As a user who relies on assistive technology, I want the chat application to be navigable and readable, so that I can use it effectively.

#### Acceptance Criteria

1. THE App SHALL use semantic HTML elements: `button` for interactive controls, `article` for message containers, and appropriate heading levels.
2. THE Chat_Message_List SHALL use `aria-live="polite"` so that screen readers announce new messages as they arrive.
3. THE Tool_Call_Pill SHALL be focusable and operable via keyboard (Enter and Space to toggle expansion).
4. THE App SHALL display visible focus indicators on all interactive elements.

### Requirement 14: Build and Deployment

**User Story:** As a developer, I want a production-ready build pipeline and clear setup documentation, so that I can build and deploy the application.

#### Acceptance Criteria

1. THE App SHALL build to a `dist/` directory using Vite's production build.
2. THE App SHALL include a Dockerfile that uses a multi-stage build with nginx alpine to serve the static files from `dist/`.
3. THE App SHALL include a README documenting: setup instructions, environment variables, how to run the dev server, how to build for production, and how to point at the Agent Backend.

### Requirement 15: Testing

**User Story:** As a developer, I want minimal but meaningful tests that verify the core streaming and rendering behavior, so that I can catch regressions without maintaining a large test suite.

#### Acceptance Criteria

1. THE test suite SHALL include one smoke test that renders the App component with mocked `/chat` (SSE) and `/tools` endpoints, sends a message, and asserts that the assistant message renders progressively as tokens arrive and that movie cards and tool pills render after their respective events.
2. THE test suite SHALL include one unit test for the SSE_Parser that verifies correct handling of multi-event chunks, split-event chunks, and graceful recovery from JSON parse errors.
3. THE test suite SHALL use vitest and `@testing-library/react`.
4. THE test suite SHALL mock SSE streams by providing a `ReadableStream` that emits pre-defined chunks at controlled intervals.

## Out of Scope (Future Work)

- No conversation persistence (refresh starts a new chat).
- No progressive tool events (tool_calls arrives as a single batch per the Agent Backend contract).
- No reconnection on SSE disconnect (treat any disconnect as a hard error for v1).
- No authentication or user accounts.
- No analytics or telemetry.
- No internationalization.
- No light-mode toggle.
- No backpressure on token rate.
- No card click-to-followup interaction (stretch goal only).
