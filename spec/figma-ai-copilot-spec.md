# Figma AI Design Copilot — Claude Code Build Spec

## Build Instructions for Claude Code

**Date:** February 14, 2026
**Version:** 2.0 — Final

---

## 1. What This Plugin Is

**"Claude Code, but for Figma."**

A product designer opens this plugin inside a Figma design file. They get a chat panel. They describe what they want in plain English — "make the header background blue", "delete the footer section", "create a new page called Onboarding" — and the AI:

1. **Reads** the current Figma file structure (pages, layers, properties, hierarchy)
2. **Writes** actual Figma Plugin API JavaScript code to accomplish the task
3. **Shows** the designer what it plans to do — a human-readable summary + the code
4. The designer **confirms** → the plugin **executes** the code against the file
5. The designer can always **Cmd+Z to undo**

The AI has the full power of the Figma Plugin API. It is not limited to a pre-defined set of operations. Just like Claude Code writes any valid code for a codebase, this plugin's AI writes any valid Figma Plugin API code for a design file.

### Scoping

The designer can scope the AI's attention in three ways:

1. **Selection** — select frames or objects in Figma, then tell the AI what to do. The AI only sees and operates on the selected items.
2. **Layer name** — mention a layer by name in the chat (e.g., "change the color of 'Header/Title'"). The AI finds it.
3. **Whole page / file** — if nothing is selected and no name is mentioned, the AI sees the full current page.

When a layer name matches multiple nodes, the AI asks the user to pick which one, showing the full path of each match (e.g., "Login > Form > Title" vs "Settings > Header > Title").

---

## 2. Product Decisions (Locked)

| Decision | Choice |
|---|---|
| Core approach | AI writes Figma Plugin API JavaScript code, plugin executes via `eval()` |
| API key | BYOK — user provides their own Anthropic API key |
| Key storage | `figma.clientStorage` (per-user, local, not in code) |
| Backend server | None — direct fetch to `api.anthropic.com` from plugin sandbox |
| MVP scope | Chat + edit/create/delete layers, frames, and pages |
| Target user | Product designers who know Figma well |
| Undo | Always possible — every AI action is a single Cmd+Z |
| Distribution | Keep options open (private or Figma Community) |

---

## 3. Feasibility Confirmation

**Fully feasible.** Every required capability is confirmed in the Figma Plugin API:

| Capability | API | Status |
|---|---|---|
| Read all layers and properties | `figma.currentPage`, node traversal | ✅ |
| Modify any node property | Direct property assignment | ✅ |
| Create nodes | `figma.createFrame()`, `createText()`, `createRectangle()`, etc. | ✅ |
| Delete nodes | `node.remove()` | ✅ |
| Create pages | `figma.createPage()` | ✅ |
| Delete pages | `page.remove()` | ✅ |
| Switch pages | `figma.setCurrentPageAsync(page)` | ✅ |
| Execute AI-generated code | `eval()` works in plugin sandbox | ✅ |
| Read user selection | `figma.currentPage.selection` | ✅ |
| Find nodes by name | `figma.currentPage.findAll(predicate)` | ✅ |
| Undo batching | `figma.commitUndo()` | ✅ |
| Version snapshots | `figma.saveVersionHistoryAsync()` | ✅ |
| Network requests (Claude API) | `fetch()` from sandbox + `networkAccess` manifest | ✅ |
| Chat UI panel | `figma.showUI()` with HTML/React iframe | ✅ |
| Local storage for API key | `figma.clientStorage.setAsync/getAsync()` | ✅ |
| Load fonts before text edit | `figma.loadFontAsync()` | ✅ |
| Create components and variants | `figma.createComponent()`, `combineAsVariants()` | ✅ |
| Import images | `figma.createImageAsync(url)`, `figma.createImage(bytes)` | ✅ |
| Export node as image | `node.exportAsync({ format, ... })` | ✅ |

### Technical Constraints

1. **Plugin sandbox** — main thread JS environment. Has `eval()`, `fetch()`, `JSON`, `Promise`, `Uint8Array`, `console`, full ES6+. Does NOT have DOM, `XMLHttpRequest`, `localStorage`, `document`. All Figma API access happens here.
2. **UI iframe** — has full browser APIs (DOM, CSS, React) but has NO access to the Figma API. Communicates with the sandbox via `postMessage`.
3. **Single-file bundle** — all plugin code compiles to one `code.js` (sandbox) and one `ui.html` (iframe with inlined JS/CSS). Use esbuild to bundle.
4. **Plugin stays alive** — as long as the UI panel is open, the plugin is running. This supports the persistent chat experience. The plugin must eventually call `figma.closePlugin()` when the user closes it.
5. **Network whitelist** — `manifest.json` must list `api.anthropic.com` in `networkAccess.allowedDomains`. The plugin's sandbox `fetch()` is NOT subject to browser CORS.
6. **Fonts must be loaded** — before changing any text content, the code must call `await figma.loadFontAsync({ family, style })` or it will throw.
7. **Images** — PNG, JPG, GIF only. Max 4096x4096px.

