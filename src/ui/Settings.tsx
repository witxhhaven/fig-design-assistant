import React, { useState } from "react";

interface SettingsProps {
  hasApiKey: boolean;
  model: string;
  onSetApiKey: (key: string) => void;
  onSetModel: (model: string) => void;
  onClose?: () => void;
}

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Fast)" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6 (Powerful)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Fastest)" },
];

export function Settings({
  hasApiKey,
  model,
  onSetApiKey,
  onSetModel,
  onClose,
}: SettingsProps) {
  const [keyInput, setKeyInput] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSaveKey = () => {
    const key = keyInput.trim();
    if (!key) return;
    onSetApiKey(key);
    setKeyInput("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveKey();
    }
  };

  return (
    <div className="settings">
      <div className="settings-section">
        <label className="settings-label">Anthropic API Key</label>
        <p className="settings-hint">
          Your key is stored locally and never sent anywhere except the
          Anthropic API.{" "}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get a key
          </a>
        </p>
        <div className="settings-key-row">
          <input
            type="password"
            className="settings-input"
            placeholder={hasApiKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "sk-ant-..."}
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="btn btn-primary"
            onClick={handleSaveKey}
            disabled={!keyInput.trim()}
          >
            Save
          </button>
        </div>
        {saved && <p className="settings-saved">API key saved</p>}
      </div>

      <div className="settings-section">
        <label className="settings-label">Model</label>
        <select
          className="settings-select"
          value={model}
          onChange={e => onSetModel(e.target.value)}
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {onClose && (
        <div className="settings-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Back to Chat
          </button>
        </div>
      )}
    </div>
  );
}
