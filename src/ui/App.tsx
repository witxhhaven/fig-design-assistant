import React, { useState, useEffect, useCallback, useRef } from "react";
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
  const [customRules, setCustomRules] = useState("");
  const [defaultCustomRules, setDefaultCustomRules] = useState("");
  const [creativeDesignMode, setCreativeDesignMode] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null
  );
  const [isExecuting, setIsExecuting] = useState(false);
  const [lockedContext, setLockedContext] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [connectionError, setConnectionError] = useState<string | undefined>();
  const [showHelp, setShowHelp] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const helpRef = useRef<HTMLDivElement>(null);

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
          setCustomRules(msg.customRules || "");
          setDefaultCustomRules(msg.defaultCustomRules || "");
          setCreativeDesignMode(msg.creativeDesignMode || false);
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
          setLockedContext(null);
          setMessages(prev => [...prev, { type: "ai", text: msg.question }]);
          break;

        case "AI_CHAT":
          setIsThinking(false);
          setLockedContext(null);
          setMessages(prev => [...prev, { type: "ai", text: msg.text }]);
          break;

        case "EXECUTION_SUCCESS":
          setIsExecuting(false);
          setPendingAction(null);
          setLockedContext(null);
          setMessages(prev => [
            ...prev,
            { type: "success", text: msg.summary },
          ]);
          break;

        case "EXECUTION_ERROR":
          setIsExecuting(false);
          setPendingAction(null);
          setLockedContext(null);
          setMessages(prev => [...prev, { type: "error", text: msg.error }]);
          break;

        case "ERROR":
          setIsThinking(false);
          setIsExecuting(false);
          setLockedContext(null);
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

  // Close help popover on outside click
  useEffect(() => {
    if (!showHelp) return;
    const handleClick = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [showHelp]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setPendingAction(null);
    setIsThinking(false);
    setIsExecuting(false);
    setChatKey(prev => prev + 1);
    parent.postMessage({ pluginMessage: { type: "CLEAR_CHAT" } }, "*");
  }, []);

  const handleTestConnection = useCallback(() => {
    setConnectionStatus("testing");
    setConnectionError(undefined);
    parent.postMessage({ pluginMessage: { type: "TEST_CONNECTION" } }, "*");
  }, []);

  const sendMessage = useCallback((text: string) => {
    // Lock context badge to show what selection is being used
    let contextText: string;
    if (selectedNodes.length === 0) {
      contextText = pageName ? `Page: ${pageName}` : "No selection";
    } else if (selectedNodes.length === 1) {
      contextText = selectedNodes[0].name;
    } else {
      contextText = `${selectedNodes.length} layers`;
    }
    setLockedContext(contextText);

    setMessages(prev => [...prev, { type: "user", text }]);
    parent.postMessage(
      { pluginMessage: { type: "CHAT_MESSAGE", text } },
      "*"
    );
  }, [selectedNodes, pageName]);

  const handleStop = useCallback(() => {
    setIsThinking(false);
    setLockedContext(null);
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
    setLockedContext(null);
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

  const handleSetCustomRules = useCallback((rules: string) => {
    setCustomRules(rules);
    parent.postMessage(
      { pluginMessage: { type: "SET_CUSTOM_RULES", rules } },
      "*"
    );
  }, []);

  const handleSetCreativeDesignMode = useCallback((enabled: boolean) => {
    setCreativeDesignMode(enabled);
    parent.postMessage(
      { pluginMessage: { type: "SET_CREATIVE_DESIGN_MODE", enabled } },
      "*"
    );
  }, []);

  if (view === "settings") {
    return (
      <div className="app">
        <header className="header">
          <span className="header-title">Settings</span>
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
          customRules={customRules}
          defaultCustomRules={defaultCustomRules}
          creativeDesignMode={creativeDesignMode}
          connectionStatus={connectionStatus}
          connectionError={connectionError}
          onSetApiKey={handleSetApiKey}
          onSetModel={handleSetModel}
          onSetCustomRules={handleSetCustomRules}
          onSetCreativeDesignMode={handleSetCreativeDesignMode}
          onTestConnection={handleTestConnection}
          onClose={hasApiKey ? () => setView("chat") : undefined}
        />
        <ResizeHandle />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          {hasApiKey && (
            <span className="api-key-badge" title="API key saved">
              <span className="api-key-dot" />
              API connected
            </span>
          )}
          <span className="toolbar-model-label">{
            model.includes("opus") ? "Opus" :
            model.includes("haiku") ? "Haiku" : "Sonnet"
          }</span>
        </div>
        <div className="toolbar-right">
          <button
            className="icon-btn"
            onClick={handleClearChat}
            title="Clear chat"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M13 4v9.33a1.33 1.33 0 01-1.33 1.34H4.33A1.33 1.33 0 013 13.33V4" />
            </svg>
          </button>
          <div className="help-wrapper" ref={helpRef}>
            <button
              className="icon-btn"
              onClick={() => setShowHelp(!showHelp)}
              title="Keyboard shortcuts"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="7" />
                <path d="M6 6a2 2 0 013.89.67c0 1.33-2 1.33-2 2.66M8 11.33h.01" />
              </svg>
            </button>
            {showHelp && (
              <div className="help-popover">
                <div className="help-title">Keyboard Shortcuts</div>
                <div className="help-row"><kbd>Enter</kbd> <span>Send message</span></div>
                <div className="help-row"><kbd>Shift+Enter</kbd> <span>New line</span></div>
                <div className="help-row"><kbd>Esc</kbd> <span>Stop AI</span></div>
                <div className="help-row"><kbd>Option+Up</kbd> <span>Previous message</span></div>
                <div className="help-row"><kbd>Option+Down</kbd> <span>Next message</span></div>
              </div>
            )}
          </div>
          <button
            className="icon-btn"
            onClick={() => setView("settings")}
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
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
      <ContextBadge nodes={selectedNodes} pageName={pageName} lockedContext={lockedContext} />
      <Chat
        key={chatKey}
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
