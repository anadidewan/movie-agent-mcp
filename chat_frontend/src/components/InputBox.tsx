import { useRef, useCallback, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";

export interface InputBoxProps {
  onSend: (content: string) => void;
  disabled: boolean;
}

/**
 * Multiline textarea with send button.
 * - Auto-grows up to ~6 rows using a ref to adjust height on input.
 * - Cmd+Enter (macOS) / Ctrl+Enter sends the message.
 * - Enter without modifier inserts a newline (default behavior).
 * - Send button disabled while streaming (disabled prop).
 * - Clears and refocuses textarea after send.
 */
export function InputBox({ onSend, disabled }: InputBoxProps): ReactNode {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Reset to auto so scrollHeight recalculates correctly when content shrinks
    el.style.height = "auto";
    // Cap at ~6 rows. One row is roughly 24px (1.5rem line-height), so 6 rows ≈ 144px.
    const maxHeight = 144;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    // Show scrollbar only when content exceeds the cap
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  const send = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value.trim();
    if (!value) return;
    onSend(value);
    el.value = "";
    // Reset height after clearing
    el.style.height = "auto";
    el.style.overflowY = "hidden";
    el.focus();
  }, [onSend]);

  const handleInput = useCallback(
    (_e: ChangeEvent<HTMLTextAreaElement>) => {
      adjustHeight();
    },
    [adjustHeight],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !disabled) {
        e.preventDefault();
        send();
      }
      // Plain Enter inserts a newline — default textarea behavior, no action needed.
    },
    [disabled, send],
  );

  return (
    <div className="border-t border-gray-800 px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          className="flex-1 resize-none rounded-lg bg-gray-900 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="Type a message… (Cmd+Enter to send)"
          rows={1}
          disabled={disabled}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          aria-label="Message input"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={send}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-light focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