---

## 4. Architecture

### 4.1 System Diagram

```
+------------------------------------------------------+
|                    FIGMA EDITOR                       |
|                                                      |
|  +-----------------+  postMessage  +--------------+  |
|  | PLUGIN SANDBOX  |<------------>| UI IFRAME     |  |
|  | (code.ts)       |              | (React app)   |  |
|  |                 |              |               |  |
|  | Responsibilities|              | - Chat UI     |  |
|  | - Read scene    |              | - Message     |  |
|  | - Serialize     |              |   history     |  |
|  |   nodes         |              | - Code preview|  |
|  | - Call Claude   |              | - Confirm/    |  |
|  |   API           |              |   Cancel      |  |
|  | - eval() AI     |              | - Settings    |  |
|  |   generated     |              | - API key     |  |
|  |   code          |              |   input       |  |
|  | - Undo batching |              |               |  |
|  | - Selection     |              |               |  |
|  |   listener      |              |               |  |
|  +-----------------+              +--------------+  |
|           |                                          |
|           | fetch()                                  |
|           v                                          |
|  +---------------------+                             |
|  | Anthropic API        |                             |
|  | api.anthropic.com    |                             |
|  | (user's own API key) |                             |
|  +---------------------+                             |
+------------------------------------------------------+
```

### 4.2 How a Request Flows (Step by Step)

```
1. DESIGNER types in the chat: "Make the header background #0066FF"

2. UI iframe sends the message to the sandbox via postMessage:
   { type: "CHAT_MESSAGE", text: "Make the header background #0066FF" }

3. SANDBOX reads the current Figma context:
   - figma.currentPage.selection (if any)
   - If nothing selected: figma.currentPage.children (all top-level layers)
   - Also: list of all pages in the file
   - Serializes everything into a compact JSON representation

4. SANDBOX calls the Claude API via fetch():
   - System prompt: "You are a Figma Plugin API expert..."
   - Context: serialized scene JSON
   - User message: "Make the header background #0066FF"
   - Claude responds with:
     {
       "summary": "Change the fill of 'Header' frame to #0066FF",
       "code": "const h = figma.getNodeById('1:23');\nif (h) {\n  h.fills = [{type: 'SOLID', color: {r: 0, g: 0.4, b: 1}}];\n}",
       "warnings": []
     }

5. SANDBOX sends the plan to the UI:
   { type: "AI_RESPONSE", summary: "...", code: "...", warnings: [] }

6. UI shows confirmation card:
   - Human-readable summary
   - Expandable code preview
   - [Apply] and [Cancel] buttons

7. DESIGNER clicks [Apply]

8. UI sends confirmation: { type: "CONFIRM" }

9. SANDBOX executes:
   - Wraps AI code in async IIFE + try/catch
   - eval(wrappedCode)
   - figma.commitUndo()  --> Makes it one Cmd+Z action
   - Sends success/failure back to UI

10. UI shows result: "Done - Header fill changed to #0066FF"
    With an "Undo" link
```

### 4.3 Message Protocol (postMessage between sandbox and UI)

```typescript
// -- UI to Sandbox --

{ type: "CHAT_MESSAGE", text: string }
  // User typed a message in the chat

{ type: "CONFIRM" }
  // User clicked Apply on a proposed change

{ type: "CANCEL" }
  // User clicked Cancel on a proposed change

{ type: "SET_API_KEY", key: string }
  // User entered their Anthropic API key in settings

{ type: "GET_SETTINGS" }
  // UI requests current settings on load

{ type: "DISAMBIGUATE", nodeId: string }
  // User picked a specific node when duplicates were found


// -- Sandbox to UI --

{ type: "SELECTION_CHANGED", nodes: NodeSummary[] }
  // User's Figma selection changed

{ type: "AI_THINKING" }
  // Claude API call in progress

{ type: "AI_RESPONSE", summary: string, code: string, warnings: string[] }
  // AI generated a plan

{ type: "AI_CLARIFICATION", question: string }
  // AI needs more info

{ type: "DISAMBIGUATION_NEEDED", options: { id: string, name: string, path: string }[] }
  // Multiple nodes matched a name

{ type: "EXECUTION_SUCCESS", summary: string }
  // Code executed successfully

{ type: "EXECUTION_ERROR", error: string }
  // Code execution failed

{ type: "SETTINGS", hasApiKey: boolean, model: string }
  // Current settings (never sends the actual key to the UI)
```

---

## 5. Scene Serialization

