import type { ReactNode } from "react";

/**
 * Top bar with app title.
 */
export function TopBar(): ReactNode {
  return (
    <header className="flex items-center border-b border-gray-800 px-4 py-3">
      <h1 className="text-xl font-semibold tracking-tight">🎬 Reelify</h1>
    </header>
  );
}
