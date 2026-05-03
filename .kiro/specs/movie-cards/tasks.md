# Implementation Plan: Movie Cards

## Overview

Extend the Agent Backend's `/chat` response to include structured movie data. A new `Movie` Pydantic model and `movie_extractor` module extract movies from tool call results, filter to those mentioned in the LLM's prose, and return them in both JSON and SSE response modes. All changes are backward compatible — `movies` defaults to `[]`.

## Tasks

- [x] 1. Add Movie model and update AssistantMessage schema
  - [x] 1.1 Define the `Movie` Pydantic model in `agent_backend/app/schemas.py`
    - Add `Movie(BaseModel)` with fields: `id` (int, required), `title` (str, required), `year` (int | None = None), `poster_url` (str | None = None), `rating` (float | None = None)
    - Place it above `AssistantMessage` so the forward reference resolves
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.2 Add `movies` field to `AssistantMessage` in `agent_backend/app/schemas.py`
    - Add `movies: list[Movie] = []` to `AssistantMessage`
    - Verify default serialization includes `movies: []` for backward compatibility
    - _Requirements: 2.1, 2.2_

- [x] 2. Implement the movie extractor module
  - [x] 2.1 Create `agent_backend/app/agent/movie_extractor.py` with `extract_movies` function
    - Define `MOVIE_TOOLS` frozenset: `{"search_movies", "discover_movies", "get_recommendations", "get_trending"}`
    - Implement `extract_movies(intermediate_steps, llm_content, max_count=5) -> list[Movie]`
    - Implement `_parse_movies_from_output(raw_output: str) -> list[Movie]` helper that parses JSON, skips error envelopes, skips missing/non-list `results`, and maps entries to `Movie` objects
    - Implement `_find_title_position(title: str, llm_content_lower: str) -> int` helper using `str.find()`
    - Algorithm: collect candidates from qualifying tool steps → filter by title presence in llm_content (case-insensitive) → sort by first mention position → deduplicate by id (first-seen wins) → cap at max_count
    - Wrap entire function body in try/except to guarantee no exceptions propagate to caller
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 8.5_
  - [x] 2.2 Write unit tests for `extract_movies` in `agent_backend/tests/unit/test_movie_extractor.py`
    - Test mixed tool calls: movie-returning tools and non-movie-returning tools (e.g., `get_movie_details`) in the same intermediate_steps — only movie-returning tools contribute candidates
    - Test deduplication by `id`: same movie from two different tool calls → only one Movie in result
    - Test title filtering: movies not mentioned in llm_content are excluded
    - Test ordering by first mention position in llm_content
    - Test `max_count` enforcement: provide more candidates than max_count, assert result length ≤ max_count
    - Test error resilience: malformed JSON output, missing `results` key, error envelope output, all-errored outputs → returns `[]`
    - Test empty llm_content → returns `[]`
    - Test case-insensitive title matching
    - _Requirements: 10.1_
  - [x] 2.3 Write property test: max_count invariant
    - **Property: max_count invariant**
    - For any valid list of intermediate_steps and llm_content, `extract_movies` returns at most `max_count` movies
    - Use Hypothesis to generate random intermediate_steps with varying tool names, movie counts, and llm_content strings
    - **Validates: Requirements 7.2, 10.2**
  - [x] 2.4 Write property test: unique IDs invariant
    - **Property: unique IDs invariant**
    - For any valid list of intermediate_steps and llm_content, all returned movie `id` values are unique
    - Use Hypothesis to generate intermediate_steps with duplicate movie IDs across tool calls
    - **Validates: Requirements 6.1, 10.2**
  - [x] 2.5 Write property test: title-in-content invariant
    - **Property: title-in-content invariant**
    - For any valid list of intermediate_steps and llm_content, every returned movie's title appears as a case-insensitive substring in llm_content
    - Use Hypothesis to generate intermediate_steps and llm_content with varying overlap
    - **Validates: Requirements 3.4, 10.2**

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Wire movie extraction into agent_runner
  - [x] 4.1 Update `run()` in `agent_backend/app/agent_runner.py` to call `extract_movies`
    - Import `extract_movies` from `app.agent.movie_extractor`
    - After building `tool_calls`, call `extract_movies(result.get("intermediate_steps", []), result.get("output", ""))`
    - Pass the returned list to `AssistantMessage(content=..., movies=movies)`
    - Existing `message.content` and `tool_calls` fields must remain unchanged
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 4.2 Update `astream_run()` in `agent_backend/app/agent_runner.py` to emit `movies` SSE event
    - Import `extract_movies` from `app.agent.movie_extractor`
    - After the streaming loop completes (all tokens emitted), call `extract_movies(intermediate_steps, full_output)`
    - If movies list is non-empty, emit `data: {"type": "movies", "movies": [...]}\n\n` before the `tool_calls` event
    - If movies list is empty, do not emit a `movies` event
    - SSE event order must be: token → movies (if any) → tool_calls → done
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Add integration tests
  - [x] 6.1 Add integration test for JSON `/chat` movies field in `agent_backend/tests/integration/test_chat.py`
    - Mock executor with movie-returning tool steps and a final output that mentions movie titles
    - Assert response contains `message.movies` as a non-empty list
    - Assert each movie has `id`, `title` fields
    - Assert movies are only those mentioned in the response content
    - _Requirements: 10.3_
  - [x] 6.2 Add integration test for SSE `movies` event in `agent_backend/tests/integration/test_streaming.py`
    - Mock executor with movie-returning tool steps and final output mentioning movie titles
    - Assert `movies` SSE event is emitted after last `token` event and before `tool_calls` event
    - Assert `movies` event payload contains correct movie data
    - Test that when no movies are present, no `movies` event is emitted
    - _Requirements: 10.4_

- [x] 7. Update API contract documentation
  - [x] 7.1 Update `agent_backend/docs/contracts.md`
    - Add `movies` field to the JSON mode response example with type `list[Movie]` and default `[]`
    - Add `movies` event row to the SSE event table with payload shape `{"type": "movies", "movies": [...]}` and timing "After final token, before tool_calls"
    - Add a note explaining that movies are extracted deterministically by a post-processor from tool results and filtered to only include movies whose titles appear in the assistant's prose response
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 7.2 Update `agent_backend/README.md`
    - Update the POST /chat response example to include the `movies` field
    - Update the SSE streaming example to show the `movies` event
    - Update the curl examples to reflect the new response shape
  - [x] 7.3 Update `agent_backend/docs/PROMPTS.md`
    - Update the example tool-chaining scenarios to mention that movie cards are returned alongside prose
    - Note that the agent does not control which movies appear as cards — the post-processor handles that
  - [x] 7.4 Update the agent-backend spec design document (`.kiro/specs/agent-backend/design.md`)
    - Add the `Movie` model to the Data Models section
    - Update the `AssistantMessage` model to include the `movies` field
    - Add the `movies` SSE event to the SSE Event Protocol table
    - Add a section on the movie extractor module and its algorithm

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All changes are backward compatible — the `movies` field defaults to `[]`, so existing tests should continue to pass
