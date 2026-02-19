import { SerializedNode, SceneContext } from "./types";

function serializeFills(fills: ReadonlyArray<Paint>): any[] {
  return fills.map(fill => {
    if (fill.type === "SOLID") {
      return {
        type: "SOLID",
        color: {
          r: Math.round(fill.color.r * 1000) / 1000,
          g: Math.round(fill.color.g * 1000) / 1000,
          b: Math.round(fill.color.b * 1000) / 1000,
        },
        opacity: fill.opacity !== undefined && fill.opacity !== 1 ? fill.opacity : undefined,
      };
    }
    return { type: fill.type };
  });
}

export function serializeNode(
  node: SceneNode,
  depth: number,
  maxDepth: number
): SerializedNode {
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
    result.fills = serializeFills(node.fills as ReadonlyArray<Paint>);
  }

  // Strokes
  if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
    result.strokes = (node.strokes as ReadonlyArray<Paint>).map(s => {
      if (s.type === "SOLID") {
        return {
          type: "SOLID",
          color: {
            r: Math.round(s.color.r * 1000) / 1000,
            g: Math.round(s.color.g * 1000) / 1000,
            b: Math.round(s.color.b * 1000) / 1000,
          },
        };
      }
      return { type: s.type };
    });
  }

  // Opacity (only if non-default)
  if ("opacity" in node && node.opacity !== 1) {
    result.opacity = Math.round(node.opacity * 100) / 100;
  }

  // Visibility (only if hidden)
  if ("visible" in node && node.visible === false) {
    result.visible = false;
  }

  // Corner radius
  if (
    "cornerRadius" in node &&
    typeof node.cornerRadius === "number" &&
    node.cornerRadius !== 0
  ) {
    result.cornerRadius = node.cornerRadius;
  }

  // Effects
  if ("effects" in node && Array.isArray(node.effects) && node.effects.length > 0) {
    result.effects = node.effects as any;
  }

  // Blend mode
  if (
    "blendMode" in node &&
    node.blendMode !== "NORMAL" &&
    node.blendMode !== "PASS_THROUGH"
  ) {
    result.blendMode = node.blendMode;
  }

  // Text properties
  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    result.characters = textNode.characters;
    if (typeof textNode.fontSize === "number") {
      result.fontSize = textNode.fontSize;
    }
    if (typeof textNode.fontName === "object" && textNode.fontName !== figma.mixed) {
      result.fontFamily = (textNode.fontName as FontName).family;
      result.fontStyle = (textNode.fontName as FontName).style;
    }
    if (textNode.textAlignHorizontal !== "LEFT") {
      result.textAlignHorizontal = textNode.textAlignHorizontal;
    }
    if (textNode.textAlignVertical !== "TOP") {
      result.textAlignVertical = textNode.textAlignVertical;
    }
  }

  // Auto layout
  if ("layoutMode" in node && (node as any).layoutMode !== "NONE") {
    const frame = node as FrameNode;
    result.layoutMode = frame.layoutMode;
    result.paddingTop = frame.paddingTop;
    result.paddingRight = frame.paddingRight;
    result.paddingBottom = frame.paddingBottom;
    result.paddingLeft = frame.paddingLeft;
    result.itemSpacing = frame.itemSpacing;
    result.primaryAxisAlignItems = frame.primaryAxisAlignItems;
    result.counterAxisAlignItems = frame.counterAxisAlignItems;
    if (frame.layoutSizingHorizontal) {
      result.layoutSizingHorizontal = frame.layoutSizingHorizontal;
    }
    if (frame.layoutSizingVertical) {
      result.layoutSizingVertical = frame.layoutSizingVertical;
    }
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
      result.children = (node as any).children.map((child: SceneNode) =>
        serializeNode(child, depth + 1, maxDepth)
      );
    } else {
      result.childCount = (node as any).children.length;
    }
  }

  return result;
}

export function buildSceneContext(): SceneContext {
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

  // Token budget check (~1 token per 4 chars, budget ~6000 tokens)
  const json = JSON.stringify(nodes);
  const estimatedTokens = json.length / 4;

  if (estimatedTokens > 6000) {
    const reducedMaxDepth = selection.length > 0 ? 4 : 2;
    if (selection.length > 0) {
      nodes = selection.map(n => serializeNode(n, 0, reducedMaxDepth));
    } else {
      nodes = figma.currentPage.children.map(n =>
        serializeNode(n as SceneNode, 0, reducedMaxDepth)
      );
    }
  }

  return {
    file: { name: figma.root.name, pages },
    scope,
    scopeDescription,
    nodes,
  };
}
