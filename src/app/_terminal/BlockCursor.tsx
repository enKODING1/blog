"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "./gsap";
import { usePrefersReducedMotion } from "./motion";

const FINE_POINTER = "(pointer: fine)";

function subscribeFinePointer(onChange: () => void): () => void {
  const mql = window.matchMedia(FINE_POINTER);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribeFinePointer,
    () => window.matchMedia(FINE_POINTER).matches,
    () => false
  );
}

const BLOCK_STYLE = {
  position: "fixed",
  top: 0,
  left: 0,
  width: 10,
  height: 18,
  pointerEvents: "none",
  zIndex: 60,
  opacity: 0,
} as const;

/**
 * Block cursor with a trailing ghost. The block's top-left sits on the
 * pointer. Active only for a fine pointer, motion allowed, outside /admin.
 */
export default function BlockCursor() {
  const pathname = usePathname();
  const finePointer = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const enabled = finePointer && !reduced && !pathname.startsWith("/admin");

  const blockRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const block = blockRef.current;
    const ghost = ghostRef.current;
    if (!block || !ghost) return;

    const root = document.documentElement;
    root.classList.add("block-cursor");

    const blockX = gsap.quickTo(block, "x", { duration: 0.08, ease: "power3" });
    const blockY = gsap.quickTo(block, "y", { duration: 0.08, ease: "power3" });
    const ghostX = gsap.quickTo(ghost, "x", { duration: 0.25, ease: "power3" });
    const ghostY = gsap.quickTo(ghost, "y", { duration: 0.25, ease: "power3" });

    let visible = false;
    const setVisible = (v: boolean) => {
      visible = v;
      block.style.opacity = v ? "1" : "0";
      ghost.style.opacity = v ? "0.35" : "0";
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (!visible) {
        // Jump to the pointer so nothing slides in from a stale position.
        gsap.set([block, ghost], { x: e.clientX, y: e.clientY });
        setVisible(true);
        return;
      }
      blockX(e.clientX);
      blockY(e.clientY);
      ghostX(e.clientX);
      ghostY(e.clientY);
    };
    const hide = () => setVisible(false);

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
      gsap.killTweensOf([block, ghost]);
      root.classList.remove("block-cursor");
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={ghostRef}
        aria-hidden
        className="bg-accent"
        style={BLOCK_STYLE}
      />
      <div
        ref={blockRef}
        aria-hidden
        className="bg-fg"
        style={{ ...BLOCK_STYLE, mixBlendMode: "difference" }}
      />
    </>
  );
}
