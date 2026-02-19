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
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [isThinking, setIsThinking] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null
  );
  const [isExecuting, setIsExecuting] = useState(false);

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
          setMessages(prev => [...prev, { type: "error", text: msg.message }]);
          break;

      }
    };

    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "GET_SETTINGS" } }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  const sendMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, { type: "user", text }]);
    parent.postMessage(
      { pluginMessage: { type: "CHAT_MESSAGE", text } },
      "*"
    );
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
        </header>
        <Settings
          hasApiKey={hasApiKey}
          model={model}
          onSetApiKey={handleSetApiKey}
          onSetModel={handleSetModel}

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
        <button
          className="icon-btn"
          onClick={() => setView("settings")}
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M6.5 1h3l.4 2 .9.4 1.8-1.1 2.1 2.1-1.1 1.8.4.9 2 .4v3l-2 .4-.4.9 1.1 1.8-2.1 2.1-1.8-1.1-.9.4-.4 2h-3l-.4-2-.9-.4-1.8 1.1-2.1-2.1 1.1-1.8-.4-.9-2-.4v-3l2-.4.4-.9L1.3 3.4l2.1-2.1 1.8 1.1.9-.4L6.5 1z"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </header>
      <ContextBadge nodes={selectedNodes} pageName={pageName} />
      <Chat
        messages={messages}
        onSendMessage={sendMessage}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
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
