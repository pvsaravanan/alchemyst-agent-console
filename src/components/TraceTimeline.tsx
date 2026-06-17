import React, { useState, useMemo } from "react";
import { TimelineEvent } from "../hooks/useAgentSocket";

interface TraceTimelineProps {
  events: TimelineEvent[];
  highlightedId: string | null;
  onItemClick: (eventId: string, chatElementId: string | null) => void;
}

export const TraceTimeline: React.FC<TraceTimelineProps> = ({
  events,
  highlightedId,
  onItemClick,
}) => {
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering parent item highlights
    setExpandedGroups((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Filter and Search logic
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      // 1. Filter by Type
      if (filterType !== "ALL") {
        if (filterType === "PING_PONG" && (e.type === "PING" || e.type === "PONG")) {
          // OK
        } else if (e.type !== filterType) {
          return false;
        }
      }

      // 2. Filter by search query
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase();
        const typeMatch = e.type.toLowerCase().includes(query);
        const payloadMatch = JSON.stringify(e.payload).toLowerCase().includes(query);
        const textMatch = e.fullText?.toLowerCase().includes(query) || false;
        return typeMatch || payloadMatch || textMatch;
      }

      return true;
    });
  }, [events, filterType, searchTerm]);

  // Utility to determine the scroll target ID in the Chat Panel
  const getChatTargetId = (e: TimelineEvent): string | null => {
    if (e.type === "TOOL_CALL" && e.payload?.call_id) {
      return e.payload.call_id;
    }
    if (e.type === "TOOL_RESULT" && e.payload?.call_id) {
      return e.payload.call_id;
    }
    if (e.type === "TOKEN" || e.type === "TOKEN_GROUP") {
      return `msg-${e.seq}`;
    }
    if (e.type === "CONTEXT_SNAPSHOT") {
      return `msg-${e.seq}`;
    }
    return null;
  };

  const getEventDescription = (e: TimelineEvent) => {
    switch (e.type) {
      case "USER_MESSAGE":
        return `"${e.payload.content}"`;
      case "TOKEN_GROUP":
        return `Streamed ${e.tokenCount} tokens (${((e.durationMs || 0) / 1000).toFixed(2)}s)`;
      case "TOOL_CALL":
        return `Invoked tool "${e.payload.tool_name}"`;
      case "TOOL_ACK":
        return `Acknowledged tool call ID: ${e.payload.call_id}`;
      case "TOOL_RESULT":
        return `Result returned for call ID: ${e.payload.call_id}`;
      case "CONTEXT_SNAPSHOT":
        return `Snapshot context_id: ${e.payload.context_id} (${Object.keys(e.payload.data || {}).length} keys)`;
      case "PING":
        return `Challenge: "${e.payload.challenge}"`;
      case "PONG":
        return `Echo challenge: "${e.payload.echo}"`;
      case "RESUME":
        return `Last seq processed: ${e.payload.last_seq}`;
      case "ERROR":
        return `[${e.payload.code}] ${e.payload.message}`;
      default:
        return JSON.stringify(e.payload);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "1rem" }}>
      {/* Filter and Search Bar */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search timeline..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-input"
          style={{ flex: 1, padding: "0.5rem 0.75rem", fontSize: "0.8rem", borderRadius: "6px" }}
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-input"
          style={{ width: "130px", padding: "0.5rem 0.75rem", fontSize: "0.8rem", borderRadius: "6px", cursor: "pointer" }}
        >
          <option value="ALL">All Events</option>
          <option value="TOKEN_GROUP">Token Streams</option>
          <option value="TOOL_CALL">Tool Calls</option>
          <option value="TOOL_RESULT">Tool Results</option>
          <option value="CONTEXT_SNAPSHOT">Contexts</option>
          <option value="PING_PONG">Heartbeats</option>
          <option value="ERROR">Errors</option>
        </select>
      </div>

      {/* Timeline Event List */}
      <div className="tab-content" style={{ padding: 0 }}>
        {filteredEvents.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            No trace events match the filters.
          </div>
        ) : (
          <div className="timeline-list">
            {filteredEvents.map((e) => {
              const chatTargetId = getChatTargetId(e);
              const isGroup = e.isGroup;
              const isExpanded = expandedGroups[e.id] || false;
              const isHighlighted = highlightedId === e.id || (e.payload?.call_id && highlightedId === e.payload.call_id);

              // Check if we want a indent linking line for TOOL_CALL / TOOL_RESULT
              const isToolRelated = e.type === "TOOL_CALL" || e.type === "TOOL_RESULT";

              return (
                <div
                  key={e.id}
                  id={`timeline-row-${e.id}`}
                  className={`timeline-row ${e.direction} ${e.type} ${isHighlighted ? "highlighted" : ""}`}
                  style={{
                    marginLeft: isToolRelated ? "0.5rem" : "0",
                    borderLeft: isToolRelated
                      ? `3px solid ${e.type === "TOOL_CALL" ? "var(--accent-amber)" : "var(--accent-emerald)"}`
                      : undefined,
                  }}
                  onClick={() => onItemClick(e.id, chatTargetId)}
                >
                  <div className="timeline-row-header">
                    <span className="event-type-badge">{e.type}</span>
                    <span className="timeline-time">
                      {e.seq !== undefined && `seq: ${e.seq} • `}
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="timeline-row-summary">
                    {getEventDescription(e)}
                  </div>

                  {/* Token Group Collapse/Expand details */}
                  {isGroup && (
                    <div style={{ marginTop: "0.25rem" }}>
                      <button
                        className="btn-secondary"
                        onClick={(evt) => toggleGroup(e.id, evt)}
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", borderRadius: "4px" }}
                      >
                        {isExpanded ? "Collapse Text" : "Expand Full Text"}
                      </button>

                      {isExpanded && (
                        <div className="timeline-expanded" style={{ fontFamily: "var(--font-sans)", color: "var(--text-secondary)" }}>
                          <div style={{ fontStyle: "italic", fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
                            {e.fullText}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expand JSON details for all other structured objects */}
                  {!isGroup && e.payload && e.type !== "USER_MESSAGE" && (
                    <div style={{ marginTop: "0.25rem" }}>
                      <button
                        className="btn-secondary"
                        onClick={(evt) => toggleGroup(e.id, evt)}
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", borderRadius: "4px" }}
                      >
                        {isExpanded ? "Hide Details" : "Show Payload"}
                      </button>

                      {isExpanded && (
                        <div className="timeline-expanded">
                          <pre className="json-block">{JSON.stringify(e.payload, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}

                  {chatTargetId && (
                    <div className="timeline-link-indicator">
                      <span>🔗 Click to scroll to chat item</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
