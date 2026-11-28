import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl } from "@/lib/auth/cognito";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_OPTIONS,
  safeNext,
} from "@/lib/auth/cookies";
import { createPkce, createState } from "@/lib/auth/pkce";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const state = createState();
  const { verifier, challenge } = createPkce();

  const res = NextResponse.redirect(buildAuthorizeUrl({ state, challenge }), {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
  res.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ state, verifier, next }),
    OAUTH_COOKIE_OPTIONS
  );
  return res;
}
