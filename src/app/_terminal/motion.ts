"use client";

import { useSyncExternalStore } from "react";

export const TIMINGS = {
  exitStep: 0.04,
  exitMax: 0.3,
  enterLine: 0.12,
  enterStep: 0.04,
  enterMax: 0.5,
  scramble: 0.4,
} as const;

export const SCRAMBLE_CHARS = "!<>-_\\/[]{}=+*^?#01";

const QUERY = "(prefers-reduced-motion: reduce)";

/** Reads the media query right now. False on the server. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Subscribes to prefers-reduced-motion. False during SSR and hydration. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
