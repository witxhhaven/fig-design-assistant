import React, { useMemo } from "react";
import { marked } from "marked";

// Configure marked for safe, compact output
marked.setOptions({
  breaks: true,
  gfm: true,
});

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  const html = useMemo(() => {
    return marked.parse(content) as string;
  }, [content]);

  return (
    <div
      className="markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
