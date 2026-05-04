import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InputBox } from "../InputBox";

describe("InputBox", () => {
  it("renders a textarea and a send button", () => {
    render(<InputBox onSend={vi.fn()} disabled={false} />);
    expect(screen.getByRole("textbox", { name: /message input/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("calls onSend with trimmed content on Enter and clears the textarea", () => {
    const onSend = vi.fn();
    render(<InputBox onSend={onSend} disabled={false} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "  hello world  " } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledWith("hello world");
    expect(textarea.value).toBe("");
  });

  it("does not send on Shift+Enter (allows newline)", () => {
    const onSend = vi.fn();
    render(<InputBox onSend={onSend} disabled={false} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "line1" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send empty or whitespace-only content", () => {
    const onSend = vi.fn();
    render(<InputBox onSend={onSend} disabled={false} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the send button when disabled prop is true", () => {
    render(<InputBox onSend={vi.fn()} disabled={true} />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("disables the textarea when disabled prop is true", () => {
    render(<InputBox onSend={vi.fn()} disabled={true} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("does not send on Enter when disabled", () => {
    const onSend = vi.fn();
    render(<InputBox onSend={onSend} disabled={true} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onSend when the send button is clicked", () => {
    const onSend = vi.fn();
    render(<InputBox onSend={onSend} disabled={false} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "click send" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith("click send");
    expect(textarea.value).toBe("");
  });
});
