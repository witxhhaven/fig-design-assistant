// ── UI → Sandbox Messages ──

export interface ChatMessageMsg {
  type: "CHAT_MESSAGE";
  text: string;
}

export interface ConfirmMsg {
  type: "CONFIRM";
}

export interface CancelMsg {
  type: "CANCEL";
}

export interface SetApiKeyMsg {
  type: "SET_API_KEY";
  key: string;
}

export interface GetSettingsMsg {
  type: "GET_SETTINGS";
}

export interface SetModelMsg {
  type: "SET_MODEL";
  model: string;
}

export interface SetCreativeDesignModeMsg {
  type: "SET_CREATIVE_DESIGN_MODE";
  enabled: boolean;
}

export type UIToSandboxMsg =
  | ChatMessageMsg
  | ConfirmMsg
  | CancelMsg
  | SetApiKeyMsg
  | GetSettingsMsg
  | SetModelMsg
  | SetCreativeDesignModeMsg;

// ── Sandbox → UI Messages ──

export interface SelectionChangedMsg {
  type: "SELECTION_CHANGED";
  nodes: NodeSummary[];
  pageName: string;
}

export interface AIThinkingMsg {
  type: "AI_THINKING";
}

export interface AIResponseMsg {
  type: "AI_RESPONSE";
  summary: string;
  code: string;
  warnings: string[];
}

export interface AIClarificationMsg {
  type: "AI_CLARIFICATION";
  question: string;
}

export interface ExecutionSuccessMsg {
  type: "EXECUTION_SUCCESS";
  summary: string;
}

export interface ExecutionErrorMsg {
  type: "EXECUTION_ERROR";
  error: string;
}

export interface SettingsMsg {
  type: "SETTINGS";
  hasApiKey: boolean;
  model: string;
  creativeDesignMode: boolean;
}

export interface ErrorMsg {
  type: "ERROR";
  message: string;
}

export type SandboxToUIMsg =
  | SelectionChangedMsg
  | AIThinkingMsg
  | AIResponseMsg
  | AIClarificationMsg
  | ExecutionSuccessMsg
  | ExecutionErrorMsg
  | SettingsMsg
  | ErrorMsg;

// ── Shared Types ──

export interface NodeSummary {
  id: string;
  name: string;
  type: string;
}

export interface SerializedNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: any[];
  strokes?: any[];
  opacity?: number;
  visible?: boolean;
  cornerRadius?: number;
  effects?: any[];
  blendMode?: string;
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  lineHeight?: any;
  letterSpacing?: any;
  layoutMode?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  componentId?: string;
  variantProperties?: object;
  children?: SerializedNode[];
  childCount?: number;
}

export interface SceneContext {
  file: {
    name: string;
    pages: { id: string; name: string; isCurrent: boolean }[];
  };
  scope: "selection" | "page";
  scopeDescription: string;
  nodes: SerializedNode[];
  emptySpot?: { x: number; y: number };
  textStyles?: { name: string; fontFamily: string; fontStyle: string; fontSize: number }[];
  variables?: { collection: string; name: string; type: string; value: any }[];
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export type MessageContent = string | ContentBlock[];

export interface AIResponse {
  summary: string | null;
  code: string | null;
  warnings: string[];
  message: string | null;
}
