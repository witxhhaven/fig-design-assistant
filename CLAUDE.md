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
| `src/code.ts` | Sandbox entry point. Message routing, session logging, selection tracking, conversation auto-clear on selection change. |
| `src/scene.ts` | Serializes Figma nodes to JSON. Includes fills with bound variable names, text styles, variables, and an `emptySpot` for placing new designs. |
| `src/executor.ts` | `eval()` wrapper. Auto-retries font loading errors (up to 3x). Saves version snapshot before destructive operations. |
| `src/types.ts` | All TypeScript interfaces for messages, serialized nodes, scene context, AI response. |

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
- Font loading required before any text operation
- Colors are 0-1 floats, not 0-255
- Text in auto-layout: must use `textAutoResize = "HEIGHT"` + `layoutSizingHorizontal = "FILL"` (not `resize()`)
- `layoutSizingHorizontal = "FILL"` only works on children of auto-layout frames
- Scene context includes `boundVariable` names on fills — AI should use these instead of guessing variable names
- `emptySpot` coordinates tell the AI where to place new designs without overlapping existing content
- Conversation auto-clears when the user switches to a different selection

## Figma Sandbox Limitations

The Figma plugin sandbox is NOT a full browser environment:
- No `AbortController` or `AbortSignal`
- Optional chaining (`?.`) not supported (esbuild targets ES2017 for sandbox)
- No direct DOM access
- `fetch()` only works for domains listed in `manifest.json` networkAccess

## Prompt Caching

The API call in `src/ai.ts` uses Anthropic's prompt caching (`cache_control: { type: "ephemeral" }`) on both the system prompt and scene context blocks. This significantly reduces token costs across multi-turn conversations.
