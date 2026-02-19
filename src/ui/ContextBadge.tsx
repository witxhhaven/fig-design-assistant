import React from "react";

interface NodeSummary {
  id: string;
  name: string;
  type: string;
}

interface ContextBadgeProps {
  nodes: NodeSummary[];
  pageName: string;
}

export function ContextBadge({ nodes, pageName }: ContextBadgeProps) {
  let text: string;

  if (nodes.length === 0) {
    text = pageName ? `Page: ${pageName}` : "No selection";
  } else if (nodes.length === 1) {
    text = `${nodes[0].name} (${nodes[0].type})`;
  } else {
    text = `${nodes.length} layers selected`;
  }

  return (
    <div className="context-badge">
      <span
        className={`context-dot ${nodes.length > 0 ? "context-dot-active" : ""}`}
      />
      <span className="context-text">{text}</span>
    </div>
  );
}
