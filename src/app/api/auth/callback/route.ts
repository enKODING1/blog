import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/auth/cognito";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_OPTIONS,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  safeNext,
} from "@/lib/auth/cookies";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

type OAuthCookie = { state: string; verifier: string; next: string };

function parseOAuthCookie(raw: string | undefined): OAuthCookie | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const { state, verifier, next } = v as Record<string, unknown>;
    if (typeof state !== "string" || !state) return null;
    if (typeof verifier !== "string" || !verifier) return null;
    return { state, verifier, next: safeNext(next) };
  } catch {
    return null;
  }
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function fail(status: number, message: string): NextResponse {
  const res = new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
  res.cookies.set(OAUTH_COOKIE, "", { ...OAUTH_COOKIE_OPTIONS, maxAge: 0 });
  return res;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams;
  if (q.get("error")) return fail(400, "Login was cancelled or failed.");

  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return fail(400, "Missing code or state.");

  const saved = parseOAuthCookie(request.cookies.get(OAUTH_COOKIE)?.value);
  if (!saved || !sameString(saved.state, state)) {
    return fail(400, "Invalid login state. Please try again.");
  }

  let idToken: string;
  try {
    ({ idToken } = await exchangeCode(code, saved.verifier));
  } catch {
    return fail(502, "Could not complete login. Please try again.");
  }

  const res = NextResponse.redirect(new URL(saved.next, getConfig().siteUrl), {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
  res.cookies.set(SESSION_COOKIE, idToken, SESSION_COOKIE_OPTIONS);
  res.cookies.set(OAUTH_COOKIE, "", { ...OAUTH_COOKIE_OPTIONS, maxAge: 0 });
  return res;
}
