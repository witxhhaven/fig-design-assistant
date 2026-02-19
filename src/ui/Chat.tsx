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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const isInputDisabled = isThinking || isExecuting || hasPendingAction;

  return (
    <div className="chat">
      <div className="messages">
        {messages.length === 0 && !isThinking && (
          <div className="empty-state">
            <p className="empty-title">What would you like to change?</p>
            <p className="empty-hint">
              Select layers in Figma, then describe what you want:
            </p>
            <div className="empty-examples">
              <span className="example">
                "Make the header background blue"
              </span>
              <span className="example">
                "Change the title text to 'Welcome'"
              </span>
              <span className="example">
                "Create a new card with auto layout"
              </span>
              <span className="example">"Delete the footer section"</span>
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
              <span className="thinking-text">Analyzing your design...</span>
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
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder={
            isInputDisabled ? "Waiting..." : "Type a message..."
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
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 1.5l13 6.5-13 6.5v-5l8-1.5-8-1.5v-5z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
