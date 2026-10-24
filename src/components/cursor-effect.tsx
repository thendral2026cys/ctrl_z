"use client";

import { useEffect, useRef } from "react";

export function CursorEffect() {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;

      cursor.style.setProperty("--cursor-x", `${event.clientX}px`);
      cursor.style.setProperty("--cursor-y", `${event.clientY}px`);
      cursor.classList.add("cursor-visible");

      const target = document.elementFromPoint(event.clientX, event.clientY);
      cursor.classList.toggle(
        "cursor-interactive",
        Boolean(
          target?.closest(
            "a, button, input, textarea, select, summary, label, [role='button']",
          ),
        ),
      );
    };

    const hideCursor = () => cursor.classList.remove("cursor-visible");
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") cursor.classList.add("cursor-pressed");
    };
    const handlePointerUp = () => cursor.classList.remove("cursor-pressed");

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("mouseleave", hideCursor);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("blur", hideCursor);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("mouseleave", hideCursor);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("blur", hideCursor);
    };
  }, []);

  return (
    <div className="custom-cursor" aria-hidden="true" ref={cursorRef}>
      <div className="cursor-ring" />
      <div className="cursor-core" />
    </div>
  );
}
