"use client";

import { useEffect, useRef } from "react";
import { isTypingTarget, nextIndex } from "@/lib/terminal/keys";

/**
 * j/k and arrow keys move real focus between the rows' links. Enter is the
 * native link activation (TransitionLink intercepts the click), so there is
 * no Enter handler here.
 */
export default function ListKeyboardNav({
  children,
}: {
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const rows = () =>
      Array.from(root.querySelectorAll<HTMLElement>("li[data-index]"));

    const indexOf = (el: Element | null) => {
      const li = el?.closest("li[data-index]");
      return li ? rows().indexOf(li as HTMLElement) : -1;
    };

    // Tab or a mouse click moved focus into a row: keep the index in sync.
    const onFocusIn = (e: FocusEvent) => {
      const i = indexOf(e.target as Element);
      if (i >= 0) selected.current = i;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement;
      if (isTypingTarget(active as HTMLElement | null)) return;
      const arrow = e.key === "ArrowDown" || e.key === "ArrowUp";
      if (!arrow && e.key !== "j" && e.key !== "k") return;
      if (arrow && active !== document.body && !root.contains(active)) return;

      const list = rows();
      const focused = active && root.contains(active) ? indexOf(active) : -1;
      const current = focused >= 0 ? focused : selected.current;
      const next = nextIndex(current, e.key, list.length);
      if (next === null) return;
      e.preventDefault();
      selected.current = next;
      const link = list[next].querySelector<HTMLElement>("a");
      link?.focus({ preventScroll: true });
      list[next].scrollIntoView({ block: "nearest" });
    };

    root.addEventListener("focusin", onFocusIn);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef}>
      {children}
      <p className="mt-4 hidden text-dim pointer-fine:block">
        [J][K] 이동 [↵] 열기
      </p>
    </div>
  );
}
