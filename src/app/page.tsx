"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAgentSocket, SocketStatus } from "../hooks/useAgentSocket";
import { ChatPanel } from "../components/ChatPanel";
import { TraceTimeline } from "../components/TraceTimeline";
import { ContextInspector } from "../components/ContextInspector";

export default function Home() {
  const {
    status,
    messages,
    timelineEvents,
    contextHistory,
    activeContextId,
    error,
    sendMessage,
    resetSession,
    setContextScrubberIndex,
  } = useAgentSocket();

  const [serverMode, setServerMode] = useState<string>("normal");
  const [highlightedTimelineId, setHighlightedTimelineId] = useState<string | null>(null);
  const [highlightedChatId, setHighlightedChatId] = useState<string | null>(null);

  // Collapsible Right Panel sections
  const [contextExpanded, setContextExpanded] = useState(true);
  const [timelineExpanded, setTimelineExpanded] = useState(true);

  // Sync server mode via health endpoint
  const checkServerHealth = async () => {
    try {
      const res = await fetch("http://localhost:4747/health");
      if (res.ok) {
        const data = await res.json();
        if (data.mode) {
          setServerMode(data.mode);
        }
      }
    } catch {
      // Fallback silently if offline
    }
  };

  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(checkServerHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Bidirectional highlighting: Timeline Row Click -> Scroll Chat Panel Item
  const handleTimelineItemClick = useCallback((eventId: string, chatTargetId: string | null) => {
    // Highlight timeline row
    setHighlightedTimelineId(eventId);
    setTimeout(() => setHighlightedTimelineId(null), 2000);

    // Scroll chat target if exists
    if (chatTargetId) {
      setHighlightedChatId(chatTargetId);
      setTimeout(() => setHighlightedChatId(null), 2000);

      // Try scrolling to tool card or text bubble message
      const element =
        document.getElementById(`chat-tool-${chatTargetId}`) ||
        document.getElementById(chatTargetId);

      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, []);

  // Bidirectional highlighting: Chat Item Click -> Scroll Timeline Row
  const handleChatItemClick = useCallback((callId: string) => {
    setHighlightedChatId(callId);
    setTimeout(() => setHighlightedChatId(null), 2000);

    // Find timeline row corresponding to this tool call
    const correspondingEvent = timelineEvents.find(
      (e) => (e.type === "TOOL_CALL" || e.type === "TOOL_RESULT") && e.payload?.call_id === callId
    );

    if (correspondingEvent) {
      setHighlightedTimelineId(correspondingEvent.id);
      setTimeout(() => setHighlightedTimelineId(null), 2000);

      const element = document.getElementById(`timeline-row-${correspondingEvent.id}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [timelineEvents]);

  const getStatusText = (s: SocketStatus) => {
    switch (s) {
      case "DISCONNECTED":
        return "Disconnected";
      case "CONNECTING":
        return "Connecting to agent...";
      case "CONNECTED":
        return "Connected & Idle";
      case "STREAMING":
        return "Streaming response...";
      case "TOOL_CALL_PENDING":
        return "Executing tool call...";
      case "RECONNECTING":
        return "Reconnecting (retrying)...";
      case "RESUMING":
        return "Replaying missed events...";
      default:
        return "Offline";
    }
  };

  return (
    <div className="dashboard">
      {/* Reconnection Overlay Banner (Invisible when connected, visible when reconnecting) */}
      {(status === "RECONNECTING" || status === "RESUMING") && (
        <div className="overlay-reconnect">
          <div className="status-dot connecting" style={{ width: "10px", height: "10px" }}></div>
          <span>Connection dropped. Reconnecting and recovering state...</span>
        </div>
      )}

      {/* Console Header */}
      <header className="header">
        <div className="logo-section">
          <div
            style={{
              background: "linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-indigo) 100%)",
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              color: "#000",
            }}
          >
            A
          </div>
          <h1 className="logo-text">Alchemyst AI</h1>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 500 }}>
            Agent Console v1.0
          </span>
        </div>

        <div className="status-badge">
          <div
            className={`status-dot ${status.toLowerCase()}`}
            title={getStatusText(status)}
          ></div>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{getStatusText(status)}</span>
        </div>
      </header>

      {/* Main Panel: Interactive Chat Stream */}
      <ChatPanel
        messages={messages}
        status={status}
        sendMessage={sendMessage}
        resetSession={resetSession}
        error={error}
        highlightedId={highlightedChatId}
        onItemClick={handleChatItemClick}
        serverMode={serverMode}
      />

      {/* Side Panel: Stacked Context Inspector + Agent Trace Timeline */}
      <aside className="side-panel">
        {/* Section 1: Context Inspector */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: contextExpanded ? (timelineExpanded ? "1" : "2") : "0 0 auto",
            minHeight: "0",
            borderBottom: "1px solid var(--border-color)",
            transition: "all 0.3s ease",
          }}
        >
          <div
            onClick={() => setContextExpanded(!contextExpanded)}
            style={{
              padding: "0.75rem 1.25rem",
              background: "rgba(255,255,255,0.02)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: "0.9rem",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span>📁</span> Context Inspector
            </h2>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {contextExpanded ? "Collapse" : "Expand"}
            </span>
          </div>

          {contextExpanded && (
            <div style={{ flex: 1, minHeight: 0, padding: "1.25rem", overflowY: "hidden" }}>
              <ContextInspector
                contextHistory={contextHistory}
                activeContextId={activeContextId}
                setIndex={setContextScrubberIndex}
              />
            </div>
          )}
        </div>

        {/* Section 2: Agent Trace Timeline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: timelineExpanded ? (contextExpanded ? "1" : "2") : "0 0 auto",
            minHeight: "0",
            transition: "all 0.3s ease",
          }}
        >
          <div
            onClick={() => setTimelineExpanded(!timelineExpanded)}
            style={{
              padding: "0.75rem 1.25rem",
              background: "rgba(255,255,255,0.02)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
              userSelect: "none",
              borderTop: !contextExpanded ? "1px solid var(--border-color)" : undefined,
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: "0.9rem",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span>📊</span> Agent Trace Timeline
            </h2>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {timelineExpanded ? "Collapse" : "Expand"}
            </span>
          </div>

          {timelineExpanded && (
            <div style={{ flex: 1, minHeight: 0, padding: "1.25rem", overflowY: "hidden" }}>
              <TraceTimeline
                events={timelineEvents}
                highlightedId={highlightedTimelineId}
                onItemClick={handleTimelineItemClick}
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
