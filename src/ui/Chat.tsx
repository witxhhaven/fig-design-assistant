import React, { useState, useRef, useEffect } from "react";
import { ConfirmCard } from "./ConfirmCard";
import { Markdown } from "./Markdown";

export interface ChatMessage {
  type: "user" | "ai" | "ai-proposal" | "success" | "error";
  text?: string;
  summary?: string;
  code?: string;
  warnings?: string[];
  status?: "applying" | "cancelled";
}

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onStop: () => void;
  isThinking: boolean;
  isExecuting: boolean;
  hasPendingAction: boolean;
}

const EXAMPLES = [
  "Create a pricing card component",
  "Build a navigation bar with links",
  "Design a login form with inputs",
  "Make a hero section with CTA button",
];

const THINKING_MESSAGES = [
  "Thinking...",
  "Working on it...",
  "Cooking something up...",
  "Brewing ideas...",
  "Let me figure this out...",
  "On it...",
  "Crunching the pixels...",
  "Designing a plan...",
  "Give me a sec...",
  "Processing...",
  "Almost got it...",
  "Putting it together...",
  "Hmm, let me see...",
  "Working some magic...",
  "Figuring things out...",
];

export function Chat({
  messages,
  onSendMessage,
  onConfirm,
  onCancel,
  onStop,
  isThinking,
  isExecuting,
  hasPendingAction,
}: ChatProps) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draft, setDraft] = useState("");
  const [thinkingMessage, setThinkingMessage] = useState(THINKING_MESSAGES[0]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isThinking) {
      const idx = Math.floor(Math.random() * THINKING_MESSAGES.length);
      setThinkingMessage(THINKING_MESSAGES[idx]);
    }
  }, [isThinking]);

  const resizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  useEffect(() => {
    resizeInput();
  }, [input]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isThinking) {
        e.preventDefault();
        onStop();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isThinking, onStop]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isThinking || isExecuting || hasPendingAction) return;
    setHistory(prev => [...prev, text]);
    setHistoryIndex(-1);
    setDraft("");
    setInput("");
    onSendMessage(text);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape" && isThinking) {
      e.preventDefault();
      onStop();
    }
    // Option+Up: cycle to older messages
    if (e.key === "ArrowUp" && e.altKey && history.length > 0) {
      e.preventDefault();
      if (historyIndex === -1) {
        setDraft(input);
        const newIndex = history.length - 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      } else if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    }
    // Option+Down: cycle to newer messages or restore draft
    if (e.key === "ArrowDown" && e.altKey && historyIndex !== -1) {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      } else {
        setHistoryIndex(-1);
        setInput(draft);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
      setDraft("");
    }
  };

  const handleExampleClick = (text: string) => {
    if (isThinking || isExecuting || hasPendingAction) return;
    onSendMessage(text);
  };

  const isInputDisabled = isThinking || isExecuting || hasPendingAction;

  return (
    <div className="chat">
      <div className="messages">
        {messages.length === 0 && !isThinking && (
          <div className="empty-state">
            <div className="empty-icon">&#10024;</div>
            <p className="empty-title">What would you like to change?</p>
            <p className="empty-hint">
              Select layers in Figma, then describe what you want
            </p>
            <div className="empty-examples">
              {EXAMPLES.map((ex, i) => (
                <span
                  key={i}
                  className="example-chip"
                  onClick={() => handleExampleClick(ex)}
                >
                  {ex}
                </span>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          switch (msg.type) {
            case "user":
              return (
                <div key={i} className="message message-user">
                  <div className="message-text">{msg.text}</div>
                </div>
              );

            case "ai":
              return (
                <div key={i} className="message message-ai">
                  <div className="message-text">
                    <Markdown content={msg.text || ""} />
                  </div>
                </div>
              );

            case "ai-proposal":
              return (
                <div key={i} className="message message-ai">
                  <ConfirmCard
                    summary={msg.summary!}
                    code={msg.code!}
                    warnings={msg.warnings || []}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                    status={msg.status}
                    isLast={i === messages.length - 1}
                  />
                </div>
              );

            case "success":
              return (
                <div
                  key={i}
                  className="message message-system message-success"
                >
                  <div className="message-text">
                    <span className="success-icon">&#10003;</span> {msg.text}
                  </div>
                </div>
              );

            case "error":
              return (
                <div key={i} className="message message-system message-error">
                  <div className="message-text">{msg.text}</div>
                </div>
              );

            default:
              return null;
          }
        })}

        {isThinking && (
          <div className="message message-ai">
            <div className="thinking">
              <div className="thinking-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="thinking-text">{thinkingMessage}</span>
            </div>
          </div>
        )}

        {isExecuting && (
          <div className="message message-system">
            <div className="thinking">
              <div className="thinking-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="thinking-text">Applying changes...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="input-bar">
        <div className={`input-wrapper ${isInputDisabled ? "input-wrapper-disabled" : ""}`}>
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={
              isInputDisabled ? "Waiting..." : "Describe what you want..."
            }
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isInputDisabled}
            rows={1}
          />
          {isThinking ? (
            <button
              className="send-btn stop-btn"
              onClick={onStop}
              title="Stop (Esc)"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
                <rect x="2" y="2" width="10" height="10" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              className="send-btn"
              onClick={handleSubmit}
              disabled={isInputDisabled || !input.trim()}
              title="Send"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 13.5L13.5 8 3 2.5v4.3l5.5 1.2L3 9.2v4.3z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
