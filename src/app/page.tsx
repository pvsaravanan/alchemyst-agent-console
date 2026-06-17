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

  const [contextExpanded, setContextExpanded] = useState(true);
  const [timelineExpanded, setTimelineExpanded] = useState(true);

  const checkServerHealth = async () => {
    try {
      const res = await fetch("http://localhost:4747/health");
      if (res.ok) {
        const data = await res.json();
        if (data.mode) setServerMode(data.mode);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(checkServerHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTimelineItemClick = useCallback(
    (eventId: string, chatTargetId: string | null) => {
      setHighlightedTimelineId(eventId);
      setTimeout(() => setHighlightedTimelineId(null), 2000);

      if (chatTargetId) {
        setHighlightedChatId(chatTargetId);
        setTimeout(() => setHighlightedChatId(null), 2000);
        const element =
          document.getElementById(`chat-tool-${chatTargetId}`) ||
          document.getElementById(chatTargetId);
        if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    []
  );

  const handleChatItemClick = useCallback(
    (callId: string) => {
      setHighlightedChatId(callId);
      setTimeout(() => setHighlightedChatId(null), 2000);

      const correspondingEvent = timelineEvents.find(
        (e) =>
          (e.type === "TOOL_CALL" || e.type === "TOOL_RESULT") &&
          e.payload?.call_id === callId
      );

      if (correspondingEvent) {
        setHighlightedTimelineId(correspondingEvent.id);
        setTimeout(() => setHighlightedTimelineId(null), 2000);
        const element = document.getElementById(`timeline-row-${correspondingEvent.id}`);
        if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [timelineEvents]
  );

  const getStatusText = (s: SocketStatus) => {
    switch (s) {
      case "DISCONNECTED":       return "Disconnected";
      case "CONNECTING":         return "Connecting";
      case "CONNECTED":          return "Connected";
      case "STREAMING":          return "Streaming";
      case "TOOL_CALL_PENDING":  return "Tool executing";
      case "RECONNECTING":       return "Reconnecting";
      case "RESUMING":           return "Resuming";
      default:                   return "Offline";
    }
  };

  return (
    <div className="dashboard">
      {/* Reconnect Banner */}
      {(status === "RECONNECTING" || status === "RESUMING") && (
        <div className="overlay-reconnect">
          <div className="status-dot connecting" />
          <span>Connection lost — recovering state&hellip;</span>
        </div>
      )}

      {/* Header */}
      <header className="header">
        <div className="logo-section">
          <div className="logo-mark">A</div>
          <span className="logo-text">Alchemyst AI</span>
          <span className="logo-version">Agent Console</span>
        </div>

        <div className="status-badge">
          <div
            className={`status-dot ${status.toLowerCase()}`}
            title={getStatusText(status)}
          />
          <span className="status-label">{getStatusText(status)}</span>
        </div>
      </header>

      {/* Main: Chat */}
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

      {/* Side: Context + Timeline */}
      <aside className="side-panel">
        {/* Context Inspector */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: contextExpanded ? (timelineExpanded ? "1" : "2") : "0 0 auto",
            minHeight: 0,
            borderBottom: "1px solid var(--border)",
            transition: "flex 0.2s ease",
          }}
        >
          <div
            className="section-header"
            onClick={() => setContextExpanded(!contextExpanded)}
          >
            <span className="section-title">Context Inspector</span>
            <span className="section-toggle">{contextExpanded ? "−" : "+"}</span>
          </div>

          {contextExpanded && (
            <div className="section-body">
              <ContextInspector
                contextHistory={contextHistory}
                activeContextId={activeContextId}
                setIndex={setContextScrubberIndex}
              />
            </div>
          )}
        </div>

        {/* Trace Timeline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: timelineExpanded ? (contextExpanded ? "1" : "2") : "0 0 auto",
            minHeight: 0,
            transition: "flex 0.2s ease",
          }}
        >
          <div
            className="section-header"
            onClick={() => setTimelineExpanded(!timelineExpanded)}
          >
            <span className="section-title">Trace Timeline</span>
            <span className="section-toggle">{timelineExpanded ? "−" : "+"}</span>
          </div>

          {timelineExpanded && (
            <div className="section-body">
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
