export type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/** Path part of an href: query and hash removed, trailing "/" trimmed. */
export function pathOf(href: string): string {
  const path = href.split(/[?#]/, 1)[0];
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

/**
 * True only for a plain left click on a same-site public path that differs
 * from the current one. Everything else (modifier keys, middle click, new
 * tab targets, external links, admin/api routes, same page) is left to the
 * browser. Pure: no window access.
 */
export function shouldIntercept(
  e: ClickLike,
  href: string,
  currentPath: string,
  target?: string | null
): boolean {
  if (e.defaultPrevented || e.button !== 0) return false;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (target && target !== "_self") return false;
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  // Backslashes are treated like "/" by browsers ("/\evil.com").
  if (href.includes("\\")) return false;
  const path = pathOf(href);
  if (path.startsWith("/admin") || path.startsWith("/api")) return false;
  return path !== pathOf(currentPath);
}
