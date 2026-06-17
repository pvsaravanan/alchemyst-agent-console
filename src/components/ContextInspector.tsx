import React, { useState, useMemo } from "react";
import { ContextHistory, ContextSnapshot } from "../hooks/useAgentSocket";
import { computeJsonDiff, DiffNode } from "../utils/diffEngine";

interface ContextInspectorProps {
  contextHistory: Record<string, ContextHistory>;
  activeContextId: string | null;
  setIndex: (contextId: string, index: number) => void;
}

const TreeNode: React.FC<{ name: string; diff: DiffNode; depth: number }> = ({
  name,
  diff,
  depth,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(depth < 1);

  const hasChildren = !!diff.children;
  const type = diff.type;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const getBadgeClass = () => {
    if (type === "added")   return "diff-added";
    if (type === "removed") return "diff-removed";
    if (type === "changed" && !diff.children) return "diff-changed";
    return "";
  };

  const renderValue = (val: unknown) => {
    if (val === null) return <span className="tree-value null">null</span>;
    if (typeof val === "string")  return <span className="tree-value string">"{val}"</span>;
    if (typeof val === "number")  return <span className="tree-value number">{val}</span>;
    if (typeof val === "boolean") return <span className="tree-value boolean">{val.toString()}</span>;
    return <span className="tree-value">{JSON.stringify(val)}</span>;
  };

  return (
    <div className={`tree-node ${getBadgeClass()}`} style={{ paddingLeft: depth === 0 ? 0 : "1rem" }}>
      <div className="tree-node-header" onClick={hasChildren ? handleToggle : undefined}>
        {hasChildren ? (
          <span className="tree-toggle-icon">{isExpanded ? "▼" : "▶"}</span>
        ) : (
          <span className="tree-toggle-icon" style={{ opacity: 0 }}>▶</span>
        )}

        <span className="tree-key">{name}</span>
        <span style={{ color: "var(--text-3)" }}>:</span>

        {hasChildren ? (
          <span style={{ fontSize: "10px", color: "var(--text-3)", marginLeft: "0.25rem" }}>
            {Array.isArray(diff.value || diff.oldValue) ? "Array" : "Object"}
            {diff.type === "changed" && " (modified)"}
          </span>
        ) : (
          <span style={{ marginLeft: "0.375rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            {type === "changed" ? (
              <>
                <span style={{ textDecoration: "line-through", color: "var(--text-3)" }}>
                  {renderValue(diff.oldValue)}
                </span>
                <span style={{ color: "var(--text-3)" }}>→</span>
                <span>{renderValue(diff.value)}</span>
              </>
            ) : (
              renderValue(diff.value)
            )}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && diff.children && (
        <div style={{ marginTop: "0.1rem" }}>
          {Object.entries(diff.children).map(([key, childNode]) => (
            <TreeNode key={key} name={key} diff={childNode} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const ContextInspector: React.FC<ContextInspectorProps> = ({
  contextHistory,
  activeContextId,
  setIndex,
}) => {
  const contextIds = Object.keys(contextHistory);
  const selectedContextId = activeContextId || (contextIds.length > 0 ? contextIds[0] : null);
  const history = selectedContextId ? contextHistory[selectedContextId] : null;

  const diffTree = useMemo(() => {
    if (!history) return null;
    const current = history.snapshots[history.currentIndex];
    if (history.currentIndex === 0) return computeJsonDiff({}, current.data);
    const prev = history.snapshots[history.currentIndex - 1];
    return computeJsonDiff(prev.data, current.data);
  }, [history]);

  if (!selectedContextId || !history) {
    return (
      <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--text-3)", fontSize: "12px" }}>
        No context snapshots received yet.
      </div>
    );
  }

  const current = history.snapshots[history.currentIndex];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.75rem" }}>
      {/* Context selector */}
      {contextIds.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>Context:</span>
          <select
            value={selectedContextId}
            onChange={() => {}}
            className="text-input"
            style={{ padding: "0.25rem 0.5rem", fontSize: "11px" }}
          >
            {contextIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
      )}

      {/* Scrubber */}
      <div className="scrubber-panel">
        <div className="scrubber-controls">
          <button
            className="btn-secondary"
            disabled={history.currentIndex === 0}
            onClick={() => setIndex(selectedContextId, history.currentIndex - 1)}
            style={{ padding: "0.2rem 0.5rem", fontSize: "11px" }}
          >
            Prev
          </button>
          <span className="scrubber-counter">
            {history.currentIndex + 1} / {history.snapshots.length}
          </span>
          <button
            className="btn-secondary"
            disabled={history.currentIndex === history.snapshots.length - 1}
            onClick={() => setIndex(selectedContextId, history.currentIndex + 1)}
            style={{ padding: "0.2rem 0.5rem", fontSize: "11px" }}
          >
            Next
          </button>
        </div>
        <input
          type="range"
          min="0"
          max={history.snapshots.length - 1}
          value={history.currentIndex}
          onChange={(e) => setIndex(selectedContextId, parseInt(e.target.value, 10))}
          className="scrubber-slider"
          disabled={history.snapshots.length <= 1}
        />
        <div className="scrubber-meta">
          <span>seq {current.seq}</span>
          <span>{new Date(current.timestamp).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Tree */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: "var(--bg)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          padding: "0.75rem",
        }}
      >
        {diffTree && diffTree.children && Object.keys(diffTree.children).length > 0 ? (
          <div className="context-tree">
            {Object.entries(diffTree.children).map(([key, node]) => (
              <TreeNode key={key} name={key} diff={node} depth={0} />
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--text-3)", fontSize: "11px", fontStyle: "italic" }}>
            Empty snapshot.
          </div>
        )}
      </div>
    </div>
  );
};
