import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { Chat, ChatMessage } from "./Chat";
import { Settings } from "./Settings";
import { ContextBadge } from "./ContextBadge";
import { ResizeHandle } from "./ResizeHandle";

interface NodeSummary {
  id: string;
  name: string;
  type: string;
}

interface PendingAction {
  summary: string;
  code: string;
  warnings: string[];
}

type AppView = "chat" | "settings";

function App() {
  const [view, setView] = useState<AppView>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<NodeSummary[]>([]);
  const [pageName, setPageName] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [isThinking, setIsThinking] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null
  );
  const [isExecuting, setIsExecuting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [connectionError, setConnectionError] = useState<string | undefined>();

  // Listen for messages from sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      switch (msg.type) {
        case "SELECTION_CHANGED":
          setSelectedNodes(msg.nodes);
          setPageName(msg.pageName);
          break;

        case "SETTINGS":
          setHasApiKey(msg.hasApiKey);
          setKeyPreview(msg.keyPreview || null);
          setModel(msg.model);
          if (!msg.hasApiKey) setView("settings");
          break;

        case "AI_THINKING":
          setIsThinking(true);
          break;

        case "AI_RESPONSE":
          setIsThinking(false);
          setPendingAction({
            summary: msg.summary,
            code: msg.code,
            warnings: msg.warnings,
          });
          setMessages(prev => [
            ...prev,
            {
              type: "ai-proposal",
              summary: msg.summary,
              code: msg.code,
              warnings: msg.warnings,
            },
          ]);
          break;

        case "AI_CLARIFICATION":
          setIsThinking(false);
          setMessages(prev => [...prev, { type: "ai", text: msg.question }]);
          break;

        case "AI_CHAT":
          setIsThinking(false);
          setMessages(prev => [...prev, { type: "ai", text: msg.text }]);
          break;

        case "EXECUTION_SUCCESS":
          setIsExecuting(false);
          setPendingAction(null);
          setMessages(prev => [
            ...prev,
            { type: "success", text: msg.summary },
          ]);
          break;

        case "EXECUTION_ERROR":
          setIsExecuting(false);
          setPendingAction(null);
          setMessages(prev => [...prev, { type: "error", text: msg.error }]);
          break;

        case "ERROR":
          setIsThinking(false);
          setIsExecuting(false);
          if (msg.message) {
            setMessages(prev => [...prev, { type: "error", text: msg.message }]);
          }
          break;

        case "TEST_CONNECTION_RESULT":
          if (msg.success) {
            setConnectionStatus("success");
            setConnectionError(undefined);
          } else {
            setConnectionStatus("error");
            setConnectionError(msg.error);
          }
          break;

      }
    };

    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "GET_SETTINGS" } }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleTestConnection = useCallback(() => {
    setConnectionStatus("testing");
    setConnectionError(undefined);
    parent.postMessage({ pluginMessage: { type: "TEST_CONNECTION" } }, "*");
  }, []);

  const sendMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, { type: "user", text }]);
    parent.postMessage(
      { pluginMessage: { type: "CHAT_MESSAGE", text } },
      "*"
    );
  }, []);

  const handleStop = useCallback(() => {
    setIsThinking(false);
    parent.postMessage({ pluginMessage: { type: "ABORT" } }, "*");
  }, []);

  const handleConfirm = useCallback(() => {
    setIsExecuting(true);
    setMessages(prev =>
      prev.map((m, i) =>
        i === prev.length - 1 && m.type === "ai-proposal"
          ? { ...m, status: "applying" as const }
          : m
      )
    );
    parent.postMessage({ pluginMessage: { type: "CONFIRM" } }, "*");
  }, []);

  const handleCancel = useCallback(() => {
    setPendingAction(null);
    setMessages(prev =>
      prev.map((m, i) =>
        i === prev.length - 1 && m.type === "ai-proposal"
          ? { ...m, status: "cancelled" as const }
          : m
      )
    );
    parent.postMessage({ pluginMessage: { type: "CANCEL" } }, "*");
  }, []);

  const handleSetApiKey = useCallback((key: string) => {
    parent.postMessage(
      { pluginMessage: { type: "SET_API_KEY", key } },
      "*"
    );
  }, []);

  const handleSetModel = useCallback(
    (newModel: string) => {
      setModel(newModel);
      parent.postMessage(
        { pluginMessage: { type: "SET_MODEL", model: newModel } },
        "*"
      );
    },
    []
  );

  if (view === "settings") {
    return (
      <div className="app">
        <header className="header">
          <h1>AI Design Copilot</h1>
          <div className="header-actions">
            {hasApiKey && (
              <span className="api-key-badge" title="API key saved">
                <span className="api-key-dot" />
                API connected
              </span>
            )}
            {hasApiKey && (
              <button
                className="icon-btn"
                onClick={() => setView("chat")}
                title="Back to chat"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M11.5 2.5l-9 9M2.5 2.5l9 9" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </button>
            )}
          </div>
        </header>
        <Settings
          hasApiKey={hasApiKey}
          keyPreview={keyPreview}
          model={model}
          connectionStatus={connectionStatus}
          connectionError={connectionError}
          onSetApiKey={handleSetApiKey}
          onSetModel={handleSetModel}
          onTestConnection={handleTestConnection}
          onClose={hasApiKey ? () => setView("chat") : undefined}
        />
        <ResizeHandle />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>AI Design Copilot</h1>
        <div className="header-actions">
          {hasApiKey && (
            <span className="api-key-badge" title="API key saved">
              <span className="api-key-dot" />
              API connected
            </span>
          )}
          <button
            className="icon-btn"
            onClick={() => setView("settings")}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10.5" y1="3.5" x2="15.5" y2="3.5" />
              <line x1=".5" y1="3.5" x2="2.5" y2="3.5" />
              <line x1="5.5" y1="12.5" x2=".5" y2="12.5" />
              <line x1="15.5" y1="12.5" x2="13.5" y2="12.5" />
              <circle cx="5" cy="3.5" r="2.5" />
              <circle cx="11" cy="12.5" r="2.5" />
            </svg>
          </button>
        </div>
      </header>
      <ContextBadge nodes={selectedNodes} pageName={pageName} />
      <Chat
        messages={messages}
        onSendMessage={sendMessage}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onStop={handleStop}
        isThinking={isThinking}
        isExecuting={isExecuting}
        hasPendingAction={!!pendingAction}
      />
      <ResizeHandle />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);
