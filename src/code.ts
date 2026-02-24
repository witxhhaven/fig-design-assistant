import { buildSceneContext } from "./scene";
import { callClaude, parseAIResponse, ConversationManager } from "./ai";
import { executeWithSafety } from "./executor";
import { NodeSummary, AIResponse, MessageContent } from "./types";

// Show UI
figma.showUI(__html__, { width: 360, height: 600, themeColors: true });

// State
let apiKey: string | null = null;
let model = "claude-sonnet-4-6";
const DEFAULT_CUSTOM_RULES = `- Always use auto-layout when creating new frames or containers
- Use 8px spacing grid (padding, gaps, margins should be multiples of 8)
- Give layers descriptive names (e.g. "Header / Nav Link" not "Frame 47")
- After creating or modifying nodes, zoom to them with figma.viewport.scrollAndZoomIntoView()
- When creating text, default to Inter Regular 14px unless specified otherwise
- Prefer using existing local styles and variables when they match what's needed`;
let customRules = DEFAULT_CUSTOM_RULES;
let creativeDesignMode = false;
let pendingResponse: AIResponse | null = null;
let lastUserRequest = "";
let lastSelectionKey = "";
const conversation = new ConversationManager();

// ── Session logging ──

const sessionId = new Date().toISOString().replace(/[:.]/g, "-");
const sessionLog: {
  sessionId: string;
  startedAt: string;
  fileName: string;
  entries: {
    timestamp: string;
    type: string;
    role?: string;
    text?: string;
    summary?: string;
    code?: string;
    warnings?: string[];
    error?: string;
    userRequest?: string;
  }[];
}  = {
  sessionId,
  startedAt: new Date().toISOString(),
  fileName: "",
  entries: [],
};

function logEntry(entry: typeof sessionLog.entries[0]) {
  entry.timestamp = new Date().toISOString();
  sessionLog.entries.push(entry);
  saveLog();
  // If it's an error type, also log to the error tracker
  if (entry.type === "error" || entry.type === "execution_error" || entry.type === "parse_error") {
    logError(entry);
  }
}

async function saveLog() {
  try {
    sessionLog.fileName = figma.root.name;
    fetch("http://localhost:3001/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionLog),
    }).catch(function() {});
    await figma.clientStorage.setAsync("log_" + sessionId, sessionLog);
    var index: string[] =
      (await figma.clientStorage.getAsync("log_index")) || [];
    if (index.indexOf(sessionId) === -1) {
      index.push(sessionId);
      await figma.clientStorage.setAsync("log_index", index);
    }
  } catch (_e) {}
}

function logError(entry: any) {
  fetch("http://localhost:3001/error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: sessionId,
      fileName: figma.root.name,
      timestamp: entry.timestamp,
      errorType: entry.type,
      error: entry.error || null,
      code: entry.code || null,
      summary: entry.summary || null,
      userRequest: entry.userRequest || null,
    }),
  }).catch(function() {});
}

// No export/download needed — log server saves to logs/ folder automatically

// ── Load settings on startup ──

function maskKey(key: string | null): string | null {
  if (!key || key.length < 10) return null;
  return key.slice(0, 5) + "..." + key.slice(-5);
}

async function loadSettings() {
  apiKey = (await figma.clientStorage.getAsync("apiKey")) || null;
  model =
    (await figma.clientStorage.getAsync("model")) || "claude-sonnet-4-6";
  const savedRules = await figma.clientStorage.getAsync("customRules");
  customRules = savedRules ?? DEFAULT_CUSTOM_RULES;
  const savedCreativeMode = await figma.clientStorage.getAsync("creativeDesignMode");
  creativeDesignMode = savedCreativeMode === true;
  figma.ui.postMessage({
    type: "SETTINGS",
    hasApiKey: !!apiKey,
    keyPreview: maskKey(apiKey),
    model,
    customRules,
    defaultCustomRules: DEFAULT_CUSTOM_RULES,
    creativeDesignMode,
  });
}

loadSettings();

// ── Selection & page change listeners ──

function sendSelectionState() {
  const nodes: NodeSummary[] = figma.currentPage.selection.map(n => ({
    id: n.id,
    name: n.name,
    type: n.type,
  }));
  figma.ui.postMessage({
    type: "SELECTION_CHANGED",
    nodes,
    pageName: figma.currentPage.name,
  });
}

figma.on("selectionchange", sendSelectionState);
figma.on("currentpagechange", sendSelectionState);

// Send initial state after UI is ready
setTimeout(sendSelectionState, 100);

