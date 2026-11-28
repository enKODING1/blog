import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookies";

// Edge runtime: only checks that the session cookie exists. The token is
// verified by requireAdmin() in the /admin pages and Server Actions.
export function middleware(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const login = new URL("/api/auth/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login, 302);
}

export const config = { matcher: ["/admin/:path*"] };
