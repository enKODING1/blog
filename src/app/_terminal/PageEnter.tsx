"use client";

import { usePathname } from "next/navigation";
import { gsap, useGSAP } from "./gsap";
import { TIMINGS, prefersReducedMotion } from "./motion";
import { useConsumeIntent } from "./TransitionProvider";

/** Set by the inline <head> script in layout.tsx; hides lines pre-paint. */
export const ENTER_ATTR = "data-enter";

const HIDDEN = "inset(0 100% 0 0)";
const SHOWN = "inset(0 0% 0 0)";

let hydrated = false;

/**
 * Types the new page's `main [data-line]` rows in, top to bottom. Lines are
 * hidden in a layout effect (before paint) and on first load by the
 * pre-paint `html[data-enter]` CSS rule, so nothing flashes. Skipped under
 * reduced motion and on /admin. Focuses the page title afterwards, but only
 * when a TransitionLink/navigate() led here.
 */
export default function PageEnter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const consumeIntent = useConsumeIntent();

  useGSAP(
    () => {
      const root = document.documentElement;
      const firstLoad = !hydrated;
      hydrated = true;
      const guarded = root.hasAttribute(ENTER_ATTR);
      const intended = consumeIntent(pathname);
      const focusTitle = () => {
        if (!intended) return;
        document
          .querySelector<HTMLElement>('main h1[tabindex="-1"]')
          ?.focus({ preventScroll: true });
      };

      const lines = gsap.utils.toArray<HTMLElement>("main [data-line]");
      // On first load, animate only if the pre-paint guard is still hiding
      // the lines; if its fallback already revealed them, retyping flashes.
      const skip =
        lines.length === 0 ||
        prefersReducedMotion() ||
        pathname.startsWith("/admin") ||
        (firstLoad && !guarded);

      if (skip) {
        if (lines.length) {
          gsap.set(lines, { clearProps: "opacity,visibility,clipPath" });
        }
        root.removeAttribute(ENTER_ATTR);
        focusTitle();
        return;
      }

      // autoAlpha: a reused node may still carry the exit's hidden state.
      gsap.set(lines, { autoAlpha: 1, clipPath: HIDDEN });
      root.removeAttribute(ENTER_ATTR);
      gsap.to(lines, {
        clipPath: SHOWN,
        ease: "steps(12)",
        duration: TIMINGS.enterLine,
        stagger: {
          amount: Math.min(
            TIMINGS.enterStep * (lines.length - 1),
            TIMINGS.enterMax - TIMINGS.enterLine
          ),
        },
        clearProps: "clipPath,opacity,visibility",
        onComplete: focusTitle,
      });
    },
    { dependencies: [pathname], revertOnUpdate: true }
  );

  return <>{children}</>;
}