This is the most critical piece. The plugin reads the Figma file and converts it to a compact JSON representation that Claude can understand and reference in the code it writes.

### 5.1 What Gets Serialized

```typescript
interface SceneContext {
  file: {
    name: string;
    pages: { id: string; name: string; isCurrent: boolean }[];
  };
  scope: "selection" | "page";
  scopeDescription: string;  // e.g., "3 layers selected" or "Page: Home"
  nodes: SerializedNode[];
}

interface SerializedNode {
  id: string;         // Figma node ID -- the AI uses this in code
  name: string;
  type: string;       // FRAME, TEXT, RECTANGLE, GROUP, COMPONENT, INSTANCE, etc.
  x: number;
  y: number;
  width: number;
  height: number;

  // Visual properties (only included if non-default)
  fills?: any[];
  strokes?: any[];
  opacity?: number;          // Only if not 1
  visible?: boolean;         // Only if false
  cornerRadius?: number;
  effects?: any[];
  blendMode?: string;        // Only if not NORMAL

  // Text-specific (only for TEXT nodes)
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  lineHeight?: any;
  letterSpacing?: any;

  // Layout (only for auto-layout frames)
  layoutMode?: string;       // HORIZONTAL or VERTICAL
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;

  // Component info
  componentId?: string;
  variantProperties?: object;

  // Children (recursive)
  children?: SerializedNode[];
  childCount?: number;       // When children are truncated
}
```

### 5.2 Serialization Rules

1. **Depth limit: 6 levels.** Beyond 6, show `{ childCount: N }` instead of expanding.
2. **Omit defaults.** Don't include `opacity: 1`, `visible: true`, `blendMode: "NORMAL"`, `rotation: 0`.
3. **Selection focus.** If the user selected specific nodes, only serialize those subtrees. Include the parent chain up to the page for context (names only).
4. **Page list always included.** Even when focused on a selection, include all pages so the AI knows what exists for page-level operations.
5. **Token budget: ~6,000 tokens** for scene context. If serialized JSON exceeds this, progressively reduce depth.
6. **Node IDs are critical.** The AI uses them in code: `figma.getNodeById("1:234")`.

### 5.3 Serialization Code

```typescript
function serializeNode(node: SceneNode, depth: number, maxDepth: number): SerializedNode {
  const result: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    x: Math.round(node.x),
    y: Math.round(node.y),
    width: Math.round(node.width),
    height: Math.round(node.height),
  };

  // Fills
  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    result.fills = serializeFills(node.fills);
  }

  // Strokes
  if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
    result.strokes = node.strokes;
  }

  // Opacity (only if non-default)
  if ("opacity" in node && node.opacity !== 1) {
    result.opacity = node.opacity;
  }

  // Visibility (only if hidden)
  if ("visible" in node && node.visible === false) {
    result.visible = false;
  }

  // Corner radius
  if ("cornerRadius" in node && node.cornerRadius !== 0) {
    result.cornerRadius = node.cornerRadius;
  }

  // Effects
  if ("effects" in node && node.effects.length > 0) {
    result.effects = node.effects;
  }

  // Text properties
  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    result.characters = textNode.characters;
    if (typeof textNode.fontSize === "number") result.fontSize = textNode.fontSize;
    if (typeof textNode.fontName === "object") {
      result.fontFamily = (textNode.fontName as FontName).family;
      result.fontStyle = (textNode.fontName as FontName).style;
    }
    if (textNode.textAlignHorizontal !== "LEFT") {
      result.textAlignHorizontal = textNode.textAlignHorizontal;
    }
  }

  // Auto layout
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    const frame = node as FrameNode;
    result.layoutMode = frame.layoutMode;
    result.paddingTop = frame.paddingTop;
    result.paddingRight = frame.paddingRight;
    result.paddingBottom = frame.paddingBottom;
    result.paddingLeft = frame.paddingLeft;
    result.itemSpacing = frame.itemSpacing;
    result.primaryAxisAlignItems = frame.primaryAxisAlignItems;
    result.counterAxisAlignItems = frame.counterAxisAlignItems;
  }

  // Component / Instance info
  if (node.type === "INSTANCE") {
    const inst = node as InstanceNode;
    if (inst.mainComponent) result.componentId = inst.mainComponent.id;
    if (inst.variantProperties) result.variantProperties = inst.variantProperties;
  }

  // Children
  if ("children" in node) {
    if (depth < maxDepth) {
      result.children = (node as FrameNode).children.map(child =>
        serializeNode(child as SceneNode, depth + 1, maxDepth)
      );
    } else {
      result.childCount = (node as FrameNode).children.length;
    }
  }

  return result;
}

function buildSceneContext(): SceneContext {
  const selection = figma.currentPage.selection;

  const pages = figma.root.children.map(page => ({
    id: page.id,
    name: page.name,
    isCurrent: page.id === figma.currentPage.id,
  }));

  let scope: "selection" | "page";
  let nodes: SerializedNode[];
  let scopeDescription: string;

  if (selection.length > 0) {
    scope = "selection";
    scopeDescription = `${selection.length} layer${selection.length > 1 ? "s" : ""} selected`;
    nodes = selection.map(n => serializeNode(n, 0, 6));
  } else {
    scope = "page";
    scopeDescription = `Page: ${figma.currentPage.name}`;
    nodes = figma.currentPage.children.map(n => serializeNode(n as SceneNode, 0, 4));
  }

  return { file: { name: figma.root.name, pages }, scope, scopeDescription, nodes };
}
```

