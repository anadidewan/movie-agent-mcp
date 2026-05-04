# Implementation Plan: Chat Frontend (Reelify)

## Overview

Build a single-page React 18 + TypeScript chat application that consumes the Agent Backend's `/chat` API over SSE. The implementation proceeds incrementally: project scaffolding → pure-function SSE parser → state management hook → layout and input components → message rendering components → movie components → error handling → tests → deployment artifacts. Each step builds on the previous, and no code is left unwired.

## Tasks

- [x] 1. Project scaffolding and type definitions
  - [x] 1.1 Scaffold Vite + React 18 + TypeScript project
    - Initialize a new Vite project in `chat_frontend/` with the `react-ts` template
    - Install dependencies: `react`, `react-dom`, `tailwindcss`, `@tailwindcss/vite`
    - Install dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
    - Configure `tsconfig.json` with `strict: true`
    - Configure Tailwind CSS with dark theme as the only theme in `src/index.css`
    - Configure vitest in `vite.config.ts` with jsdom environment
    - _Requirements: 1.1, 1.5, 4.5, 14.1, 15.3_

  - [x] 1.2 Create type definitions and API wrappers
    - Create `src/lib/types.ts` with all types: `Movie`, `ToolCall`, `ToolInfo`, `HealthStatus`, `ErrorDetail`, `ErrorEnvelope`, `ChatStreamEvent` (discriminated union), `MessageStatus`, `Message`
    - Create `src/lib/api.ts` with typed fetch wrappers: `postChatStream()`, `fetchTools()`, `fetchHealth()`, and the `ApiError` class
    - Use `VITE_AGENT_BASE_URL` from environment, defaulting to `http://localhost:8000`
    - Create `.env.example` with `VITE_AGENT_BASE_URL=`
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [x] 2. SSE parser utility
  - [x] 2.1 Implement the SSE parser as a pure async generator
    - Create `src/lib/sse.ts` with `parseSSEStream()` async generator and `parseSegment()` helper
    - Buffer UTF-8 text chunks and split on `\n\n` boundaries
    - Handle multi-event chunks by yielding each event separately in order
    - Handle split-event chunks by buffering partial data across reads
    - Skip malformed JSON without throwing (return null from `parseSegment`)
    - Signal implicit termination by yielding a synthetic `done` event when the stream closes without one
    - No React or DOM dependencies — pure function only
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 3. useChat hook with reducer
  - [x] 3.1 Implement the chat reducer
    - Create `src/hooks/useChat.ts` with `ChatState`, `ChatAction` types, and `chatReducer` function
    - Implement all reducer actions: `ADD_USER_MESSAGE`, `START_ASSISTANT_MESSAGE`, `APPEND_TOKEN`, `SET_MOVIES`, `SET_TOOL_CALLS`, `COMPLETE_MESSAGE`, `SET_ERROR`
    - `APPEND_TOKEN` transitions `pending` → `streaming` on first token, then appends content
    - `SET_ERROR` preserves partial content and sets `isStreaming: false`
    - `COMPLETE_MESSAGE` sets `isStreaming: false`
    - All mutations produce new state objects (immutable updates)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 3.2 Implement the useChat hook
    - Implement `useChat()` hook returning `{ messages, isStreaming, sendMessage }`
    - `sendMessage` dispatches `ADD_USER_MESSAGE` and `START_ASSISTANT_MESSAGE`, then calls `postChatStream()` with full conversation history
    - Iterate `parseSSEStream()` async generator, dispatching the appropriate action for each event type
    - Catch `ApiError` for pre-stream HTTP errors and dispatch `SET_ERROR`
    - Use `AbortController` to cancel in-flight streams on unmount via `useEffect` cleanup
    - Send `Accept: text/event-stream` header via `postChatStream()`
    - _Requirements: 3.9, 3.10_

