"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  formatKstClock,
  progressBar,
  scrollRatio,
  terminalPath,
} from "@/lib/terminal/format";

const CLOCK_PLACEHOLDER = "--:-- KST";

export default function StatusBar() {
  const pathname = usePathname();
  const [clock, setClock] = useState(CLOCK_PLACEHOLDER);
  const [progress, setProgress] = useState<string | null>(null);
  const showProgress = pathname.startsWith("/posts/");

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setClock(formatKstClock(new Date()));
    tick();
    const msToNextMinute = 60000 - (Date.now() % 60000);
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!showProgress) {
      setProgress(null);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      setProgress(
        progressBar(
          scrollRatio(
            window.scrollY,
            document.documentElement.scrollHeight,
            window.innerHeight
          )
        )
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname, showProgress]);

  return (
    <div className="sticky top-0 z-40 flex h-8 items-center justify-between gap-4 border-b border-line bg-bg px-4 text-sm text-fg">
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/" className="shrink-0 font-semibold">
          seongjin@blog
        </Link>
        <span className="truncate text-dim">{terminalPath(pathname)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-dim">
        {showProgress && progress && <span>{progress}</span>}
        <span>
          <span className="text-accent" aria-hidden>
            ●
          </span>{" "}
          {clock}
        </span>
      </div>
    </div>
  );
}
