import React, { useState } from "react";

interface ConfirmCardProps {
  summary: string;
  code: string;
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
  status?: "applying" | "cancelled";
  isLast: boolean;
}

export function ConfirmCard({
  summary,
  code,
  warnings,
  onConfirm,
  onCancel,
  status,
  isLast,
}: ConfirmCardProps) {
  const [showCode, setShowCode] = useState(false);

  const hasWarnings = warnings.length > 0;
  const isActive = !status && isLast;

  return (
    <div
      className={`confirm-card ${hasWarnings ? "confirm-card-warning" : ""}`}
    >
      <div className="confirm-summary">{summary}</div>

      {warnings.map((w, i) => (
        <div key={i} className="confirm-warning">
          &#9888; {w}
        </div>
      ))}

      <button
        className="code-toggle"
        onClick={() => setShowCode(!showCode)}
      >
        {showCode ? "\u25BC Hide code" : "\u25B6 View code"}
      </button>

      {showCode && (
        <pre className="code-preview">
          <code>{code}</code>
        </pre>
      )}

      {isActive && (
        <div className="confirm-actions">
          <button className="btn btn-primary" onClick={onConfirm}>
            Apply
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}

      {status === "applying" && (
        <div className="confirm-status">Applying...</div>
      )}

      {status === "cancelled" && (
        <div className="confirm-status confirm-status-cancelled">
          Cancelled
        </div>
      )}
    </div>
  );
}
