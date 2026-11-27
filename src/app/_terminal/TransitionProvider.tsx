"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { pathOf, shouldIntercept } from "@/lib/terminal/links";
import { gsap } from "./gsap";
import { TIMINGS, prefersReducedMotion } from "./motion";

type TransitionNav = {
  navigate(href: string): void;
  prefetch(href: string): void;
};

type InternalCtx = TransitionNav & {
  /** True once if the last navigate() targeted `pathname`. */
  consumeIntent(pathname: string): boolean;
};

const TransitionContext = createContext<InternalCtx | null>(null);

/** Restore window for a push that never changes the pathname (R4). */
const RESTORE_AFTER_MS = 2000;

const LINES = "main [data-line]";

function isSitePath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export function TransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const exitRef = useRef<gsap.core.Tween | null>(null);
  // Lines hidden by the current exit, kept so a failed push can restore them.
  const hiddenRef = useRef<HTMLElement[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intentRef = useRef<string | null>(null);

  const stopExit = useCallback(() => {
    exitRef.current?.kill();
    exitRef.current = null;
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const restore = useCallback(() => {
    stopExit();
    if (hiddenRef.current.length) {
      // clipPath too: an enter tween killed mid-way leaves lines clipped.
      gsap.set(hiddenRef.current, { autoAlpha: 1, clearProps: "clipPath" });
    }
    hiddenRef.current = [];
    intentRef.current = null;
  }, [stopExit]);

  const push = useCallback(
    (href: string) => {
      const fromPath = pathnameRef.current;
      intentRef.current = pathOf(href);
      // Scroll is left to router.push's default (scroll: true), which runs
      // only once the new page renders, so a restored page (R4) stays put.
      router.push(href);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        if (pathnameRef.current === fromPath) restore();
      }, RESTORE_AFTER_MS);
    },
    [router, restore]
  );

  const navigate = useCallback(
    (href: string) => {
      const current = pathnameRef.current;
      if (isSitePath(href) && pathOf(href) === pathOf(current)) {
        // Same page (or only query/hash differs): never leave it blank.
        restore();
        router.push(href);
        return;
      }
      if (exitRef.current || hiddenRef.current.length) {
        // An exit is running or waiting on its push: finish it, go to `href`.
        stopExit();
        gsap.set(hiddenRef.current, { autoAlpha: 0 });
        push(href);
        return;
      }
      if (prefersReducedMotion() || current.startsWith("/admin")) {
        push(href);
        return;
      }
      const lines = gsap.utils.toArray<HTMLElement>(LINES);
      if (lines.length === 0) {
        push(href);
        return;
      }
      // Stop a still-running PageEnter tween first, or its completion would
      // fight the exit over these lines.
      gsap.killTweensOf(lines);
      hiddenRef.current = lines;
      exitRef.current = gsap.to(lines, {
        autoAlpha: 0,
        duration: 0,
        stagger: {
          amount: Math.min(
            TIMINGS.exitStep * (lines.length - 1),
            TIMINGS.exitMax
          ),
        },
        onComplete: () => {
          exitRef.current = null;
          push(href);
        },
      });
    },
    [router, push, restore, stopExit]
  );

  const prefetch = useCallback(
    (href: string) => {
      if (isSitePath(href)) router.prefetch(href);
    },
    [router]
  );

  const consumeIntent = useCallback((path: string) => {
    const hit = intentRef.current === pathOf(path);
    intentRef.current = null;
    return hit;
  }, []);

  // A pathname change (pushed, back/forward) ends any exit: the old lines
  // are gone, and a still-running exit must not push its stale target.
  useEffect(() => {
    stopExit();
    hiddenRef.current = [];
  }, [pathname, stopExit]);

  useEffect(() => stopExit, [stopExit]);

  const value = useMemo(
    () => ({ navigate, prefetch, consumeIntent }),
    [navigate, prefetch, consumeIntent]
  );

  return (
    <TransitionContext.Provider value={value}>
      {children}
    </TransitionContext.Provider>
  );
}

export function useTransitionNav(): TransitionNav | null {
  return useContext(TransitionContext);
}

/** Internal: PageEnter uses this to focus only after an intercepted nav. */
export function useConsumeIntent(): (pathname: string) => boolean {
  const ctx = useContext(TransitionContext);
  return ctx?.consumeIntent ?? (() => false);
}

type LinkProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
  onFocus?: React.FocusEventHandler<HTMLAnchorElement>;
};

/**
 * A next/link whose plain left clicks run the `clear` exit first. Modifier
 * and middle clicks, target=_blank, external, admin/api and same-path links
 * fall through to next/link / the browser untouched.
 */
export function TransitionLink({
  href,
  className,
  children,
  onFocus,
}: LinkProps) {
  const nav = useTransitionNav();
  const pathname = usePathname();
  return (
    <Link
      href={href}
      className={className}
      onClick={e => {
        if (
          nav &&
          shouldIntercept(
            e,
            href,
            pathname,
            e.currentTarget.getAttribute("target")
          )
        ) {
          // next/link skips its own navigation when defaultPrevented.
          e.preventDefault();
          nav.navigate(href);
        }
      }}
      onMouseEnter={() => nav?.prefetch(href)}
      onFocus={e => {
        nav?.prefetch(href);
        onFocus?.(e);
      }}
    >
      {children}
    </Link>
  );
}