---

## 6. AI Integration

### 6.1 Claude API Call

The sandbox calls the Anthropic API directly. No server needed.

```typescript
async function callClaude(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  apiKey: string,
  model: string
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}
```

### 6.2 System Prompt

This is sent to Claude with every request. It teaches the AI how to read the scene context and write correct Figma Plugin API code.

```
You are an AI assistant embedded in a Figma plugin. You help product designers edit their Figma design files by writing Figma Plugin API JavaScript code.

## How This Works

1. You receive a JSON representation of the current Figma file (or selected layers).
2. The user describes what they want in plain English.
3. You write JavaScript code using the Figma Plugin API to accomplish it.
4. The code will be executed in the Figma plugin sandbox via eval().

## Response Format

ALWAYS respond with valid JSON in this exact structure:

{
  "summary": "One-line human-readable description of what the code does",
  "code": "// The JavaScript code to execute\n...",
  "warnings": ["Optional array of warnings, e.g., 'This will delete 5 layers'"],
  "clarification": null
}

If you need more information from the user before you can write code, respond with:

{
  "summary": null,
  "code": null,
  "warnings": [],
  "clarification": "Your question to the user"
}

## Code Rules

1. Use node IDs from the context. Access nodes via figma.getNodeById("nodeId"). The IDs are provided in the scene context JSON.
2. Always check for null. figma.getNodeById() can return null.
3. Load fonts before changing text. Before setting characters, fontSize, or fontName on a TextNode, ALWAYS call: await figma.loadFontAsync({ family: "FontName", style: "Style" }). Read the current font from the node first.
4. The code runs in an async context. You can use await. The code is wrapped in an async IIFE before execution.
5. Do NOT call figma.closePlugin(). The plugin stays open for conversation.
6. Do NOT call figma.commitUndo(). The plugin handles undo batching automatically.
7. Use figma.notify() for user feedback. Example: figma.notify("Updated 3 layers")
8. Colors use 0-1 range. Figma colors are {r: 0-1, g: 0-1, b: 0-1}, NOT 0-255. Convert hex to 0-1 float.
9. Scope your changes. Only modify what the user asked for.
10. For destructive operations (delete), always include a warning in the warnings array.

## Finding Nodes

- By ID (preferred): figma.getNodeById("1:234")
- By name: figma.currentPage.findOne(n => n.name === "Header")
- All matching: figma.currentPage.findAll(n => n.type === "TEXT")
- Children: node.children (for container types)

## Common Operations Quick Reference

Change fill:
  node.fills = [{ type: "SOLID", color: { r: 0, g: 0.4, b: 1 } }]

Change text (MUST load font first):
  await figma.loadFontAsync(node.fontName)
  node.characters = "New text"

Resize:
  node.resize(200, 100)

Move:
  node.x = 100; node.y = 200

Create frame:
  const frame = figma.createFrame()
  frame.name = "Card"
  frame.resize(300, 200)

Create text:
  const text = figma.createText()
  await figma.loadFontAsync({ family: "Inter", style: "Regular" })
  text.characters = "Hello"

Delete node:
  node.remove()

Create page:
  const page = figma.createPage()
  page.name = "New Page"

Delete page:
  page.remove()

Switch page:
  await figma.setCurrentPageAsync(page)

Set auto layout:
  frame.layoutMode = "VERTICAL"
  frame.paddingTop = 16
  frame.itemSpacing = 8

Set corner radius:
  node.cornerRadius = 8

Set opacity:
  node.opacity = 0.5

Add child to frame:
  parentFrame.appendChild(childNode)

Clone node:
  const clone = node.clone()

Zoom to view:
  figma.viewport.scrollAndZoomIntoView([node])

## Disambiguation

If the user references a layer by name and the context shows multiple nodes with that name, respond with a clarification listing the options with their full path. For example:

{
  "summary": null,
  "code": null,
  "warnings": [],
  "clarification": "I found 3 layers named 'Title'. Which one?\n\n1. Login > Header > Title (Text: 'Sign In')\n2. Home > Hero > Title (Text: 'Welcome')\n3. Settings > Title (Text: 'Preferences')"
}

## Destructive Operations

For any operation that deletes nodes or pages, ALWAYS include a warning:

{
  "summary": "Delete the Footer frame and all its children",
  "code": "...",
  "warnings": ["This will permanently delete the 'Footer' frame and its 12 child layers. You can undo with Cmd+Z."]
}
```

