import { SerializedNode, SceneContext } from "./types";

function serializeFills(fills: ReadonlyArray<Paint>, varLookup?: Map<string, string>): any[] {
  return fills.map(fill => {
    if (fill.type === "SOLID") {
      const result: any = {
        type: "SOLID",
        color: {
          r: Math.round(fill.color.r * 1000) / 1000,
          g: Math.round(fill.color.g * 1000) / 1000,
          b: Math.round(fill.color.b * 1000) / 1000,
        },
        opacity: fill.opacity !== undefined && fill.opacity !== 1 ? fill.opacity : undefined,
      };
      // Include bound variable name if present
      if (fill.boundVariables && fill.boundVariables.color && varLookup) {
        const varId = (fill.boundVariables.color as any).id;
        if (varId && varLookup.has(varId)) {
          result.boundVariable = varLookup.get(varId);
        }
      }
      return result;
    }
    return { type: fill.type };
  });
}

export async function serializeNode(
  node: SceneNode,
  depth: number,
  maxDepth: number,
  varLookup?: Map<string, string>
): Promise<SerializedNode> {
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
    result.fills = serializeFills(node.fills as ReadonlyArray<Paint>, varLookup);
  }

  // Strokes
  if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
    result.strokes = serializeFills(node.strokes as ReadonlyArray<Paint>, varLookup);
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
    const mainComp = await inst.getMainComponentAsync();
    if (mainComp) result.componentId = mainComp.id;
    if (inst.variantProperties) result.variantProperties = inst.variantProperties;
  }

  // Children
  if ("children" in node) {
    if (depth < maxDepth) {
      result.children = await Promise.all(
        (node as any).children.map((child: SceneNode) =>
          serializeNode(child, depth + 1, maxDepth, varLookup)
        )
      );
    } else {
      result.childCount = (node as any).children.length;
    }
  }

  return result;
}

export async function buildSceneContext(): Promise<SceneContext> {
  const selection = figma.currentPage.selection;

  const pages = figma.root.children.map(page => ({
    id: page.id,
    name: page.name,
    isCurrent: page.id === figma.currentPage.id,
  }));

  // Fetch text styles and variables first (needed for serialization)
  const [textStylesRaw, variablesRaw, collectionsRaw] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.variables.getLocalVariablesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
  ]);

  const textStyles = textStylesRaw.map(s => ({
    name: s.name,
    fontFamily: s.fontName.family,
    fontStyle: s.fontName.style,
    fontSize: s.fontSize as number,
  }));

  const collectionNames = new Map<string, string>();
  for (const c of collectionsRaw) {
    collectionNames.set(c.id, c.name);
  }

  // Build variable ID -> name lookup for fill serialization
  const varLookup = new Map<string, string>();
  const localVars = variablesRaw.filter(v => !v.remote);
  for (const v of localVars) {
    varLookup.set(v.id, v.name);
  }

  const variables = localVars
    .map(v => {
      const modeId = Object.keys(v.valuesByMode)[0];
      const rawValue = modeId ? v.valuesByMode[modeId] : undefined;
      let value = rawValue;
      // Simplify color values to hex-like
      if (
        rawValue &&
        typeof rawValue === "object" &&
        "r" in rawValue &&
        "g" in rawValue &&
        "b" in rawValue
      ) {
        const c = rawValue as { r: number; g: number; b: number; a?: number };
        value = {
          r: Math.round(c.r * 1000) / 1000,
          g: Math.round(c.g * 1000) / 1000,
          b: Math.round(c.b * 1000) / 1000,
        };
      }
      return {
        collection: collectionNames.get(v.variableCollectionId) || "",
        name: v.name,
        type: v.resolvedType,
        value,
      };
    });

  // Serialize nodes (after variables are loaded so we can include bound variable names)
  let scope: "selection" | "page";
  let nodes: SerializedNode[];
  let scopeDescription: string;

  if (selection.length > 0) {
    scope = "selection";
    scopeDescription = `${selection.length} layer${selection.length > 1 ? "s" : ""} selected`;
    nodes = await Promise.all(selection.map(n => serializeNode(n, 0, 6, varLookup)));
  } else {
    scope = "page";
    scopeDescription = `Page: ${figma.currentPage.name}`;
    nodes = await Promise.all(figma.currentPage.children.map(n => serializeNode(n as SceneNode, 0, 4, varLookup)));
  }

  // Token budget check (~1 token per 4 chars, budget ~6000 tokens)
  const json = JSON.stringify(nodes);
  const estimatedTokens = json.length / 4;

  if (estimatedTokens > 6000) {
    const reducedMaxDepth = selection.length > 0 ? 4 : 2;
    if (selection.length > 0) {
      nodes = await Promise.all(selection.map(n => serializeNode(n, 0, reducedMaxDepth, varLookup)));
    } else {
      nodes = await Promise.all(figma.currentPage.children.map(n =>
        serializeNode(n as SceneNode, 0, reducedMaxDepth, varLookup)
      ));
    }
  }

  // Compute an empty spot to the right of all existing content
  const pageChildren = figma.currentPage.children;
  let emptySpot = { x: 0, y: 0 };
  if (pageChildren.length > 0) {
    let maxRight = -Infinity;
    let topAtMaxRight = 0;
    for (var i = 0; i < pageChildren.length; i++) {
      var child = pageChildren[i];
      var right = Math.round(child.x + child.width);
      if (right > maxRight) {
        maxRight = right;
        topAtMaxRight = Math.round(child.y);
      }
    }
    emptySpot = { x: maxRight + 100, y: topAtMaxRight };
  }

  const result: SceneContext = {
    file: { name: figma.root.name, pages },
    scope,
    scopeDescription,
    nodes,
    emptySpot,
  };

  if (textStyles.length > 0) result.textStyles = textStyles;
  if (variables.length > 0) result.variables = variables;

  return result;
}
