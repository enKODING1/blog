/** Next selected row for j/k/arrow keys; other keys keep `current`. */
export function nextIndex(
  current: number | null,
  key: string,
  length: number
): number | null {
  if (length <= 0) return null;
  const down = key === "j" || key === "ArrowDown";
  const up = key === "k" || key === "ArrowUp";
  if (!down && !up) return current;
  if (current === null) return 0;
  return down ? Math.min(current + 1, length - 1) : Math.max(current - 1, 0);
}

/** True when keystrokes belong to a text field, so shortcuts must not fire. */
export function isTypingTarget(
  el: { tagName?: string; isContentEditable?: boolean } | null
): boolean {
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable === true
  );
}

/** Maps Korean-IME keys (e.key "ㅓ"/"Process") to j/k via the physical key. */
export function normalizeNavKey(key: string, code: string): string {
  if (["j", "k", "ArrowUp", "ArrowDown"].includes(key)) return key;
  if (code === "KeyJ") return "j";
  if (code === "KeyK") return "k";
  return key;
}
