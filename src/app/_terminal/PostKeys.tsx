"use client";

import { useEffect } from "react";
import { isTypingTarget } from "@/lib/terminal/keys";
import { useTransitionNav } from "./TransitionProvider";

/** Esc / Backspace on a post page returns to the list. */
export default function PostKeys() {
  const nav = useTransitionNav();

  useEffect(() => {
    if (!nav) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "Escape" && e.key !== "Backspace") return;
      if (isTypingTarget(document.activeElement as HTMLElement | null)) return;
      e.preventDefault();
      nav.navigate("/");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nav]);

  return (
    <p className="mt-2 hidden text-dim pointer-fine:block">[esc] 목록으로</p>
  );
}
