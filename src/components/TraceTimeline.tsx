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
    e.stopPropagation();
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterType !== "ALL") {
        if (filterType === "PING_PONG" && (e.type === "PING" || e.type === "PONG")) {
          // pass
        } else if (e.type !== filterType) {
          return false;
        }
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          e.type.toLowerCase().includes(q) ||
          JSON.stringify(e.payload).toLowerCase().includes(q) ||
          (e.fullText?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [events, filterType, searchTerm]);

  const getChatTargetId = (e: TimelineEvent): string | null => {
    if ((e.type === "TOOL_CALL" || e.type === "TOOL_RESULT") && e.payload?.call_id) {
      return e.payload.call_id;
    }
    if (e.type === "TOKEN" || e.type === "TOKEN_GROUP") return `msg-${e.seq}`;
    if (e.type === "CONTEXT_SNAPSHOT") return `msg-${e.seq}`;
    return null;
  };

  const getEventDescription = (e: TimelineEvent) => {
    switch (e.type) {
      case "USER_MESSAGE":      return `"${e.payload.content}"`;
      case "TOKEN_GROUP":       return `${e.tokenCount} tokens — ${((e.durationMs || 0) / 1000).toFixed(2)}s`;
      case "TOOL_CALL":         return `${e.payload.tool_name}`;
      case "TOOL_ACK":          return `ack ${e.payload.call_id}`;
      case "TOOL_RESULT":       return `result for ${e.payload.call_id}`;
      case "CONTEXT_SNAPSHOT":  return `ctx ${e.payload.context_id} (${Object.keys(e.payload.data || {}).length} keys)`;
      case "PING":              return `challenge: "${e.payload.challenge}"`;
      case "PONG":              return `echo: "${e.payload.echo}"`;
      case "RESUME":            return `last_seq: ${e.payload.last_seq}`;
      case "ERROR":             return `[${e.payload.code}] ${e.payload.message}`;
      default:                  return JSON.stringify(e.payload);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.75rem" }}>
      {/* Filter Bar */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search events…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-input"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-input"
        >
          <option value="ALL">All</option>
          <option value="TOKEN_GROUP">Streams</option>
          <option value="TOOL_CALL">Tool calls</option>
          <option value="TOOL_RESULT">Results</option>
          <option value="CONTEXT_SNAPSHOT">Contexts</option>
          <option value="PING_PONG">Heartbeats</option>
          <option value="ERROR">Errors</option>
        </select>
      </div>

      {/* Event List */}
      <div className="tab-content" style={{ padding: 0, flex: 1, overflowY: "auto" }}>
        {filteredEvents.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--text-3)", fontSize: "12px" }}>
            No events match the current filter.
          </div>
        ) : (
          <div className="timeline-list">
            {filteredEvents.map((e) => {
              const chatTargetId = getChatTargetId(e);
              const isGroup = e.isGroup;
              const isExpanded = expandedGroups[e.id] || false;
              const isHighlighted =
                highlightedId === e.id ||
                (e.payload?.call_id && highlightedId === e.payload.call_id);
              const isToolRelated = e.type === "TOOL_CALL" || e.type === "TOOL_RESULT";

              return (
                <div
                  key={e.id}
                  id={`timeline-row-${e.id}`}
                  className={`timeline-row ${e.direction} ${e.type} ${isHighlighted ? "highlighted" : ""}`}
                  style={{ marginLeft: isToolRelated ? "0.5rem" : "0" }}
                  onClick={() => onItemClick(e.id, chatTargetId)}
                >
                  <div className="timeline-row-header">
                    <span className="event-type-badge">{e.type}</span>
                    <span className="timeline-time">
                      {e.seq !== undefined && `#${e.seq} · `}
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="timeline-row-summary">{getEventDescription(e)}</div>

                  {isGroup && (
                    <div style={{ marginTop: "0.2rem" }}>
                      <button
                        className="btn-secondary"
                        onClick={(evt) => toggleGroup(e.id, evt)}
                        style={{ padding: "0.15rem 0.4rem", fontSize: "10px" }}
                      >
                        {isExpanded ? "Collapse" : "Expand text"}
                      </button>
                      {isExpanded && (
                        <div className="timeline-expanded">
                          <div style={{ fontStyle: "italic", fontSize: "11px", whiteSpace: "pre-wrap", color: "var(--text-2)" }}>
                            {e.fullText}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isGroup && e.payload && e.type !== "USER_MESSAGE" && (
                    <div style={{ marginTop: "0.2rem" }}>
                      <button
                        className="btn-secondary"
                        onClick={(evt) => toggleGroup(e.id, evt)}
                        style={{ padding: "0.15rem 0.4rem", fontSize: "10px" }}
                      >
                        {isExpanded ? "Hide payload" : "Show payload"}
                      </button>
                      {isExpanded && (
                        <div className="timeline-expanded">
                          <pre className="json-block">{JSON.stringify(e.payload, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}

                  {chatTargetId && (
                    <div className="timeline-link-indicator">Jump to chat item</div>
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
