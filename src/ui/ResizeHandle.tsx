import React, { useCallback, useRef } from "react";

export function ResizeHandle() {
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ w: 0, h: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    startPos.current = { x: e.clientX, y: e.clientY };
    startSize.current = {
      w: document.documentElement.clientWidth,
      h: document.documentElement.clientHeight,
    };

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startPos.current.x;
      const dy = ev.clientY - startPos.current.y;
      const newW = Math.max(280, startSize.current.w + dx);
      const newH = Math.max(300, startSize.current.h + dy);
      parent.postMessage(
        {
          pluginMessage: {
            type: "RESIZE",
            width: Math.round(newW),
            height: Math.round(newH),
          },
        },
        "*"
      );
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, []);

  return (
    <div className="resize-handle" onPointerDown={onPointerDown}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <circle cx="9" cy="9" r="1.2" />
        <circle cx="5" cy="9" r="1.2" />
        <circle cx="9" cy="5" r="1.2" />
      </svg>
    </div>
  );
}
