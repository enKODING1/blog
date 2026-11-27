"use client";

import { useCallback, useEffect, useRef } from "react";
import { gsap } from "./gsap";
import {
  SCRAMBLE_CHARS,
  TIMINGS,
  prefersReducedMotion,
  usePrefersReducedMotion,
} from "./motion";

type Props = {
  text: string;
  /**
   * mount: once after mounting. hover: when the closest `[data-line]`
   * ancestor (the whole row) is hovered or receives focus. active: when
   * `active` becomes true. `active` also replays a "hover" Scramble.
   */
  trigger: "mount" | "hover" | "active";
  active?: boolean;
  className?: string;
};

/**
 * Scrambles `text` through SCRAMBLE_CHARS for TIMINGS.scramble seconds.
 * Screen readers get the real text from a visually hidden sibling; the
 * animated span is aria-hidden and its SSR content is the original text.
 */
export default function Scramble({ text, trigger, active, className }: Props) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const visualRef = useRef<HTMLSpanElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const reduced = usePrefersReducedMotion();

  const stop = useCallback(() => {
    tweenRef.current?.kill();
    tweenRef.current = null;
    if (visualRef.current) visualRef.current.textContent = text;
  }, [text]);

  const play = useCallback(() => {
    const el = visualRef.current;
    // Checked at call time: the hook value is still false during hydration.
    if (!el || prefersReducedMotion()) return;
    stop();
    tweenRef.current = gsap.to(el, {
      duration: TIMINGS.scramble,
      ease: "none",
      scrambleText: { text, chars: SCRAMBLE_CHARS, speed: 1 },
      onComplete: () => {
        tweenRef.current = null;
      },
    });
  }, [text, stop]);

  // Kill only: on a text change the ref already points at the new span.
  useEffect(
    () => () => {
      tweenRef.current?.kill();
      tweenRef.current = null;
    },
    [text]
  );

  useEffect(() => {
    if (reduced) stop();
  }, [reduced, stop]);

  useEffect(() => {
    if (trigger === "mount") play();
  }, [trigger, play]);

  useEffect(() => {
    if (trigger !== "hover") return;
    const outer = outerRef.current;
    const target = outer?.closest<HTMLElement>("[data-line]") ?? outer;
    if (!target) return;
    target.addEventListener("mouseenter", play);
    target.addEventListener("focusin", play);
    return () => {
      target.removeEventListener("mouseenter", play);
      target.removeEventListener("focusin", play);
    };
  }, [trigger, play]);

  useEffect(() => {
    if (trigger !== "mount" && active) play();
  }, [trigger, active, play]);

  return (
    <span ref={outerRef} className={className}>
      <span className="sr-only">{text}</span>
      {/* key: GSAP rewrites this node's children, so remount on new text. */}
      <span key={text} ref={visualRef} aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
