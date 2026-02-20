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
      <svg className="context-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4.5" y1="2.5" x2="11.5" y2="2.5" />
        <line x1="13.5" y1="4.5" x2="13.5" y2="9.5" />
        <line x1="11.5" y1="13.5" x2="4.5" y2="13.5" />
        <line x1="2.5" y1="4.5" x2="2.5" y2="9.5" />
        <rect x="0.5" y="0.5" width="4" height="4" />
        <rect x="11.5" y="0.5" width="4" height="4" />
        <rect x="0.5" y="11.5" width="4" height="4" />
        <rect x="11.5" y="11.5" width="4" height="4" />
      </svg>
      <span className="context-text">{text}</span>
    </div>
  );
}
