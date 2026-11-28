import { NextResponse } from "next/server";
import { buildLogoutUrl } from "@/lib/auth/cognito";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const res = NextResponse.redirect(buildLogoutUrl(), {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
  res.cookies.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return res;
}
