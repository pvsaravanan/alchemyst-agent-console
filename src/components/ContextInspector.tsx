import React, { useState, useMemo } from "react";
import { ContextHistory, ContextSnapshot } from "../hooks/useAgentSocket";
import { computeJsonDiff, DiffNode } from "../utils/diffEngine";

interface ContextInspectorProps {
  contextHistory: Record<string, ContextHistory>;
  activeContextId: string | null;
  setIndex: (contextId: string, index: number) => void;
}

// Tree Node Renderer Component
const TreeNode: React.FC<{
  name: string;
  diff: DiffNode;
  depth: number;
}> = ({ name, diff, depth }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(depth < 1); // Expand level 0 by default

  const hasChildren = !!diff.children;
  const type = diff.type;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const getBadgeColor = () => {
    if (type === "added") return "diff-added";
    if (type === "removed") return "diff-removed";
    if (type === "changed" && !diff.children) return "diff-changed";
    return "";
  };

  // Helper to get type of leaf
  const getLeafType = (val: any) => {
    if (val === null) return "null";
    return typeof val;
  };

  const renderValue = (val: any) => {
    if (val === null) return <span className="tree-value null">null</span>;
    if (typeof val === "string") return <span className="tree-value string">"{val}"</span>;
    if (typeof val === "number") return <span className="tree-value number">{val}</span>;
    if (typeof val === "boolean") return <span className="tree-value boolean">{val.toString()}</span>;
    return <span className="tree-value">{JSON.stringify(val)}</span>;
  };

  return (
    <div className={`tree-node ${getBadgeColor()}`} style={{ paddingLeft: depth === 0 ? 0 : "1rem" }}>
      <div className="tree-node-header" onClick={hasChildren ? handleToggle : undefined}>
        {hasChildren ? (
          <span className="tree-toggle-icon">{isExpanded ? "▼" : "▶"}</span>
        ) : (
          <span className="tree-toggle-icon" style={{ opacity: 0 }}>▶</span>
        )}

        <span className="tree-key">{name}</span>
        <span>:</span>

        {hasChildren ? (
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "0.25rem" }}>
            {Array.isArray(diff.value || diff.oldValue) ? "Array" : "Object"}
            {diff.type === "changed" && " (modified)"}
          </span>
        ) : (
          <span style={{ marginLeft: "0.5rem", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            {type === "changed" ? (
              <>
                <span style={{ textDecoration: "line-through", color: "var(--text-muted)" }}>
                  {renderValue(diff.oldValue)}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>→</span>
                <span>{renderValue(diff.value)}</span>
              </>
            ) : (
              renderValue(diff.value)
            )}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && diff.children && (
        <div style={{ marginTop: "0.15rem" }}>
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
  // If there are multiple active contexts
  const contextIds = Object.keys(contextHistory);
  const selectedContextId = activeContextId || (contextIds.length > 0 ? contextIds[0] : null);

  const history = selectedContextId ? contextHistory[selectedContextId] : null;

  // Compute the diff tree for the current index against the previous snapshot
  const diffTree = useMemo(() => {
    if (!history) return null;
    const currentSnapshot = history.snapshots[history.currentIndex];
    
    // If first snapshot, diff against empty object
    if (history.currentIndex === 0) {
      return computeJsonDiff({}, currentSnapshot.data);
    }
    
    const prevSnapshot = history.snapshots[history.currentIndex - 1];
    return computeJsonDiff(prevSnapshot.data, currentSnapshot.data);
  }, [history]);

  if (!selectedContextId || !history) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1.5rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
        No context snapshots received yet.
      </div>
    );
  }

  const currentSnapshot = history.snapshots[history.currentIndex];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "1rem" }}>
      {/* Selector if multiple contexts exist */}
      {contextIds.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Context ID:</span>
          <select
            value={selectedContextId}
            onChange={() => {}}
            className="text-input"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", borderRadius: "4px" }}
          >
            {contextIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* History Scrubber Panel */}
      <div className="scrubber-panel">
        <div className="scrubber-controls">
          <button
            className="btn-secondary"
            disabled={history.currentIndex === 0}
            onClick={() => setIndex(selectedContextId, history.currentIndex - 1)}
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", borderRadius: "4px" }}
          >
            ◀ Back
          </button>
          <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
            Snapshot {history.currentIndex + 1} of {history.snapshots.length}
          </span>
          <button
            className="btn-secondary"
            disabled={history.currentIndex === history.snapshots.length - 1}
            onClick={() => setIndex(selectedContextId, history.currentIndex + 1)}
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", borderRadius: "4px" }}
          >
            Next ▶
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
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)" }}>
          <span>Seq: {currentSnapshot.seq}</span>
          <span>{new Date(currentSnapshot.timestamp).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Interactive Lazy Tree View */}
      <div style={{ flex: 1, overflowY: "auto", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid var(--border-color)", padding: "1rem" }}>
        {diffTree && diffTree.children && Object.keys(diffTree.children).length > 0 ? (
          <div className="context-tree">
            {Object.entries(diffTree.children).map(([key, node]) => (
              <TreeNode key={key} name={key} diff={node} depth={0} />
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontStyle: "italic" }}>
            Empty snapshot data.
          </div>
        )}
      </div>
    </div>
  );
};
