# Reelify — Chat Frontend

A React 18 + TypeScript single-page chat UI for the movie recommendation agent. Streams agent responses over SSE, renders inline tool-call pills, and displays movie cards with poster art beneath the agent's prose.

Built with Vite, Tailwind CSS (dark theme only), and vitest.

## Architecture

The frontend is a single-page app with no router. It communicates exclusively with the Agent Backend over HTTP.

```
User → InputBox → useChat hook → POST /chat (SSE) → Agent Backend
                                      ↓
                    parseSSEStream (async generator)
                                      ↓
                    chatReducer (useReducer)
                                      ↓
                    ChatMessageList → ChatMessage (React.memo)
                                      ├── ToolCallPill (expandable)
                                      ├── Message text (streaming)
                                      ├── MovieStrip → MovieCard
                                      └── ErrorBanner
```

### Key Design Decisions

- **useReducer over Redux/Zustand** — single conversation, no global state needed.
- **Native fetch + ReadableStream** — `EventSource` doesn't support POST. No third-party SSE library.
- **React.memo with custom comparator** — only the actively streaming message re-renders per token.
- **Pure-function SSE parser** — zero React/DOM dependencies, fully unit-testable.

### SSE Event Flow

The agent backend streams events in this order:

1. `token` (many) — incremental LLM output, rendered progressively
2. `movies` (0 or 1) — structured movie data, rendered as poster cards
3. `tool_calls` (1) — tool invocation trace, rendered as expandable pills
4. `done` (1) — stream complete, input re-enabled

### Components

| Component | Purpose |
|---|---|
| `App` | Root component, owns hooks, renders layout |
| `TopBar` | App title ("🎬 Reelify") |
| `ChatMessageList` | Scrollable message container with auto-scroll and `aria-live` |
| `ChatMessage` | Single message bubble (React.memo), renders pills/text/movies/errors |
| `ToolCallPill` | Expandable pill showing tool name, input JSON, output summary |
| `MovieCard` | 140×220px card with poster, title, year, rating |
| `MovieStrip` | Horizontal scrollable container for MovieCards |
| `InputBox` | Auto-growing textarea, Enter to send, Shift+Enter for newline |
| `ThinkingIndicator` | Pulsing "Thinking…" shown before first token |
| `ErrorBanner` | Maps error codes to user-friendly messages |

### Hooks

| Hook | Purpose |
|---|---|
| `useChat` | Manages conversation state via useReducer, owns SSE stream lifecycle |
| `useTools` | Fetches tool registry from `GET /tools` for pill descriptions |

### Folder Structure

```
src/
├── components/
│   ├── TopBar.tsx
│   ├── ChatMessageList.tsx
│   ├── ChatMessage.tsx
│   ├── ToolCallPill.tsx
│   ├── MovieCard.tsx
│   ├── MovieStrip.tsx
│   ├── InputBox.tsx
│   ├── ThinkingIndicator.tsx
│   └── ErrorBanner.tsx
├── hooks/
│   ├── useChat.ts          # reducer + SSE stream
│   └── useTools.ts         # GET /tools registry
├── lib/
│   ├── types.ts            # TypeScript types matching backend contract
│   ├── api.ts              # Typed fetch wrappers
│   └── sse.ts              # Pure SSE parser (async generator)
├── App.tsx
├── main.tsx
└── index.css               # Tailwind v4 + dark theme
```

## Prerequisites

- Node.js 20+
- pnpm

## Setup

```bash
cd chat_frontend
pnpm install
cp .env.example .env
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `VITE_AGENT_BASE_URL` | Base URL of the Agent Backend | `http://localhost:8000` |

## Development

```bash
pnpm run dev
```

Opens at http://localhost:5173. The Agent Backend must be running at `VITE_AGENT_BASE_URL`.

## Production Build

```bash
pnpm run build
```

Output goes to `dist/`.

## Tests

```bash
pnpm run test
```

Uses vitest with jsdom and `@testing-library/react`. The test suite covers:

- **SSE parser** — multi-event chunks, split-event buffering, malformed JSON recovery, implicit termination
- **Chat reducer** — all 7 action types, immutability, status transitions
- **Components** — ChatMessage rendering (pills, text, movies, errors), InputBox keyboard handling, MovieCard/MovieStrip rendering

## Docker

```bash
docker build -t reelify-frontend .
docker run -p 5173:80 reelify-frontend
```

The app is served by nginx on port 80 inside the container.

`VITE_AGENT_BASE_URL` is baked in at build time. To change it:

```bash
docker build --build-arg VITE_AGENT_BASE_URL=http://your-backend:8000 -t reelify-frontend .
```
