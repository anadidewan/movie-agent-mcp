import { useMemo } from "react";
import { useChat } from "./hooks/useChat";
import { useTools } from "./hooks/useTools";
import { TopBar } from "./components/TopBar";
import { InputBox } from "./components/InputBox";
import { ChatMessageList } from "./components/ChatMessageList";

export function App() {
  const { messages, isStreaming, sendMessage } = useChat();
  const { tools } = useTools();

  // Build toolRegistry Map from tools array (used by ToolCallPill for descriptions)
  const toolRegistry = useMemo(
    () => new Map(tools.map((t) => [t.name, t.description])),
    [tools],
  );

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-gray-100">
      <TopBar />

      <div className="flex flex-1 justify-center overflow-hidden">
        <div className="flex w-full max-w-3xl flex-col">
          <ChatMessageList messages={messages} toolRegistry={toolRegistry} />
          <InputBox onSend={sendMessage} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
}