### 6.3 Response Parsing

```typescript
interface AIResponse {
  summary: string | null;
  code: string | null;
  warnings: string[];
  clarification: string | null;
}

function parseAIResponse(rawText: string): AIResponse {
  let cleaned = rawText.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  return {
    summary: parsed.summary || null,
    code: parsed.code || null,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    clarification: parsed.clarification || null,
  };
}
```

---

## 7. Code Execution Engine

```typescript
async function executeAICode(code: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Wrap in async IIFE so the AI can use await
    const wrappedCode = `(async () => {\n${code}\n})()`;
    await eval(wrappedCode);

    // Commit as a single undo step
    figma.commitUndo();

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || String(error),
    };
  }
}

async function executeWithSafety(
  code: string,
  hasWarnings: boolean
): Promise<{ success: boolean; error?: string }> {
  // For destructive operations, save a version checkpoint first
  if (hasWarnings) {
    await new Promise(r => setTimeout(r, 500));
    await figma.saveVersionHistoryAsync("AI Copilot — auto-saved before change");
    await new Promise(r => setTimeout(r, 500));
  }

  return executeAICode(code);
}
```

### Safety Measures

1. **Confirmation step.** User always sees summary + code before execution. Nothing runs automatically.
2. **try/catch wrapper.** If code throws, it fails gracefully. Partial changes are still undoable.
3. **figma.commitUndo().** All changes become one Cmd+Z action.
4. **Version snapshots.** For destructive operations (flagged via warnings), auto-save version history before executing.
5. **User reviews code.** Product designers can inspect the code preview before clicking Apply.

---

## 8. Undo Management

- By default, plugin actions are NOT in the undo stack. `figma.commitUndo()` adds them.
- After each successful AI code execution, the plugin calls `figma.commitUndo()`. This makes all changes from that execution a single Cmd+Z action.
- Multiple AI edits in a row = multiple undo steps. Cmd+Z three times reverts three edits.
- For destructive operations, the plugin also saves a version history checkpoint BEFORE executing, as an extra safety net.

```
AI execution 1: "Changed header color"        -> commitUndo() -> Cmd+Z reverts
AI execution 2: "Added new text layer"         -> commitUndo() -> Cmd+Z reverts
AI execution 3: "Deleted footer" (+ auto save) -> commitUndo() -> Cmd+Z reverts
```

---

## 9. Conversation History

Multi-turn conversation so the AI remembers context.

```typescript
class ConversationManager {
  private history: { role: "user" | "assistant"; content: string }[] = [];
  private maxMessages = 10;

  addUserMessage(text: string, sceneContext: string) {
    const content = `[Scene Context]\n${sceneContext}\n\n[User Request]\n${text}`;
    this.history.push({ role: "user", content });
    this.trim();
  }

  addUserFollowUp(text: string) {
    this.history.push({ role: "user", content: text });
    this.trim();
  }

  addAssistantMessage(response: string) {
    this.history.push({ role: "assistant", content: response });
    this.trim();
  }

  getMessages() {
    return [...this.history];
  }

  clear() {
    this.history = [];
  }

  private trim() {
    if (this.history.length > this.maxMessages) {
      this.history = this.history.slice(-this.maxMessages);
    }
  }
}
```

This enables flows like:
```
User: "Make the header blue"
AI: [changes header to blue]
User: "Actually make it darker"         <- AI knows "it" = the header
AI: [changes header to darker blue]
User: "And add a bottom border"         <- AI still knows the context
AI: [adds border to header]
```

---

## 10. Project Structure

```
figma-ai-copilot/
|-- manifest.json              # Plugin manifest
|-- package.json
|-- tsconfig.json
|-- esbuild.config.js          # Build config
|
|-- src/
|   |-- code.ts                # Plugin sandbox entry point
|   |                          # - Shows UI, listens for messages
|   |                          # - Reads scene, calls Claude, executes code
|   |                          # - Manages undo
|   |
|   |-- scene.ts               # Scene serialization
|   |                          # - serializeNode(), buildSceneContext()
|   |
|   |-- ai.ts                  # Claude API client
|   |                          # - callClaude(), parseAIResponse()
|   |                          # - ConversationManager
|   |
|   |-- executor.ts            # Code execution engine
|   |                          # - executeAICode(), executeWithSafety()
|   |
|   |-- types.ts               # Shared TypeScript types
|   |
|   |-- ui/
|       |-- index.html         # HTML shell
|       |-- App.tsx            # Root React component
|       |-- Chat.tsx           # Chat message list + input
|       |-- ConfirmCard.tsx    # Confirmation card with code preview
|       |-- Settings.tsx       # API key + model settings
|       |-- ContextBadge.tsx   # Shows current selection/scope
|       |-- styles.css         # Styles matching Figma UI
|
|-- dist/                      # Build output
    |-- code.js                # Bundled sandbox code
    |-- ui.html                # Bundled UI with inlined JS/CSS
```