// ── Handle messages from UI ──

figma.ui.onmessage = async (msg: any) => {
  switch (msg.type) {
    case "CHAT_MESSAGE":
      await handleChatMessage(msg.text);
      break;

    case "CONFIRM":
      await handleConfirm();
      break;

    case "CANCEL":
      pendingResponse = null;
      logEntry({ type: "cancel", timestamp: "" });
      break;

    case "ABORT":
      logEntry({ type: "abort", timestamp: "" });
      break;

    case "CLEAR_CHAT":
      conversation.clear();
      pendingResponse = null;
      logEntry({ type: "clear_chat", timestamp: "" });
      break;

    case "SET_API_KEY":
      await figma.clientStorage.setAsync("apiKey", msg.key);
      apiKey = msg.key;
      figma.ui.postMessage({ type: "SETTINGS", hasApiKey: true, keyPreview: maskKey(apiKey), model, customRules, defaultCustomRules: DEFAULT_CUSTOM_RULES, creativeDesignMode });
      break;

    case "SET_MODEL":
      await figma.clientStorage.setAsync("model", msg.model);
      model = msg.model;
      break;

    case "SET_CUSTOM_RULES":
      await figma.clientStorage.setAsync("customRules", msg.rules);
      customRules = msg.rules;
      break;

    case "SET_CREATIVE_DESIGN_MODE":
      await figma.clientStorage.setAsync("creativeDesignMode", msg.enabled);
      creativeDesignMode = msg.enabled;
      break;

    case "GET_SETTINGS":
      figma.ui.postMessage({ type: "SETTINGS", hasApiKey: !!apiKey, keyPreview: maskKey(apiKey), model, customRules, defaultCustomRules: DEFAULT_CUSTOM_RULES, creativeDesignMode });
      break;

    case "RESIZE":
      figma.ui.resize(msg.width, msg.height);
      break;

    case "TEST_CONNECTION":
      await testConnection();
      break;

  }
};

// ── Test connection ──

async function testConnection() {
  if (!apiKey) {
    figma.ui.postMessage({ type: "TEST_CONNECTION_RESULT", success: false, error: "No API key set" });
    return;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    if (response.ok) {
      figma.ui.postMessage({ type: "TEST_CONNECTION_RESULT", success: true });
    } else if (response.status === 401) {
      figma.ui.postMessage({ type: "TEST_CONNECTION_RESULT", success: false, error: "Invalid API key" });
    } else if (response.status === 429) {
      figma.ui.postMessage({ type: "TEST_CONNECTION_RESULT", success: false, error: "Rate limited — try again later" });
    } else {
      figma.ui.postMessage({ type: "TEST_CONNECTION_RESULT", success: false, error: `API error (${response.status})` });
    }
  } catch (error: any) {
    figma.ui.postMessage({ type: "TEST_CONNECTION_RESULT", success: false, error: error.message || "Network error" });
  }
}

// ── Image detection + export ──

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0;
    result += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)]
      + (i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '=')
      + (i + 2 < bytes.length ? chars[c & 63] : '=');
  }
  return result;
}

async function exportSelectedImage(): Promise<string | null> {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return null;

  for (const node of selection) {
    // Check if node has image fills
    if (!("fills" in node)) continue;
    const fills = node.fills;
    if (!Array.isArray(fills)) continue;
    const hasImage = fills.some(function(f: any) { return f.type === "IMAGE" && f.visible !== false; });
    if (!hasImage) continue;

    // Determine export scale — cap large images to keep under ~1MB
    let scale = 1;
    if (node.width > 2000 || node.height > 2000) {
      scale = 0.5;
    }

    const pngBytes = await (node as SceneNode).exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: scale },
    });

    return uint8ArrayToBase64(pngBytes);
  }

  return null;
}

// ── Chat handler ──