- [x] 4. Layout shell, InputBox, ThinkingIndicator, and TypingIndicator
  - [x] 4.1 Implement the App root component and layout shell
    - Create `src/components/App.tsx` as the root component owning `useChat` and `useTools` hooks
    - Create `src/components/TopBar.tsx` with app title "🎬 Reelify"
    - Render full viewport height dark background (`bg-gray-950 text-gray-100`)
    - Render centered main column with `max-w-3xl` (~720px), flex column, scrollable
    - [Removed during implementation] ~~Render `ToolPanel` on the right side~~
    - Ensure usability on viewports as narrow as 360px
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Implement InputBox component
    - Create `src/components/InputBox.tsx` with multiline textarea and send button
    - Auto-grow textarea up to ~6 rows
    - Cmd+Enter (macOS) / Ctrl+Enter sends the message
    - Enter without modifier inserts a newline
    - Send button disabled while `disabled` prop is true (streaming in flight)
    - Clear content and refocus textarea after send
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 4.3 Implement ThinkingIndicator component
    - Create `src/components/ThinkingIndicator.tsx` with pulsing "Thinking…" text using Tailwind `animate-pulse`
    - Displayed when assistant message status is `pending`
    - Replaced by message content when first token arrives
    - _Requirements: 6.1, 6.2_

  - [x] 4.4 Implement ChatMessageList component
    - Create `src/components/ChatMessageList.tsx` as a vertically scrolling container
    - Use `aria-live="polite"` for screen reader announcements
    - Auto-scroll to bottom on new messages
    - Render `ChatMessage` for each message in the array
    - _Requirements: 13.2_

- [x] 5. Checkpoint — Verify layout and input
  - Ensure all components compile and render without errors, ask the user if questions arise.

- [x] 6. ChatMessage and ToolCallPill components
  - [x] 6.1 Implement ChatMessage component
    - Create `src/components/ChatMessage.tsx` wrapped in `React.memo` with custom comparator (compare `id`, `content.length`, `status`, `tool_calls.length`, `movies.length`)
    - Render user messages right-aligned with accent background
    - Render assistant messages left-aligned with neutral background
    - Display `ThinkingIndicator` when status is `pending`
    - Display message text when status is `streaming` or `complete`
    - Render content in vertical order: tool call pills → message text → movie strip → error banner
    - Use semantic HTML: `article` for message containers
    - _Requirements: 3.11, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 13.1_

  - [x] 6.2 Implement ToolCallPill component
    - Create `src/components/ToolCallPill.tsx` with collapsed and expanded states
    - Collapsed: "🔧 {tool_name} — {first sentence of output_summary}"
    - Expanded: tool name (monospace), description from registry, input as formatted JSON (monospace), output_summary
    - Use `<button>` for the toggle element
    - Keyboard accessible: Enter/Space toggles expansion
    - Multiple pills can be expanded simultaneously (local state per pill)
    - Visible focus indicators on the toggle button
    - Pills render only after `tool_calls` SSE event arrives (all at once)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 13.3, 13.4_

- [x] 7. MovieCard and MovieStrip components
  - [x] 7.1 Implement MovieCard component
    - Create `src/components/MovieCard.tsx` with fixed width (~140px) and fixed height
    - Display poster thumbnail from `poster_url`, or neutral placeholder when null
    - Display title (1-2 lines, truncated with ellipsis)
    - Display year (small, muted, hidden when null) and rating with star icon (small, hidden when null)
    - Subtle scale-up effect on hover (`transform scale-105`)
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 7.2 Implement MovieStrip component
    - Create `src/components/MovieStrip.tsx` as a horizontal scrollable container
    - Smooth scrolling on touch and trackpad (`scroll-smooth`, `overflow-x-auto`)
    - Right-edge gradient fade when content overflows
    - Render nothing when movies array is empty
    - _Requirements: 8.4, 8.5, 8.6_