### Manifest

```json
{
  "name": "AI Design Copilot",
  "id": "ai-design-copilot-001",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "networkAccess": {
    "allowedDomains": ["api.anthropic.com"],
    "reasoning": "Calls Claude AI API to process design instructions using user's own API key"
  },
  "documentAccess": "dynamic-page"
}
```

### Build Config (esbuild)

```javascript
const esbuild = require("esbuild");
const fs = require("fs");

// Build sandbox code
esbuild.buildSync({
  entryPoints: ["src/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2020",
  format: "iife",
});

// Build UI
esbuild.buildSync({
  entryPoints: ["src/ui/App.tsx"],
  bundle: true,
  outfile: "dist/ui_bundle.js",
  target: "es2020",
  format: "iife",
  loader: { ".tsx": "tsx", ".ts": "ts", ".css": "css" },
  define: { "process.env.NODE_ENV": '"production"' },
});

// Inline into HTML
const js = fs.readFileSync("dist/ui_bundle.js", "utf8");
const css = fs.readFileSync("src/ui/styles.css", "utf8");
fs.writeFileSync("dist/ui.html", `<!DOCTYPE html>
<html><head><style>${css}</style></head>
<body><div id="root"></div><script>${js}</script></body></html>`);
```

### Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@figma/plugin-typings": "^1.100.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.4.0"
  }
}
```

---

## 11. UI Specification

### 11.1 Chat Panel Layout

```
+--------------------------------------+
| AI Design Copilot            [gear]  |  <- Header
+--------------------------------------+
|                                      |
|  +--------------------------------+  |
|  | [blue dot] 3 layers selected   |  |  <- Context badge
|  +--------------------------------+  |
|                                      |
|  +- You -------------+               |
|  | Make the header background        |
|  | #0066FF                           |
|  +-----------------------------------+
|                                      |
|  +- AI --------------+               |
|  | Change Header fill to #0066FF     |  <- Summary
|  |                                   |
|  | > View code                       |  <- Expandable
|  | +-------------------------------+ |
|  | | const h = figma               | |  <- Code preview
|  | |   .getNodeById("1:23");       | |
|  | | if (h) h.fills = [{...}];     | |
|  | +-------------------------------+ |
|  |                                   |
|  | [Apply]         [Cancel]          |  <- Action buttons
|  +-----------------------------------+
|                                      |
|  +- System -----------+              |
|  | Done - Header fill changed        |  <- Success
|  | [Undo]                            |
|  +-----------------------------------+
|                                      |
+--------------------------------------+
| [clip] Type a message...      [send] |  <- Input
+--------------------------------------+
```

### 11.2 UI States

| State | What Shows |
|---|---|
| No API key | Settings panel with API key input |
| Idle | Chat input enabled, context badge shows selection |
| Thinking | Spinner + "Analyzing your design..." |
| Clarification | AI question in chat, user types response |
| Confirmation | Summary + code preview + Apply/Cancel |
| Executing | Spinner + "Applying changes..." |
| Success | Green message + Undo link |
| Error | Red error message + retry option |
| Destructive warning | Orange/red confirmation with warning text |

### 11.3 Settings Panel

Via gear icon in header:

- **API Key** — password input. Stored in `figma.clientStorage`. Shows "API key saved" after entry, never displays the key.
- **Model** — dropdown: `claude-sonnet-4-20250514` (default, faster) or `claude-opus-4-6` (smarter, slower).
- **Auto-confirm simple changes** — toggle. When on, non-destructive single-property changes skip confirmation. Off by default.

### 11.4 Styling

Use Figma's theme colors. Set `themeColors: true` in `figma.showUI()` so Figma injects CSS variables:

```css
body {
  font-family: Inter, system-ui, sans-serif;
  font-size: 12px;
  color: var(--figma-color-text);
  background: var(--figma-color-bg);
}
```

Plugin panel size: `width: 360, height: 600`.

---

## 12. Error Handling

| Error | Response |
|---|---|
| No API key | Show settings panel prompting for key |
| Invalid API key | "Invalid API key. Get yours at console.anthropic.com" |
| Rate limited | "Rate limited. Retrying in 30 seconds..." + auto-retry |
| Network failure | "Can't reach Claude API. Check your connection." + retry button |
| Invalid JSON from AI | "Unexpected response. Trying again..." + auto-retry once |
| AI code throws | "The code hit an error: [message]. Partial changes can be undone with Cmd+Z." |
| Node not found by name | "No layer named '[name]'. Did you mean: [suggestions]?" |
| Font not available | AI handles via loadFontAsync; fallback to Inter |
| Huge file | "This page has many layers. Select specific frames for better results." |
| Plugin crash | Changes tracked by Figma regardless — Cmd+Z still works |

---

## 13. MVP Scope Summary

### What to Build

- Plugin scaffold (manifest, esbuild, sandbox + UI)
- Chat UI with React (message history, input, context badge)
- Settings panel (API key, model selector)
- Scene serializer (selection and page and page list to JSON)
- Claude API integration (fetch from sandbox, BYOK)
- System prompt with full Plugin API knowledge
- AI response parser (JSON extraction from Claude's response)
- Code execution engine (eval in async IIFE + try/catch)
- Undo management (figma.commitUndo per execution)
- Confirmation flow (summary + expandable code preview + Apply/Cancel)
- Destructive operation warnings (orange/red card)
- Version snapshots before destructive operations
- Selection change listener (live context badge)
- Conversation history (multi-turn within session)
- Error handling for all cases above

### What's Supported via AI Code Generation (no special implementation needed)

Because the AI writes raw Plugin API code, all of these work out of the box:

- Change fills, strokes, effects, opacity, corner radius, blend mode
- Change text content, font, size, alignment, color, decoration
- Resize and reposition any node
- Set auto layout, padding, spacing, alignment
- Create frames, rectangles, ellipses, text, lines
- Delete any node or page
- Create new pages, switch pages
- Rename, duplicate, group, ungroup nodes
- Reparent nodes (move into different frames)
- Set visibility, locked state
- Set constraints
- Clone nodes
- Zoom viewport to nodes

---

## 14. Future Phases (High-Level Outlines)

### Phase 2: Component Operations
- Create component variants from a base component (clone, modify, name with `Property=Value` convention, `combineAsVariants()`)
- Smart component updates preserving instance overrides (catalog overrides before changing main component, ask user about overridden instances)
- Component property management (boolean, text, instance-swap properties)

### Phase 3: Image to Design
- User pastes screenshot into chat
- Export as base64, send to Claude Vision API
- Claude analyzes layout, writes code to recreate as Figma layers
- Iterative refinement ("make the header taller")

### Phase 4: Style and Variable Operations
- Read/apply local styles (paint, text, effect)
- Create/manage design variables
- Apply variables to node properties
- Theme switching via modes

### Phase 5: Multi-Page Intelligence
- Cross-page operations ("apply this header to all pages")
- Design system awareness across pages
- Batch operations with progress reporting

### Phase 6: Polish and Publishing
- Streaming AI responses
- Keyboard shortcuts
- Onboarding flow
- Figma Community listing

---

## 15. Token Budget and Cost

### Per Request Estimate

| Component | Tokens |
|---|---|
| System prompt | ~2,000 |
| Scene context | ~2,000 to 6,000 |
| Conversation history | ~2,000 |
| User message | ~100 |
| **Total input** | **~6,000 to 10,000** |
| AI response | ~500 to 1,500 |

### Cost (claude-sonnet-4-20250514)

- Simple edit: ~$0.03
- Complex edit: ~$0.06
- Session of 20 edits: ~$0.60 to $1.20

---

## 16. Figma Plugin API Quick Reference

Most commonly used APIs the AI will write code against:

```javascript
// Scene Access
figma.root                              // Document root
figma.root.children                     // All pages
figma.currentPage                       // Active page
figma.currentPage.selection             // Selected nodes
figma.currentPage.findAll(fn)           // Find all matching
figma.currentPage.findOne(fn)           // Find first matching
figma.getNodeById(id)                   // By ID (returns null if not found)

