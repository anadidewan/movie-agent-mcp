"""
Unit + property tests for dynamic tool construction.

Covers:
- build_args_schema(): JSON Schema type mapping, required vs optional fields
- build_tool(): StructuredTool name, description, args_schema correctness
- Real-world example: search_movies descriptor from the MCP contract

Property tests (Hypothesis):
- Property 1: Tool construction completeness and fidelity
"""

from __future__ import annotations

from typing import Optional, get_args, get_origin
from unittest.mock import AsyncMock, MagicMock

import pytest
from hypothesis import given, settings as h_settings
from hypothesis import strategies as st
from langchain.tools import StructuredTool

from app.agent_runner import build_args_schema, build_tool, json_schema_type_to_python
from app.schemas import ToolDescriptor


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_descriptor(
    name: str = "test_tool",
    description: str = "A test tool",
    properties: dict | None = None,
    required: list[str] | None = None,
) -> ToolDescriptor:
    return ToolDescriptor(
        name=name,
        description=description,
        input_schema={
            "type": "object",
            "properties": properties or {},
            "required": required or [],
        },
    )


# ---------------------------------------------------------------------------
# Unit tests — json_schema_type_to_python
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "json_type, expected_python_type",
    [
        ("string", str),
        ("integer", int),
        ("number", float),
        ("boolean", bool),
        ("array", list),
        ("object", dict),
    ],
)
def test_json_schema_type_mapping(json_type: str, expected_python_type: type):
    result = json_schema_type_to_python({"type": json_type})
    assert result is expected_python_type


def test_unknown_json_type_defaults_to_str():
    result = json_schema_type_to_python({"type": "unknown_type"})
    assert result is str


def test_missing_type_key_defaults_to_str():
    result = json_schema_type_to_python({})
    assert result is str


# ---------------------------------------------------------------------------
# Unit tests — build_args_schema
# ---------------------------------------------------------------------------


def test_required_field_is_not_optional():
    schema = build_args_schema(
        "test_tool",
        {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    )
    fields = schema.model_fields
    assert "query" in fields
    # Required field: annotation should be str, not Optional[str]
    annotation = fields["query"].annotation
    # For required fields, origin should not be Union (Optional is Union[X, None])
    assert get_origin(annotation) is None or str in get_args(annotation)
    assert fields["query"].default is None or fields["query"].is_required()


def test_optional_field_has_none_default():
    schema = build_args_schema(
        "test_tool",
        {
            "type": "object",
            "properties": {"year": {"type": "integer"}},
            "required": [],
        },
    )
    fields = schema.model_fields
    assert "year" in fields
    assert fields["year"].default is None


def test_optional_field_annotation_is_optional_int():
    schema = build_args_schema(
        "test_tool",
        {
            "type": "object",
            "properties": {"year": {"type": "integer"}},
            "required": [],
        },
    )
    fields = schema.model_fields
    annotation = fields["year"].annotation
    # Optional[int] == Union[int, None]
    assert get_origin(annotation) is not None  # is a generic (Union)
    assert int in get_args(annotation)
    assert type(None) in get_args(annotation)


def test_empty_schema_produces_empty_model():
    schema = build_args_schema("test_tool", {"type": "object", "properties": {}})
    assert len(schema.model_fields) == 0


# ---------------------------------------------------------------------------
# Unit tests — build_tool (real-world: search_movies)
# ---------------------------------------------------------------------------

SEARCH_MOVIES_DESCRIPTOR = ToolDescriptor(
    name="search_movies",
    description="Search for movies by title and optional release year.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Movie title to search for"},
            "year": {"type": "integer", "description": "Optional release year"},
        },
        "required": ["query"],
    },
)


def test_build_tool_returns_structured_tool():
    mock_client = MagicMock()
    mock_client.call_tool = AsyncMock(return_value='{"results": []}')
    tool = build_tool(SEARCH_MOVIES_DESCRIPTOR, mock_client)
    assert isinstance(tool, StructuredTool)


