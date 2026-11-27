import { CognitoJwtVerifier } from "aws-jwt-verify";
import { cookies } from "next/headers";
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
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  verifier ??= buildVerifier();
  try {
    const payload = await verifier.verify(token);
    const { email, sub } = payload;
    if (typeof email !== "string" || !email || typeof sub !== "string") {
      return null;
    }
    return { email, sub };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new UnauthorizedError();
  return session;
}
