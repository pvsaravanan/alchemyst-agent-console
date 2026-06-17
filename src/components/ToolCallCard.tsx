import React from "react";

interface ToolCallCardProps {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: "pending" | "waiting" | "done";
  isHighlighted?: boolean;
  onClick?: () => void;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  callId,
  toolName,
  args,
  result,
  status,
  isHighlighted,
  onClick,
}) => {
  return (
    <div
      id={`chat-tool-${callId}`}
      className={`tool-card ${status} ${isHighlighted ? "flash-pulse" : ""}`}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <div className="tool-header">
        <div className="tool-title">
          <span className="tool-icon">fn</span>
          <span>{toolName}</span>
        </div>
        <div className={`tool-badge ${status}`}>
          {status === "waiting" ? "executing" : "done"}
        </div>
      </div>

      <div className="tool-body">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div>
            <span className="tool-label">Arguments</span>
            <pre className="json-block">{JSON.stringify(args, null, 2)}</pre>
          </div>

          {result && (
            <div>
              <span className="tool-label">Result</span>
              <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
