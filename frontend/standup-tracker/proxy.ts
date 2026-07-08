import { NextResponse, type NextRequest } from "next/server";
import { decryptSession } from "@/app/_lib/session/crypto";
import { SESSION_COOKIE_NAME } from "@/app/_lib/session/constants";

// OPTIMISTIC ONLY. This never re-verifies with Express and must never be the security boundary —
// every layout/page/route handler re-checks independently (see app/_lib/session/read.ts's
// requireSession, used by app/(app)/layout.tsx). A stale, forged, or expired cookie that still
// decrypts structurally is NOT proof of a valid Express session; it only unblocks the redirect
// round-trip so authenticated users don't flash the sign-in screen on every navigation.
const PROTECTED_PATH_PREFIXES = ["/dashboard", "/history", "/team", "/account"];
const AUTH_ONLY_PATHS = ["/signin"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = cookieValue ? await decryptSession(cookieValue) : null;

  const isProtected = PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isProtected && !session) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (AUTH_ONLY_PATHS.includes(pathname) && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
