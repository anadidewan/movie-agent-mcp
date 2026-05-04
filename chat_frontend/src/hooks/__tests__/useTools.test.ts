import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTools } from "../useTools";
import type { ToolInfo } from "../../lib/types";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    fetchTools: vi.fn(),
  };
});

import { fetchTools } from "../../lib/api";
const mockFetchTools = vi.mocked(fetchTools);

const sampleTools: ToolInfo[] = [
  { name: "search_movies", description: "Search for movies by title" },
  { name: "get_movie_details", description: "Get details for a movie" },
];

describe("useTools", () => {
  beforeEach(() => {
    mockFetchTools.mockReset();
  });

  it("fetches tools on mount and returns them", async () => {
    mockFetchTools.mockResolvedValue(sampleTools);

    const { result } = renderHook(() => useTools());

    expect(result.current.loading).toBe(true);
    expect(result.current.tools).toEqual([]);
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tools).toEqual(sampleTools);
    expect(result.current.error).toBeNull();
    expect(mockFetchTools).toHaveBeenCalledTimes(1);
  });

  it("sets error on fetch failure and keeps tools empty", async () => {
    mockFetchTools.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useTools());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Network error");
    expect(result.current.tools).toEqual([]);
  });

  it("preserves last loaded tools on subsequent fetch error", async () => {
    mockFetchTools.mockResolvedValue(sampleTools);

    const { result } = renderHook(() => useTools());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tools).toEqual(sampleTools);

    mockFetchTools.mockRejectedValue(new Error("Server down"));

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tools).toEqual(sampleTools);
    expect(result.current.error).toBe("Server down");
  });

  it("refetch() triggers a manual re-fetch", async () => {
    mockFetchTools.mockResolvedValue(sampleTools);

    const { result } = renderHook(() => useTools());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetchTools).toHaveBeenCalledTimes(1);

    const updatedTools: ToolInfo[] = [
      { name: "new_tool", description: "A new tool" },
    ];
    mockFetchTools.mockResolvedValue(updatedTools);

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchTools).toHaveBeenCalledTimes(2);
    expect(result.current.tools).toEqual(updatedTools);
  });
});
