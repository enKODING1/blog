import { CognitoJwtVerifier } from "aws-jwt-verify";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/auth/cookies";

export {
  OAUTH_COOKIE,
  OAUTH_COOKIE_OPTIONS,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth/cookies";

export const ADMIN_GROUP = "blog-admin";

export type AdminSession = { email: string; sub: string };

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

function buildVerifier() {
  const { userPoolId, clientId } = getConfig().cognito;
  return CognitoJwtVerifier.create({
    userPoolId,
    clientId,
    tokenUse: "id",
    groups: ADMIN_GROUP,
  });
}

// Created on first use (no env read at import time) and reused so the JWKS
// stays cached across requests.
let verifier: ReturnType<typeof buildVerifier> | undefined;

/**
 * Verified admin session from the ID token cookie. Missing, expired, forged,
 * wrong-client or non-admin tokens all yield null — this never throws for a
 * bad token, so a stale cookie means "logged out", not a 500.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  return (await verifiedSession())?.session ?? null;
}

async function verifiedSession(): Promise<{
  session: AdminSession;
  token: string;
} | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  verifier ??= buildVerifier();
  try {
    const payload = await verifier.verify(token);
    const { email, sub } = payload;
    if (typeof email !== "string" || !email || typeof sub !== "string") {
      return null;
    }
    return { session: { email, sub }, token };
  } catch {
    return null;
  }
}

/**
 * Raw ID token of a verified admin session (sent to the API as
 * X-User-Token, which re-verifies it). Null whenever getAdminSession() is.
 */
export async function getSessionToken(): Promise<string | null> {
  return (await verifiedSession())?.token ?? null;
}

/** For Server Actions: the admin's ID token, or UnauthorizedError. */
export async function requireAdminToken(): Promise<string> {
  const token = await getSessionToken();
  if (!token) throw new UnauthorizedError();
  return token;
}

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/**
 * For admin pages/layouts: Next renders layout and page concurrently, so each
 * page must guard itself before reading data. Redirects to login when logged
 * out (including stale/forged cookies, which never surface as a 500).
 */
export async function requireAdminPage(
  nextPath: string
): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirectToLogin(nextPath);
  return session;
}

/** Sends the browser to login, returning to `nextPath` afterwards. */
export function redirectToLogin(nextPath: string): never {
  redirect("/api/auth/login?next=" + encodeURIComponent(nextPath));
}