def test_build_tool_name_matches_descriptor():
    mock_client = MagicMock()
    mock_client.call_tool = AsyncMock(return_value='{"results": []}')
    tool = build_tool(SEARCH_MOVIES_DESCRIPTOR, mock_client)
    assert tool.name == "search_movies"


def test_build_tool_description_matches_descriptor():
    mock_client = MagicMock()
    mock_client.call_tool = AsyncMock(return_value='{"results": []}')
    tool = build_tool(SEARCH_MOVIES_DESCRIPTOR, mock_client)
    assert tool.description == SEARCH_MOVIES_DESCRIPTOR.description


def test_build_tool_args_schema_has_query_required():
    mock_client = MagicMock()
    mock_client.call_tool = AsyncMock(return_value='{"results": []}')
    tool = build_tool(SEARCH_MOVIES_DESCRIPTOR, mock_client)
    fields = tool.args_schema.model_fields
    assert "query" in fields
    assert fields["query"].is_required()


def test_build_tool_args_schema_has_year_optional():
    mock_client = MagicMock()
    mock_client.call_tool = AsyncMock(return_value='{"results": []}')
    tool = build_tool(SEARCH_MOVIES_DESCRIPTOR, mock_client)
    fields = tool.args_schema.model_fields
    assert "year" in fields
    assert fields["year"].default is None


@pytest.mark.asyncio
async def test_build_tool_coroutine_calls_mcp_client():
    mock_client = MagicMock()
    mock_client.call_tool = AsyncMock(return_value='{"results": [{"title": "Inception"}]}')
    tool = build_tool(SEARCH_MOVIES_DESCRIPTOR, mock_client)

    result = await tool.coroutine(query="Inception")
    mock_client.call_tool.assert_called_once_with("search_movies", {"query": "Inception"})
    assert "Inception" in result


# ---------------------------------------------------------------------------
# Property tests (Hypothesis)
# ---------------------------------------------------------------------------

# Strategy: generate valid tool descriptor dicts
_json_types = st.sampled_from(["string", "integer", "number", "boolean", "array", "object"])
_field_name_strategy = st.text(
    min_size=1, max_size=20,
    alphabet=st.characters(whitelist_categories=("Ll",))
).filter(lambda s: not s.startswith("_") and s.isidentifier())


@st.composite
def tool_descriptor_strategy(draw) -> ToolDescriptor:
    name = draw(st.text(min_size=1, max_size=30, alphabet=st.characters(whitelist_categories=("Ll",), whitelist_characters="_")))
    description = draw(st.text(min_size=1, max_size=100))
    num_fields = draw(st.integers(min_value=0, max_value=5))

    # Generate unique field names
    field_names = draw(
        st.lists(
            _field_name_strategy,
            min_size=num_fields,
            max_size=num_fields,
            unique=True,
        )
    )
    properties = {fn: {"type": draw(_json_types)} for fn in field_names}

    # Some fields are required
    required = draw(
        st.lists(st.sampled_from(field_names), max_size=len(field_names), unique=True)
        if field_names else st.just([])
    )

    return ToolDescriptor(
        name=name or "tool",
        description=description,
        input_schema={
            "type": "object",
            "properties": properties,
            "required": required,
        },
    )


@given(descriptors=st.lists(tool_descriptor_strategy(), min_size=1, max_size=20))
@h_settings(max_examples=100)
def test_property1_tool_construction_completeness(descriptors: list[ToolDescriptor]):
    """
    Property 1: Tool construction completeness and fidelity.

    For any list of ToolDescriptors, build_tool() SHALL produce a StructuredTool
    whose name, description, and args_schema field names match the descriptor.
    """
    mock_client = MagicMock()
    mock_client.call_tool = AsyncMock(return_value='{}')

    for descriptor in descriptors:
        tool = build_tool(descriptor, mock_client)

        # Name and description must match exactly
        assert tool.name == descriptor.name
        assert tool.description == descriptor.description

        # args_schema field names must match descriptor properties
        expected_fields = set(descriptor.input_schema.get("properties", {}).keys())
        actual_fields = set(tool.args_schema.model_fields.keys())
        assert actual_fields == expected_fields
