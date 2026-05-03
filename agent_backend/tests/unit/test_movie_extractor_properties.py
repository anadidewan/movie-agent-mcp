"""
Property-based tests for extract_movies() in app/agent/movie_extractor.py.

Uses Hypothesis to verify universal invariants across randomly generated inputs.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

from hypothesis import given, settings
from hypothesis import strategies as st

from app.agent.movie_extractor import MOVIE_TOOLS, extract_movies


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Tool names: a mix of movie-returning tools and non-movie-returning tools
movie_tool_names = st.sampled_from(sorted(MOVIE_TOOLS))
non_movie_tool_names = st.sampled_from(
    ["get_movie_details", "get_movie_id", "get_genre_id", "unknown_tool"]
)
any_tool_name = st.one_of(movie_tool_names, non_movie_tool_names)

# Movie data with constrained but varied fields
movie_entry = st.fixed_dictionaries(
    {
        "id": st.integers(min_value=1, max_value=999_999),
        "title": st.text(
            alphabet=st.characters(whitelist_categories=("L", "N", "Zs")),
            min_size=1,
            max_size=40,
        ),
    },
    optional={
        "year": st.integers(min_value=1900, max_value=2030),
        "poster_url": st.just("https://img/poster.jpg"),
        "rating": st.floats(min_value=0.0, max_value=10.0, allow_nan=False),
    },
)

# A valid tool output JSON string containing a results array
valid_tool_output = st.lists(movie_entry, min_size=0, max_size=8).map(
    lambda movies: json.dumps({"results": movies})
)

# A single intermediate step: (action, raw_output)
intermediate_step = st.tuples(
    any_tool_name.map(lambda name: SimpleNamespace(tool=name)),
    valid_tool_output,
)

# Full list of intermediate steps
intermediate_steps_strategy = st.lists(intermediate_step, min_size=0, max_size=6)

# LLM content: arbitrary text that may or may not contain movie titles
llm_content_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "Zs", "P")),
    min_size=0,
    max_size=300,
)

# max_count: positive integer
max_count_strategy = st.integers(min_value=1, max_value=20)


# ---------------------------------------------------------------------------
# Property: max_count invariant
# ---------------------------------------------------------------------------


class TestMaxCountInvariant:
    """
    **Validates: Requirements 7.2, 10.2**

    For any valid list of intermediate_steps and llm_content,
    extract_movies returns at most max_count movies.
    """

    @given(
        steps=intermediate_steps_strategy,
        llm_content=llm_content_strategy,
        max_count=max_count_strategy,
    )
    @settings(max_examples=200)
    def test_result_never_exceeds_max_count(
        self,
        steps: list,
        llm_content: str,
        max_count: int,
    ) -> None:
        """extract_movies always returns <= max_count movies."""
        result = extract_movies(steps, llm_content, max_count=max_count)
        assert len(result) <= max_count


# ---------------------------------------------------------------------------
# Strategy: intermediate steps with duplicate movie IDs across tool calls
# ---------------------------------------------------------------------------


@st.composite
def _steps_with_duplicate_ids(draw: st.DrawFn) -> list[tuple[SimpleNamespace, str]]:
    """Generate intermediate_steps where the same movie ID can appear in
    multiple tool calls, stressing the deduplication logic.

    Approach:
    1. Draw a small pool of movie IDs (1-5 IDs).
    2. Generate 2-5 tool call steps, each containing 1-4 movies whose IDs
       are sampled *from the shared pool* — so duplicates across calls are
       very likely.
    3. Each step uses a movie-returning tool name so the extractor processes it.
    """
    id_pool = draw(
        st.lists(
            st.integers(min_value=1, max_value=999_999),
            min_size=1,
            max_size=5,
        )
    )

    num_steps = draw(st.integers(min_value=2, max_value=5))
    steps: list[tuple[SimpleNamespace, str]] = []

    for _ in range(num_steps):
        num_movies = draw(st.integers(min_value=1, max_value=4))
        movies = []
        for _ in range(num_movies):
            mid = draw(st.sampled_from(id_pool))
            title = draw(
                st.text(
                    alphabet=st.characters(
                        whitelist_categories=("L", "N", "Zs")
                    ),
                    min_size=1,
                    max_size=40,
                )
            )
            entry: dict = {"id": mid, "title": title}
            # Optionally add extra fields
            if draw(st.booleans()):
                entry["year"] = draw(st.integers(min_value=1900, max_value=2030))
            if draw(st.booleans()):
                entry["rating"] = draw(
                    st.floats(min_value=0.0, max_value=10.0, allow_nan=False)
                )
            movies.append(entry)

        tool_name = draw(movie_tool_names)
        action = SimpleNamespace(tool=tool_name)
        raw_output = json.dumps({"results": movies})
        steps.append((action, raw_output))

    return steps


# ---------------------------------------------------------------------------
# Property: unique IDs invariant
# ---------------------------------------------------------------------------


class TestUniqueIdsInvariant:
    """
    **Validates: Requirements 6.1, 10.2**

    For any valid list of intermediate_steps and llm_content,
    all returned movie `id` values are unique.
    """

    @given(
        steps=_steps_with_duplicate_ids(),
        llm_content=llm_content_strategy,
        max_count=max_count_strategy,
    )
    @settings(max_examples=200)
    def test_returned_ids_are_unique_with_duplicate_inputs(
        self,
        steps: list,
        llm_content: str,
        max_count: int,
    ) -> None:
        """Even when intermediate_steps contain duplicate movie IDs across
        tool calls, extract_movies never returns duplicate IDs."""
        result = extract_movies(steps, llm_content, max_count=max_count)
        ids = [m.id for m in result]
        assert len(ids) == len(set(ids)), (
            f"Duplicate IDs in result: {ids}"
        )

    @given(
        steps=intermediate_steps_strategy,
        llm_content=llm_content_strategy,
        max_count=max_count_strategy,
    )
    @settings(max_examples=200)
    def test_returned_ids_are_unique_with_random_inputs(
        self,
        steps: list,
        llm_content: str,
        max_count: int,
    ) -> None:
        """For any randomly generated inputs, returned IDs are always unique."""
        result = extract_movies(steps, llm_content, max_count=max_count)
        ids = [m.id for m in result]
        assert len(ids) == len(set(ids)), (
            f"Duplicate IDs in result: {ids}"
        )


# ---------------------------------------------------------------------------
# Strategy: intermediate steps + llm_content with varying title overlap
# ---------------------------------------------------------------------------


@st.composite
def _steps_and_content_with_overlap(
    draw: st.DrawFn,
) -> tuple[list[tuple[SimpleNamespace, str]], str]:
    """Generate (intermediate_steps, llm_content) where some movie titles
    are deliberately embedded in the LLM content and some are not.

    This stresses the title-in-content filtering: the extractor must only
    return movies whose titles actually appear in llm_content.

    Approach:
    1. Draw a pool of movie entries (2-8 movies).
    2. Randomly partition them into "mentioned" and "not mentioned" groups.
    3. Build llm_content by joining the mentioned titles with filler text.
    4. Package all movies (both groups) into tool call steps.
    """
    # Draw a pool of movies
    movies = draw(
        st.lists(movie_entry, min_size=2, max_size=8, unique_by=lambda m: m["id"])
    )

    # Decide which movies are mentioned in llm_content
    mentioned_flags = draw(
        st.lists(
            st.booleans(),
            min_size=len(movies),
            max_size=len(movies),
        )
    )

    # Build llm_content: embed mentioned titles with filler text around them
    content_parts: list[str] = []
    for movie, mentioned in zip(movies, mentioned_flags):
        if mentioned:
            filler = draw(
                st.text(
                    alphabet=st.characters(whitelist_categories=("L", "Zs")),
                    min_size=0,
                    max_size=30,
                )
            )
            content_parts.append(f"{filler} {movie['title']} ")

    # Add some trailing filler so content isn't just titles
    trailing = draw(
        st.text(
            alphabet=st.characters(whitelist_categories=("L", "N", "Zs")),
            min_size=0,
            max_size=50,
        )
    )
    content_parts.append(trailing)
    llm_content = "".join(content_parts)

    # Package all movies into 1-3 tool call steps using movie-returning tools
    num_steps = draw(st.integers(min_value=1, max_value=3))
    # Split movies across steps
    steps: list[tuple[SimpleNamespace, str]] = []
    chunk_size = max(1, len(movies) // num_steps)
    for i in range(num_steps):
        start = i * chunk_size
        end = start + chunk_size if i < num_steps - 1 else len(movies)
        chunk = movies[start:end]
        if not chunk:
            continue
        tool_name = draw(movie_tool_names)
        action = SimpleNamespace(tool=tool_name)
        raw_output = json.dumps({"results": chunk})
        steps.append((action, raw_output))

    return steps, llm_content


# ---------------------------------------------------------------------------
# Property: title-in-content invariant
# ---------------------------------------------------------------------------


class TestTitleInContentInvariant:
    """
    **Validates: Requirements 3.4, 10.2**

    For any valid list of intermediate_steps and llm_content,
    every returned movie's title appears as a case-insensitive substring
    in llm_content.
    """

    @given(
        data=_steps_and_content_with_overlap(),
        max_count=max_count_strategy,
    )
    @settings(max_examples=200)
    def test_every_returned_title_appears_in_llm_content(
        self,
        data: tuple,
        max_count: int,
    ) -> None:
        """Every movie returned by extract_movies has its title present
        (case-insensitive) in the llm_content that was provided."""
        steps, llm_content = data
        result = extract_movies(steps, llm_content, max_count=max_count)
        llm_lower = llm_content.lower()
        for movie in result:
            assert movie.title.lower() in llm_lower, (
                f"Movie title {movie.title!r} not found in llm_content"
            )

    @given(
        steps=intermediate_steps_strategy,
        llm_content=llm_content_strategy,
        max_count=max_count_strategy,
    )
    @settings(max_examples=200)
    def test_title_in_content_with_random_inputs(
        self,
        steps: list,
        llm_content: str,
        max_count: int,
    ) -> None:
        """For fully random inputs, every returned movie's title still
        appears in llm_content (case-insensitive)."""
        result = extract_movies(steps, llm_content, max_count=max_count)
        llm_lower = llm_content.lower()
        for movie in result:
            assert movie.title.lower() in llm_lower, (
                f"Movie title {movie.title!r} not found in llm_content"
            )
