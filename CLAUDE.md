# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run build    # One-time production build
npm run watch    # Rebuild on file changes
npm run logs     # Start log server (saves to logs/)
npm run dev      # Log server + watch together (use this for development)
```

No test framework is configured. The log server (`localhost:3001`) is optional — the plugin works without it.

## Architecture

This is a Figma plugin ("AI Design Copilot") where Claude writes Figma Plugin API code that gets executed via `eval()`. Users bring their own Anthropic API key.

### Two Execution Contexts

Figma plugins run in **two isolated contexts** that communicate via message passing:

1. **Sandbox** (`src/code.ts`) — Has access to the Figma API but no DOM. Orchestrates everything: receives user messages, builds scene context, calls Claude API, executes generated code.
2. **UI** (`src/ui/App.tsx`) — React app rendered in an iframe. Handles chat interface, settings, and displays AI proposals for user confirmation.

Messages flow: `UI → postMessage → Sandbox → postMessage → UI`. All message types are defined in `src/types.ts`.

### Request Lifecycle

```
User sends message
  → code.ts: buildSceneContext() serializes selected layers + variables + styles
  → code.ts: callClaude() sends conversation + scene JSON to Anthropic API
  → Claude returns JSON: { summary, code, warnings, message }
  → UI shows proposal with confirm/cancel
  → On confirm: executor.ts wraps code in async IIFE and eval()s it
  → On success: figma.commitUndo() batches the changes
```

### Key Files

| File | Role |
|------|------|
| `src/ai.ts` | System prompt + Claude API client + ConversationManager. **Most frequently edited** — this is where all Figma API guidance for Claude lives. |
| `src/code.ts` | Sandbox entry point. Message routing, session logging, selection tracking, conversation auto-clear on selection change. Detects image fills on selected nodes and exports them as base64 PNG for Claude's vision API. |
| `src/scene.ts` | Serializes Figma nodes to JSON (async — `serializeNode` returns `Promise<SerializedNode>`). Includes fills with bound variable names, text styles, variables, and an `emptySpot` for placing new designs. |
| `src/executor.ts` | `eval()` wrapper. Auto-retries font loading errors (up to 3x). Saves version snapshot before destructive operations. |
| `src/types.ts` | All TypeScript interfaces for messages, serialized nodes, scene context, AI response. Includes `ContentBlock` and `MessageContent` types for mixed text+image messages. |

### Build Pipeline (esbuild.config.js)

Two separate bundles:
- **Sandbox**: `src/code.ts` → `dist/code.js` (target: ES2017, IIFE)
- **UI**: `src/ui/App.tsx` → `dist/ui_bundle.js` (target: ES2020, IIFE)

After bundling, the config inlines `ui_bundle.js` + `styles.css` into `dist/ui.html`. The manifest points to `dist/code.js` and `dist/ui.html`.

## Critical: documentAccess: "dynamic-page"

The manifest uses `"documentAccess": "dynamic-page"`, which **disables all synchronous Figma API methods**. Every method that has an async variant MUST use it:
- `figma.getNodeByIdAsync()` not `figma.getNodeById()`
- `node.setTextStyleIdAsync()` not `node.textStyleId = x`
- `node.setFillStyleIdAsync()` not `node.fillStyleId = x`
- All variable/style getters must be async

This is the most common source of runtime errors. When adding new Figma API calls or updating the system prompt, always use async variants.

## System Prompt (src/ai.ts)

The system prompt teaches Claude how to write Figma Plugin API code. Key documented gotchas:
- Async-only API (see above)
- Font loading required before any text operation; font style names have spaces (`"Semi Bold"` not `"SemiBold"`)
- Font loading wrapped in try/catch with fallback to Inter Regular
- Colors are 0-1 floats, not 0-255. Fills/strokes use `{r,g,b}` + `opacity` on paint; effects use `{r,g,b,a}` (RGBA) — different formats
- Effects (`DROP_SHADOW`, `INNER_SHADOW`) require `blendMode: "NORMAL"` and all fields
- `layoutSizingHorizontal`/`layoutSizingVertical` require `layoutMode` to be set first, or the node must be a child of an auto-layout parent — otherwise it throws
- Text in auto-layout: must use `textAutoResize = "HEIGHT"` + `layoutSizingHorizontal = "FILL"` (not `resize()`)
- Always null-check results from `getNodeByIdAsync()`, `findOne()`, `.find()` before accessing properties
- Scene context includes `boundVariable` names on fills — AI should use these instead of guessing variable names
- `emptySpot` coordinates tell the AI where to place new designs without overlapping existing content
- When a reference image is attached, AI matches its colors/styling faithfully
- Conversation auto-clears when the user switches to a different selection

## Figma Sandbox Limitations

The Figma plugin sandbox is NOT a full browser environment:
- No `AbortController` or `AbortSignal`
- No `btoa` or `atob` — use the inline `uint8ArrayToBase64()` in `code.ts` for base64 encoding
- Optional chaining (`?.`) not supported (esbuild targets ES2017 for sandbox)
- No direct DOM access
- `fetch()` only works for domains listed in `manifest.json` networkAccess

## Image Vision Support

When a selected node has image fills (e.g. a pasted screenshot), `code.ts` automatically exports it as PNG via `exportAsync()`, converts to base64 (using an inline encoder since sandbox lacks `btoa`), and sends it as a vision content block alongside the user's text. This flows through:
- `code.ts`: `exportSelectedImage()` detects image fills, exports at scale 1 (scale 0.5 if >2000px)
- `types.ts`: `ContentBlock` type (`text` | `image`), `MessageContent` type alias
- `ai.ts`: `ConversationManager.addUserMessage()` and `callClaude()` accept `MessageContent` (string or content block array)

No UI changes needed — detection is automatic based on selection.

## Prompt Caching

The API call in `src/ai.ts` uses Anthropic's prompt caching (`cache_control: { type: "ephemeral" }`) on both the system prompt and scene context blocks. This significantly reduces token costs across multi-turn conversations.
