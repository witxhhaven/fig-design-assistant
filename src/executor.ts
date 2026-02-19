async function loadFontFromError(errorMsg: string): Promise<boolean> {
  const match = errorMsg.match(
    /unloaded font "(.+?)"\. Please call figma\.loadFontAsync\(\{ family: "(.+?)", style: "(.+?)" \}\)/
  );
  if (!match) return false;
  try {
    await figma.loadFontAsync({ family: match[2], style: match[3] });
    return true;
  } catch {
    return false;
  }
}

export async function executeAICode(
  code: string,
  _retryCount = 0
): Promise<{ success: boolean; error?: string }> {
  try {
    const wrappedCode = `(async () => {\n${code}\n})()`;
    await eval(wrappedCode);
    figma.commitUndo();
    return { success: true };
  } catch (error: any) {
    const msg = error.message || String(error);

    // Auto-retry on font loading errors (up to 3 times)
    if (msg.includes("unloaded font") && _retryCount < 3) {
      const loaded = await loadFontFromError(msg);
      if (loaded) {
        return executeAICode(code, _retryCount + 1);
      }
    }

    return { success: false, error: msg };
  }
}

export async function executeWithSafety(
  code: string,
  hasWarnings: boolean
): Promise<{ success: boolean; error?: string }> {
  if (hasWarnings) {
    try {
      await figma.saveVersionHistoryAsync(
        "AI Copilot — auto-saved before destructive change"
      );
    } catch (_e) {
      // Version save can fail in drafts or when offline — continue anyway
      console.log("Version snapshot skipped");
    }
  }
  return executeAICode(code);
}
