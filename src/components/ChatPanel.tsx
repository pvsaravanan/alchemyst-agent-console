import React, { useRef, useEffect, useState } from "react";
import { Message, SocketStatus } from "../hooks/useAgentSocket";
import { ToolCallCard } from "./ToolCallCard";

interface ChatPanelProps {
  messages: Message[];
  status: SocketStatus;
  sendMessage: (content: string) => void;
  resetSession: () => void;
  error: string | null;
  highlightedId: string | null;
  onItemClick: (id: string) => void;
  serverMode: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  status,
  sendMessage,
  resetSession,
  error,
  highlightedId,
  onItemClick,
  serverMode,
}) => {
  const [inputValue, setInputValue] = useState("");
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue("");
  };

  const suggestions = [
    { label: "Greeting",             text: "hello" },
    { label: "Q3 Summary",           text: "Summarize the Q3 report" },
    { label: "Analysis (2 Tools)",   text: "Compare and analyze the market trends" },
    { label: "Search (Tool First)",  text: "lookup the database" },
    { label: "Large Context 500KB",  text: "schema query large database" },
    { label: "Long Document",        text: "generate detailed long report" },
  ];

  return (
    <div className="main-panel">
      {/* Messages */}
      <div className="chat-container" ref={chatContainerRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <h2>Agent Console</h2>
            <p>Select a template below or type a message to begin streaming.</p>
          </div>
        )}

        {messages.map((msg, msgIdx) => {
          const isLastMessage = msgIdx === messages.length - 1;

          return (
            <div key={msg.id} className={`message-row ${msg.sender}`}>
              <div className="message-bubble">
                {msg.sender === "agent" && (
                  <div className="agent-label">
                    <div className="agent-label-dot" />
                    <span className="agent-label-text">Agent</span>
                  </div>
                )}

                {msg.blocks.map((block, blockIdx) => {
                  const isLastBlock = blockIdx === msg.blocks.length - 1;

                  if (block.type === "text") {
                    const isStreamingNow =
                      msg.sender === "agent" &&
                      isLastMessage &&
                      isLastBlock &&
                      status === "STREAMING";

                    return (
                      <span
                        key={blockIdx}
                        className={isStreamingNow ? "streaming-text" : ""}
                        style={{ whiteSpace: "pre-wrap" }}
                      >
                        {block.text}
                      </span>
                    );
                  } else {
                    return (
                      <div key={blockIdx} style={{ margin: "0.5rem 0" }}>
                        <ToolCallCard
                          callId={block.callId}
                          toolName={block.toolName}
                          args={block.args}
                          result={block.result}
                          status={block.status}
                          isHighlighted={highlightedId === block.callId}
                          onClick={() => onItemClick(block.callId)}
                        />
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Error */}
      {error && <div className="error-banner">{error}</div>}

      {/* Suggestion Chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.75rem" }}>
        {suggestions.map((s) => (
          <button
            key={s.label}
            className="chip"
            onClick={() => setInputValue(s.text)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="input-section">
        <div className="input-container">
          <input
            type="text"
            className="text-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message…"
            disabled={status === "STREAMING" || status === "TOOL_CALL_PENDING"}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={
              !inputValue.trim() ||
              status === "STREAMING" ||
              status === "TOOL_CALL_PENDING"
            }
          >
            Send
          </button>
        </div>

        <div className="action-row">
          <span className="mode-text">
            Mode: <strong>{serverMode}</strong>
          </span>
          <button type="button" className="btn-secondary" onClick={resetSession}>
            Reset session
          </button>
        </div>
      </form>
    </div>
  );
};
