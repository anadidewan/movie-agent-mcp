# Requirements Document

## Introduction

Extend the Agent Backend's `/chat` response to include structured movie data alongside the assistant's prose response. A deterministic post-processor extracts movie data from tool call results, then filters to only include movies whose titles appear in the LLM's prose output. The frontend will render these as movie cards. This feature affects both JSON and SSE response modes, adds a new `Movie` Pydantic model, introduces a `movie_extractor` module, and updates the API contract documentation.

## Glossary

- **Agent_Backend**: The FastAPI service that orchestrates LLM calls and MCP tool invocations, exposing `/chat`, `/health`, and `/tools` endpoints.
- **Movie_Extractor**: A new deterministic post-processing module (`app/agent/movie_extractor.py`) that parses intermediate tool call results, filters to movies mentioned in the LLM's prose output, and returns structured movie data.
- **LLM_Content**: The text content of the assistant's prose response produced by the LLM for a given agent run.
- **Movie**: A Pydantic model representing a single movie with fields: `id`, `title`, `year`, `poster_url`, `rating`.
- **AssistantMessage**: The Pydantic model representing the assistant's reply in a `ChatResponse`, extended with an optional `movies` field.
- **ChatResponse**: The Pydantic model for the JSON-mode `/chat` response body.
- **Intermediate_Steps**: The ordered list of `(AgentAction, raw_output)` tuples produced by the LangChain `AgentExecutor` during a single agent run.
- **Movie_Returning_Tool**: Any MCP tool whose name is one of `search_movies`, `discover_movies`, `get_recommendations`, or `get_trending`.
- **SSE_Stream**: The Server-Sent Events response mode for `/chat`, activated by the `Accept: text/event-stream` header.
- **Movies_Event**: A new SSE event type (`{"type": "movies", "movies": [...]}`) emitted once per streaming response when movies are present.

## Requirements

### Requirement 1: Movie Pydantic Model

**User Story:** As a frontend developer, I want the API to return structured movie data in a well-defined schema, so that I can render movie cards without parsing free-text responses.

#### Acceptance Criteria

1. THE Agent_Backend SHALL define a `Movie` Pydantic model with the fields: `id` (int, required), `title` (str, required), `year` (int or null, default null), `poster_url` (str or null, default null), and `rating` (float or null, default null).
2. WHEN a Movie object is serialized to JSON, THE Agent_Backend SHALL include all five fields, using `null` for any field whose value is unavailable from the MCP tool output.
3. THE Agent_Backend SHALL NOT fabricate values for `year`, `poster_url`, or `rating` when the source tool output does not contain them.

### Requirement 2: AssistantMessage Movies Field

**User Story:** As a frontend developer, I want the assistant message to carry an optional list of movies, so that I can display movie cards alongside the prose response.

#### Acceptance Criteria

1. THE AssistantMessage model SHALL include a `movies` field of type `list[Movie]` with a default value of an empty list.
2. WHEN the agent run did not invoke any Movie_Returning_Tool, THE AssistantMessage SHALL contain an empty `movies` list.
3. WHEN the agent run invoked one or more Movie_Returning_Tools, THE AssistantMessage SHALL contain the extracted movies in the `movies` field.

### Requirement 3: Movie Extractor Module

**User Story:** As a backend developer, I want a deterministic post-processor that extracts movies from tool call results and filters them to only those mentioned in the LLM's response, so that movie cards match the prose the user reads.

#### Acceptance Criteria

1. THE Movie_Extractor SHALL expose a function `extract_movies(intermediate_steps, llm_content, max_count=5)` that accepts the Intermediate_Steps list, the LLM_Content string, and returns a `list[Movie]`.
2. THE Movie_Extractor SHALL iterate Intermediate_Steps in invocation order and extract movies only from steps where the tool name is in the set {`search_movies`, `discover_movies`, `get_recommendations`, `get_trending`}.
3. THE Movie_Extractor SHALL parse each qualifying tool output's `results` array and map each entry to a Movie object.
4. THE Movie_Extractor SHALL include a movie in the result only when the movie's full title appears as a complete phrase within the LLM_Content (case-insensitive exact phrase title filtering against LLM_Content).
5. THE Movie_Extractor SHALL order the returned movies by the position of their first title mention in the LLM_Content (earliest mention first).
6. THE Movie_Extractor SHALL deduplicate movies by `id`, preserving the first-seen occurrence based on LLM_Content mention order.
7. THE Movie_Extractor SHALL return at most `max_count` movies.
8. IF a tool call output is malformed or represents an error, THEN THE Movie_Extractor SHALL skip that step silently without raising an exception.
9. WHEN multiple Movie_Returning_Tools were invoked, THE Movie_Extractor SHALL collect movies across all qualifying steps, deduplicate by `id`, filter by title presence in LLM_Content, order by first mention position in LLM_Content, and then apply the `max_count` limit.
10. FOR ALL valid Intermediate_Steps lists and LLM_Content strings, extracting movies and then extracting again from the same inputs SHALL produce an identical result (idempotence).
11. WHEN the LLM_Content is empty or does not mention any movie title, THE Movie_Extractor SHALL return an empty list.

### Requirement 4: JSON Mode Wiring

