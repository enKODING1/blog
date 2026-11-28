// Edge-safe: src/middleware.ts imports this file, so it must not import
// node:crypto, aws-jwt-verify, the AWS SDK or src/lib/config.

/** Cognito ID token (12h). Verified on every use by getAdminSession(). */
export const SESSION_COOKIE = "blog_id_token";
/** In-flight login: JSON `{ state, verifier, next }`. */
export const OAUTH_COOKIE = "blog_oauth";

const base = { httpOnly: true, secure: true, sameSite: "lax" } as const;

export const SESSION_COOKIE_OPTIONS = { ...base, path: "/", maxAge: 43200 };
export const OAUTH_COOKIE_OPTIONS = { ...base, path: "/api/auth", maxAge: 600 };

export const DEFAULT_NEXT = "/admin";

/**
 * Open-redirect guard: only same-site absolute paths. Rejects `//host`,
 * backslashes (browsers treat `/\host` as `//host`) and control characters
 * (browsers strip tab/newline, so `/\t/host` becomes `//host`).
 */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return DEFAULT_NEXT;
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_NEXT;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return DEFAULT_NEXT;
  return next;
}
