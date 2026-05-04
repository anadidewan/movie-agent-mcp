import { useCallback, useEffect, useState } from "react";
import { fetchTools } from "../lib/api";
import type { ToolInfo } from "../lib/types";

export interface UseToolsReturn {
  tools: ToolInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches GET /tools on mount and exposes a refetch function.
 * Used to build the tool registry for ToolCallPill descriptions.
 */
export function useTools(): UseToolsReturn {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTools();
      setTools(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch tools";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    void load();
  }, [load]);

  return { tools, loading, error, refetch: load };
}