**User Story:** As a frontend developer, I want the JSON `/chat` response to include extracted movies, so that I can render movie cards from a single API call.

#### Acceptance Criteria

1. WHEN the `run()` function completes an agent invocation in JSON mode, THE Agent_Backend SHALL call `extract_movies` with the agent result's `intermediate_steps` and the agent result's `output` (LLM_Content), and attach the returned list to `AssistantMessage.movies`.
2. WHEN no movies are extracted, THE Agent_Backend SHALL set `AssistantMessage.movies` to an empty list.
3. THE Agent_Backend SHALL NOT modify the existing `message.content` or `tool_calls` fields as a result of movie extraction.

### Requirement 5: SSE Streaming Mode — Movies Event

**User Story:** As a frontend developer, I want a dedicated SSE event for movies during streaming, so that I can render movie cards as soon as they are available without waiting for the full response.

#### Acceptance Criteria

1. THE SSE_Stream SHALL support a new event type `movies` with payload `{"type": "movies", "movies": [...]}`.
2. WHEN movies are extracted from the streaming run, THE SSE_Stream SHALL emit exactly one `movies` event.
3. THE SSE_Stream SHALL emit the `movies` event after the final `token` event and before the `tool_calls` event.
4. WHEN no movies are extracted from the streaming run, THE SSE_Stream SHALL NOT emit a `movies` event.
5. THE `movies` event payload SHALL contain the same movie data that would appear in `AssistantMessage.movies` in JSON mode for an equivalent agent run.
6. THE SSE_Stream SHALL accumulate the full LLM_Content from all `token` events before calling `extract_movies`, so that title filtering uses the complete prose response.

### Requirement 6: Deduplication and Ordering

**User Story:** As a frontend developer, I want movies to be deduplicated and ordered by how the assistant mentions them, so that the card order matches the reading flow of the prose response.

#### Acceptance Criteria

1. WHEN the same movie `id` appears in multiple tool call results, THE Movie_Extractor SHALL include only one occurrence.
2. THE Movie_Extractor SHALL order movies by the position of their first title mention in the LLM_Content (earliest mention first).
3. WHEN the total number of unique, mentioned movies exceeds `max_count`, THE Movie_Extractor SHALL return only the first `max_count` movies in their LLM_Content mention order.

### Requirement 7: Maximum Movie Count

**User Story:** As a frontend developer, I want the API to cap the number of movies per response, so that the UI layout remains manageable.

#### Acceptance Criteria

1. THE Movie_Extractor SHALL accept a `max_count` parameter with a default value of 5.
2. THE Movie_Extractor SHALL return at most `max_count` movies regardless of how many were found in the Intermediate_Steps.
3. WHEN fewer than `max_count` unique movies are found, THE Movie_Extractor SHALL return all of them.

### Requirement 8: Error Resilience

**User Story:** As a backend developer, I want the movie extractor to handle malformed tool outputs gracefully, so that a single bad tool response does not break the entire chat response.

#### Acceptance Criteria

1. IF a tool call output cannot be parsed as JSON, THEN THE Movie_Extractor SHALL skip that step and continue processing remaining steps.
2. IF a tool call output is valid JSON but does not contain a `results` array, THEN THE Movie_Extractor SHALL skip that step and continue processing remaining steps.
3. IF a tool call output contains an `error` envelope, THEN THE Movie_Extractor SHALL skip that step and continue processing remaining steps.
4. IF all tool call outputs are malformed or errored, THEN THE Movie_Extractor SHALL return an empty list.
5. THE Movie_Extractor SHALL NOT raise exceptions to the caller under any input condition.

### Requirement 9: API Contract Documentation

**User Story:** As a frontend developer, I want the API contract documentation to reflect the new movies field and SSE event, so that I can integrate against an accurate specification.

#### Acceptance Criteria

1. THE contracts.md document SHALL describe the `movies` field in the JSON mode response example, including its type (`list[Movie]`) and default value (empty list).
2. THE contracts.md document SHALL describe the `movies` SSE event type in the SSE event table, including its payload shape and emission timing.
3. THE contracts.md document SHALL include a note explaining that movies are extracted deterministically by a post-processor from tool results and filtered to only include movies whose titles appear in the assistant's prose response.

### Requirement 10: Test Coverage

**User Story:** As a backend developer, I want comprehensive tests for the movie extraction feature, so that regressions are caught early.

#### Acceptance Criteria

1. THE test suite SHALL include unit tests for `extract_movies` covering: mixed tool calls (movie-returning and non-movie-returning), deduplication by `id`, exact phrase title filtering against LLM_Content, `max_count` enforcement, and graceful handling of errored or malformed tool outputs.
2. THE test suite SHALL include a property-based test verifying that for any valid list of Intermediate_Steps and LLM_Content, `extract_movies` returns at most `max_count` movies, all returned movie `id` values are unique, and every returned movie's title appears in the LLM_Content.
3. THE test suite SHALL include an integration test for the JSON `/chat` endpoint asserting that the `movies` field is present in the response.
4. THE test suite SHALL include an integration test for the SSE `/chat` endpoint asserting that the `movies` event is emitted in the correct position in the stream when movies are present, and omitted when no movies are present.