// Node Creation
figma.createFrame()
figma.createRectangle()
figma.createEllipse()
figma.createLine()
figma.createText()
figma.createComponent()
figma.createPage()
node.clone()

// Properties
node.name, node.x, node.y
node.resize(w, h)
node.rotation, node.opacity, node.visible, node.locked
node.fills, node.strokes, node.strokeWeight
node.effects, node.cornerRadius, node.blendMode
node.remove()

// Text (MUST load font first)
await figma.loadFontAsync({ family, style })
textNode.characters, textNode.fontSize, textNode.fontName
textNode.textAlignHorizontal, textNode.textAlignVertical
textNode.lineHeight, textNode.letterSpacing

// Auto Layout
frame.layoutMode  // "VERTICAL" | "HORIZONTAL" | "NONE"
frame.paddingTop/Right/Bottom/Left
frame.itemSpacing
frame.primaryAxisAlignItems, frame.counterAxisAlignItems
frame.layoutSizingHorizontal/Vertical  // "HUG" | "FILL" | "FIXED"

// Hierarchy
parent.appendChild(child)
parent.insertChild(index, child)
node.parent

// Components and Variants
figma.createComponent()
figma.createComponentFromNode(node)
figma.combineAsVariants(nodes, parent)
component.createInstance()
instance.mainComponent
instance.setProperties({...})

