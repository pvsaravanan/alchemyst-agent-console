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

  // Auto scroll to bottom when messages update
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

  // Quick suggestion chips to trigger server scripts
  const suggestions = [
    { label: "Greeting", text: "hello" },
    { label: "Q3 Summary (1 Tool)", text: "Summarize the Q3 report" },
    { label: "Analysis (2 Tools)", text: "Compare and analyze the market trends" },
    { label: "Search (Tool First)", text: "lookup the database" },
    { label: "Large Context (500KB)", text: "schema query large database" },
    { label: "Long Document", text: "generate detailed long report" },
  ];

  return (
    <div className="main-panel">
      {/* Messages Scroll Area */}
      <div className="chat-container" ref={chatContainerRef}>
        {messages.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "#fff", marginBottom: "0.5rem" }}>
              Agent Console Active
            </h2>
            <p style={{ maxWidth: "360px", fontSize: "0.9rem" }}>
              Send a trigger message below or use a quick script template to start streaming responses.
            </p>
          </div>
        )}

        {messages.map((msg, msgIdx) => {
          const isLastMessage = msgIdx === messages.length - 1;

          return (
            <div key={msg.id} className={`message-row ${msg.sender}`}>
              <div className="message-bubble">
                {msg.sender === "agent" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div className="status-dot connected" style={{ width: "6px", height: "6px" }}></div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                      AI Agent
                    </span>
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
                      <div key={blockIdx} style={{ margin: "0.75rem 0" }}>
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

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "var(--accent-rose-glow)",
            border: "1px solid var(--accent-rose)",
            color: "var(--accent-rose)",
            borderRadius: "8px",
            fontSize: "0.85rem",
            marginBottom: "1rem",
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}

      {/* Suggestion Chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        {suggestions.map((s) => (
          <button
            key={s.label}
            className="btn-secondary"
            onClick={() => setInputValue(s.text)}
            style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem", borderRadius: "20px" }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Input Section */}
      <form onSubmit={handleSubmit} className="input-section">
        <div className="input-container">
          <input
            type="text"
            className="text-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a trigger keyword like 'hello', 'q3', 'compare'..."
            disabled={status === "STREAMING" || status === "TOOL_CALL_PENDING"}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={
              !inputValue.trim() || status === "STREAMING" || status === "TOOL_CALL_PENDING"
            }
          >
            Send
          </button>
        </div>
        <div className="action-row">
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Server Mode:{" "}
            <span
              style={{
                color: serverMode === "chaos" ? "var(--accent-rose)" : "var(--accent-emerald)",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {serverMode}
            </span>
          </span>
          <button type="button" className="btn-secondary" onClick={resetSession}>
            Reset Session
          </button>
        </div>
      </form>
    </div>
  );
};