- [x] 8. ~~ToolPanel and HealthIndicator~~ [Removed during implementation]
  - [x] 8.1 ~~Implement HealthIndicator component~~ [Removed during implementation]
    - ~~Create `src/components/HealthIndicator.tsx` rendering a small colored dot (green, amber, red)~~
    - ~~Include `aria-label` for accessibility~~
    - ~~_Requirements: 10.1, 10.2, 10.3_~~

  - [x] 8.2 ~~Implement useHealth hook~~ [Removed during implementation]
    - ~~Create `src/hooks/useHealth.ts` that polls `GET /health` every 30 seconds~~
    - ~~Map response to color: green (both ok), amber (mcp unreachable), red (network error/non-200)~~
    - ~~Return `{ color, status }`~~
    - ~~_Requirements: 10.4_~~

  - [x] 8.3 ~~Implement useTools hook~~ [Removed during implementation]
    - ~~Create `src/hooks/useTools.ts` that fetches `GET /tools` on mount~~
    - ~~Expose `{ tools, loading, error, refetch }`~~
    - ~~Re-fetch when health transitions from non-green to green~~
    - ~~_Requirements: 9.1, 9.5_~~
    - _Note: A simplified useTools hook remains (fetches on mount only, no health parameter) to build the tool registry for ToolCallPill descriptions._

  - [x] 8.4 ~~Implement ToolPanel component~~ [Removed during implementation]
    - ~~Create `src/components/ToolPanel.tsx` with header "Available Tools" and tooltip~~
    - ~~Display each tool as a card: name (monospace) + description (1-2 lines)~~
    - ~~On error: "Could not load tools" with retry button~~
    - ~~Visible on `lg:` screens, collapsible toggle on smaller screens~~
    - ~~_Requirements: 9.1, 9.2, 9.3, 9.4_~~

- [x] 9. Checkpoint — Verify full component integration
  - Ensure all components render correctly together and chat messages display with tool pills and movie cards. Ask the user if questions arise.

- [x] 10. ErrorBanner and error event handling
  - [x] 10.1 Implement ErrorBanner component
    - Create `src/components/ErrorBanner.tsx` that maps error codes to user-friendly messages
    - `LLM_ERROR` → "The AI service had an issue — try again."
    - `MCP_UNAVAILABLE` → "The movie data service is unavailable — try again in a moment."
    - `VALIDATION_ERROR` → "Something went wrong with your request."
    - Unknown codes → "Unexpected error. Try again."
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 10.2 Wire error handling into useChat and App
    - Handle pre-stream HTTP errors (4xx/5xx): read JSON error envelope, dispatch `SET_ERROR` with mapped message
    - Handle SSE `error` events: dispatch `SET_ERROR`, preserve partial content
    - Handle unexpected stream close (no `done` event): preserve partial content, mark message as complete, display soft warning
    - Re-enable InputBox after error (isStreaming set to false)
    - _Requirements: 12.5, 12.6, 12.7_

- [ ] 11. Smoke test and SSE parser unit test
  - [ ]* 11.1 Write SSE parser unit tests
    - Create `src/lib/__tests__/sse.test.ts` using vitest
    - Test multi-event chunks: a single chunk containing multiple `data:` lines separated by `\n\n` yields each event in order
    - Test split-event chunks: an event split across two chunks is correctly buffered and parsed
    - Test malformed JSON recovery: invalid JSON in a `data:` line is skipped, subsequent valid events still yield
    - Test implicit termination: stream closing without a `done` event yields a synthetic `done`
    - Mock SSE streams using `ReadableStream` with pre-defined chunks
    - _Requirements: 15.2, 15.4_

  - [ ]* 11.2 Write App smoke test
    - Create `src/__tests__/App.test.tsx` using vitest and `@testing-library/react`
    - Mock `fetch` to return a `ReadableStream` emitting pre-defined SSE chunks for `/chat`, and JSON responses for `/tools` and `/health`
    - Render the App, type a message, send it
    - Assert: assistant message renders progressively as token events arrive
    - Assert: movie cards render after the `movies` event
    - Assert: tool call pills render after the `tool_calls` event
    - _Requirements: 15.1, 15.3, 15.4_

- [x] 12. Dockerfile, README, and .env.example
  - [x] 12.1 Create Dockerfile
    - Multi-stage build: Node alpine for build stage, nginx alpine for serve stage
    - Build stage: install deps, run `npm run build`
    - Serve stage: copy `dist/` to nginx html directory
    - Expose port 80
    - _Requirements: 14.2_

  - [x] 12.2 Create README
    - Document setup instructions and prerequisites
    - Document environment variables (`VITE_AGENT_BASE_URL`)
    - Document how to run the dev server (`npm run dev`)
    - Document how to build for production (`npm run build`)
    - Document how to point at the Agent Backend
    - Document Docker build and run commands
    - _Requirements: 14.3_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The SSE parser is implemented first as a pure function so it can be tested independently before wiring into React
- The useChat hook is built next so all subsequent UI components can consume real state
- Components are built inside-out: layout shell → message rendering → specialized components → error handling
- Tests come near the end since they exercise the full integrated stack