// Pages
figma.createPage()
await figma.setCurrentPageAsync(page)
page.remove()

// Images
const img = await figma.createImageAsync(url)
node.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: "FILL" }]

// Undo and History
figma.commitUndo()
await figma.saveVersionHistoryAsync("description")

// UI
figma.showUI(__html__, { width: 360, height: 600, themeColors: true })
figma.ui.postMessage(data)
figma.ui.onmessage = (msg) => { ... }

// Storage
await figma.clientStorage.setAsync(key, value)
await figma.clientStorage.getAsync(key)

// Fonts
await figma.loadFontAsync({ family: "Inter", style: "Regular" })
await figma.listAvailableFontsAsync()

// Events
figma.on("selectionchange", () => { ... })
figma.on("currentpagechange", () => { ... })

// Viewport
figma.viewport.scrollAndZoomIntoView(nodes)

// Notifications
figma.notify("message")
figma.notify("error", { error: true })
```

---

## 17. Build Order for Claude Code

Follow this order. Each step should work before moving to the next.

### Step 1: Project Setup
```
- npm init, install all dependencies
- Create manifest.json, tsconfig.json, esbuild.config.js
- Create file structure from Section 10
- Build script that produces dist/code.js and dist/ui.html
- Verify: npm run build succeeds
```

### Step 2: Minimal Plugin Shell
```
- code.ts: figma.showUI(__html__, { width: 360, height: 600, themeColors: true })
- code.ts: basic postMessage listener
- code.ts: selection change listener that sends to UI
- ui/App.tsx: minimal React app rendering "AI Design Copilot"
- ui/App.tsx: basic onmessage listener
- Verify: plugin loads in Figma, shows UI panel, two-way messages work
```

### Step 3: Settings and API Key
```
- Settings.tsx: API key input field, model dropdown
- code.ts: store/retrieve API key via figma.clientStorage
- Show settings on first launch when no key is stored
- Verify: enter key, restart plugin, key persists
```

### Step 4: Chat UI
```
- Chat.tsx: scrollable message list, text input, send button
- Message types: user bubble, AI bubble, system message
- ContextBadge.tsx: shows selection count or page name
- Update badge when selection changes
- Verify: type messages, they appear, badge updates with selection
```

### Step 5: Scene Serializer
```
- scene.ts: serializeNode() and buildSceneContext()
- Depth limiting, default omission, token estimation
- Verify: select layers, log serialized JSON, check accuracy
```

### Step 6: Claude API Integration
```
- ai.ts: callClaude() with fetch
- System prompt from Section 6.2
- parseAIResponse() from Section 6.3
- ConversationManager for multi-turn
- Wire: user message -> serialize -> call Claude -> log response
- Verify: send request, get valid JSON with code back
```

### Step 7: Confirmation Flow
```
- ConfirmCard.tsx: summary text, expandable code block, Apply/Cancel
- Wire: AI response -> show card in chat
- Verify: AI suggests change, card shows, buttons send messages
```

### Step 8: Code Execution
```
- executor.ts: executeAICode() with eval + try/catch + commitUndo
- executeWithSafety() with version snapshot for warnings
- Wire: Apply -> execute -> show success or error
- Verify: change a fill color, confirm, Cmd+Z undoes it
```

### Step 9: Integration and Polish
```
- Destructive warning styling (orange/red card)
- Error handling for all Section 12 cases
- Conversation follow-ups work (multi-turn)
- Selection change re-serializes context on next message
- Empty state when no messages yet
- Loading states, disabled input while thinking
```

### Step 10: Testing Checklist
```
[ ] Change fill color on selected frame
[ ] Change text content (font loads correctly)
[ ] Create a new frame with auto layout and children
[ ] Delete a frame (warning shown)
[ ] Create a new page
[ ] Delete a page (warning shown)
[ ] Rename a layer
[ ] Multiple property changes in one request
[ ] Follow-up request (AI remembers context)
[ ] Reference layer by name (not selection)
[ ] Duplicate name disambiguation
[ ] Undo works (single Cmd+Z per AI action)
[ ] Invalid API key error
[ ] Network failure error
[ ] AI code error caught and displayed
[ ] Settings persist between restarts
[ ] Context badge updates live
[ ] Large page serializes without crashing
```
