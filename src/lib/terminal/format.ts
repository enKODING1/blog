const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatKstClock(d: Date): string {
  return `${clockFormat.format(d)} KST`;
}

export function progressBar(ratio: number): string {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const n = Math.round(r * 10);
  return `[${"#".repeat(n)}${"-".repeat(10 - n)}] ${Math.round(r * 100)}%`;
}

export function terminalPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "~" : `~${trimmed}`;
}

export function scrollRatio(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 1;
  return Math.min(1, Math.max(0, scrollTop / max));
}