async function handleChatMessage(text: string) {
  if (!apiKey) {
    figma.ui.postMessage({
      type: "ERROR",
      message: "Please set your API key in settings first.",
    });
    return;
  }

  lastUserRequest = text;
  logEntry({ type: "user_message", role: "user", text, timestamp: "" });
  figma.ui.postMessage({ type: "AI_THINKING" });

  try {
    // Build scene context
    const sceneContext = await buildSceneContext();
    const sceneJson = JSON.stringify(sceneContext);

    // Detect selection change — if user switched to a different element, start fresh
    // Only clear when going from one specific selection to a DIFFERENT specific selection.
    // Don't clear when selection goes to nothing (page scope) — user may have just
    // clicked the plugin input or deselected while reading AI responses.
    const currentSelectionKey = sceneContext.scope === "selection"
      ? sceneContext.nodes.map(function(n) { return n.id; }).sort().join(",")
      : "";
    if (currentSelectionKey && lastSelectionKey && currentSelectionKey !== lastSelectionKey) {
      conversation.clear();
    }
    if (currentSelectionKey) {
      lastSelectionKey = currentSelectionKey;
    }

    // Export selected image if present
    const imageBase64 = await exportSelectedImage();

    // Build message content — mixed content if image found, plain string otherwise
    let userContent: MessageContent;
    if (imageBase64) {
      userContent = [
        { type: "image", source: { type: "base64", media_type: "image/png", data: imageBase64 } },
        { type: "text", text: text },
      ];
    } else {
      userContent = text;
    }

    // Add to conversation history
    conversation.addUserMessage(userContent);

    // Call Claude
    const rawResponse = await callClaude(
      conversation.getMessages(),
      apiKey,
      model,
      sceneJson,
      customRules,
      creativeDesignMode
    );

    conversation.addAssistantMessage(rawResponse);

    // Parse response
    let aiResponse: AIResponse;
    try {
      aiResponse = parseAIResponse(rawResponse);
    } catch (_parseError: any) {
      // Log parse error and retry
      logEntry({
        type: "parse_error",
        error: "Invalid JSON from AI: " + (_parseError.message || String(_parseError)),
        userRequest: lastUserRequest,
        timestamp: "",
      });
      figma.ui.postMessage({ type: "AI_THINKING" });

      const retryMessages = [
        ...conversation.getMessages(),
        {
          role: "user" as const,
          content:
            "Your previous response was not valid JSON. Please respond with ONLY valid JSON in the required format.",
        },
      ];

      const retryResponse = await callClaude(retryMessages, apiKey, model, sceneJson, customRules, creativeDesignMode);
      conversation.addAssistantMessage(retryResponse);
      aiResponse = parseAIResponse(retryResponse);
    }

    // Handle chat message (no code, just conversation)
    if (aiResponse.message && !aiResponse.code) {
      logEntry({
        type: "ai_message",
        role: "assistant",
        text: aiResponse.message,
        timestamp: "",
      });
      figma.ui.postMessage({
        type: "AI_CHAT",
        text: aiResponse.message,
      });
      return;
    }

    // Handle code response
    if (aiResponse.code && aiResponse.summary) {
      logEntry({
        type: "ai_proposal",
        role: "assistant",
        summary: aiResponse.summary,
        code: aiResponse.code,
        warnings: aiResponse.warnings,
        timestamp: "",
      });
      pendingResponse = aiResponse;
      figma.ui.postMessage({
        type: "AI_RESPONSE",
        summary: aiResponse.summary,
        code: aiResponse.code,
        warnings: aiResponse.warnings,
      });
      return;
    }

    // Fallback: response had neither message nor code
    figma.ui.postMessage({
      type: "ERROR",
      message: "Unexpected response from AI. Please try again.",
    });
  } catch (error: any) {
    let message = error.message || String(error);

    if (message === "INVALID_API_KEY") {
      message = "Invalid API key. Please update your key in settings.";
    } else if (message === "RATE_LIMITED") {
      message =
        "Rate limited by Claude API. Please wait a moment and try again.";
    } else if (
      message.includes("Failed to fetch") ||
      message.includes("NetworkError")
    ) {
      message = "Can't reach Claude API. Check your connection.";
    }

    logEntry({ type: "error", error: message, userRequest: lastUserRequest, timestamp: "" });
    figma.ui.postMessage({ type: "ERROR", message });
  }
}

// ── Confirm handler ──

async function handleConfirm() {
  if (!pendingResponse || !pendingResponse.code) return;

  const response = pendingResponse;
  pendingResponse = null;

  const result = await executeWithSafety(
    response.code,
    response.warnings.length > 0
  );

  if (result.success) {
    logEntry({
      type: "execution_success",
      summary: response.summary || "Changes applied",
      code: response.code,
      timestamp: "",
    });
    figma.ui.postMessage({
      type: "EXECUTION_SUCCESS",
      summary: response.summary || "Changes applied",
    });
  } else {
    logEntry({
      type: "execution_error",
      code: response.code,
      error: result.error,
      summary: response.summary || "",
      userRequest: lastUserRequest,
      timestamp: "",
    });
    figma.ui.postMessage({
      type: "EXECUTION_ERROR",
      error: `The code hit an error: ${result.error}`,
    });
  }
}
