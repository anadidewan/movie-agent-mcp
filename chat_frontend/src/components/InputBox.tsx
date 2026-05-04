import { useRef, useCallback, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";

export interface InputBoxProps {
  onSend: (content: string) => void;
  disabled: boolean;
}

/**
 * Multiline textarea with send button.
 * - Auto-grows up to ~6 rows using a ref to adjust height on input.
 * - Enter sends the message.
 * - Shift+Enter inserts a newline.
 * - Send button disabled while streaming (disabled prop).
 * - Clears and refocuses textarea after send.
 */
export function InputBox({ onSend, disabled }: InputBoxProps): ReactNode {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 144;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  const send = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value.trim();
    if (!value) return;
    onSend(value);
    el.value = "";
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
      if (e.key === "Enter" && !e.shiftKey && !disabled) {
        e.preventDefault();
        send();
      }
      // Shift+Enter falls through to default behavior (inserts newline)
    },
    [disabled, send],
  );

  return (
    <div className="border-t border-gray-800 px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          className="flex-1 resize-none rounded-lg bg-gray-900 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="Type a message…"
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
