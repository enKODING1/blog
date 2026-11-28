/**
 * One frame of the text scramble: the leading `progress` share of `target`
 * (by code point) is revealed, the rest is random `chars`. Spaces are kept.
 * Plain text only — the caller writes it with textContent.
 */
export function scrambleFrame(
  target: string,
  progress: number,
  chars: string,
  rand: () => number
): string {
  const p = Math.min(1, Math.max(0, progress));
  if (p >= 1) return target;
  const points = [...target];
  const pool = [...chars];
  const revealed = Math.floor(points.length * p);
  return points
    .map((ch, i) => {
      if (i < revealed || /\s/.test(ch) || pool.length === 0) return ch;
      const k = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
      return pool[k];
    })
    .join("");
}
